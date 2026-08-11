/// AlignmentWritingScreen — the check-in flow (SPEC §10).
///
/// Phase 1 — "Log masteries" (no timer): the daily/weekly pillar pick with
///   sliders/steppers/booleans + one smart advice card (weekly).
/// Phase 2 — "Dangerous Deck": every picked item opens a 1-minute reflection
///   with the death timer (EASY idle limit = 12 s).
///
/// Rate limit: 3 hours since the last pillar log (dev-mode bypass).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/config/app_config.dart';
import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../core/utils.dart';
import '../../../data/models/pillar.dart';
import '../../../data/providers.dart';
import '../../../domain/use_cases/session_engine.dart';
import '../../core/widgets/animated_scale_button.dart';
import '../../core/widgets/custom_slider.dart';
import '../writing/death_overlay.dart';

/// One reflection deck item (a mastery to reflect on).
class _DeckItem {
  const _DeckItem({this.pillar, this.adviceId, required this.label});

  final Pillar? pillar;
  final String? adviceId;
  final String label;
}

class AlignmentWritingScreen extends ConsumerStatefulWidget {
  const AlignmentWritingScreen({super.key});

  @override
  ConsumerState<AlignmentWritingScreen> createState() =>
      _AlignmentWritingScreenState();
}

class _AlignmentWritingScreenState extends ConsumerState<AlignmentWritingScreen> {
  static const int _reflectionMinutes = 1;

  // Phase 1 state
  List<Pillar>? _picked;
  AdviceCard? _advice;
  final Map<String, double> _values = {};
  final Map<String, bool> _booleans = {};
  final Map<String, String> _logIds = {};

  // Phase 2 state
  List<_DeckItem> _deck = [];
  int _deckIndex = 0;
  bool _inReflection = false;

  late final SessionEngine _engine = SessionEngine(
    callbacks: SessionCallbacks(
      onDeath: () => setState(() {}),
      onSessionEnd: () {},
    ),
  );
  final TextEditingController _textController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _preparePhase1();
  }

  @override
  void dispose() {
    _engine.dispose();
    _textController.dispose();
    super.dispose();
  }

  // -- Phase 1 -----------------------------------------------------------------

  void _preparePhase1() {
    final notifier = ref.read(appDataProvider.notifier);
    final isWeekly = DateTime.now().weekday == DateTime.monday ||
        DateTime.now().weekday == DateTime.wednesday;
    final picked = notifier.getPillarsForCheckIn(isWeekly);
    final advice = isWeekly ? notifier.getSmartAdvice() : null;
    setState(() {
      _picked = picked;
      _advice = advice;
      for (final pillar in picked) {
        switch (pillar.type) {
          case PillarType.rating:
            _values[pillar.id] = 5;
          case PillarType.time:
            _values[pillar.id] = 7.0;
          case PillarType.boolean:
            _booleans[pillar.id] = true;
          case PillarType.text:
            _values[pillar.id] = 5;
        }
      }
    });
  }

  Future<void> _logAndContinue() async {
    final picked = _picked ?? const <Pillar>[];
    if (picked.isEmpty) {
      _goHome();
      return;
    }
    final notifier = ref.read(appDataProvider.notifier);
    final now = DateTime.now().millisecondsSinceEpoch;

    for (final pillar in picked) {
      final logId = generateId();
      final boolValue = _booleans[pillar.id];
      final numValue = pillar.type == PillarType.boolean
          ? (boolValue == true ? 1.0 : 0.0)
          : _values[pillar.id];
      await notifier.savePillarLog(PillarLog(
        id: logId,
        pillarId: pillar.id,
        valueNum: numValue,
        valueStr: boolValue == null ? '${numValue ?? ''}' : '$boolValue',
        timestamp: now,
      ));
      _logIds[pillar.id] = logId;
      _values[pillar.id] = numValue ?? 5;
    }

    // Build the dangerous deck: picked pillars + the advice card (weekly).
    setState(() {
      _deck = [
        for (final pillar in picked) _DeckItem(pillar: pillar, label: pillar.title),
        if (_advice != null)
          _DeckItem(adviceId: _advice!.id, label: _advice!.text),
      ];
      _deckIndex = 0;
    });
    _startReflection();
  }

  // -- Phase 2 (dangerous deck) -------------------------------------------------

  void _startReflection() {
    if (_deckIndex >= _deck.length) {
      _goHome();
      return;
    }
    setState(() {
      _inReflection = true;
    });
    _textController.clear();
    // 1-minute session with EASY idle limit (12 s) — SPEC §10.
    _engine.start(
      difficultyLimitMs: difficultyLimitsMs[0],
      sessionDurationMin: _reflectionMinutes,
    );
  }

  Future<void> _saveReflection() async {
    final text = _textController.text.trim();
    final item = _deck[_deckIndex];
    final notifier = ref.read(appDataProvider.notifier);

    final result = await notifier.saveEntry(
      text: text,
      won: true,
      durationMin: _reflectionMinutes,
    );
    final savedNote = result.note;

    // Link the reflection to its pillar log / advice card (SPEC §10).
    if (item.pillar != null) {
      final logId = _logIds[item.pillar!.id];
      if (logId != null) {
        await notifier.linkPillarLogNote(logId, savedNote.id);
      }
      // Reflection notes carry the pillar metadata for version badges.
      await notifier.updateNote(savedNote.id, {
        'is_alignment_reflection': 1,
        'pillar_id': item.pillar!.id,
        'pillar_value': _values[item.pillar!.id],
        'pillar_version': item.pillar!.version,
      });
    } else if (item.adviceId != null) {
      await notifier.incrementAdviceReflection(item.adviceId!);
    }

    setState(() {
      _deckIndex++;
      _inReflection = false;
    });
    _startReflection();
  }

  void _goHome() {
    vibrate(HapticPatterns.unlockSuccess);
    context.go('/');
  }

  // -- Build -------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final notifier = ref.read(appDataProvider.notifier);
    if (notifier.isCheckinRateLimited() && !ref.read(preferencesProvider).devMode) {
      return _RateLimitScreen(onBack: () => context.pop());
    }
    if (_picked == null) {
      return const Scaffold(
        backgroundColor: AppColors.background,
        body: Center(child: Text('Preparing check-in...', style: TextStyle(color: AppColors.textMuted))),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: _inReflection ? _buildReflection() : _buildLogPhase(),
      ),
    );
  }

  Widget _buildLogPhase() {
    final picked = _picked ?? const <Pillar>[];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 8, 16, 0),
          child: Row(
            children: [
              IconButton(
                onPressed: () => context.pop(),
                icon: Icon(Mdi.get('close'), color: AppColors.textSecondary),
              ),
              const SizedBox(width: 4),
              const Text(
                'LOG TODAY\'S MASTERIES',
                style: TextStyle(
                  color: AppColors.primaryAction,
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.5,
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
            children: [
              if (picked.isEmpty) ...[
                const SizedBox(height: 120),
                const Center(
                  child: Text(
                    'No masteries for today — create one in Masteries first.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppColors.textMuted, fontSize: 14),
                  ),
                ),
              ],
              for (final pillar in picked) _buildPillarInput(pillar),
              if (_advice != null) ...[
                const SizedBox(height: 18),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.glassSurfaceSubtle,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppColors.glassBorderFaint, width: 1),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'FOCUS ADVICE',
                        style: TextStyle(
                          color: AppColors.gold,
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.5,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _advice!.text,
                        style: const TextStyle(
                          color: AppColors.textBody,
                          fontSize: 15,
                          height: 1.45,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 28),
              AnimatedScaleButton(
                onPress: _logAndContinue,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 15),
                  decoration: BoxDecoration(
                    color: AppColors.primaryAction,
                    borderRadius: BorderRadius.circular(30),
                  ),
                  child: const Text(
                    'LOG & CONTINUE',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: AppColors.primaryActionText,
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Center(
                child: Text(
                  'Next: ${picked.length} reflection${picked.length == 1 ? '' : 's'}',
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildPillarInput(Pillar pillar) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.glassBorder, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            pillar.title,
            style: const TextStyle(
              color: AppColors.textPrimary,
              fontSize: 17,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 14),
          switch (pillar.type) {
            PillarType.rating => CustomSlider(
                value: (_values[pillar.id] ?? 5).round(),
                color: AppColors.alignmentTierColor((_values[pillar.id] ?? 5).round()),
                onChanged: (v) => setState(() => _values[pillar.id] = v.toDouble()),
              ),
            PillarType.time => _TimeStepper(
                value: _values[pillar.id] ?? 7.0,
                onChanged: (v) => setState(() => _values[pillar.id] = v),
              ),
            PillarType.boolean => Row(
                children: [
                  for (final choice in [true, false])
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: AnimatedScaleButton(
                        onPress: () => setState(() => _booleans[pillar.id] = choice),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 10),
                          decoration: BoxDecoration(
                            color: (_booleans[pillar.id] ?? true) == choice
                                ? AppColors.dangerTint
                                : AppColors.glassSurfaceSubtle,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: (_booleans[pillar.id] ?? true) == choice
                                  ? AppColors.dangerBorder
                                  : AppColors.glassBorderFaint,
                            ),
                          ),
                          child: Text(
                            choice ? 'YES' : 'NO',
                            style: TextStyle(
                              color: (_booleans[pillar.id] ?? true) == choice
                                  ? AppColors.primaryAction
                                  : AppColors.textSecondary,
                              fontSize: 14,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            PillarType.text => const Text(
                'Text mastery — reflect in the writing phase.',
                style: TextStyle(color: AppColors.textMuted, fontSize: 13),
              ),
          },
        ],
      ),
    );
  }

  Widget _buildReflection() {
    final item = _deck[_deckIndex];
    final dead = _engine.phase.value == SessionPhase.death;

    return Stack(
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'REFLECTION ${_deckIndex + 1}/${_deck.length}',
                    style: const TextStyle(
                      color: AppColors.primaryAction,
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.5,
                    ),
                  ),
                  ValueListenableBuilder<int?>(
                    valueListenable: _engine.sessionSecondsRemaining,
                    builder: (context, seconds, _) => Text(
                      _formatTime(seconds),
                      style: const TextStyle(color: AppColors.textDim, fontSize: 14, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Text(
                item.label,
                style: const TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                child: TextField(
                  controller: _textController,
                  maxLines: null,
                  expands: true,
                  textAlignVertical: TextAlignVertical.top,
                  style: const TextStyle(color: AppColors.textInput, fontSize: 18, height: 1.5),
                  cursorColor: AppColors.primaryAction,
                  decoration: const InputDecoration(
                    hintText: 'Reflect on this mastery...',
                    hintStyle: TextStyle(color: AppColors.placeholder, fontSize: 18),
                    border: InputBorder.none,
                  ),
                  onChanged: (_) => setState(() {}),
                ),
              ),
            ),
            if (!dead && (_engine.canSave || _textController.text.trim().isNotEmpty))
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Center(
                  child: AnimatedScaleButton(
                    onPress: _saveReflection,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 14),
                      decoration: BoxDecoration(
                        color: AppColors.primaryAction,
                        borderRadius: BorderRadius.circular(30),
                      ),
                      child: const Text(
                        'SAVE REFLECTION',
                        style: TextStyle(
                          color: AppColors.primaryActionText,
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
        DeathOverlay(
          visible: dead,
          subtitle: 'You stopped reflecting for too long.',
          continueLabel: 'Let me finish',
          onReturnToMenu: _goHome,
          onContinue: () {
            _engine.resumeWritingFreely();
            setState(() {});
          },
        ),
      ],
    );
  }

  static String _formatTime(int? seconds) {
    if (seconds == null) return '';
    final m = (seconds ~/ 60).toString().padLeft(2, '0');
    final s = (seconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }
}

/// ±0.5 h stepper for time masteries (SPEC §10).
class _TimeStepper extends StatelessWidget {
  const _TimeStepper({required this.value, required this.onChanged});

  final double value;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        AnimatedScaleButton(
          onPress: () => onChanged((value - 0.5).clamp(0, 24)),
          child: _stepButton('-'),
        ),
        Text(
          '${value.toStringAsFixed(1)} h',
          style: const TextStyle(
            color: AppColors.textPrimary,
            fontSize: 22,
            fontWeight: FontWeight.w800,
          ),
        ),
        AnimatedScaleButton(
          onPress: () => onChanged((value + 0.5).clamp(0, 24)),
          child: _stepButton('+'),
        ),
      ],
    );
  }

  Widget _stepButton(String label) {
    return Container(
      width: 44,
      height: 44,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.glassSurfaceMedium,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.glassBorderSubtle, width: 1),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: AppColors.textPrimary,
          fontSize: 22,
          fontWeight: FontWeight.w400,
        ),
      ),
    );
  }
}

/// 3-hour rate-limit screen with countdown (SPEC §10, dev-mode bypass).
class _RateLimitScreen extends StatelessWidget {
  const _RateLimitScreen({required this.onBack});

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Mdi.get('clockOutline'), color: AppColors.gold, size: 48),
              const SizedBox(height: 16),
              const Text(
                'Check-in on cooldown',
                style: TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'You can check in again in a few hours.',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 14),
              ),
              const SizedBox(height: 28),
              AnimatedScaleButton(
                onPress: onBack,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 36, vertical: 13),
                  decoration: BoxDecoration(
                    color: AppColors.primaryAction,
                    borderRadius: BorderRadius.circular(30),
                  ),
                  child: const Text(
                    'BACK',
                    style: TextStyle(
                      color: AppColors.primaryActionText,
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
