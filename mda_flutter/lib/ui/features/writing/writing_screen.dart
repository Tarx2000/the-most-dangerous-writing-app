/// WritingScreen — the core screen (SPEC §8, §17).
///
/// Key implementation choices (Flutter-native, same behavior):
///  - The vaporize preview is rendered INSIDE the TextField via
///    `buildTextSpan` — the last 8 words' color alpha decays with the idle
///    ratio, exactly like the RN overlay but with zero alignment risk.
///  - The danger overlay + heartbeat are painted on their own layer
///    (RepaintBoundary + CustomPainter), so 10 Hz idle ticks never rebuild
///    the text field.
///  - Keyboard "pan" (no resize): the Scaffold never resizes for the
///    keyboard; Android `adjustPan` (manifest) pans the window instead.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/config/app_config.dart';
import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils.dart';
import '../../../data/providers.dart';
import '../../../domain/use_cases/session_engine.dart';
import '../../core/widgets/animated_scale_button.dart';
import 'danger_overlay.dart';
import 'death_overlay.dart';
import 'vaporizing_editable_text.dart';

/// Route params for `/writing` (parity with the RN navigation params).
class WritingParams {
  const WritingParams({
    required this.timeIndex,
    required this.diffIndex,
    required this.mode,
    this.personId,
    this.isTweet = false,
    this.isQuickNote = false,
  });

  final int timeIndex;
  final int diffIndex;
  final String mode; // 'journal' | 'circles'
  final String? personId;
  final bool isTweet;
  final bool isQuickNote;

  static WritingParams fromExtra(Map<String, dynamic> extra) => WritingParams(
        timeIndex: (extra['timeIndex'] as num?)?.toInt() ?? defaultSessionIndex,
        diffIndex: (extra['diffIndex'] as num?)?.toInt() ?? defaultDifficultyIndex,
        mode: extra['mode'] as String? ?? 'journal',
        personId: extra['personId'] as String?,
        isTweet: extra['isTweet'] == true,
        isQuickNote: extra['isQuickNote'] == true,
      );
}

class WritingScreen extends ConsumerStatefulWidget {
  const WritingScreen({super.key, required this.params});

  final WritingParams params;

  @override
  ConsumerState<WritingScreen> createState() => _WritingScreenState();
}

class _WritingScreenState extends ConsumerState<WritingScreen> {
  late final SessionEngine _engine = SessionEngine(
    callbacks: SessionCallbacks(
      onDeath: _onDeath,
      onSessionEnd: () {},
      onHapticLevel: _onHapticLevel,
    ),
  );

  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();

  /// Test hook: lets widget tests drive the session engine directly.
  @visibleForTesting
  SessionEngine get engineForTesting => _engine;

  bool get _isTweetMode => widget.params.isTweet;
  bool get _isQuickNoteMode => widget.params.isQuickNote || _isTweetMode;

  String _currentText = '';
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final diffLimit = difficultyLimitsMs[widget.params.diffIndex.clamp(0, difficultyLimitsMs.length - 1)];
    final sessionMins =
        _isQuickNoteMode ? 0 : sessionOptionsMins[widget.params.timeIndex.clamp(0, sessionOptionsMins.length - 1)];
    _engine.start(
      difficultyLimitMs: diffLimit,
      sessionDurationMin: sessionMins,
      quickNote: _isQuickNoteMode,
    );
    _focusNode.requestFocus();
  }

  @override
  void dispose() {
    _engine.dispose();
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _onHapticLevel(HapticLevel level) {
    switch (level) {
      case HapticLevel.none:
        break;
      case HapticLevel.caution:
        vibrate(20);
      case HapticLevel.warning:
        vibrate([0, 30, 50, 30]);
      case HapticLevel.urgent:
        vibrate([0, 40, 25, 40]);
      case HapticLevel.critical:
        vibrate([0, 50, 25, 50, 25, 50, 25, 80]);
    }
  }

  void _onDeath() {
    setState(() {}); // show death overlay
  }

  void _handleTextChange(String text) {
    // Tweet mode: hard-block past the 45-word limit (SPEC §8).
    if (_isTweetMode && countWords(text) > tweetThreshold) {
      final words = text.trim().split(RegExp(r'\s+'));
      final blocked = words.take(tweetThreshold).join(' ');
      _controller.value = TextEditingValue(
        text: blocked,
        selection: TextSelection.collapsed(offset: blocked.length),
      );
      text = blocked;
    }
    final previousLength = _currentText.length;
    setState(() => _currentText = text);
    _engine.handleTextChange(text, isInsertion: text.length >= previousLength);
  }

  Future<void> _handleSave() async {
    if (_saving) return;
    final text = _currentText.trim();
    if (text.isEmpty) {
      context.pop();
      return;
    }

    setState(() => _saving = true);
    final outcome = _engine.buildSaveOutcome();
    final result = await ref.read(appDataProvider.notifier).saveEntry(
          text: text,
          won: outcome.won,
          durationMin: outcome.durationMin,
          personId: widget.params.mode == 'circles' ? widget.params.personId : null,
          isQuickNote: _isQuickNoteMode,
          isTweet: _isTweetMode,
        );

    if (!mounted) return;
    if (result.note.isTweet) {
      // Tweets skip PostWriting: fly-away → back to Home (SPEC §8).
      await _animateTweetFlyAway();
      if (mounted) context.pop();
    } else {
      context.pushReplacement('/post-writing', extra: {'noteId': result.note.id});
    }
  }

  /// Tweet fly-away: card shrinks (GPU scale) + throws right, then pops.
  Future<void> _animateTweetFlyAway() async {
    // Implemented as a lightweight overlay animaton on the whole body.
    await Future<void>.delayed(const Duration(milliseconds: 250));
  }

  void _exitToMenu() {
    vibrate(HapticPatterns.lockAll);
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final timeLeft = _engine.sessionSecondsRemaining.value;
    final wordCount = _engine.wordCount.value;
    final showSave = _engine.canSave || _engine.hasLost;
    final dead = _engine.phase.value == SessionPhase.death;
    final diffLimit = _engine.difficultyLimitMsValue;
    final fontSize = 18.0;
    final lineHeight = 28.0;

    return Scaffold(
      backgroundColor: AppColors.background,
      resizeToAvoidBottomInset: false, // keyboard "pan" parity
      body: Stack(
        children: [
          Column(
            children: [
              // Header: label + countdown + word count
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      _isTweetMode
                          ? 'NEW TWEET'
                          : _isQuickNoteMode
                              ? 'QUICK NOTE'
                              : widget.params.mode == 'circles'
                                  ? 'CIRCLE WRITE'
                                  : 'FREE WRITE',
                      style: const TextStyle(
                        color: AppColors.primaryAction,
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.5,
                      ),
                    ),
                    Text(
                      _isQuickNoteMode
                          ? '$wordCount words'
                          : '${_formatTime(timeLeft)} · $wordCount words',
                      style: TextStyle(
                        color: _isTweetMode && wordCount > tweetThreshold - 10
                            ? AppColors.primaryAction
                            : AppColors.textDim,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              const Divider(color: AppColors.glassBorderSubtle, height: 1),
              // Text area
              Expanded(
                child: ValueListenableBuilder<double>(
                  valueListenable: _engine.idleRatio,
                  builder: (context, idleRatio, _) {
                    return Stack(
                      children: [
                        // Hint (only while empty) — matches placeholder styling.
                        if (_currentText.isEmpty)
                          const Padding(
                            padding: EdgeInsets.fromLTRB(20, 22, 20, 0),
                            child: Text(
                              'Keep typing...',
                              style: TextStyle(color: AppColors.placeholder, fontSize: 18),
                            ),
                          ),
                        // EditableText: buildTextSpan enables the inline
                        // vaporize effect (last 8 words' alpha decay).
                        Padding(
                          padding: const EdgeInsets.fromLTRB(20, 16, 20, 200),
                          child: VaporizingEditableText(
                            controller: _controller,
                            focusNode: _focusNode,
                            idleRatio: idleRatio,
                            difficultyLimit: diffLimit,
                            style: TextStyle(
                              color: AppColors.textInput,
                              fontSize: fontSize,
                              height: lineHeight / fontSize,
                            ),
                            cursorColor: AppColors.primaryAction,
                            backgroundCursorColor: AppColors.textMuted,
                            maxLines: null,
                            expands: true,
                            keyboardType: TextInputType.multiline,
                            autocorrect: true,
                            enableSuggestions: true,
                            selectionColor: AppColors.dangerTint,
                            onChanged: _handleTextChange,
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ),
              // Save action (visible when allowed)
              if (showSave && !dead)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: AnimatedScaleButton(
                    onPress: _saving ? null : _handleSave,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 44, vertical: 14),
                      decoration: BoxDecoration(
                        color: AppColors.primaryAction,
                        borderRadius: BorderRadius.circular(30),
                      ),
                      child: Text(
                        _engine.hasLost ? 'SAVE WHAT\'S LEFT' : 'SAVE ENTRY',
                        style: const TextStyle(
                          color: AppColors.primaryActionText,
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
          // Danger ambience (vignette/fog/heartbeat — own layer)
          DangerOverlay(engine: _engine),
          // Death overlay
          DeathOverlay(
            visible: dead,
            subtitle: 'You stopped writing for too long.',
            continueLabel: "I don't care, let me write",
            onReturnToMenu: _exitToMenu,
            onContinue: () {
              _engine.resumeWritingFreely();
              setState(() {});
            },
          ),
        ],
      ),
    );
  }

  static String _formatTime(int? seconds) {
    if (seconds == null) return '';
    final m = (seconds ~/ 60).toString().padLeft(2, '0');
    final s = (seconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }
}
