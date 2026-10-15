import '../../core/rating_day.dart';
import '../../data/models/wellbeing_checkin.dart';

class WellbeingPoint {
  const WellbeingPoint({
    required this.day,
    required this.value,
    required this.isObserved,
  });
  final RatingDay day;
  final double value;
  final bool isObserved;
}

/// Missing internal days are drawing-only estimates. No extrapolation and no
/// synthetic observations are returned to persistence or statistics.
List<WellbeingPoint> wellbeingSeries(
  List<WellbeingCheckin> entries,
  LifeDomain? domain,
) {
  final observations = entries.where((e) => e.score(domain) != null).toList()
    ..sort((a, b) => a.dayKey.compareTo(b.dayKey));
  final result = <WellbeingPoint>[];
  for (var i = 0; i < observations.length; i++) {
    final current = observations[i];
    final day = RatingDay.parse(current.dayKey);
    if (i > 0) {
      final previous = observations[i - 1];
      final prevDay = RatingDay.parse(previous.dayKey);
      final gap = day.daysSince(prevDay);
      for (var offset = 1; offset < gap; offset++) {
        result.add(
          WellbeingPoint(
            day: RatingDay(
              DateTime(
                prevDay.date.year,
                prevDay.date.month,
                prevDay.date.day + offset,
              ),
            ),
            value:
                previous.score(domain)! +
                (current.score(domain)! - previous.score(domain)!) *
                    offset /
                    gap,
            isObserved: false,
          ),
        );
      }
    }
    result.add(
      WellbeingPoint(
        day: day,
        value: current.score(domain)!.toDouble(),
        isObserved: true,
      ),
    );
  }
  return result;
}

bool isWheelDue(List<WellbeingCheckin> entries, DateTime now) {
  final completions = entries.where((e) => e.completedWheelAt != null).toList();
  if (completions.isEmpty) return true;
  completions.sort(
    (a, b) => a.completedWheelAt!.compareTo(b.completedWheelAt!),
  );
  return RatingDay.at(now).daysSince(
        RatingDay.at(
          DateTime.fromMillisecondsSinceEpoch(
            completions.last.completedWheelAt!,
          ),
        ),
      ) >=
      7;
}
