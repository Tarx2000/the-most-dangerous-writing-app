/// Database wrapper — port of `src/lib/db.ts` (SPEC §6).
///
/// Only sanctioned access to SQLite: screens/queues/services must use
/// `run` / `getAll` / `getFirst` / `exec`, never raw database handles.
///
/// Versioning is **dual-track**:
///   - `PRAGMA user_version` (lives inside the DB file, survives backup restores)
///   - SharedPreferences marker `__DB_SCHEMA_VERSION__` (legacy tracker)
/// Effective version = `max(both)`, so stale ALTERs can never crash with
/// "duplicate column" — migrations are self-healing and never brick startup.
library;

import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite/sqflite.dart';

import '../../core/logger.dart';

/// Name of the SQLite file (same as the RN app for future data migration).
const String databaseFileName = 'mda_v2.db';

/// SharedPreferences key tracking the schema version (legacy dual-track).
const String schemaVersionKey = '__DB_SCHEMA_VERSION__';

/// Current schema version of this app build.
const int currentSchemaVersion = 6;

/// In-memory DB factory override for tests (set via `databaseFactory` in tests).
/// The app itself always uses the platform factory.

Future<DatabaseFactory> _resolveFactory() async {
  return databaseFactory;
}

Database? _db;
Future<Database>? _opening;

/// Test hook: overrides the DB location (e.g. `inMemoryDatabasePath`).
/// Defaults to `<databasesPath>/mda_v2.db`.
String? _dbPathOverride;

void setDatabasePathForTest(String path) => _dbPathOverride = path;

/// Opens (and migrates) the app database. On failure the cached promise is
/// reset so a later call can retry — the app must never crash on open errors.
Future<Database> getDb() {
  final existing = _db;
  if (existing != null) return Future.value(existing);
  final pending = _opening;
  if (pending != null) return pending;

  final opening = _openInternal().catchError((Object e, StackTrace st) {
    logDb.error('getDb open failed, resetting for retry', e);
    _opening = null;
    _db = null;
    return Future<Database>.error(e, st);
  });
  _opening = opening;
  return opening;
}

Future<Database> _openInternal() async {
  final factory = await _resolveFactory();
  final path = _dbPathOverride ??
      '${await factory.getDatabasesPath()}/$databaseFileName';
  final db = await factory.openDatabase(path, options: OpenDatabaseOptions(
      // No version → sqflite skips its own version management entirely and
      // leaves `PRAGMA user_version` alone (we run the dual-track migration
      // manually right after opening).
      onConfigure: (db) async {
        await db.execute('PRAGMA foreign_keys = ON');
      },
    ),
  );
  _db = db;
  await migrate(db);
  return db;
}

/// Closes the DB (used by backup restore for the rollback snapshot).
Future<void> closeDb() async {
  final db = _db;
  _db = null;
  _opening = null;
  if (db != null) {
    try {
      await db.close();
    } catch (_) {
      // Already closed — ignore.
    }
  }
}

/// Run a write statement with bind params.
Future<void> run(String sql, [List<Object?>? params]) async {
  final db = await getDb();
  await db.rawInsert(sql, params);
}

/// Run a read statement returning all rows.
Future<List<Map<String, Object?>>> getAll(String sql, [List<Object?>? params]) async {
  final db = await getDb();
  return db.rawQuery(sql, params);
}

/// Run a read statement returning the first row (or null).
Future<Map<String, Object?>?> getFirst(String sql, [List<Object?>? params]) async {
  final rows = await getAll(sql, params);
  return rows.isEmpty ? null : rows.first;
}

/// Execute a parameter-less statement (PRAGMAs, batch DDL).
Future<void> exec(String sql) async {
  final db = await getDb();
  await db.execute(sql);
}

/// Executes all statements of [sqlScript] (multiple `;`-separated statements)
/// inside one transaction — used by migrations.
Future<void> execScript(String sqlScript) async {
  final db = await getDb();
  final statements = sqlScript
      .split(';')
      .map((s) => s.trim())
      .where((s) => s.isNotEmpty);
  await db.transaction((txn) async {
    for (final stmt in statements) {
      await txn.execute('$stmt;');
    }
  });
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

/// Result of a self-healing migration step.
class MigrationOutcome {
  const MigrationOutcome({required this.applied, this.skipped});

  final bool applied;
  final String? skipped;
}

/// Reads the effective schema version (max of both trackers).
Future<int> getCurrentSchemaVersion() async {
  final prefs = await _prefsReader();
  final asyncVersion = prefs?[schemaVersionKey];
  final pragmaVersion = await _pragmaUserVersion();
  final asyncNum = asyncVersion != null ? int.tryParse('$asyncVersion') ?? 0 : 0;
  return asyncNum > pragmaVersion ? asyncNum : pragmaVersion;
}

Future<int> _pragmaUserVersion() async {
  try {
    final db = await getDb();
    final result = await db.rawQuery('PRAGMA user_version');
    if (result.isEmpty) return 0;
    final value = result.first.values.first;
    return value is int ? value : int.tryParse('$value') ?? 0;
  } catch (_) {
    return 0;
  }
}

/// SharedPreferences access (injected via a top-level function so tests can stub it).
typedef PrefsReader = Future<Map<String, Object>?> Function();
typedef PrefsWriter = Future<void> Function(String key, Object value);

PrefsReader _prefsReader = _defaultPrefsReader;
PrefsWriter _prefsWriter = _defaultPrefsWriter;

/// Test hook: override the prefs read/write (in-memory map in tests).
void setPrefsAccess(PrefsReader reader, PrefsWriter writer) {
  _prefsReader = reader;
  _prefsWriter = writer;
}

Future<Map<String, Object>?> _defaultPrefsReader() async {
  try {
    final sp = await SharedPreferences.getInstance();
    return sp.getKeys().map((k) => MapEntry(k, sp.get(k) as Object)).toMap();
  } catch (_) {
    return null;
  }
}

extension<T> on Iterable<MapEntry<String, T>> {
  Map<String, T> toMap() => {for (final e in this) e.key: e.value};
}

Future<void> _defaultPrefsWriter(String key, Object value) async {
  try {
    final sp = await SharedPreferences.getInstance();
    if (value is String) {
      await sp.setString(key, value);
    } else if (value is int) {
      await sp.setInt(key, value);
    }
  } catch (_) {}
}

/// Applies pending migrations up to [currentSchemaVersion].
/// Self-healing: statements that fail with "duplicate column" / "already exists"
/// are treated as already-applied and skipped; a failed migration never bricks
/// startup (best-effort continue).
Future<void> migrate(Database db) async {
  final prefs = await _prefsReader();
  final asyncVersion = prefs?[schemaVersionKey];
  final asyncNum = asyncVersion != null ? int.tryParse('$asyncVersion') ?? 0 : 0;
  var pragmaVersion = 0;
  try {
    final r = await db.rawQuery('PRAGMA user_version');
    if (r.isNotEmpty) {
      final v = r.first.values.first;
      pragmaVersion = v is int ? v : int.tryParse('$v') ?? 0;
    }
  } catch (_) {}

  var current = asyncNum > pragmaVersion ? asyncNum : pragmaVersion;

  if (current >= currentSchemaVersion) return;

  for (final migration in _migrations) {
    if (migration.version > currentSchemaVersion) break;
    if (migration.version <= current) continue;

    try {
      await db.transaction((txn) async {
        for (final stmt in migration.statements) {
          try {
            await txn.execute(stmt);
          } catch (e) {
            final msg = '$e';
            final isDuplicate = RegExp(r'duplicate column name|already exists', caseSensitive: false)
                .hasMatch(msg);
            if (!isDuplicate) rethrow;
            logDb.warn('Migration v${migration.version} skipped statement (already applied)', stmt);
          }
        }
      });
      current = migration.version;
      await db.execute('PRAGMA user_version = ${migration.version}');
      await _prefsWriter(schemaVersionKey, '${migration.version}');
      logDb.info('Migration applied → v${migration.version}');
    } catch (e) {
      // Self-healing: record the attempted version, keep going (crash-proof startup).
      logDb.error('Migration v${migration.version} failed (best-effort continue)', e);
      current = migration.version;
    }
  }
}

class _Migration {
  const _Migration(this.version, this.statements);

  final int version;
  final List<String> statements;
}

/// Verbatim schema from the RN app (SPEC §6). Statements are split per table
/// so the self-healing skip works statement-by-statement.
const List<_Migration> _migrations = [
  _Migration(1, [
    // notes
    '''CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        date_str TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        duration_min INTEGER NOT NULL DEFAULT 0,
        won INTEGER NOT NULL DEFAULT 0,
        person_id TEXT,
        is_quick_note INTEGER NOT NULL DEFAULT 0,
        ai_title TEXT,
        ai_summary TEXT,
        ai_model_used TEXT,
        is_alignment_reflection INTEGER NOT NULL DEFAULT 0,
        alignment_score INTEGER,
        stop_text TEXT,
        start_text TEXT,
        continue_text TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
      )''',
    'CREATE INDEX IF NOT EXISTS idx_notes_timestamp ON notes(timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_notes_person ON notes(person_id)',
    // persons
    '''CREATE TABLE IF NOT EXISTS persons (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        nickname TEXT,
        relationship TEXT,
        birthday TEXT,
        bio TEXT,
        custom_relationships TEXT
      )''',
    // vlogs
    '''CREATE TABLE IF NOT EXISTS vlogs (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        date_str TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        duration_sec INTEGER NOT NULL,
        file_size_bytes INTEGER NOT NULL DEFAULT 0,
        thumbnail_path TEXT,
        compression_preset TEXT,
        original_file_size_bytes INTEGER,
        compression_pending INTEGER NOT NULL DEFAULT 0
      )''',
    // settings (de-facto preference store)
    '''CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
      )''',
    // feed bookmarks/comments (dead code in the RN app — kept for backup scope parity)
    '''CREATE TABLE IF NOT EXISTS feed_bookmarks (
        note_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
      )''',
    '''CREATE TABLE IF NOT EXISTS feed_comments (
        note_id TEXT PRIMARY KEY,
        comment TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
      )''',
  ]),
  _Migration(2, [
    '''CREATE TABLE IF NOT EXISTS ai_jobs (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL,
        category TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        error TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0
      )''',
    '''CREATE TABLE IF NOT EXISTS ai_logs (
        timestamp INTEGER NOT NULL,
        action TEXT NOT NULL,
        note_id TEXT,
        model TEXT NOT NULL,
        phase TEXT NOT NULL,
        duration_ms INTEGER,
        error TEXT
      )''',
  ]),
  _Migration(3, [
    'ALTER TABLE notes ADD COLUMN is_tweet INTEGER NOT NULL DEFAULT 0',
    '''UPDATE notes SET is_tweet = 1 WHERE (LENGTH(text) - LENGTH(REPLACE(text, ' ', '')) + 1) <= 45''',
  ]),
  _Migration(4, [
    '''CREATE TABLE IF NOT EXISTS pillars (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        scope TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        adaptive_days INTEGER NOT NULL DEFAULT 14,
        is_active INTEGER NOT NULL DEFAULT 1
      )''',
    '''CREATE TABLE IF NOT EXISTS advice_cards (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_reflected_at INTEGER,
        reflection_count INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1
      )''',
    '''CREATE TABLE IF NOT EXISTS pillar_logs (
        id TEXT PRIMARY KEY,
        pillar_id TEXT NOT NULL,
        value_num REAL,
        value_str TEXT,
        timestamp INTEGER NOT NULL,
        note_id TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
      )''',
    'CREATE INDEX IF NOT EXISTS idx_pillar_logs_timestamp ON pillar_logs(timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_pillar_logs_pillar ON pillar_logs(pillar_id)',
    'ALTER TABLE notes ADD COLUMN pillar_id TEXT',
    'ALTER TABLE notes ADD COLUMN advice_id TEXT',
    'ALTER TABLE notes ADD COLUMN pillar_value REAL',
    // Seed data (INSERT OR IGNORE → lands exactly once)
    '''INSERT OR IGNORE INTO pillars (id, title, type, scope, created_at, adaptive_days, is_active)
        VALUES ('mock_pillar_sleep', 'Sleep', 'rating', 'daily', 0, 14, 1)''',
    '''INSERT OR IGNORE INTO pillars (id, title, type, scope, created_at, adaptive_days, is_active)
        VALUES ('mock_pillar_comfort', 'Comfort Zone', 'rating', 'adaptive', 0, 14, 1)''',
    '''INSERT OR IGNORE INTO pillars (id, title, type, scope, created_at, adaptive_days, is_active)
        VALUES ('mock_pillar_mindfulness', 'Mindfulness', 'boolean', 'weekly', 0, 14, 1)''',
    '''INSERT OR IGNORE INTO advice_cards (id, text, created_at, last_reflected_at, reflection_count, is_active)
        VALUES ('mock_advice_listen', 'Listen twice as much as you speak.', 0, NULL, 0, 1)''',
    '''INSERT OR IGNORE INTO advice_cards (id, text, created_at, last_reflected_at, reflection_count, is_active)
        VALUES ('mock_advice_comfort', 'Growth happens at the edge of your comfort zone.', 0, NULL, 0, 1)''',
  ]),
  _Migration(5, [
    'ALTER TABLE pillars ADD COLUMN description TEXT',
    'ALTER TABLE pillars ADD COLUMN last_edited_at INTEGER',
    'UPDATE pillars SET last_edited_at = created_at WHERE last_edited_at IS NULL',
  ]),
  _Migration(6, [
    '''CREATE TABLE IF NOT EXISTS pillar_versions (
        id TEXT PRIMARY KEY,
        pillar_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL
      )''',
    'ALTER TABLE pillars ADD COLUMN version INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE notes ADD COLUMN pillar_version INTEGER',
    '''INSERT OR IGNORE INTO pillar_versions (id, pillar_id, version, title, description, created_at)
        SELECT id || '_v1', id, 1, title, description, created_at FROM pillars''',
  ]),
];
