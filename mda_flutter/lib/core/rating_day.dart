/// Local calendar days with the agreed 03:00 boundary. Calendar construction
/// (rather than subtracting 24 hours) keeps this correct across DST changes.
class RatingDay {
  RatingDay(DateTime date) : date = DateTime(date.year, date.month, date.day);

  factory RatingDay.at(DateTime instant) {
    final local = instant.toLocal();
    return RatingDay(
      DateTime(local.year, local.month, local.day - (local.hour < 3 ? 1 : 0)),
    );
  }

  factory RatingDay.parse(String key) {
    final parsed = DateTime.parse(key);
    final result = RatingDay(parsed);
    if (result.key != key) throw FormatException('Invalid rating day', key);
    return result;
  }

  final DateTime date;
  String get key =>
      '${date.year.toString().padLeft(4, '0')}-'
      '${date.month.toString().padLeft(2, '0')}-'
      '${date.day.toString().padLeft(2, '0')}';
  DateTime get start => DateTime(date.year, date.month, date.day, 3);
  DateTime get end => DateTime(date.year, date.month, date.day + 1, 3);
  int get ordinal => DateTime.utc(
    date.year,
    date.month,
    date.day,
  ).difference(DateTime.utc(1970)).inDays;
  int daysSince(RatingDay other) => ordinal - other.ordinal;
  bool isCurrent(DateTime now) => key == RatingDay.at(now).key;
}
