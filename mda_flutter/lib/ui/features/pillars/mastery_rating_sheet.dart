import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/rating_day.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils.dart';
import '../../../data/models/pillar.dart';
import '../../../data/providers.dart';
import '../../../data/security_providers.dart';
import '../../core/widgets/custom_slider.dart';
import '../../core/widgets/glass_action.dart';

class MasteryRatingSheet extends ConsumerStatefulWidget {
  const MasteryRatingSheet({
    super.key,
    required this.pillar,
    required this.onSaved,
  });
  final Pillar pillar;
  final VoidCallback onSaved;
  @override
  ConsumerState<MasteryRatingSheet> createState() => _MasteryRatingSheetState();
}

class _MasteryRatingSheetState extends ConsumerState<MasteryRatingSheet> {
  late final String _dayKey = RatingDay.at(DateTime.now()).key;
  double? _number;
  bool? _boolean;
  bool _saving = false;
  final _text = TextEditingController();
  @override
  void initState() {
    super.initState();
    final saved = ref
        .read(pillarLogsProvider)
        .where(
          (l) =>
              l.pillarId == widget.pillar.id &&
              (l.dayKey ??
                      RatingDay.at(
                        DateTime.fromMillisecondsSinceEpoch(l.timestamp),
                      ).key) ==
                  _dayKey,
        )
        .lastOrNull;
    _number = saved?.valueNum;
    if (saved?.valueNum != null) _boolean = saved!.valueNum == 1;
    _text.text = saved?.valueStr ?? '';
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      final type = widget.pillar.type;
      await ref
          .read(appDataProvider.notifier)
          .savePillarLog(
            PillarLog(
              id: generateId(),
              pillarId: widget.pillar.id,
              dayKey: _dayKey,
              valueNum: type == PillarType.boolean
                  ? (_boolean! ? 1 : 0)
                  : type == PillarType.text
                  ? null
                  : _number,
              valueStr: type == PillarType.text ? _text.text.trim() : null,
              timestamp: DateTime.now().millisecondsSinceEpoch,
            ),
          );
      if (mounted) widget.onSaved();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Could not save. Ratings close at 03:00; reopen if a new day has started.',
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
    if (!ref.watch(isNotesUnlockedProvider)) {
      return const Center(
        child: Text('Masteries are locked. Reopen after unlocking.'),
      );
    }
    final glass = ref.watch(
      preferencesProvider.select((p) => p.enableLiquidGlass),
    );
    final type = widget.pillar.type;
    final answered = type == PillarType.boolean
        ? _boolean != null
        : type == PillarType.text
        ? _text.text.trim().isNotEmpty
        : _number != null;
    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
      children: [
        Text(
          widget.pillar.title,
          style: const TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w600,
            letterSpacing: -0.7,
          ),
        ),
        const SizedBox(height: 10),
        const Text(
          'Today’s rating · editable until 03:00',
          style: TextStyle(color: AppColors.textBodyDim),
        ),
        const SizedBox(height: 32),
        if (type == PillarType.rating || type == PillarType.time) ...[
          Text(
            _number == null
                ? '—'
                : type == PillarType.time
                ? '${_number!.toStringAsFixed(1)} h'
                : '${_number!.round()} / 10',
            style: const TextStyle(fontSize: 36, fontWeight: FontWeight.w500),
          ),
          const SizedBox(height: 14),
          CustomSlider(
            value: _number == null
                ? null
                : (type == PillarType.time ? _number! * 2 : _number!).round(),
            min: type == PillarType.time ? 0 : 1,
            max: type == PillarType.time ? 48 : 10,
            label: widget.pillar.title,
            valueFormatter: type == PillarType.time
                ? (v) => '${(v / 2).toStringAsFixed(1)} hours'
                : null,
            enableGlass: glass,
            onChanged: (v) => setState(
              () => _number = type == PillarType.time ? v / 2 : v.toDouble(),
            ),
            onCancelled: (v) => setState(
              () => _number = v == null
                  ? null
                  : type == PillarType.time
                  ? v / 2
                  : v.toDouble(),
            ),
          ),
          Text(
            type == PillarType.time ? '0–24 hours · half-hour steps' : '1–10',
            style: const TextStyle(color: AppColors.textBodyDim),
          ),
        ] else if (type == PillarType.boolean)
          Wrap(
            spacing: 12,
            children: [
              for (final value in [true, false])
                ChoiceChip(
                  label: Text(value ? 'Yes' : 'No'),
                  selected: _boolean == value,
                  selectedColor: const Color(0xFF444444),
                  onSelected: (_) => setState(() => _boolean = value),
                ),
            ],
          )
        else
          TextField(
            controller: _text,
            minLines: 3,
            maxLines: 8,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(hintText: 'Your observation'),
          ),
        const SizedBox(height: 32),
        GlassAction(
          label: _saving ? 'Saving…' : 'Save rating',
          onPressed: answered && !_saving ? _save : null,
        ),
      ],
    );
  }
}
