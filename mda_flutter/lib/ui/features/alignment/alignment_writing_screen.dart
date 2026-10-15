/// Optional Masteries and reflections after the wellbeing save (SPEC §10).
///
/// Phase 1 — "Log masteries" (no timer): the daily/weekly pillar pick with
///   sliders/steppers/booleans + one smart advice card (weekly).
/// Phase 2 — "Dangerous Deck": every picked item opens a 1-minute reflection
///   with the death timer (EASY idle limit = 12 s).
///
/// Due scheduling and same-rating-day upserts replace the legacy global cooldown.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/config/app_config.dart';
import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../core/utils.dart';
import '../../../core/rating_day.dart';
import '../../core/widgets/glass_action.dart';
import '../../../data/models/pillar.dart';
import '../../../data/providers.dart';
import '../../../data/security_providers.dart';
import '../../core/widgets/rating_unlock.dart';
import '../../../domain/use_cases/session_engine.dart';
import '../../core/widgets/animated_scale_button.dart';
import '../../core/widgets/custom_slider.dart';
import '../writing/death_overlay.dart';
import '../writing/danger_overlay.dart';

/// One reflection deck item (a mastery to reflect on).
class _DeckItem {
  const _DeckItem({this.pillar, this.adviceId, required this.label});

  final Pillar? pillar;
  final String? adviceId;
  final String label;
}

class AlignmentWritingScreen extends ConsumerStatefulWidget {
  const AlignmentWritingScreen({
    super.key,
    this.isWeekly = false,
    this.overallScore,
    this.includeMasteries = true,
  });

  final bool isWeekly;
  final int? overallScore;
  final bool includeMasteries;

  @override
  ConsumerState<AlignmentWritingScreen> createState() =>
      _AlignmentWritingScreenState();
}

class _AlignmentWritingScreenState
    extends ConsumerState<AlignmentWritingScreen> {
  static const int _reflectionMinutes = 1;

  // Phase 1 state
  late final String _ratingDay = RatingDay.at(DateTime.now()).key;
  List<Pillar>? _picked;
  AdviceCard? _advice;
  final Map<String, double> _values = {};
  final Map<String, bool> _booleans = {};
  final Map<String, String> _logIds = {};

  // Phase 2 state
  List<_DeckItem> _deck = [];
  int _deckIndex = 0;
  bool _inReflection = false;
  bool _logged = false;
  bool _saving = false;
  final Set<int> _completed = {};
  bool _hasReflectionText = false;

  late final SessionEngine _engine = SessionEngine(
    callbacks: SessionCallbacks(
      onDeath: () => setState(() {}),
      onSessionEnd: () {
        if (mounted) setState(() {});
      },
      onTextWiped: () {
        if (mounted) {
          _textController.clear();
          setState(() {});
        }
      },
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

  Future<void> _preparePhase1() async {
    final notifier = ref.read(appDataProvider.notifier);
    try {
      final picked = widget.includeMasteries
          ? await notifier.getStableCheckinSelection(widget.isWeekly)
          : <Pillar>[];
      if (!mounted) return;
      final day = RatingDay.at(DateTime.now()).key;
      setState(() {
        _picked = picked;
        _advice = widget.isWeekly ? notifier.getSmartAdvice() : null;
        for (final pillar in picked) {
          final logs = ref
              .read(pillarLogsProvider)
              .where(
                (l) =>
                    l.pillarId == pillar.id &&
                    (l.dayKey ??
                            RatingDay.at(
                              DateTime.fromMillisecondsSinceEpoch(l.timestamp),
                            ).key) ==
                        day,
              );
          final saved = logs.lastOrNull;
          if (saved != null) {
            _logIds[pillar.id] = saved.id;
            if (saved.valueNum != null) _values[pillar.id] = saved.valueNum!;
            if (pillar.type == PillarType.boolean && saved.valueNum != null) {
              _booleans[pillar.id] = saved.valueNum == 1;
            }
          }
        }
      });
    } catch (_) {
      if (mounted) setState(() => _picked = []);
    }
  }

  Future<void> _logAndContinue() async {
    if (_saving || _logged) return;
    _saving = true;
    try {
      final picked = _picked ?? const <Pillar>[];
      final notifier = ref.read(appDataProvider.notifier);
      final now = DateTime.now().millisecondsSinceEpoch;

      for (final pillar in picked) {
        if (pillar.type == PillarType.text ||
            (pillar.type == PillarType.boolean
                ? !_booleans.containsKey(pillar.id)
                : !_values.containsKey(pillar.id))) {
          continue;
        }
        final logId = _logIds.putIfAbsent(pillar.id, generateId);
        final boolValue = _booleans[pillar.id];
        final numValue = pillar.type == PillarType.boolean
            ? (boolValue == true ? 1.0 : 0.0)
            : _values[pillar.id];
        await notifier.savePillarLog(
          PillarLog(
            id: logId,
            pillarId: pillar.id,
            valueNum: numValue,
            valueStr: pillar.type == PillarType.text
                ? ''
                : boolValue == null
                ? '${numValue ?? ''}'
                : '$boolValue',
            timestamp: now,
            dayKey: _ratingDay,
          ),
        );
        _logIds[pillar.id] =
            ref
                .read(pillarLogsProvider)
                .where((l) => l.pillarId == pillar.id)
                .lastOrNull
                ?.id ??
            logId;
        if (numValue != null) _values[pillar.id] = numValue;
      }

      await notifier.completeCheckin(now);

      // Build the dangerous deck: picked pillars + the advice card (weekly).
      if (!mounted) return;
      setState(() {
        _logged = true;
        _deck = [
          const _DeckItem(label: 'Life today'),
          for (final pillar in picked)
            _DeckItem(pillar: pillar, label: pillar.title),
          if (_advice != null)
            _DeckItem(adviceId: _advice!.id, label: _advice!.text),
        ];
        _deckIndex = 0;
      });
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not save your check-in. Please try again.'),
          ),
        );
      }
    } finally {
      _saving = false;
    }
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
    _hasReflectionText = false;
    // 1-minute session with EASY idle limit (12 s) — SPEC §10.
    _engine.start(
      difficultyLimitMs: difficultyLimitsMs[0],
      sessionDurationMin: _reflectionMinutes,
    );
  }

  Future<void> _saveReflection() async {
    final text = _textController.text.trim();
    if (_saving || text.isEmpty || _engine.phase.value == SessionPhase.death) {
      return;
    }
    _saving = true;
    _engine.stopTimers();
    try {
      final item = _deck[_deckIndex];
      final notifier = ref.read(appDataProvider.notifier);

      final result = await notifier.saveEntry(
        text: text,
        won: true,
        durationMin: _reflectionMinutes,
        isAlignmentReflection: true,
        alignmentScore: item.pillar == null && item.adviceId == null
            ? widget.overallScore
            : null,
        pillarId: item.pillar?.id,
        adviceId: item.adviceId,
        pillarValue: item.pillar != null ? _values[item.pillar!.id] : null,
        pillarVersion: item.pillar?.version,
      );
      final savedNote = result.note;

      // Link the reflection to its pillar log / advice card (SPEC §10).
      if (item.pillar?.type == PillarType.text &&
          RatingDay.at(DateTime.now()).key == _ratingDay) {
        await notifier.savePillarLog(
          PillarLog(
            id: generateId(),
            pillarId: item.pillar!.id,
            dayKey: _ratingDay,
            valueStr: text,
            timestamp: DateTime.now().millisecondsSinceEpoch,
            noteId: savedNote.id,
          ),
        );
      } else if (item.pillar != null) {
        final logId = _logIds[item.pillar!.id];
        if (logId != null) {
          await notifier.linkPillarLogNote(logId, savedNote.id);
        }
      } else if (item.adviceId != null) {
        await notifier.incrementAdviceReflection(item.adviceId!);
      }

      if (!mounted) return;
      setState(() {
        _completed.add(_deckIndex);
        _inReflection = false;
      });
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Could not save your reflection. Your text is still here.',
            ),
          ),
        );
      }
    } finally {
      _saving = false;
    }
  }

  void _goHome() {
    vibrate(HapticPatterns.unlockSuccess);
    context.go('/');
  }

  // -- Build -------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    if (widget.includeMasteries &&
        ref.watch(pillarsProvider).isNotEmpty &&
        !ref.watch(isNotesUnlockedProvider)) {
      return const RatingUnlock(title: 'Unlock Masteries');
    }
    if (_picked == null) {
      return const Scaffold(
        backgroundColor: AppColors.background,
        body: Center(
          child: Text(
            'Preparing check-in...',
            style: TextStyle(color: AppColors.textMuted),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      resizeToAvoidBottomInset: !_inReflection,
      body: _inReflection
          ? _buildReflection()
          : SafeArea(child: _logged ? _buildDeckPhase() : _buildLogPhase()),
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
                'Masteries',
                style: TextStyle(
                  color: AppColors.primaryAction,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
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
              if (picked.isEmpty && _advice == null) ...[
                const SizedBox(height: 120),
                const Center(
                  child: Text(
                    'No masteries due. You can still write a reflection.',
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
                    border: Border.all(
                      color: AppColors.glassBorderFaint,
                      width: 1,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'FOCUS ADVICE',
                        style: TextStyle(
                          color: AppColors.gold,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
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
              GlassAction(
                label: 'Continue to reflections',
                onPressed: _saving ? null : _logAndContinue,
                icon: Icons.arrow_forward_rounded,
              ),
              const SizedBox(height: 10),
              Center(
                child: Text(
                  'Next: ${picked.length} reflection${picked.length == 1 ? '' : 's'}',
                  style: const TextStyle(
                    color: AppColors.textMuted,
                    fontSize: 12,
                  ),
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
              fontWeight: FontWeight.w600,
            ),
          ),
          Text(
            pillar.type == PillarType.boolean
                ? (_booleans[pillar.id] == null
                      ? 'Not rated'
                      : (_booleans[pillar.id]! ? 'Yes' : 'No'))
                : (_values[pillar.id] == null
                      ? 'Not rated'
                      : '${_values[pillar.id]}${pillar.type == PillarType.time ? ' h' : ''}'),
            style: const TextStyle(color: AppColors.textBodyDim, fontSize: 13),
          ),
          const SizedBox(height: 14),
          switch (pillar.type) {
            PillarType.rating => CustomSlider(
              value: _values[pillar.id]?.round(),
              enableGlass: ref.watch(preferencesProvider).enableLiquidGlass,
              label: pillar.title,
              color: AppColors.alignmentTierColor(
                (_values[pillar.id] ?? 5).round(),
              ),
              onChanged: (v) =>
                  setState(() => _values[pillar.id] = v.toDouble()),
              onCancelled: (v) => setState(() {
                if (v == null) {
                  _values.remove(pillar.id);
                } else {
                  _values[pillar.id] = v.toDouble();
                }
              }),
            ),
            PillarType.time => CustomSlider(
              value: _values[pillar.id] == null
                  ? null
                  : (_values[pillar.id]! * 2).round(),
              min: 0,
              max: 48,
              label: '${pillar.title}, half-hour steps',
              valueFormatter: (v) => '${(v / 2).toStringAsFixed(1)} hours',
              enableGlass: ref.watch(preferencesProvider).enableLiquidGlass,
              onChanged: (v) => setState(() => _values[pillar.id] = v / 2),
              onCancelled: (v) => setState(() {
                if (v == null) {
                  _values.remove(pillar.id);
                } else {
                  _values[pillar.id] = v / 2;
                }
              }),
            ),
            PillarType.boolean => Row(
              children: [
                for (final choice in [true, false])
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: AnimatedScaleButton(
                      onPress: () =>
                          setState(() => _booleans[pillar.id] = choice),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 22,
                          vertical: 10,
                        ),
                        decoration: BoxDecoration(
                          color: _booleans[pillar.id] == choice
                              ? AppColors.dangerTint
                              : AppColors.glassSurfaceSubtle,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: _booleans[pillar.id] == choice
                                ? AppColors.dangerBorder
                                : AppColors.glassBorderFaint,
                          ),
                        ),
                        child: Text(
                          choice ? 'YES' : 'NO',
                          style: TextStyle(
                            color: _booleans[pillar.id] == choice
                                ? AppColors.primaryAction
                                : AppColors.textSecondary,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            PillarType.text => const Text(
              'Write an optional reflection to log this mastery.',
              style: TextStyle(color: AppColors.textMuted, fontSize: 13),
            ),
          },
        ],
      ),
    );
  }

  /// Reflection choice remains with the writer, as in the RN dangerous deck.
  Widget _buildDeckPhase() => Column(
    children: [
      const Padding(
        padding: EdgeInsets.all(24),
        child: Text(
          'Reflections',
          style: TextStyle(
            color: AppColors.textPrimary,
            fontSize: 22,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      const Padding(
        padding: EdgeInsets.symmetric(horizontal: 24),
        child: Text(
          'An optional minute to put your thoughts into words.',
          style: TextStyle(color: AppColors.textSecondary),
        ),
      ),
      Expanded(
        child: ListView.builder(
          padding: const EdgeInsets.all(20),
          itemCount: _deck.length,
          itemBuilder: (context, index) => Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: ListTile(
              tileColor: AppColors.surfaceCard,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
              title: Text(
                _deck[index].label,
                style: const TextStyle(color: AppColors.textPrimary),
              ),
              subtitle: Text(
                _completed.contains(index) ? 'Reflection saved' : '1 minute',
                style: const TextStyle(color: AppColors.textSecondary),
              ),
              trailing: Icon(
                _completed.contains(index)
                    ? Icons.check_circle_outline
                    : Icons.chevron_right,
                color: _completed.contains(index)
                    ? AppColors.green
                    : AppColors.primaryAction,
              ),
              onTap: _completed.contains(index)
                  ? null
                  : () {
                      _deckIndex = index;
                      _startReflection();
                    },
            ),
          ),
        ),
      ),
      Padding(
        padding: const EdgeInsets.all(20),
        child: FilledButton(
          onPressed: _goHome,
          child: const Text('Finish Check-in'),
        ),
      ),
    ],
  );

  Widget _buildReflection() {
    final item = _deck[_deckIndex];
    final dead = _engine.phase.value == SessionPhase.death;
    final prefs = ref.watch(preferencesProvider);
    final reading =
        readingSizes[prefs.sizeIndex.clamp(0, readingSizes.length - 1)];

    return Stack(
      children: [
        Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: SafeArea(
            child: Column(
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
                          fontWeight: FontWeight.w600,
                          letterSpacing: 1.5,
                        ),
                      ),
                      ValueListenableBuilder<int?>(
                        valueListenable: _engine.sessionSecondsRemaining,
                        builder: (context, seconds, _) => Text(
                          _formatTime(seconds),
                          style: const TextStyle(
                            color: AppColors.textDim,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
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
                      fontWeight: FontWeight.w600,
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
                      style: TextStyle(
                        color: AppColors.textInput,
                        fontFamily: fontFamilyForIndex(prefs.fontIndex),
                        fontSize: reading.fontSize,
                        height: reading.lineHeight,
                      ),
                      cursorColor: AppColors.primaryAction,
                      decoration: const InputDecoration(
                        hintText: 'Reflect on this mastery...',
                        hintStyle: TextStyle(
                          color: AppColors.placeholder,
                          fontSize: 18,
                        ),
                        border: InputBorder.none,
                      ),
                      autofocus: true,
                      onChanged: (text) {
                        _engine.handleTextChange(text);
                        final hasText = text.trim().isNotEmpty;
                        if (hasText != _hasReflectionText) {
                          setState(() => _hasReflectionText = hasText);
                        }
                      },
                    ),
                  ),
                ),
                if (!dead &&
                    (_engine.canSave || _textController.text.trim().isNotEmpty))
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Center(
                      child: AnimatedScaleButton(
                        onPress: _saveReflection,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 40,
                            vertical: 14,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.primaryAction,
                            borderRadius: BorderRadius.circular(30),
                          ),
                          child: const Text(
                            'SAVE REFLECTION',
                            style: TextStyle(
                              color: AppColors.primaryActionText,
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        if (!dead) Positioned.fill(child: DangerOverlay(engine: _engine)),
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
