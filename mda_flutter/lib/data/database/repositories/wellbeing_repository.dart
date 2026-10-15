import '../../../core/rating_day.dart';
import '../../models/wellbeing_checkin.dart';
import '../db.dart';

class WellbeingRepository {
  Future<List<WellbeingCheckin>> getAllCheckins() async => (await getAll(
    'SELECT * FROM wellbeing_checkins ORDER BY day_key DESC',
  )).map(WellbeingCheckin.fromRow).toList();

  Future<void> save(WellbeingCheckin entry, {DateTime? now}) async {
    if (!RatingDay.parse(entry.dayKey).isCurrent(now ?? DateTime.now())) {
      throw StateError('This rating day is closed at 03:00.');
    }
    if (entry.overall == null && entry.domains.isEmpty) {
      throw ArgumentError('A check-in needs at least one actual rating.');
    }
    final row = entry.toRow();
    await run(
      'INSERT INTO wellbeing_checkins (${row.keys.join(', ')}) '
      'VALUES (${List.filled(row.length, '?').join(', ')}) '
      'ON CONFLICT(day_key) DO UPDATE SET overall=excluded.overall, '
      'domains=excluded.domains, completed_wheel_at=excluded.completed_wheel_at, '
      'updated_at=excluded.updated_at',
      row.values.toList(),
    );
  }
}
