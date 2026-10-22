/// WritingScreen — the core screen (SPEC §8, §17).
///
/// Key implementation choices (Flutter-native, same behavior):
///  - The vaporize preview is rendered INSIDE the TextField via
///    `buildTextSpan` — all visible words' color alpha decays simultaneously
///    with the idle ratio, with zero alignment risk.
///  - The danger overlay + heartbeat are painted on their own layer
///    (RepaintBoundary + CustomPainter), so 10 Hz idle ticks never rebuild
///    the text field.
///  - Keyboard handling: the text area resizes above `viewInsets.bottom` so
///    text is never hidden behind the keyboard, auto-scrolls as new lines are
///    written, and supports full manual scrolling + text selection/deletion,
///    while the SAVE button stays anchored at the bottom (visible when the
///    keyboard is dismissed).
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

class _WritingScreenState extends ConsumerState<WritingScreen>
    with TickerProviderStateMixin {
  late final SessionEngine _engine = SessionEngine(
    callbacks: SessionCallbacks(
      onDeath: _onDeath,
      onTextWiped: _onTextWiped,
      onSessionEnd: _onSessionEnd,
      onHapticLevel: _onHapticLevel,
    ),
  );

  late final VaporizingTextEditingController _controller =
      VaporizingTextEditingController(idleRatioListenable: _engine.idleRatio);
  final FocusNode _focusNode = FocusNode();
  final ScrollController _scrollController = ScrollController();
  final ValueNotifier<bool> _canSaveNotifier = ValueNotifier(false);

  late final AnimationController _flyAwayController = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 300),
  );
  late final Animation<double> _flyAwayAnim = CurvedAnimation(
    parent: _flyAwayController,
    curve: Curves.easeInCubic,
  );

  late final AnimationController _shakeController = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 200),
  );
  late final Animation<double> _shakeAnim = TweenSequence<double>([
    TweenSequenceItem(tween: Tween(begin: 0.0, end: 15.0), weight: 25),
    TweenSequenceItem(tween: Tween(begin: 15.0, end: -15.0), weight: 25),
    TweenSequenceItem(tween: Tween(begin: -15.0, end: 15.0), weight: 25),
    TweenSequenceItem(tween: Tween(begin: 15.0, end: 0.0), weight: 25),
  ]).animate(_shakeController);

  /// Test hook: lets widget tests drive the session engine directly.
  @visibleForTesting
  SessionEngine get engineForTesting => _engine;

  bool get _isTweetMode => widget.params.isTweet;
  bool get _isQuickNoteMode => widget.params.isQuickNote || _isTweetMode;

  String _currentText = '';
  bool _saving = false;
  double _lastBottomInset = 0.0;

  @override
  void initState() {
    super.initState();
    final diffLimit =
        difficultyLimitsMs[widget.params.diffIndex.clamp(
          0,
          difficultyLimitsMs.length - 1,
        )];
    final sessionMins = _isQuickNoteMode
        ? 0
        : sessionOptionsMins[widget.params.timeIndex.clamp(
            0,
            sessionOptionsMins.length - 1,
          )];
    _engine.start(
      difficultyLimitMs: diffLimit,
      sessionDurationMin: sessionMins,
      quickNote: _isQuickNoteMode,
    );
    _canSaveNotifier.value = _engine.canSave || _engine.hasLost;
    _focusNode.requestFocus();
  }

  @override
  void dispose() {
    _engine.dispose();
    _controller.dispose();
    _focusNode.dispose();
    _scrollController.dispose();
    _canSaveNotifier.dispose();
    _flyAwayController.dispose();
    _shakeController.dispose();
    super.dispose();
  }

  void _onSessionEnd() {
    _canSaveNotifier.value = _engine.canSave || _engine.hasLost;
  }

  void _onTextWiped() {
    // 200 ms after death: destroy written text (core premise of the app).
    _controller.value = const TextEditingValue(
      text: '',
      selection: TextSelection.collapsed(offset: 0),
    );
    _currentText = '';
    _canSaveNotifier.value = _engine.canSave || _engine.hasLost;
    if (mounted) setState(() {});
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
    // Haptic shock is owned by SessionEngine._triggerDeath (parity: RN
    // vibrates once in `triggerDeathState`). This handler only starts the
    // trauma shake and shows the overlay.
    _shakeController.forward(from: 0.0);
    _canSaveNotifier.value = true;
    setState(() {}); // show death overlay
  }

  void _handleTextChange(String text) {
    // Tweet mode: hard-block past the 45-word limit while preserving newlines (SPEC §8).
    if (_isTweetMode && countWords(text) > tweetThreshold) {
      final blocked = truncateToWords(text, tweetThreshold);
      _controller.value = TextEditingValue(
        text: blocked,
        selection: TextSelection.collapsed(offset: blocked.length),
      );
      text = blocked;
    }
    final previousLength = _currentText.length;
    final isInsertion = text.length >= previousLength;
    _currentText = text;
    _engine.handleTextChange(text, isInsertion: isInsertion);

    // When actively writing at the end of the text, keep the bottom line
    // scrolled into view above the keyboard as new lines are added.
    final selection = _controller.selection;
    final atEnd =
        !selection.isValid ||
        (selection.isCollapsed && selection.baseOffset >= text.length);
    if (isInsertion && atEnd) {
      _scrollToBottomAfterFrame();
    }
  }

  void _scrollToBottomAfterFrame() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scrollController.hasClients) return;
      final position = _scrollController.position;
      if (position.maxScrollExtent > position.pixels) {
        _scrollController.jumpTo(position.maxScrollExtent);
      }
    });
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
    final result = await ref
        .read(appDataProvider.notifier)
        .saveEntry(
          text: text,
          won: outcome.won,
          durationMin: outcome.durationMin,
          personId: widget.params.mode == 'circles'
              ? widget.params.personId
              : null,
          isQuickNote: _isQuickNoteMode,
          isTweet: _isTweetMode,
        );

    if (!mounted) return;
    if (result.note.isTweet) {
      // Tweets skip PostWriting: fly-away → back to Home (SPEC §8).
      await _animateTweetFlyAway();
      if (mounted) context.pop();
    } else {
      context.pushReplacement(
        '/post-writing',
        extra: {'noteId': result.note.id},
      );
    }
  }

  /// Tweet fly-away: card shrinks (GPU scale) + throws right, then pops.
  Future<void> _animateTweetFlyAway() async {
    vibrate(HapticPatterns.success);
    await _flyAwayController.forward();
  }

  void _exitToMenu() {
    vibrate(HapticPatterns.lockAll);
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final dead = _engine.phase.value == SessionPhase.death;

    final prefs = ref.watch(userPreferencesProvider);
    final readingSize =
        readingSizes[prefs.sizeIndex.clamp(0, readingSizes.length - 1)];
    final fontSize = readingSize.fontSize;
    final lineHeight = readingSize.lineHeight;
    final fontFamily = fontFamilyForIndex(prefs.fontIndex);

    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    final isKeyboardOpen = bottomInset > 0;
    if (bottomInset > _lastBottomInset) {
      final selection = _controller.selection;
      if (!selection.isValid ||
          (selection.isCollapsed &&
              selection.baseOffset >= _currentText.length)) {
        _scrollToBottomAfterFrame();
      }
    }
    _lastBottomInset = bottomInset;

    return Scaffold(
      backgroundColor: AppColors.background,
      resizeToAvoidBottomInset: false, // DangerOverlay fills full screen
      body: AnimatedBuilder(
        animation: Listenable.merge([_flyAwayAnim, _shakeAnim]),
        builder: (context, child) {
          final progress = _flyAwayAnim.value;
          final screenWidth = MediaQuery.sizeOf(context).width;
          return Transform.translate(
            offset: Offset(
              _shakeAnim.value + progress * (screenWidth * 1.1),
              -progress * 40,
            ),
            child: Transform.scale(
              scale: 1.0 - (progress * 0.2),
              child: Opacity(
                opacity: (1.0 - progress).clamp(0.0, 1.0),
                child: child,
              ),
            ),
          );
        },
        child: Stack(
          children: [
            SafeArea(
              bottom: !isKeyboardOpen,
              child: Column(
                children: [
                  // Header: label + countdown + word count
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        ValueListenableBuilder<int?>(
                          valueListenable: _engine.sessionSecondsRemaining,
                          builder: (context, seconds, _) => Text(
                            _isTweetMode || _isQuickNoteMode
                                ? ''
                                : _formatTime(seconds),
                            style: const TextStyle(
                              color: AppColors.textBody,
                              fontFeatures: [FontFeature.tabularFigures()],
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        AnimatedBuilder(
                          animation: Listenable.merge([
                            _engine.sessionSecondsRemaining,
                            _engine.wordCount,
                          ]),
                          builder: (context, _) {
                            final wordCount = _engine.wordCount.value;
                            return Text(
                              '$wordCount words',
                              style: TextStyle(
                                color:
                                    _isTweetMode &&
                                        wordCount > tweetThreshold - 10
                                    ? AppColors.primaryAction
                                    : AppColors.textDim,
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                  const Divider(color: AppColors.glassBorderSubtle, height: 1),
                  // Scrollable, selectable text area padded above the keyboard.
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.only(bottom: bottomInset),
                      child: TextSelectionTheme(
                        data: const TextSelectionThemeData(
                          cursorColor: AppColors.primaryAction,
                          selectionColor: AppColors.dangerTint,
                          selectionHandleColor: AppColors.primaryAction,
                        ),
                        child: TextField(
                          controller: _controller,
                          focusNode: _focusNode,
                          scrollController: _scrollController,
                          style: TextStyle(
                            color: AppColors.textInput,
                            fontFamily: fontFamily,
                            fontSize: fontSize,
                            height: lineHeight / fontSize,
                          ),
                          cursorColor: AppColors.primaryAction,
                          maxLines: null,
                          expands: true,
                          textAlignVertical: TextAlignVertical.top,
                          keyboardType: TextInputType.multiline,
                          autocorrect: true,
                          enableSuggestions: true,
                          enableInteractiveSelection: true,
                          scrollPhysics: const BouncingScrollPhysics(
                            parent: AlwaysScrollableScrollPhysics(),
                          ),
                          scrollPadding: const EdgeInsets.only(
                            top: 24,
                            bottom: 48,
                          ),
                          decoration: InputDecoration(
                            hintText: 'Keep typing...',
                            hintStyle: TextStyle(
                              color: AppColors.placeholder,
                              fontFamily: fontFamily,
                              fontSize: fontSize,
                              height: lineHeight / fontSize,
                            ),
                            border: InputBorder.none,
                            isCollapsed: true,
                            contentPadding: const EdgeInsets.fromLTRB(
                              20,
                              16,
                              20,
                              24,
                            ),
                          ),
                          onChanged: _handleTextChange,
                        ),
                      ),
                    ),
                  ),
                  // Save action stays anchored at the bottom of the screen
                  // (only shown when the keyboard is dismissed).
                  ValueListenableBuilder<bool>(
                    valueListenable: _canSaveNotifier,
                    builder: (context, canSave, _) {
                      if (!canSave || dead || isKeyboardOpen) {
                        return const SizedBox.shrink();
                      }
                      return Padding(
                        padding: const EdgeInsets.only(top: 8, bottom: 16),
                        child: AnimatedScaleButton(
                          onPress: _saving ? null : _handleSave,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 44,
                              vertical: 14,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.primaryAction,
                              borderRadius: BorderRadius.circular(30),
                            ),
                            child: Text(
                              _engine.hasLost
                                  ? "SAVE WHAT'S LEFT"
                                  : 'SAVE ENTRY',
                              style: const TextStyle(
                                color: AppColors.primaryActionText,
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
            // Danger ambience (4-sided edge fog/blur/heartbeat — own layer)
            if (!dead) Positioned.fill(child: DangerOverlay(engine: _engine)),
            // Death overlay
            DeathOverlay(
              visible: dead,
              subtitle: 'You stopped writing for too long.',
              continueLabel: "I don't care, let me write",
              onReturnToMenu: _exitToMenu,
              onSaveWhatsLeft: _currentText.trim().isNotEmpty
                  ? _handleSave
                  : null,
              onContinue: () {
                _engine.resumeWritingFreely();
                _canSaveNotifier.value = _engine.canSave;
                setState(() {});
              },
            ),
          ],
        ),
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
