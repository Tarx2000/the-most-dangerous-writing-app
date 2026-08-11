/// CalendarView — streak calendar (port of `CalendarView.tsx`, SPEC §15).
/// Hero streak header · month nav (‹ ›) · weekday headers · swipeable
/// month grid. Record days (streak history) get the danger fill; today gets
/// the white ring; daySize = (width − 80) / 7 (parity).
///
/// Implementation note: the RN app uses a 3-month finger-tracking strip;
/// Flutter's PageView delivers the same behavior natively at 120 Hz with
/// springy page snapping.
library;

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import 'animated_scale_button.dart';

class CalendarView extends StatefulWidget {
  const CalendarView({super.key, required this.currentStreak, required this.streakHistory});

  final int currentStreak;
  final List<String> streakHistory;

  @override
  State<CalendarView> createState() => _CalendarViewState();
}

class _CalendarViewState extends State<CalendarView> {
  static const _weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  late final PageController _pager = PageController(initialPage: 1);
  int _monthOffset = 0; // 0 = current month; >0 = back in time

  DateTime get _currentMonth {
    final now = DateTime.now();
    return DateTime(now.year, now.month - _monthOffset, 1);
  }

  bool get _canGoForward => _monthOffset > 0;

  void _commitMonth(int delta) {
    setState(() => _monthOffset += delta);
    _pager.jumpToPage(1); // always recenter on the new "current" month
  }

  @override
  void dispose() {
    _pager.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final recordDays = widget.streakHistory.toSet();
    final month = _currentMonth;
    final monthLabel = _monthName(month.month);
    final yearLabel = '${month.year}';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Hero streak header
        const Text('🔥', style: TextStyle(fontSize: 36)),
        const SizedBox(height: 12),
        Text.rich(
          TextSpan(
            text: "You're on a\n",
            style: const TextStyle(
              color: AppColors.textPrimary,
              fontSize: 32,
              fontWeight: FontWeight.w800,
              height: 1.15,
            ),
            children: [
              TextSpan(
                text: '${widget.currentStreak}-day ',
                style: const TextStyle(color: AppColors.primaryAction),
              ),
              const TextSpan(text: 'streak'),
            ],
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Keep it up! Write every day and don\'t let your streak reset.',
          style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
        ),
        const SizedBox(height: 18),
        // Month nav
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '$monthLabel $yearLabel',
              style: const TextStyle(
                color: AppColors.textPrimary,
                fontSize: 18,
                fontWeight: FontWeight.w800,
              ),
            ),
            Row(
              children: [
                AnimatedScaleButton(
                  onPress: () => _commitMonth(1),
                  child: _arrow('‹'),
                ),
                const SizedBox(width: 8),
                AnimatedScaleButton(
                  onPress: _canGoForward ? () => _commitMonth(-1) : null,
                  child: _arrow('›', enabled: _canGoForward),
                ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 12),
        // Weekday headers + grid
        LayoutBuilder(
          builder: (context, constraints) {
            final daySize = (constraints.maxWidth - 80) / 7;
            return Column(
              children: [
                Row(
                  children: [
                    for (final day in _weekDays)
                      SizedBox(
                        width: daySize,
                        child: Text(
                          day,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: AppColors.textMuted,
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 6),
                // 3 months: prev (0) / current (1) / next (2)
                SizedBox(
                  height: daySize * 6.2,
                  child: PageView.builder(
                    controller: _pager,
                    onPageChanged: (page) {
                      if (page == 0) {
                        _commitMonth(1);
                      } else if (page == 2) {
                        _commitMonth(-1);
                      }
                    },
                    itemBuilder: (context, page) {
                      final monthDate =
                          DateTime(month.year, month.month - 1 + page, 1);
                      return _MonthGrid(
                        year: monthDate.year,
                        month: monthDate.month,
                        daySize: daySize,
                        recordDays: recordDays,
                      );
                    },
                    itemCount: 3,
                  ),
                ),
              ],
            );
          },
        ),
      ],
    );
  }

  Widget _arrow(String glyph, {bool enabled = true}) {
    return Container(
      width: 32,
      height: 32,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.glassSurfaceMedium,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        glyph,
        style: TextStyle(
          color: enabled ? AppColors.textSecondary : AppColors.textMuted,
          fontSize: 22,
          fontWeight: FontWeight.w300,
        ),
      ),
    );
  }

  static String _monthName(int month) {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    return months[month - 1];
  }
}

/// One month of circular day cells (parity: danger fill on record days,
/// white ring on today).
class _MonthGrid extends StatelessWidget {
  const _MonthGrid({
    required this.year,
    required this.month,
    required this.daySize,
    required this.recordDays,
  });

  final int year;
  final int month;
  final double daySize;
  final Set<String> recordDays;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final daysInMonth = DateTime(year, month + 1, 0).day;
    final firstDayJS = DateTime(year, month, 1).weekday % 7; // 0 = Monday
    final cells = <Widget>[];

    for (var i = 0; i < firstDayJS; i++) {
      cells.add(SizedBox(width: daySize, height: daySize));
    }

    for (var day = 1; day <= daysInMonth; day++) {
      final dateStr =
          '${year.toString().padLeft(4, '0')}-${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';
      final hasRecord = recordDays.contains(dateStr);
      final isToday = now.year == year && now.month == month && now.day == day;

      cells.add(Container(
        key: ValueKey('cal-day-$dateStr'),
        width: daySize,
        height: daySize,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: hasRecord ? AppColors.primaryAction : null,
          shape: BoxShape.circle,
          border: isToday
              ? Border.all(
                  color: AppColors.textPrimary,
                  width: hasRecord ? 2 : 1.5,
                )
              : null,
        ),
        child: Text(
          '$day',
          style: TextStyle(
            color: hasRecord
                ? AppColors.primaryActionText
                : isToday
                    ? AppColors.textPrimary
                    : AppColors.textSecondary,
            fontSize: 14,
            fontWeight: isToday ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
      ));
    }

    return Wrap(spacing: 0, runSpacing: 2, children: cells);
  }
}
