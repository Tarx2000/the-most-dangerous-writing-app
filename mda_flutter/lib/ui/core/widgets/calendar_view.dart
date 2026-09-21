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
  State<CalendarView> createState() => CalendarViewState();
}

/// State is public so the date math is unit-testable (see
/// `test/ui/calendar_math_test.dart`). Widget behavior is unchanged.
class CalendarViewState extends State<CalendarView> {
  static const _weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  late final PageController _pager = PageController(initialPage: 1);
  int _monthOffset = 0; // 0 = current month; >0 = back in time

  DateTime get _currentMonth {
    final now = DateTime.now();
    return CalendarViewState.monthForOffset(now, _monthOffset);
  }

  bool get _canGoForward => _monthOffset > 0;

  void _commitMonth(int delta) {
    // RN parity (`commitMonth`): going back is unbounded, going forward
    // stops at the current month (offset 0). Without the clamp the label
    // could show a FUTURE month while the ring logic still compares days
    // against `now` — the "eingekreiste 21" symptom from the bug report.
    setState(() => _monthOffset = CalendarViewState.clampOffset(_monthOffset + delta));
    _pager.jumpToPage(1); // always recenter on the new "current" month
  }

  /// Shared date math, unit-tested (see `calendar_math_test.dart`):
  /// displayed month for an offset, Monday-first leading blanks, and the
  /// future-month clamp. The report's core bug: `weekday % 7` maps Sunday→0
  /// AND Monday→1 (off by one — Sunday-first layout on some months), and the
  /// PageView could drift into future months no arrow could reach.
  ///
  /// Monday-first blanks for a month: Dart `weekday` is 1 = Monday …
  /// 7 = Sunday, so `weekday − 1` IS the blank count (RN `(getDay()+6)%7`).
  /// The old `weekday % 7` mapped Sunday→0 AND Monday→1 — off by one.
  static int mondayFirstBlanks(int year, int month) =>
      DateTime(year, month, 1).weekday - 1;

  /// Displayed month for a back-offset (0 = current month).
  static DateTime monthForOffset(DateTime now, int offset) =>
      DateTime(now.year, now.month - offset, 1);

  /// Forward navigation stops at the current month (RN `canGoForward`).
  static int clampOffset(int offset) => offset.clamp(0, 1200);

  @override
  void dispose() {
    _pager.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final recordDays = widget.streakHistory.toSet();
    final month = _currentMonth;
    final monthLabel = _monthName(month.month);
    final yearLabel = '${month.year}';
    // The "heute" ring belongs to exactly one cell: today's date shown in
    // the CURRENT month only. Comparing a bare `day == now.day` would ring
    // the 21st in every month the user scrolls to (the reported bug).
    final todayKey =
        '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    final showTodayRing = recordDays.contains(todayKey) || _monthOffset == 0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Hero streak header
        const Text('🔥', style: TextStyle(fontSize: 36)),
        const SizedBox(height: 12),
        Text.rich(
          TextSpan(
            style: const TextStyle(
              color: AppColors.textPrimary,
              fontSize: 32,
              fontWeight: FontWeight.w800,
              height: 1.15,
            ),
            children: [
              const TextSpan(text: "You're on a\n"),
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
            final daySize = (constraints.maxWidth / 7).floorToDouble();
            return Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
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
                        // Only the live current-month page may ring today:
                        // pager neighbours (prev/next) show plain numbers.
                        showTodayRing:
                            showTodayRing && monthDate == _currentMonth,
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
    this.showTodayRing = true,
  });

  final int year;
  final int month;
  final double daySize;
  final Set<String> recordDays;

  /// False for the PageView's prev/next neighbour pages: they render the
  /// same month shape but must never carry the today ring.
  final bool showTodayRing;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final daysInMonth = DateTime(year, month + 1, 0).day;
    // Monday-first: Dart weekday 1 (Mon) … 7 (Sun) → blanks = weekday − 1.
    final firstDayMon = CalendarViewState.mondayFirstBlanks(year, month);
    final cells = <Widget>[];

    for (var i = 0; i < firstDayMon; i++) {
      cells.add(SizedBox(width: daySize, height: daySize));
    }

    for (var day = 1; day <= daysInMonth; day++) {
      final dateStr =
          '${year.toString().padLeft(4, '0')}-${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';
      final hasRecord = recordDays.contains(dateStr);
      final isToday = showTodayRing &&
          now.year == year &&
          now.month == month &&
          now.day == day;

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

    return Center(
      child: Wrap(
        alignment: WrapAlignment.start,
        spacing: 0,
        runSpacing: 2,
        children: cells,
      ),
    );
  }
}
