import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_colors.dart';
import '../../../data/models/wellbeing_checkin.dart';
import '../../../data/providers.dart';
import '../../../domain/use_cases/wellbeing_history.dart';
import 'life_wheel.dart';
import '../../core/widgets/custom_slider.dart';

class WellbeingHistorySection extends ConsumerStatefulWidget {
  const WellbeingHistorySection({super.key});
  @override
  ConsumerState<WellbeingHistorySection> createState() =>
      _WellbeingHistorySectionState();
}

class _WellbeingHistorySectionState
    extends ConsumerState<WellbeingHistorySection> {
  String _metric = 'overall';
  String? _wheelDay;
  int? _scrub;
  int _range = 30;
  List<WellbeingCheckin>? _cachedEntries;
  LifeDomain? _cachedDomain;
  List<WellbeingPoint> _cachedSeries = const [];

  @override
  Widget build(BuildContext context) {
    final entries = ref.watch(wellbeingProvider);
    final enableGlass = ref.watch(
      preferencesProvider.select((p) => p.enableLiquidGlass),
    );
    final domain = LifeDomain.values
        .where((d) => d.name == _metric)
        .firstOrNull;
    if (!identical(_cachedEntries, entries) || _cachedDomain != domain) {
      _cachedEntries = entries;
      _cachedDomain = domain;
      _cachedSeries = wellbeingSeries(entries, domain);
    }
    final allSeries = _cachedSeries;
    final series = _range == 0 || allSeries.isEmpty
        ? allSeries
        : allSeries
              .where((p) => allSeries.last.day.daysSince(p.day) < _range)
              .toList();
    final wheels = entries.where((e) => e.domains.isNotEmpty).toList()
      ..sort((a, b) => b.dayKey.compareTo(a.dayKey));
    final wheel =
        wheels.where((e) => e.dayKey == _wheelDay).firstOrNull ??
        wheels.firstOrNull;
    final selection = _scrub != null && _scrub! < series.length
        ? series[_scrub!]
        : series.lastOrNull;
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 16, 8, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Your life over time',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.6,
            ),
          ),
          const SizedBox(height: 12),
          DropdownButton<String>(
            isExpanded: true,
            value: _metric,
            dropdownColor: AppColors.surfaceElevated,
            underline: const SizedBox(),
            items: [
              const DropdownMenuItem(
                value: 'overall',
                child: Text('Overall satisfaction'),
              ),
              for (final d in LifeDomain.values)
                DropdownMenuItem(value: d.name, child: Text(d.label)),
            ],
            onChanged: (value) => setState(() {
              _metric = value!;
              _scrub = null;
            }),
          ),
          Row(
            children: [
              for (final days in [30, 90, 0])
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(days == 0 ? 'All' : '${days}d'),
                    selected: _range == days,
                    selectedColor: AppColors.borderMuted,
                    showCheckmark: false,
                    onSelected: (_) => setState(() {
                      _range = days;
                      _scrub = null;
                    }),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),
          if (selection != null)
            SizedBox(
              height: MediaQuery.textScalerOf(context).scale(46),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        '${selection.isObserved ? selection.value.toInt() : selection.value.toStringAsFixed(1)} / 10',
                        style: TextStyle(
                          color: selection.isObserved
                              ? AppColors.textPrimary
                              : AppColors.textBodyDim,
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          DateFormat('d MMM y').format(selection.day.date),
                          textAlign: TextAlign.right,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppColors.textBodyDim,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    selection.isObserved
                        ? 'Entered rating'
                        : 'Estimated connection',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppColors.textBodyDim,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 12),
          if (series.isEmpty)
            const SizedBox(
              height: 150,
              child: Center(
                child: Text(
                  'Your first rating will appear here.',
                  style: TextStyle(color: AppColors.textBodyDim),
                ),
              ),
            )
          else
            WellbeingTrend(
              series: series,
              selectedIndex: _scrub,
              onSelected: (index) => setState(() {
                _scrub = index;
                if (series[index].isObserved &&
                    wheels.any((w) => w.dayKey == series[index].day.key)) {
                  _wheelDay = series[index].day.key;
                }
              }),
            ),
          if (series.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    DateFormat('d MMM').format(series.first.day.date),
                    style: const TextStyle(
                      color: AppColors.textBodyDim,
                      fontSize: 11,
                    ),
                  ),
                  Text(
                    DateFormat('d MMM').format(series.last.day.date),
                    style: const TextStyle(
                      color: AppColors.textBodyDim,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 10),
          const Text(
            '● Entered rating    ━ Gray: days without a rating',
            style: TextStyle(color: AppColors.textBodyDim, fontSize: 11),
          ),
          if (wheel != null) ...[
            const SizedBox(height: 28),
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Life wheel',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                  ),
                ),
                DropdownButton<String>(
                  value: wheel.dayKey,
                  underline: const SizedBox(),
                  dropdownColor: AppColors.surfaceElevated,
                  items: [
                    for (final w in wheels)
                      DropdownMenuItem(
                        value: w.dayKey,
                        child: Text(
                          DateFormat(
                            'd MMM y',
                          ).format(DateTime.parse(w.dayKey)),
                          style: const TextStyle(fontSize: 13),
                        ),
                      ),
                  ],
                  onChanged: (day) => setState(() => _wheelDay = day),
                ),
              ],
            ),
            Center(
              child: LifeWheel(
                values: wheel.domains,
                selected: domain,
                onSelected: (d) => setState(() {
                  _metric = d.name;
                  _scrub = null;
                }),
              ),
            ),
            if (wheels.length > 1)
              CustomSlider(
                value: wheels.indexOf(wheel),
                min: 0,
                max: wheels.length - 1,
                label: 'Life wheel history',
                valueFormatter: (index) => DateFormat(
                  'd MMM y',
                ).format(DateTime.parse(wheels[index].dayKey)),
                enableGlass: enableGlass,
                onChanged: (index) =>
                    setState(() => _wheelDay = wheels[index].dayKey),
              ),
            Text(
              '${wheel.domains.length} of 8 areas rated',
              style: const TextStyle(
                color: AppColors.textBodyDim,
                fontSize: 12,
              ),
            ),
          ],
          const SizedBox(height: 24),
          const Divider(color: AppColors.borderSubtle),
          const SizedBox(height: 14),
          const Text(
            'Reflections',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class WellbeingTrend extends StatelessWidget {
  const WellbeingTrend({
    super.key,
    required this.series,
    this.selectedIndex,
    this.onSelected,
  });
  final List<WellbeingPoint> series;
  final int? selectedIndex;
  final ValueChanged<int>? onSelected;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, bounds) {
      void select(Offset offset) {
        final index =
            ((offset.dx - 10) / (bounds.maxWidth - 20) * (series.length - 1))
                .round()
                .clamp(0, series.length - 1);
        if (index != selectedIndex) onSelected?.call(index);
      }

      return Semantics(
        label:
            'Satisfaction history. '
            '${series.where((p) => p.isObserved).length} entered ratings. Gray lines bridge missing days.',
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapDown: (d) => select(d.localPosition),
          onHorizontalDragStart: (d) => select(d.localPosition),
          onHorizontalDragUpdate: (d) => select(d.localPosition),
          child: RepaintBoundary(
            child: CustomPaint(
              size: Size(bounds.maxWidth, 170),
              painter: WellbeingTrendPainter(series, selectedIndex),
            ),
          ),
        ),
      );
    },
  );
}

class WellbeingTrendPainter extends CustomPainter {
  const WellbeingTrendPainter(this.series, this.selectedIndex);
  final List<WellbeingPoint> series;
  final int? selectedIndex;
  @override
  void paint(Canvas canvas, Size size) {
    const inset = 10.0;
    final grid = Paint()
      ..color = AppColors.borderSubtle
      ..strokeWidth = 0.7;
    for (final value in [0, 5, 10]) {
      final y = inset + (1 - value / 10) * (size.height - 2 * inset);
      canvas.drawLine(Offset(inset, y), Offset(size.width - inset, y), grid);
    }
    Offset point(int index) => Offset(
      series.length == 1
          ? size.width / 2
          : inset + index / (series.length - 1) * (size.width - 2 * inset),
      inset + (1 - series[index].value / 10) * (size.height - 2 * inset),
    );
    for (var i = 1; i < series.length; i++) {
      final observed = series[i - 1].isObserved && series[i].isObserved;
      canvas.drawLine(
        point(i - 1),
        point(i),
        Paint()
          ..color = observed ? AppColors.textSoftWhite : AppColors.textNeutral
          ..strokeWidth = 2
          ..strokeCap = StrokeCap.round,
      );
    }
    for (var i = 0; i < series.length; i++) {
      if (series[i].isObserved) {
        canvas.drawCircle(
          point(i),
          3.3,
          Paint()..color = AppColors.textPrimary,
        );
        canvas.drawCircle(point(i), 1.4, Paint()..color = AppColors.background);
      }
    }
    if (selectedIndex != null && selectedIndex! < series.length) {
      final p = point(selectedIndex!);
      canvas.drawLine(
        Offset(p.dx, inset),
        Offset(p.dx, size.height - inset),
        Paint()
          ..color = AppColors.sliderThumbUnset
          ..strokeWidth = 0.8,
      );
    }
  }

  @override
  bool shouldRepaint(WellbeingTrendPainter old) =>
      old.series != series || old.selectedIndex != selectedIndex;
}
