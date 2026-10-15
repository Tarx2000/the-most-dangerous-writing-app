import 'dart:math';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/core/rating_day.dart';
import 'package:mda_flutter/data/models/pillar.dart';
import 'package:mda_flutter/data/models/wellbeing_checkin.dart';
import 'package:mda_flutter/domain/use_cases/mastery_logic.dart';
import 'package:mda_flutter/domain/use_cases/wellbeing_history.dart';

Pillar pillar(
  String id, {
  PillarScope scope = PillarScope.daily,
  int? reactivatedAt,
  int adaptiveDays = 14,
}) => Pillar(
  id: id,
  title: id,
  type: PillarType.rating,
  scope: scope,
  createdAt: 0,
  reactivatedAt: reactivatedAt,
  adaptiveDays: adaptiveDays,
);
PillarLog log(String id, DateTime time) => PillarLog(
  id: '$id-$time',
  pillarId: id,
  valueNum: 5,
  timestamp: time.millisecondsSinceEpoch,
);
WellbeingCheckin checkin(String day, int value, {int? completed}) =>
    WellbeingCheckin(
      dayKey: day,
      overall: value,
      updatedAt: 0,
      completedWheelAt: completed,
      domains: completed == null ? const {} : {LifeDomain.health: 5},
    );

void main() {
  test(
    '03:00 is the single local calendar boundary, including month/year changes',
    () {
      expect(RatingDay.at(DateTime(2026, 1, 1, 2, 59)).key, '2025-12-31');
      expect(RatingDay.at(DateTime(2026, 1, 1, 3)).key, '2026-01-01');
      expect(RatingDay.at(DateTime(2026, 10, 26, 1)).key, '2026-10-25');
      final day = RatingDay.parse('2026-10-25');
      expect(day.start, DateTime(2026, 10, 25, 3));
      expect(day.end, DateTime(2026, 10, 26, 3));
      expect(
        RatingDay.parse('2026-03-30').daysSince(RatingDay.parse('2026-03-28')),
        2,
      );
      expect(() => RatingDay.parse('2026-02-31'), throwsFormatException);
    },
  );

  test(
    'internal calendar gaps interpolate for drawing only with exact markers',
    () {
      final observations = [
        checkin('2026-10-12', 2),
        checkin('2026-10-16', 10),
      ];
      final series = wellbeingSeries(observations, null);
      expect(series.map((p) => p.value), [2, 4, 6, 8, 10]);
      expect(series.map((p) => p.isObserved), [
        true,
        false,
        false,
        false,
        true,
      ]);
      expect(series.first.day.key, '2026-10-12');
      expect(series.last.day.key, '2026-10-16');
      expect(observations.length, 2);
      expect(wellbeingSeries(observations, LifeDomain.health), isEmpty);
      expect(wellbeingSeries([observations.first], null).length, 1);
    },
  );

  test('quick overall ratings do not postpone the weekly wheel reminder', () {
    final completed = DateTime(2026, 10, 8, 12).millisecondsSinceEpoch;
    final entries = [
      checkin('2026-10-08', 4, completed: completed),
      checkin('2026-10-15', 8),
    ];
    expect(isWheelDue(entries, DateTime(2026, 10, 15, 2, 59)), isFalse);
    expect(isWheelDue(entries, DateTime(2026, 10, 15, 3)), isTrue);
  });

  test('daily/weekly due use rating days and actual observations', () {
    final now = DateTime(2026, 10, 15, 3);
    expect(
      masteryOverdueDays(pillar('a'), [
        log('a', DateTime(2026, 10, 15, 2, 59)),
      ], now),
      0,
    );
    expect(masteryOverdueDays(pillar('a'), [log('a', now)], now), -1);
    expect(
      masteryOverdueDays(pillar('a', scope: PillarScope.weekly), [
        log('a', DateTime(2026, 10, 8, 3)),
      ], now),
      0,
    );
    expect(
      masteryOverdueDays(
        pillar('a', reactivatedAt: now.millisecondsSinceEpoch),
        [log('a', DateTime(2026, 9, 1, 12))],
        now,
      ),
      0,
    );
  });

  test(
    'adaptive graduation counts distinct 03:00 days and switches eligibility',
    () {
      final p = pillar('a', scope: PillarScope.adaptive, adaptiveDays: 2);
      final logs = [
        log('a', DateTime(2026, 10, 12, 23)),
        log('a', DateTime(2026, 10, 13, 1)),
        log('a', DateTime(2026, 10, 13, 3)),
        log('another', DateTime(2026, 10, 14, 12)),
      ];
      expect(adaptiveProgress(pillar: p, logs: logs), 1);
      expect(effectiveScope(p, logs), PillarScope.weekly);
      expect(
        pickPillarsForCheckIn(
          allPillars: [p],
          logs: logs,
          now: DateTime(2026, 10, 21, 12),
          isWeekly: false,
        ),
        isEmpty,
      );
      expect(
        pickPillarsForCheckIn(
          allPillars: [p],
          logs: logs,
          now: DateTime(2026, 10, 21, 12),
          isWeekly: true,
        ).single.id,
        'a',
      );
    },
  );

  test(
    'overdue weighting strongly favors four days over one, without duplicates',
    () {
      final now = DateTime(2026, 10, 15, 12);
      final pillars = [pillar('four'), pillar('one'), pillar('third')];
      final logs = [
        log('four', DateTime(2026, 10, 10, 12)),
        log('one', DateTime(2026, 10, 13, 12)),
      ];
      final rng = Random(41);
      var four = 0, one = 0;
      for (var i = 0; i < 2000; i++) {
        final result = pickPillarsForCheckIn(
          allPillars: pillars,
          isWeekly: false,
          logs: logs,
          now: now,
          random: rng,
        );
        expect(result.map((p) => p.id).toSet().length, result.length);
        if (result.first.id == 'four') four++;
        if (result.first.id == 'one') one++;
      }
      expect(four / one, inInclusiveRange(5.0, 8.0));
    },
  );
}
