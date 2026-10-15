import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/core/rating_day.dart';
import 'package:mda_flutter/data/database/db.dart';
import 'package:mda_flutter/data/database/repositories/pillars_repository.dart';
import 'package:mda_flutter/data/database/repositories/wellbeing_repository.dart';
import 'package:mda_flutter/data/models/pillar.dart';
import 'package:mda_flutter/data/models/wellbeing_checkin.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
    setDatabasePathForTest(inMemoryDatabasePath);
  });
  setUp(() => setPrefsAccess(() async => {}, (key, value) async {}));
  tearDown(closeDb);

  test(
    'quick and partial wheel update one day; cutoff rejects old edits',
    () async {
      final repo = WellbeingRepository();
      final before = DateTime(2026, 10, 16, 2, 59);
      final day = RatingDay.at(before).key;
      await repo.save(
        WellbeingCheckin(
          dayKey: day,
          overall: 0,
          updatedAt: before.millisecondsSinceEpoch,
        ),
        now: before,
      );
      await repo.save(
        WellbeingCheckin(
          dayKey: day,
          overall: 7,
          domains: {LifeDomain.health: 0, LifeDomain.work: 10},
          completedWheelAt: before.millisecondsSinceEpoch,
          updatedAt: before.millisecondsSinceEpoch,
        ),
        now: before,
      );
      final entries = await repo.getAllCheckins();
      expect(entries, hasLength(1));
      expect(entries.single.overall, 7);
      expect(entries.single.domains, {
        LifeDomain.health: 0,
        LifeDomain.work: 10,
      });
      expect(entries.single.domains.containsKey(LifeDomain.finances), isFalse);
      await expectLater(
        repo.save(entries.single, now: DateTime(2026, 10, 16, 3)),
        throwsStateError,
      );
      expect((await repo.getAllCheckins()).single.overall, 7);
    },
  );

  test(
    'same-day mastery save updates a single row and preserves its note link',
    () async {
      final repo = PillarsRepository();
      final now = DateTime(2026, 10, 15, 12);
      PillarLog entry(String id, double value) => PillarLog(
        id: id,
        pillarId: 'sleep',
        valueNum: value,
        timestamp: now.millisecondsSinceEpoch,
      );
      final first = await repo.saveCurrentLog(entry('one', 5), now: now);
      await repo.updatePillarLogNoteId(first.id, 'reflection');
      final second = await repo.saveCurrentLog(entry('two', 9), now: now);
      expect(second.id, first.id);
      final logs = await repo.getPillarLogs('sleep');
      expect(logs, hasLength(1));
      expect(logs.single.valueNum, 9);
      expect(logs.single.noteId, 'reflection');
      expect(logs.single.dayKey, '2026-10-15');
      await expectLater(
        repo.saveCurrentLog(entry('old', 1), now: DateTime(2026, 10, 16, 3)),
        throwsStateError,
      );
    },
  );

  test(
    'selection persistence distinguishes an empty draw and never redraws a day',
    () async {
      final repo = PillarsRepository();
      expect(await repo.getSelection('2026-10-15', 'daily'), isNull);
      await repo.saveSelection('2026-10-15', 'daily', []);
      await repo.saveSelection('2026-10-15', 'daily', ['new']);
      expect(await repo.getSelection('2026-10-15', 'daily'), isEmpty);
      await repo.saveSelection('2026-10-15', 'weekly', ['one', 'two']);
      expect(await repo.getSelection('2026-10-15', 'weekly'), ['one', 'two']);
    },
  );
}
