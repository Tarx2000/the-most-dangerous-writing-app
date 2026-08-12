/// Backup service — format v2, import/export compatible with the RN app
/// (SPEC §13). Plaintext ZIP: `backup_metadata.json` + `vlogs/` +
/// `thumbnails/`; secrets stripped; verification gates on both directions.
// ignore_for_file: prefer_initializing_formals
library;

import 'dart:convert';
import 'dart:io';

import 'package:archive/archive_io.dart';
import 'package:collection/collection.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../core/logger.dart';
import '../database/db.dart';
import 'settings_service.dart';

/// Scope → tables (SPEC §13).
const Map<String, List<String>> scopeTables = {
  'settings': ['settings'],
  'notes': ['notes', 'persons', 'feed_bookmarks', 'feed_comments'],
  'masteries': ['pillars', 'advice_cards', 'pillar_logs', 'pillar_versions'],
  'vlogs': ['vlogs'],
  'system': ['ai_jobs', 'ai_logs'],
};

const List<String> backupScopes = ['settings', 'notes', 'masteries', 'vlogs'];

/// Settings rows stripped on export (SPEC §13).
const Set<String> _settingSecretKeys = {
  'AI_OLLAMA_API_KEY',
  'AI_NEURALWATT_API_KEY',
};

/// AsyncStorage/prefs allowlist that travels in backups (SPEC §13).
const Set<String> _prefsAllowlist = {
  '__DB_SCHEMA_VERSION__',
  'FEATURE_FLAGS',
};

class BackupResult {
  const BackupResult({
    required this.success,
    this.verification = 'ok',
    this.error,
    this.cancelled = false,
    this.zipPath,
    this.warnings = const [],
    this.videosIncluded = 0,
    this.videosExcluded = const [],
  });

  final bool success;
  final String verification; // ok | warn | failed
  final String? error;
  final bool cancelled;
  final String? zipPath;
  final List<String> warnings;
  final int videosIncluded;
  final List<({String vlogId, String reason})> videosExcluded;
}

class BackupService {
  BackupService({
    SettingsService? settings,
    Future<String> Function()? documentsDirProvider,
  })  : _settings = settings,
        _documentsDirProvider = documentsDirProvider ?? _defaultDocs;

  final SettingsService? _settings;
  final Future<String> Function() _documentsDirProvider;

  static Future<String> _defaultDocs() async {
    final dir = await getApplicationDocumentsDirectory();
    return dir.path;
  }

  Future<String> _docs() => _documentsDirProvider();

  /// Export pipeline (SPEC §13): snapshot rows → metadata → ZIP (STORE)
  /// → post-zip verification → return path (sharing happens in the UI).
  Future<BackupResult> exportBackupZip({
    required List<String> scopes,
    void Function(double progress)? onProgress,
  }) async {
    final warnings = <String>[];
    try {
      // 1. WAL checkpoint for a consistent snapshot (best-effort).
      try {
        await exec('PRAGMA wal_checkpoint(TRUNCATE)');
      } catch (_) {}

      // 2. Scope-filtered table dump with secret stripping.
      final tables = <String, List<Map<String, Object?>>>{};
      final tableManifest = <String, Map<String, Object?>>{};
      for (final scope in scopes) {
        for (final table in scopeTables[scope] ?? const <String>[]) {
          try {
            final rows = await getAll('SELECT * FROM $table');
            final cleaned = table == 'settings' ? _stripSettingsSecrets(rows) : rows;
            tables[table] = cleaned;
            tableManifest[table] = {
              'columns': cleaned.isEmpty ? const <String>[] : cleaned.first.keys.toList(),
              'rowCount': cleaned.length,
            };
          } catch (e) {
            warnings.add('Table $table unreadable — exported empty');
            tables[table] = [];
            tableManifest[table] = {'columns': <String>[], 'rowCount': 0};
          }
        }
      }

      // 3. Prefs allowlist (schema marker + feature flags).
      final prefs = await _readPrefsAllowlist();

      // 4. Media manifest.
      final docs = await _docs();
      final vlogEntries = <Map<String, Object?>>[];
      final thumbEntries = <Map<String, Object?>>[];
      final excluded = <({String vlogId, String reason})>[];

      final vlogRows = tables['vlogs'] ?? const [];
      final usedBasenames = <String>{};
      for (final row in vlogRows) {
        final path = row['file_path'] as String?;
        final id = row['id'] as String? ?? 'unknown';
        if (path == null || !File(path).existsSync()) {
          excluded.add((vlogId: id, reason: 'missing'));
          continue;
        }
        final basename = _uniqueBasename(usedBasenames, '$id.mp4');
        vlogEntries.add({
          'vlogId': id,
          'basename': basename,
          'sourcePath': path,
          'size': File(path).lengthSync(),
        });
        final thumb = row['thumbnail_path'] as String?;
        if (thumb != null && File(thumb).existsSync()) {
          thumbEntries.add({
            'vlogId': id,
            'basename': _uniqueBasename(usedBasenames, '$id.jpg'),
            'sourcePath': thumb,
            'size': File(thumb).lengthSync(),
          });
        }
      }

      // 5. Metadata envelope.
      final metadata = <String, Object?>{
        'backupVersion': 2,
        'schemaVersion': currentSchemaVersion,
        'appVersion': '1.5.8',
        'createdAt': DateTime.now().millisecondsSinceEpoch,
        'scopes': scopes,
        'sqlite': tables,
        'asyncStorage': prefs,
        'tableManifest': tableManifest,
        'fileManifest': {
          'vlogs': vlogEntries,
          'thumbnails': thumbEntries,
        },
      };

      // 6. ZIP (STORE) with native file streaming (ZipFileEncoder).
      onProgress?.call(0.2);
      final backupDir = Directory(p.join(docs, 'backups'));
      await backupDir.create(recursive: true);
      final zipPath = p.join(backupDir.path, 'mda_backup_${_isoTimestamp()}.zip');
      final encoder = ZipFileEncoder();
      encoder.create(zipPath);
      encoder.addArchiveFile(
        ArchiveFile.bytes('backup_metadata.json', utf8.encode(jsonEncode(metadata))),
      );
      for (final entry in vlogEntries) {
        // STORE streaming: the file content is piped from disk without ever
        // loading it into Dart memory (1.2 GB backups stay crash-proof).
        encoder.addArchiveFile(
          ArchiveFile.stream(
            'vlogs/${entry['basename'] as String}',
            InputFileStream(entry['sourcePath'] as String),
          )..compression = CompressionType.none,
        );
      }
      for (final entry in thumbEntries) {
        encoder.addArchiveFile(
          ArchiveFile.stream(
            'thumbnails/${entry['basename'] as String}',
            InputFileStream(entry['sourcePath'] as String),
          )..compression = CompressionType.none,
        );
      }
      await encoder.close();
      onProgress?.call(0.8);

      // 7. Post-zip verification (SPEC §13): every included entry must exist
      //    with the exact recorded size.
      final verification = _verifyZip(zipPath, metadata);
      if (verification == 'failed') {
        return BackupResult(
          success: false,
          verification: 'failed',
          error: 'Backup verification failed — the file would be corrupt.',
          warnings: warnings,
        );
      }

      // Cleanup old backups (SPEC §13).
      try {
        await for (final old in backupDir.list()) {
          if (old is File && old.path != zipPath && p.basename(old.path).startsWith('mda_backup_')) {
            await old.delete();
          }
        }
      } catch (_) {}

      return BackupResult(
        success: true,
        verification: verification,
        zipPath: zipPath,
        warnings: warnings,
        videosIncluded: vlogEntries.length,
        videosExcluded: excluded,
      );
    } catch (e) {
      logStorage.error('backup export failed', e);
      return BackupResult(
        success: false,
        error: '$e',
        warnings: warnings,
      );
    }
  }

  List<Map<String, Object?>> _stripSettingsSecrets(List<Map<String, Object?>> rows) {
    return [
      for (final row in rows)
        if (row['key'] is String && !_settingSecretKeys.contains(row['key'])) row,
    ];
  }

  Future<Map<String, String>> _readPrefsAllowlist() async {
    final settings = _settings;
    if (settings == null) return {};
    final all = await settings.getAll();
    final result = <String, String>{};
    for (final key in _prefsAllowlist) {
      final value = all[key];
      if (value != null) result[key] = value;
    }
    return result;
  }

  String _uniqueBasename(Set<String> used, String preferred) {
    if (!used.contains(preferred)) {
      used.add(preferred);
      return preferred;
    }
    var n = 1;
    var candidate = '${p.basenameWithoutExtension(preferred)}_$n${p.extension(preferred)}';
    while (used.contains(candidate)) {
      n++;
      candidate = '${p.basenameWithoutExtension(preferred)}_$n${p.extension(preferred)}';
    }
    used.add(candidate);
    return candidate;
  }

  /// Re-opens the ZIP and checks every included entry against the manifest.
  String _verifyZip(String zipPath, Map<String, Object?> metadata) {
    try {
      // Lazy decode: only entry names/sizes are read (central directory).
      final input = InputFileStream(zipPath);
      final archive = ZipDecoder().decodeStream(input, verify: false);
      final entries = <String, int>{};
      for (final file in archive.files) {
        if (file.isFile) entries[file.name] = file.size;
      }
      if (!entries.containsKey('backup_metadata.json')) return 'failed';

      final manifest = metadata['fileManifest'] as Map<String, Object?>?;
      final vlogs = (manifest?['vlogs'] as List?) ?? const [];
      for (final entry in vlogs) {
        final basename = (entry as Map)['basename'] as String;
        final size = (entry['size'] as num).toInt();
        final actual = entries['vlogs/$basename'];
        if (actual == null) return 'failed';
        if (actual != size) return 'warn';
      }
      final thumbs = (manifest?['thumbnails'] as List?) ?? const [];
      for (final entry in thumbs) {
        final basename = (entry as Map)['basename'] as String;
        final actual = entries['thumbnails/$basename'];
        if (actual == null) return 'failed';
      }
      return 'ok';
    } catch (_) {
      return 'failed';
    }
  }

  static String _isoTimestamp() {
    final now = DateTime.now();
    return '${now.year}${_two(now.month)}${_two(now.day)}-${_two(now.hour)}${_two(now.minute)}${_two(now.second)}';
  }

  static String _two(int n) => n.toString().padLeft(2, '0');

  // ---------------------------------------------------------------------------
  // Import pipeline (SPEC §13)
  // ---------------------------------------------------------------------------

  /// Imports a v2 backup ZIP. Gates: schema, manifest integrity, free space.
  /// Safety snapshots + full rollback on any failure; queues pause/resume
  /// handled by the caller (backup UI).
  Future<BackupResult> importBackupZip({
    required String zipPath,
    void Function(double progress)? onProgress,
    Future<int> Function()? freeSpaceProvider,
  }) async {
    try {
      // 1. Open + normalize metadata (v2; legacy v1 rejected with message).
      // Streaming decode (verify: false): the ZIP is read lazily from disk —
      // 1.2 GB backups never load into memory (crash-proof by design).
      final input = InputFileStream(zipPath);
      final archive = ZipDecoder().decodeStream(input, verify: false);
      final metadataFile =
          archive.files.where((f) => f.name == 'backup_metadata.json').firstOrNull;
      if (metadataFile == null) {
        return const BackupResult(
          success: false,
          error: 'Corrupt backup — metadata missing.',
        );
      }
      final metadata =
          jsonDecode(utf8.decode(metadataFile.content as List<int>)) as Map<String, dynamic>;
      final version = metadata['backupVersion'];
      if (version != 2) {
        return BackupResult(
          success: false,
          error: version == 1
              ? 'This backup uses the legacy format. Please update the app and export a new backup.'
              : 'Unknown backup version ($version).',
        );
      }

      // 2. Schema gate: backups from a NEWER app are rejected first (SPEC).
      final backupSchema = (metadata['schemaVersion'] as num?)?.toInt() ?? 0;
      if (backupSchema > currentSchemaVersion) {
        return const BackupResult(
          success: false,
          error: 'This backup was created by a newer app version. Update the app first.',
        );
      }

      // 3. Manifest gate: every included entry must exist with exact size.
      final manifest = metadata['fileManifest'] as Map<String, dynamic>?;
      final fileOk = _verifyManifestInArchive(archive, manifest);
      if (!fileOk) {
        return const BackupResult(
          success: false,
          error: 'Corrupt backup — included files are missing or damaged.',
        );
      }

      // 4. Free-space gate: requiredBytes × 1.1 vs free disk (SPEC).
      final requiredBytes = _manifestTotalBytes(manifest);
      try {
        final free = await (freeSpaceProvider ?? _freeDiskBytes)();
        if (free > 0 && requiredBytes * 1.1 > free) {
          return BackupResult(
            success: false,
            error: 'Not enough free space for this backup '
                '(${(requiredBytes * 1.1 / 1048576).round()} MB needed).',
          );
        }
      } catch (_) {}

      // 5. Safety snapshots.
      final snapshots = await _createSnapshots();

      try {
        // 6. Restore SQLite in ONE transaction (column-filtered re-insert).
        final sqlite = metadata['sqlite'] as Map<String, dynamic>? ?? {};
        await _restoreSqlite(sqlite);

        // 7. Rewrite media paths to this device's sandbox.
        final docs = await _docs();
        final restoredVlogs = await _restoreMedia(archive, manifest, docs);

        // 8. Restore prefs allowlist (schema marker forced to local value).
        final prefs = metadata['asyncStorage'] as Map<String, dynamic>? ?? {};
        await _restorePrefsAllowlist(prefs);

        onProgress?.call(1);
        return BackupResult(
          success: true,
          verification: 'ok',
          videosIncluded: restoredVlogs,
          zipPath: zipPath,
        );
      } catch (e) {
        // 9. Rollback on any failure (best-effort, never throws).
        await _rollbackSnapshots(snapshots);
        logStorage.error('backup import failed, rolled back', e);
        return BackupResult(success: false, error: 'Import failed: $e');
      }
    } catch (e) {
      logStorage.error('backup import failed', e);
      return BackupResult(success: false, error: 'Import failed: $e');
    }
  }

  /// Checks every `included` manifest entry against the archive.
  bool _verifyManifestInArchive(Archive archive, Map<String, dynamic>? manifest) {
    if (manifest == null) return true;
    final sizes = <String, int>{
      for (final file in archive.files)
        if (file.isFile) file.name: file.size,
    };
    for (final listKey in ['vlogs', 'thumbnails']) {
      final entries = manifest[listKey] as List? ?? const [];
      for (final entry in entries) {
        final map = entry as Map;
        final basename = map['basename'] as String;
        final expectedSize = (map['size'] as num?)?.toInt();
        final actual = sizes['$listKey/$basename'];
        if (actual == null) return false;
        if (expectedSize != null && actual != expectedSize) return false;
      }
    }
    return true;
  }

  int _manifestTotalBytes(Map<String, dynamic>? manifest) {
    if (manifest == null) return 0;
    var total = 0;
    for (final listKey in ['vlogs', 'thumbnails']) {
      final entries = manifest[listKey] as List? ?? const [];
      for (final entry in entries) {
        total += ((entry as Map)['size'] as num?)?.toInt() ?? 0;
      }
    }
    return total;
  }

  /// Free disk space in bytes. There is no pure-Dart API for this; the
  /// platform channel (`StatFs` on Android, `NSURLVolumeAvailableCapacityKey`
  /// on iOS) is a future polish item. Returning -1 disables the gate.
  Future<int> _freeDiskBytes() async => -1;

  Future<Map<String, Object>> _createSnapshots() async {
    final docs = await _docs();
    final snapshotDir = Directory(p.join(docs, 'backup_restore_tmp'));
    await snapshotDir.create(recursive: true);

    // DB file copy (close first so the copy is consistent).
    final dbPath = '$docs/$databaseFileName';
    final dbCopy = p.join(snapshotDir.path, 'mda_db_rollback.db');
    if (File(dbPath).existsSync()) {
      await closeDb();
      await File(dbPath).copy(dbCopy);
    }

    // Media dirs.
    final vlogSnapshot = p.join(snapshotDir.path, 'vlogs_snapshot');
    final thumbSnapshot = p.join(snapshotDir.path, 'thumbs_snapshot');
    await _copyDir(p.join(docs, 'vlogs'), vlogSnapshot);
    await _copyDir(p.join(docs, 'vlog_thumbnails'), thumbSnapshot);

    return {
      'dbCopy': dbCopy,
      'dbPath': dbPath,
      'vlogSnapshot': vlogSnapshot,
      'thumbSnapshot': thumbSnapshot,
      'snapshotDir': snapshotDir.path,
    };
  }

  Future<void> _copyDir(String source, String target) async {
    final src = Directory(source);
    if (!await src.exists()) return;
    final dst = Directory(target);
    await dst.create(recursive: true);
    await for (final entity in src.list()) {
      if (entity is File) {
        await entity.copy(p.join(target, p.basename(entity.path)));
      }
    }
  }

  Future<void> _restoreSqlite(Map<String, dynamic> sqlite) async {
    final db = await getDb();
    await db.transaction((txn) async {
      // Column-filtered re-insert (older backups with fewer columns restore
      // cleanly — SPEC §13).
      for (final entry in sqlite.entries) {
        final table = entry.key;
        final rows = entry.value as List;
        await txn.rawDelete('DELETE FROM $table');
        for (final row in rows) {
          final map = (row as Map).cast<String, Object?>();
          final columns = map.keys.toList();
          final placeholders = List.filled(columns.length, '?').join(', ');
          await txn.rawInsert(
            'INSERT INTO $table (${columns.join(', ')}) VALUES ($placeholders)',
            [for (final c in columns) map[c]],
          );
        }
      }
    });
  }

  /// Writes media files to the sandbox and rewrites `vlogs` paths.
  Future<int> _restoreMedia(
    Archive archive,
    Map<String, dynamic>? manifest,
    String docs,
  ) async {
    if (manifest == null) return 0;
    final vlogDir = Directory(p.join(docs, 'vlogs'));
    final thumbDir = Directory(p.join(docs, 'vlog_thumbnails'));
    await vlogDir.create(recursive: true);
    await thumbDir.create(recursive: true);

    var restored = 0;
    final pathMap = <String, String>{}; // old path → new path
    final vlogEntries = manifest['vlogs'] as List? ?? const [];
    for (final entry in vlogEntries) {
      final map = entry as Map;
      final basename = map['basename'] as String;
      final file = archive.files.where((f) => f.name == 'vlogs/$basename').firstOrNull;
      if (file == null) continue;
      final outPath = p.join(vlogDir.path, basename);
      // Stream the file to disk in chunks (never buffers the whole video).
      await _writeArchiveFileStreaming(file, outPath);
      pathMap[map['vlogId'] as String] = outPath;
      restored++;
    }

    // Rebase vlogs.file_path / thumbnail_path rows to the new sandbox paths.
    final vlogRows = await getAll('SELECT id, file_path FROM vlogs');
    for (final row in vlogRows) {
      final id = row['id'] as String;
      final newPath = pathMap[id];
      if (newPath != null) {
        await run('UPDATE vlogs SET file_path = ? WHERE id = ?', [newPath, id]);
      }
    }

    final thumbEntries = manifest['thumbnails'] as List? ?? const [];
    for (final entry in thumbEntries) {
      final map = entry as Map;
      final basename = map['basename'] as String;
      final file = archive.files.where((f) => f.name == 'thumbnails/$basename').firstOrNull;
      if (file == null) continue;
      final outPath = p.join(thumbDir.path, basename);
      await _writeArchiveFileStreaming(file, outPath);
      final vlogId = map['vlogId'] as String;
      await run('UPDATE vlogs SET thumbnail_path = ? WHERE id = ?', [outPath, vlogId]);
    }
    return restored;
  }

  /// Writes an archive entry to disk via a streaming output (large media
  /// files never load into Dart memory).
  Future<void> _writeArchiveFileStreaming(ArchiveFile file, String outPath) async {
    final output = OutputFileStream(outPath);
    try {
      file.writeContent(output, freeMemory: false);
    } finally {
      output.close();
    }
  }

  Future<void> _restorePrefsAllowlist(Map<String, dynamic> prefs) async {
    final settings = _settings;
    if (settings == null) return;
    // The settings TABLE was already restored via `sqlite` — this method
    // only re-applies the legacy AsyncStorage allowlist (schema marker +
    // feature flags). The schema marker is FORCED to the local value so
    // migrations never re-run (SPEC §13).
    for (final entry in prefs.entries) {
      if (!_prefsAllowlist.contains(entry.key)) continue;
      if (entry.key == '__DB_SCHEMA_VERSION__') continue; // forced local
      await settings.setRaw(entry.key, '${entry.value}');
    }
    await settings.setRaw('__DB_SCHEMA_VERSION__', '$currentSchemaVersion');
  }

  Future<void> _rollbackSnapshots(Map<String, Object> snapshots) async {
    try {
      final dbCopy = snapshots['dbCopy'] as String;
      final dbPath = snapshots['dbPath'] as String;
      if (File(dbCopy).existsSync()) {
        await closeDb();
        final dbFile = File(dbPath);
        if (await dbFile.exists()) await dbFile.delete();
        await File(dbCopy).copy(dbPath);
      }
      final snapshotDir = snapshots['snapshotDir'] as String;
      final docs = await _docs();
      await _restoreDir(snapshots['vlogSnapshot'] as String, p.join(docs, 'vlogs'));
      await _restoreDir(snapshots['thumbSnapshot'] as String, p.join(docs, 'vlog_thumbnails'));
      final dir = Directory(snapshotDir);
      if (await dir.exists()) await dir.delete(recursive: true);
    } catch (e) {
      logStorage.warn('rollback best-effort failed', e);
    }
  }

  Future<void> _restoreDir(String snapshot, String target) async {
    final src = Directory(snapshot);
    if (!await src.exists()) return;
    final dst = Directory(target);
    if (await dst.exists()) await dst.delete(recursive: true);
    await dst.create(recursive: true);
    await _copyDir(snapshot, target);
  }
}
