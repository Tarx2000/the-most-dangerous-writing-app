import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/rating_day.dart';
import '../../../core/theme/app_colors.dart';
import '../../../data/models/wellbeing_checkin.dart';
import '../../../data/providers.dart';
import '../../../data/security_providers.dart';
import '../../core/widgets/rating_unlock.dart';
import '../../core/widgets/custom_slider.dart';
import '../../core/widgets/glass_action.dart';
import 'life_wheel.dart';
import 'wellbeing_draft.dart';

class WellbeingScreen extends ConsumerStatefulWidget {
  const WellbeingScreen({super.key, this.initialOverall});
  final int? initialOverall;
  @override
  ConsumerState<WellbeingScreen> createState() => _WellbeingScreenState();
}

class _WellbeingScreenState extends ConsumerState<WellbeingScreen> {
  late final String _dayKey = RatingDay.at(DateTime.now()).key;
  bool _saving = false;
  bool _saved = false;
  bool _seeded = false;
  bool? _existingAtEntry;
  LifeDomain? _selected;

  Future<void> _save() async {
    if (_saving) return;
    final draft = ref.read(wellbeingDraftProvider(_dayKey));
    if (!draft.hasRatings) return;
    setState(() => _saving = true);
    try {
      final now = DateTime.now().millisecondsSinceEpoch;
      final old = ref
          .read(wellbeingProvider)
          .where((e) => e.dayKey == _dayKey)
          .firstOrNull;
      await ref
          .read(appDataProvider.notifier)
          .saveWellbeing(
            WellbeingCheckin(
              dayKey: _dayKey,
              overall: draft.overall,
              domains: draft.domains,
              completedWheelAt: draft.fullWheel && draft.domains.isNotEmpty
                  ? now
                  : old?.completedWheelAt,
              updatedAt: now,
            ),
          );
      if (mounted) setState(() => _saved = true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              RatingDay.parse(_dayKey).isCurrent(DateTime.now())
                  ? 'Could not save. Your ratings are still here.'
                  : 'A new rating day started at 03:00. Reopen Check-in to rate today.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ready = ref.watch(storageReadyProvider);
    if (ready.isLoading) {
      return const Scaffold(
        backgroundColor: AppColors.background,
        body: Center(
          child: CircularProgressIndicator(color: AppColors.textBodyDim),
        ),
      );
    }
    _existingAtEntry ??= ref
        .read(wellbeingProvider)
        .any((e) => e.dayKey == _dayKey);
    if (_existingAtEntry! && !ref.watch(isNotesUnlockedProvider)) {
      return const RatingUnlock(title: 'Unlock today’s check-in');
    }
    if (!_seeded) {
      _seeded = true;
      if (widget.initialOverall != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) {
            ref
                .read(wellbeingDraftProvider(_dayKey).notifier)
                .setOverall(widget.initialOverall);
          }
        });
      }
    }
    final draft = ref.watch(wellbeingDraftProvider(_dayKey));
    final edit = ref.read(wellbeingDraftProvider(_dayKey).notifier);
    final glass = ref.watch(
      preferencesProvider.select((p) => p.enableLiquidGlass),
    );
    final now = ref.watch(ratingClockProvider).valueOrNull ?? DateTime.now();
    final closed = !RatingDay.parse(_dayKey).isCurrent(now);
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 620),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 8, 12, 0),
                  child: Row(
                    children: [
                      IconButton(
                        tooltip: 'Back',
                        onPressed: () => context.pop(),
                        icon: const Icon(Icons.arrow_back_rounded),
                      ),
                      const Spacer(),
                      TextButton.icon(
                        onPressed: () => context.push('/checkin/history'),
                        icon: const Icon(Icons.show_chart_rounded, size: 18),
                        label: const Text(
                          'History',
                          style: TextStyle(color: AppColors.textBodyDim),
                        ),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(24, 12, 24, 28),
                    children: [
                      Text(
                        _saved ? 'Checked in.' : 'Check-in',
                        style: const TextStyle(
                          fontSize: 34,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -1,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _saved
                            ? 'Your ratings are saved. The rest is optional.'
                            : 'How satisfied are you with your life right now?',
                        style: const TextStyle(
                          color: AppColors.textBodyDim,
                          fontSize: 16,
                          height: 1.4,
                        ),
                      ),
                      const SizedBox(height: 28),
                      if (closed) ...[
                        const Text(
                          'This rating day closed at 03:00.',
                          style: TextStyle(color: AppColors.gold),
                        ),
                        TextButton(
                          onPressed: () => context.replace('/checkin'),
                          child: const Text('Rate the new day'),
                        ),
                      ] else if (!_saved) ...[
                        RatingRow(
                          label: 'Overall satisfaction',
                          value: draft.overall,
                          glass: glass,
                          onChanged: edit.setOverall,
                          onCancelled: edit.setOverall,
                        ),
                        const SizedBox(height: 12),
                        SwitchListTile.adaptive(
                          contentPadding: EdgeInsets.zero,
                          title: const Text(
                            'Life wheel',
                            style: TextStyle(fontWeight: FontWeight.w600),
                          ),
                          subtitle: const Text(
                            'A closer look at eight areas',
                            style: TextStyle(color: AppColors.textBodyDim),
                          ),
                          value: draft.fullWheel,
                          activeTrackColor: const Color(0xFF777777),
                          onChanged: edit.setFullWheel,
                        ),
                        if (draft.fullWheel) ...[
                          Center(
                            child: LifeWheel(
                              values: draft.domains,
                              selected: _selected,
                              onSelected: (d) => setState(() => _selected = d),
                            ),
                          ),
                          if (_selected != null)
                            Center(
                              child: Text(
                                '${_selected!.label} · ${draft.domains[_selected] ?? 'Not rated'}',
                                style: const TextStyle(
                                  color: AppColors.textBodyDim,
                                ),
                              ),
                            ),
                          const SizedBox(height: 16),
                          for (final domain in LifeDomain.values)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: RatingRow(
                                label: domain.label,
                                value: draft.domains[domain],
                                glass: glass,
                                highlighted: domain == _selected,
                                onChanged: (v) => edit.setDomain(domain, v),
                                onCancelled: (v) => edit.setDomain(domain, v),
                              ),
                            ),
                          const Text(
                            'Leave any area untouched to skip it.',
                            style: TextStyle(
                              color: AppColors.textBodyDim,
                              fontSize: 13,
                            ),
                          ),
                          const SizedBox(height: 24),
                        ],
                        GlassAction(
                          label: _saving ? 'Saving…' : 'Save check-in',
                          icon: Icons.arrow_forward_rounded,
                          onPressed: draft.hasRatings && !_saving
                              ? _save
                              : null,
                        ),
                      ] else ...[
                        if (draft.fullWheel)
                          Center(child: LifeWheel(values: draft.domains)),
                        const SizedBox(height: 12),
                        GlassAction(
                          label: ref.watch(preferencesProvider).promptMasteries
                              ? 'Masteries & reflections'
                              : 'Write a reflection',
                          icon: Icons.arrow_forward_rounded,
                          onPressed: () => context.push(
                            '/checkin/reflections',
                            extra: {
                              'isWeekly': draft.fullWheel,
                              'alignmentScore': draft.overall,
                              'includeMasteries': ref
                                  .read(preferencesProvider)
                                  .promptMasteries,
                            },
                          ),
                        ),
                        const SizedBox(height: 14),
                        Center(
                          child: TextButton(
                            onPressed: () => context.pop(),
                            child: const Text('Done'),
                          ),
                        ),
                        Center(
                          child: TextButton(
                            onPressed: () => setState(() => _saved = false),
                            child: const Text(
                              'Edit today’s ratings',
                              style: TextStyle(color: AppColors.textBodyDim),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class RatingRow extends StatelessWidget {
  const RatingRow({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    this.onCancelled,
    this.glass = false,
    this.highlighted = false,
  });
  final String label;
  final int? value;
  final ValueChanged<int> onChanged;
  final ValueChanged<int?>? onCancelled;
  final bool glass;
  final bool highlighted;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
    decoration: BoxDecoration(
      color: const Color(0xFF0A0A0A),
      borderRadius: BorderRadius.circular(20),
      border: Border.all(
        color: highlighted ? const Color(0xFF777777) : const Color(0xFF252525),
      ),
    ),
    child: Column(
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(width: 10),
            Text(
              value == null ? '—' : '$value',
              style: const TextStyle(
                fontFeatures: [FontFeature.tabularFigures()],
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        CustomSlider(
          value: value,
          min: 0,
          max: 10,
          label: label,
          enableGlass: glass,
          onChanged: onChanged,
          onCancelled: onCancelled,
        ),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '0',
                style: TextStyle(color: AppColors.textBodyDim, fontSize: 11),
              ),
              Text(
                '10',
                style: TextStyle(color: AppColors.textBodyDim, fontSize: 11),
              ),
            ],
          ),
        ),
        const SizedBox(height: 6),
      ],
    ),
  );
}
