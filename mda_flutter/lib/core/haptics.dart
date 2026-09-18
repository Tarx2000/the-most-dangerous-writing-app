/// Haptic wrapper — ports `src/lib/haptics.ts`.
/// Honors the global `enableHaptics` preference; all app haptics go through here.
library;

import 'dart:async';

import 'package:flutter/services.dart';
import 'package:vibration/vibration.dart';

/// Global haptics toggle (mirrored from the settings store).
bool hapticsEnabled = true;

/// True when the platform can run the legacy vibrate-pattern API.
bool _patternSupported = false;

// Native selection/light impacts feel crisp on both platforms. Throttle dial
// ticks so a fast drag cannot queue a long tail of vibration after release.
const _microTickInterval = Duration(milliseconds: 35);
final _hapticClock = Stopwatch()..start();
Duration? _lastMicroTick;

/// Initializes the haptics backend (call once at startup).
Future<void> initHaptics() async {
  try {
    _patternSupported = await Vibration.hasVibrator();
  } catch (_) {
    // Plugin unavailable (e.g. tests) — degrade to no-op.
    _patternSupported = false;
  }
}

/// Single pulse of [ms] duration, or a full pattern `[delay, duration, delay, ...]`.
/// Mirrors `vibrate(pattern)` in haptics.ts — no-op when haptics are disabled.
Future<void> vibrate(Object pattern) async {
  if (!hapticsEnabled) return;
  try {
    if (pattern is int && pattern > 0 && pattern <= 30) {
      final now = _hapticClock.elapsed;
      if (_lastMicroTick != null &&
          now - _lastMicroTick! < _microTickInterval) {
        return;
      }
      _lastMicroTick = now;
      if (pattern <= 10) {
        await HapticFeedback.selectionClick();
      } else {
        await HapticFeedback.lightImpact();
      }
      return;
    }
    if (!_patternSupported) return;
    if (pattern is List) {
      final list = pattern;
      if (list.length == 1) {
        await Vibration.vibrate(duration: list.first as int);
      } else {
        await Vibration.vibrate(pattern: [for (final d in list) d as int]);
      }
    } else {
      await Vibration.vibrate(duration: pattern as int);
    }
  } catch (_) {
    // Best-effort: haptics must never crash the app.
  }
}

/// Cancels any running vibration pattern.
Future<void> cancel() async {
  if (!_patternSupported) return;
  try {
    await Vibration.cancel();
  } catch (_) {}
}

/// Sets the global enabled flag (used by the settings store on boot).
void setGlobalHapticsEnabled(bool enabled) {
  hapticsEnabled = enabled;
  _lastMicroTick = null;
  if (!enabled) unawaited(cancel());
}

/// Micro-tick haptics table (SPEC §16) — named for reuse.
class HapticPatterns {
  static const tick = 10;
  static const optionSelect = 10;
  static const versionPress = 10;
  static const dialPress = 30;
  static const regenerate = 30;
  static const unlockSuccess = 50;
  static const success = 50;
  static const lockAll = 50;
  static const openVlogDay = 20;
  static const backupOp = 15;
  static const favoriteStar = 5;
  static const pinError = [0, 50, 50, 50];
  static const devOn = [0, 50, 100, 50, 100, 150];
  static const devOff = [0, 150, 100, 150];
  static const death = [0, 200, 100, 200];
  static const sessionEnd = [0, 100, 50, 100];
}
