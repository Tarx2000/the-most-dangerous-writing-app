/// Calendar date-math tests — pins the "eingekreiste 21" fix.
///
/// Bug report (German): scrolling the date library between months showed
/// other months, but the 21st stayed ringed even though it is not August
/// 2024 / today. Two root causes, both covered here:
/// 1. `weekday % 7` maps Sunday→0 AND Monday→1 (off by one): the grid could
///    render Sunday-first on some months, shifting every day cell.
/// 2. The today ring compared only `day == now.day` in some paths, so EVERY
///    month's 21st got the ring — the ring belongs to exactly one cell.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/ui/core/widgets/calendar_view.dart';

void main() {
  group('mondayFirstBlanks', () {
    test('Monday-start month has no blanks (Sep 2025 starts Monday)', () {
      expect(CalendarViewState.mondayFirstBlanks(2025, 9), 0);
    });
    test('Sunday-start month has six blanks (Jun 2025 starts Sunday)', () {
      expect(CalendarViewState.mondayFirstBlanks(2025, 6), 6);
    });
    test('Saturday-start month has five blanks (Aug 2026 starts Saturday)', () {
      // The report's month: August 2026 starts on a Saturday.
      expect(CalendarViewState.mondayFirstBlanks(2026, 8), 5);
    });
    test('spot-check all 2026 months against DateTime.weekday', () {
      for (var m = 1; m <= 12; m++) {
        final expected = DateTime(2026, m, 1).weekday - 1;
        expect(
          CalendarViewState.mondayFirstBlanks(2026, m),
          expected,
          reason: 'month $m',
        );
        expect(expected, inInclusiveRange(0, 6));
      }
    });
  });

  group('monthForOffset', () {
    test('offset 0 is the current month', () {
      final now = DateTime(2026, 8, 21);
      final m = CalendarViewState.monthForOffset(now, 0);
      expect((m.year, m.month), (2026, 8));
    });
    test('offset crosses year boundaries', () {
      final now = DateTime(2026, 1, 15);
      final m = CalendarViewState.monthForOffset(now, 1);
      expect((m.year, m.month), (2025, 12));
    });
  });

  group('clampOffset', () {
    test('never goes negative (no future months)', () {
      expect(CalendarViewState.clampOffset(-5), 0);
      expect(CalendarViewState.clampOffset(0), 0);
      expect(CalendarViewState.clampOffset(3), 3);
    });
  });
}
