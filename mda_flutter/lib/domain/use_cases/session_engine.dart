/// Session engine — the heart of the writing mechanic.
/// Port of `src/lib/hooks/useSession.ts` (SPEC §8).
///
/// Design notes (performance):
///  - The idle timer ticks at 10 Hz but only mutates [ValueNotifier]s —
///    the UI reads them inside `RepaintBoundary`-wrapped listeners, so no
///    full-screen rebuilds happen while writing.
///  - Word counting uses an O(1) append-only fast path with a debounced
///    O(n) fallback for mid-edits (parity with the RN implementation).
library;

import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/config/app_config.dart';
import '../../core/haptics.dart';
import '../../core/logger.dart';
import '../../core/utils.dart';

/// Words that vaporize while idling (SPEC §8).
const int wordsToVaporize = 8;

/// Minimal opacity of vaporized words.
const double vaporizeMinOpacity = 0.3;

enum SessionPhase { writing, death, continuingAfterLoss }

enum HapticLevel { none, caution, warning, urgent, critical }

/// Callbacks the engine emits (all on the UI isolate).
class SessionCallbacks {
  const SessionCallbacks({
    this.onDeath,
    this.onHapticLevel,
    this.onSessionEnd,
    this.onIdleRatioChanged,
  });

  /// Fired exactly once when the idle limit is reached.
  final VoidCallback? onDeath;

  /// Fired once per escalation level crossing (reset on typing).
  final ValueChanged<HapticLevel>? onHapticLevel;

  /// Fired when the session countdown reaches zero.
  final VoidCallback? onSessionEnd;

  /// 0→1 idle ratio (drives the vaporize preview + danger overlay).
  final ValueChanged<double>? onIdleRatioChanged;
}

/// Save payload (SPEC §8): `won` = finished without loss.
class SaveOutcome {
  const SaveOutcome({required this.won, required this.durationMin});

  final bool won;
  final int durationMin;
}

class SessionEngine {
  SessionEngine({this.callbacks = const SessionCallbacks()});

  final SessionCallbacks callbacks;

  // -- Live state (ValueNotifiers: cheap reads, no rebuild storms) ----------

  /// Milliseconds since the last keystroke (0..difficultyLimit).
  final ValueNotifier<int> idleTimeMs = ValueNotifier(0);

  /// Session seconds remaining (0 = time's up; null = quick note, no timer).
  final ValueNotifier<int?> sessionSecondsRemaining = ValueNotifier(null);

  final ValueNotifier<SessionPhase> phase = ValueNotifier(SessionPhase.writing);

  /// Word count of the current text (fast-path maintained).
  final ValueNotifier<int> wordCount = ValueNotifier(0);

  /// Current idle ratio 0→1 (drives vaporize/danger preview).
  final ValueNotifier<double> idleRatio = ValueNotifier(0);

  // -- Config ---------------------------------------------------------------

  int _difficultyLimitMs = difficultyLimitsMs[defaultDifficultyIndex];
  bool _sessionTimedOut = false;
  bool _hasLost = false;
  bool _isContinuingAfterLoss = false;
  bool _isQuickNote = false;
  int _sessionDurationMin = 0;
  String _lastCountedText = '';

  /// True once the user chose "I don't care, let me write".
  bool get isContinuingAfterLoss => _isContinuingAfterLoss;

  bool get hasLost => _hasLost;

  /// Quick note flag.
  bool get isQuickNote => _isQuickNote;

  /// Session countdown is still running (excludes deaths and quick notes).
  bool get isSessionRunning =>
      !_hasLost && !_isContinuingAfterLoss && (sessionSecondsRemaining.value ?? 0) > 0;

  /// True when the entry can be saved (time up, continuing, or quick note).
  bool get canSave => _sessionTimedOut || _isContinuingAfterLoss || _isQuickNote || _hasLost;

  int get difficultyLimitMsValue => _difficultyLimitMs;

  Timer? _idleTicker;
  Timer? _sessionTicker;
  Timer? _wordCountDebounce;
  Timer? _deathTimer;
  int _hapticLevel = -1;

  // -- Lifecycle -------------------------------------------------------------

  /// Starts a session. [difficultyLimitMs] comes from the difficulty index.
  /// Quick notes and tweets do not run timers or idle death.
  void start({
    required int difficultyLimitMs,
    required int sessionDurationMin,
    bool quickNote = false,
  }) {
    _difficultyLimitMs = difficultyLimitMs;
    _sessionDurationMin = sessionDurationMin;
    _isQuickNote = quickNote;
    _hasLost = false;
    _isContinuingAfterLoss = false;
    _sessionTimedOut = false;
    _hapticLevel = -1;
    phase.value = SessionPhase.writing;
    idleTimeMs.value = 0;
    idleRatio.value = 0;
    wordCount.value = 0;
    _lastCountedText = '';

    _idleTicker?.cancel();
    _sessionTicker?.cancel();
    _deathTimer?.cancel();
    _wordCountDebounce?.cancel();

    if (quickNote) {
      sessionSecondsRemaining.value = null; // Quick notes have NO timers
    } else {
      sessionSecondsRemaining.value = sessionDurationMin * 60;
      _sessionTicker = Timer.periodic(const Duration(seconds: 1), _onSessionTick);
      _idleTicker = Timer.periodic(const Duration(milliseconds: tickRateMs), _onIdleTick);
    }
    logAi.debug('session started', '$sessionDurationMin min / ${difficultyLimitMs}ms idle');
  }

  /// Text edit entry point — resets the idle timer and updates the word count.
  void handleTextChange(String text, {bool isInsertion = true}) {
    if (!_hasLost && !_isContinuingAfterLoss) {
      idleTimeMs.value = 0;
      idleRatio.value = 0.0;
      callbacks.onIdleRatioChanged?.call(0.0);
      _resetHaptics();
    }

    if (isInsertion && text.startsWith(_lastCountedText)) {
      final added = text.substring(_lastCountedText.length);
      final continuation = _lastCountedText.isNotEmpty &&
          !_lastCountedText.endsWith(' ') &&
          !_lastCountedText.endsWith('\n') &&
          !_lastCountedText.endsWith('\t') &&
          !added.startsWith(' ') &&
          !added.startsWith('\n') &&
          !added.startsWith('\t');
      final addedWords = countWords(added);
      final delta = addedWords - (continuation ? 1 : 0);
      _lastCountedText = text;
      wordCount.value = (wordCount.value + delta).clamp(0, 999999);
    } else {
      _scheduleFullWordCount(text);
    }
  }

  // -- Word counting -----------------------------------------------------------

  /// Debounced full recount for mid-edits/deletions (400 ms).
  void _scheduleFullWordCount(String text) {
    _wordCountDebounce?.cancel();
    _wordCountDebounce = Timer(const Duration(milliseconds: 400), () {
      final newCount = countWords(text);
      wordCount.value = newCount;
      _lastCountedText = text;
    });
  }

  // -- Timer ticks --------------------------------------------------------------

  void _onIdleTick(Timer _) {
    if (_isQuickNote || phase.value != SessionPhase.writing) return; // Frozen after death or quick note
    final next = idleTimeMs.value + tickRateMs;
    idleTimeMs.value = next;
    final ratio = next / _difficultyLimitMs;
    idleRatio.value = ratio.clamp(0.0, 1.0);
    callbacks.onIdleRatioChanged?.call(idleRatio.value);
    _checkHaptics(ratio);

    if (next >= _difficultyLimitMs) {
      _triggerDeath();
    }
  }

  void _onSessionTick(Timer _) {
    final current = sessionSecondsRemaining.value;
    if (current == null) return;
    if (current <= 1) {
      sessionSecondsRemaining.value = 0;
      _sessionTicker?.cancel();
      _sessionTimedOut = true;
      callbacks.onSessionEnd?.call();
    } else {
      sessionSecondsRemaining.value = current - 1;
    }
  }

  // -- Haptic escalation (SPEC §8: once per level, reset on typing) ---------------

  void _checkHaptics(double ratio) {
    HapticLevel level;
    if (ratio >= 0.95) {
      level = HapticLevel.critical;
    } else if (ratio >= 0.90) {
      level = HapticLevel.urgent;
    } else if (ratio >= 0.80) {
      level = HapticLevel.warning;
    } else if (ratio >= 0.70) {
      level = HapticLevel.caution;
    } else {
      level = HapticLevel.none;
    }
    if (level != HapticLevel.none && level.index != _hapticLevel) {
      _hapticLevel = level.index;
      callbacks.onHapticLevel?.call(level);
    }
  }

  void _resetHaptics() {
    _hapticLevel = -1;
  }

  // -- Death -----------------------------------------------------------------------

  void _triggerDeath() {
    if (_hasLost) return;
    _hasLost = true;
    phase.value = SessionPhase.death;
    _sessionTicker?.cancel();
    _idleTicker?.cancel();
    idleTimeMs.value = _difficultyLimitMs;
    idleRatio.value = 1.0;
    vibrate(HapticPatterns.death);
    // Text is wiped shortly after the death overlay appears (SPEC: 200 ms).
    _deathTimer?.cancel();
    _deathTimer = Timer(const Duration(milliseconds: 200), () {
      _lastCountedText = '';
      wordCount.value = 0;
    });
    callbacks.onDeath?.call();
  }

  /// "I don't care, let me write" — resume without death risk, saves `won: false`.
  void resumeWritingFreely() {
    if (!_hasLost) return;
    _isContinuingAfterLoss = true;
    phase.value = SessionPhase.continuingAfterLoss;
    idleTimeMs.value = 0;
    idleRatio.value = 0;
    _resetHaptics();
  }

  /// Dev-mode helper: skips the remaining session time.
  void skipTimer() {
    _sessionTicker?.cancel();
    _sessionTimedOut = true;
    sessionSecondsRemaining.value = 0;
    callbacks.onSessionEnd?.call();
  }

  /// Builds the save payload (SPEC §8).
  SaveOutcome buildSaveOutcome() {
    final won = !_hasLost && !_isContinuingAfterLoss;
    return SaveOutcome(
      won: won,
      durationMin: _isQuickNote ? 0 : _sessionDurationMin,
    );
  }

  void dispose() {
    _idleTicker?.cancel();
    _sessionTicker?.cancel();
    _wordCountDebounce?.cancel();
    _deathTimer?.cancel();
    idleTimeMs.dispose();
    sessionSecondsRemaining.dispose();
    phase.dispose();
    wordCount.dispose();
    idleRatio.dispose();
  }
}
