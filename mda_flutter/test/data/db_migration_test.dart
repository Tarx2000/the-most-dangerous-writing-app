/// DB migration + dual-track versioning tests — parity with `db.test.ts`.
///
/// Uses the in-memory FFI factory so tests run without a device.
library;

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/data/database/db.dart';
import 'package:path/path.dart' as p;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// In-memory prefs stub mirroring SharedPreferences.
class _PrefsStub {
  final Map<String, Object> values = {};

  Future<Map<String, Object>?> read() async => Map.of(values);
  Future<void> write(String key, Object value) async => values[key] = value;
}

void main() {
  late _PrefsStub prefs;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
    // In-memory DB: fully isolated from other test files (parallel runs).
    setDatabasePathForTest(inMemoryDatabasePath);
  });

  setUp(() {
    prefs = _PrefsStub();
    setPrefsAccess(prefs.read, prefs.write);
  });

  tearDown(() async {
    await closeDb();
  });

  test('migrates an empty DB to schema v6', () async {
    final db = await getDb();
    final version = await getCurrentSchemaVersion();
    expect(version, currentSchemaVersion);

    // The prefs marker is written during the fresh migration (dual-track).
    expect(prefs.values[schemaVersionKey], '$currentSchemaVersion');

    // All tables exist.
    final tables = await db.rawQuery(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );
    final names = tables.map((r) => r['name']).toSet();
    expect(
      names,
      containsAll({
        'notes', 'persons', 'vlogs', 'settings', 'feed_bookmarks', 'feed_comments',
        'ai_jobs', 'ai_logs', 'pillars', 'advice_cards', 'pillar_logs', 'pillar_versions',
      }),
    );
  });

  test('PRAGMA user_version is stamped after migration', () async {
    await getDb();
    final db = await getDb();
    final pragma = await db.rawQuery('PRAGMA user_version');
    expect(pragma.first.values.first, currentSchemaVersion);
  });

  test('seed pillars + advice cards land exactly once (INSERT OR IGNORE)', () async {
    await getDb();
    final db = await getDb();
    final pillars = await db.rawQuery('SELECT * FROM pillars');
    final cards = await db.rawQuery('SELECT * FROM advice_cards');
    expect(pillars.length, 3);
    expect(cards.length, 2);
    final pillarIds = pillars.map((r) => r['id']).toList();
    expect(pillarIds, containsAll(['mock_pillar_sleep', 'mock_pillar_comfort', 'mock_pillar_mindfulness']));
  });

  test('pillar_versions backfilled for seed pillars (v6)', () async {
    await getDb();
    final db = await getDb();
    final versions = await db.rawQuery('SELECT * FROM pillar_versions');
    expect(versions.length, 3);
    expect(versions.every((r) => r['version'] == 1), isTrue);
  });

  test('re-running migrations is idempotent (dual-track max rule)', () async {
    // In-memory DBs are fresh on every open — this test needs a real file
    // to prove that re-opening a migrated DB never re-runs migrations.
    final tmpDir = await Directory.systemTemp.createTemp('mda_db_idem');
    setDatabasePathForTest(p.join(tmpDir.path, 'mda_v2.db'));
    addTearDown(() async {
      await closeDb();
      await tmpDir.delete(recursive: true);
      setDatabasePathForTest(inMemoryDatabasePath);
    });

    await getDb();
    await closeDb();
    final db2 = await getDb();
    final version = await getCurrentSchemaVersion();
    expect(version, currentSchemaVersion);
    final pragma = await db2.rawQuery('PRAGMA user_version');
    expect(pragma.first.values.first, currentSchemaVersion);
  });

  test('a prefs marker ahead of the DB file still yields the effective max', () async {
    await getDb();
    prefs.values[schemaVersionKey] = '6';
    final version = await getCurrentSchemaVersion();
    expect(version, 6);
  });

  test('notes table has all migrated columns', () async {
    await getDb();
    final db = await getDb();
    final cols = await db.rawQuery('PRAGMA table_info(notes)');
    final names = cols.map((r) => r['name']).toSet();
    expect(
      names,
      containsAll({
        'id', 'text', 'date_str', 'timestamp', 'duration_min', 'won', 'person_id',
        'is_quick_note', 'is_tweet', 'ai_title', 'ai_summary', 'ai_model_used',
        'is_alignment_reflection', 'alignment_score', 'stop_text', 'start_text',
        'continue_text', 'pillar_id', 'advice_id', 'pillar_value', 'pillar_version',
      }),
    );
  });
}
