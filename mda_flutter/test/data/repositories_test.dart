/// Repository integration tests — CRUD through the SQLite layer
/// (parity with the RN `storageOps`-level behavior).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/core/utils.dart';
import 'package:mda_flutter/data/database/db.dart';
import 'package:mda_flutter/data/database/repositories/notes_repository.dart';
import 'package:mda_flutter/data/database/repositories/persons_repository.dart';
import 'package:mda_flutter/data/database/repositories/pillars_repository.dart';
import 'package:mda_flutter/data/database/repositories/settings_repository.dart';
import 'package:mda_flutter/data/database/repositories/vlogs_repository.dart';
import 'package:mda_flutter/data/models/person.dart';
import 'package:mda_flutter/data/models/pillar.dart';
import 'package:mda_flutter/data/models/saved_note.dart';
import 'package:mda_flutter/data/models/saved_vlog.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
    // In-memory DB: fully isolated from other test files (parallel runs).
    setDatabasePathForTest(inMemoryDatabasePath);
  });

  setUp(() {
    setPrefsAccess(
      () async => {},
      (key, value) async {},
    );
  });

  tearDown(() async {
    await closeDb();
  });

  group('NotesRepository', () {
    test('insert → read → partial update → delete', () async {
      final repo = NotesRepository();
      final note = SavedNote(
        id: generateId(),
        text: 'Hello dangerous world',
        dateStr: toLocalDateString(DateTime.now()),
        timestamp: DateTime.now().millisecondsSinceEpoch,
        durationMin: 5,
        won: true,
      );
      await repo.insertNote(note);

      final all = await repo.getAllNotes();
      expect(all.length, 1);
      expect(all.first.text, note.text);

      await repo.updateNote(note.id, {'ai_title': 'Hello World', 'ai_model_used': 'test-model'});
      final updated = await repo.getNoteById(note.id);
      expect(updated?.aiTitle, 'Hello World');
      expect(updated?.aiModelUsed, 'test-model');
      expect(updated?.won, isTrue); // untouched field survives

      await repo.deleteNote(note.id);
      expect(await repo.getAllNotes(), isEmpty);
    });

    test('insertNote auto-writes tweet flag from the model', () async {
      final repo = NotesRepository();
      final tweet = SavedNote(
        id: generateId(),
        text: 'short tweet',
        dateStr: '2026-08-11',
        timestamp: 1,
        durationMin: 0,
        won: false,
        isTweet: true,
      );
      await repo.insertNote(tweet);
      final row = await getFirst('SELECT is_tweet FROM notes WHERE id = ?', [tweet.id]);
      expect(row?['is_tweet'], 1);
    });

    test('unknown update columns are ignored', () async {
      final repo = NotesRepository();
      final note = SavedNote(
        id: generateId(),
        text: 'x',
        dateStr: '2026-08-11',
        timestamp: 1,
        durationMin: 0,
        won: false,
      );
      await repo.insertNote(note);
      await repo.updateNote(note.id, {'hack_column': 'boom'});
      final loaded = await repo.getNoteById(note.id);
      expect(loaded?.text, 'x');
    });
  });

  group('PersonsRepository', () {
    test('insert, update relationship, delete detaches notes', () async {
      final personsRepo = PersonsRepository();
      final notesRepo = NotesRepository();

      final person = Person(
        id: generateId(),
        name: 'Ada',
        createdAt: DateTime.now().millisecondsSinceEpoch,
      );
      await personsRepo.insertPerson(person);

      final note = SavedNote(
        id: generateId(),
        text: 'to ada',
        dateStr: '2026-08-11',
        timestamp: 1,
        durationMin: 3,
        won: true,
        personId: person.id,
      );
      await notesRepo.insertNote(note);

      await personsRepo.updatePerson(person.id, {'relationship': 'Friend'});
      final updated = await personsRepo.getPersonById(person.id);
      expect(updated?.relationship, 'Friend');

      await personsRepo.deletePerson(person.id);
      final detached = await notesRepo.getNoteById(note.id);
      expect(detached?.personId, isNull);
    });
  });

  group('PillarsRepository', () {
    test('pillar CRUD + version rows + advice cards + logs', () async {
      final repo = PillarsRepository();

      final pillar = Pillar(
        id: generateId(),
        title: 'Gym',
        type: PillarType.time,
        scope: PillarScope.daily,
        createdAt: DateTime.now().millisecondsSinceEpoch,
      );
      await repo.insertPillar(pillar);
      await repo.insertPillarVersion(PillarVersion(
        id: '${pillar.id}_v1',
        pillarId: pillar.id,
        version: 1,
        title: pillar.title,
        createdAt: pillar.createdAt,
      ));

      final all = await repo.getAllPillars();
      expect(all.length, 4); // 3 seeds + 1 new
      expect(all.first.title, 'Gym');

      final versions = await repo.getPillarVersions(pillar.id);
      expect(versions.length, 1);

      final log = PillarLog(
        id: generateId(),
        pillarId: pillar.id,
        valueNum: 7.0,
        valueStr: '7.0',
        timestamp: DateTime.now().millisecondsSinceEpoch,
      );
      await repo.insertPillarLog(log);
      final logs = await repo.getPillarLogs(pillar.id);
      expect(logs.length, 1);

      final lastLog = await repo.getLatestPillarLogTimestamp();
      expect(lastLog, isNotNull);

      await repo.hardDeletePillar(pillar.id);
      expect(await repo.getPillarLogs(pillar.id), isEmpty);
      expect(await repo.getPillarVersions(pillar.id), isEmpty);
      expect(await repo.getPillarById(pillar.id), isNull);
    });

    test('incrementAdviceReflection bumps count + timestamp', () async {
      final repo = PillarsRepository();
      await repo.incrementAdviceReflection('mock_advice_listen', 1234);
      final card = await repo.getAdviceById('mock_advice_listen');
      expect(card?.reflectionCount, 1);
      expect(card?.lastReflectedAt, 1234);
    });
  });

  group('VlogsRepository', () {
    test('insert + path rebasing', () async {
      final repo = VlogsRepository(
        documentsDirProvider: () async => '/sandbox/docs',
      );
      final vlog = SavedVlog(
        id: generateId(),
        filePath: '/old/device/vlogs/abc.mp4',
        dateStr: '2026-08-11',
        timestamp: 1,
        durationSec: 60,
        fileSizeBytes: 100,
        thumbnailPath: '/old/device/vlog_thumbnails/abc.jpg',
        compressionPreset: 'balanced',
      );
      await repo.insertVlog(vlog);

      final all = await repo.getAllVlogs();
      expect(all.length, 1);
      expect(all.first.filePath, '/sandbox/docs/vlogs/abc.mp4');
      expect(all.first.thumbnailPath, '/sandbox/docs/vlog_thumbnails/abc.jpg');
      expect(all.first.compressionPreset, 'balanced');
    });
  });

  group('SettingsRepository', () {
    test('upsert semantics (set twice keeps one row)', () async {
      final repo = SettingsRepository();
      await repo.setSetting('KEY_A', 'first');
      await repo.setSetting('KEY_A', 'second');
      await repo.setSetting('KEY_B', 'b');

      expect(await repo.getSetting('KEY_A'), 'second');
      final all = await repo.getAllSettings();
      expect(all.length, 2);

      await repo.deleteSetting('KEY_A');
      expect(await repo.getSetting('KEY_A'), isNull);
    });
  });
}
