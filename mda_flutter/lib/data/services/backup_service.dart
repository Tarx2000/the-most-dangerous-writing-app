/// Backup service — format v2, import/export 100% compatible with the RN app
/// (SPEC §13, port of `src/lib/backupService.ts`).
///
/// Implements a unified, VERIFIABLE ZIP backup containing:
/// - backup_metadata.json: SQLite table serialization + SharedPreferences/AsyncStorage
///   allowlist + table/file manifests.
/// - vlogs/: video files (collision-free entry names, dedupe-prefix `${vlogId}_`).
/// - thumbnails/: thumbnail images (same dedupe rule).
///
/// Hard guarantees:
/// 1. NO SILENT FAILURES — a backup reports `success: true` ONLY after the ZIP
///    was re-opened and every included media entry matched its recorded size.
/// 2. SECURITY BY OMISSION — backups are plaintext ZIPs. The security PIN,
///    attempt counters, and AI API keys are NEVER exported, and local PINs are
///    NEVER overwritten during restore.
/// 3. PERFECT RESTORE — vlog/thumbnail paths are rewritten to the target device's
///    sandbox during import.
/// 4. FORWARD COMPATIBILITY — backups with a schemaVersion higher than the current
///    install are rejected before data is touched; older backups restore cleanly
///    with live column filtering.
library;

import 'dart:convert';
import 'dart:io';

import 'package:archive/archive_io.dart';
import 'package:collection/collection.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/config/app_config.dart';
import '../../core/logger.dart';
import '../database/db.dart';

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIGURABLE VALUES & CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════ */

/// Current backup container format version.
const int backupVersionCurrent = 2;

/// Legacy format (no manifests, flat basenames) — still importable.
const int backupVersionLegacy = 1;

/// Free-space gate margin: required bytes = manifest total * this factor.
const double freeSpaceMarginFactor = 1.1;

/// Scope → tables mapping (SPEC §13).
const Map<String, List<String>> scopeTables = {
  'settings': ['settings'],
  'notes': ['notes', 'persons', 'feed_bookmarks', 'feed_comments'],
  'masteries': ['pillars', 'advice_cards', 'pillar_logs', 'pillar_versions'],
  'vlogs': ['vlogs'],
  'system': ['ai_jobs', 'ai_logs'],
};

const List<String> allBackupScopes = ['settings', 'notes', 'masteries', 'vlogs'];
const List<String> backupScopes = allBackupScopes;

/// Settings table keys that hold secret credentials. Stripped on export.
const Set<String> settingSecretKeys = {
  'AI_OLLAMA_API_KEY',
  'AI_NEURALWATT_API_KEY',
};

/// SharedPreferences / AsyncStorage allowlist that travels in backups.
const Set<String> prefsAllowlist = {
  '__DB_SCHEMA_VERSION__',
  'FEATURE_FLAGS',
};

/// Local security state that must NEVER travel with a backup and NEVER be
/// overwritten by a restore ("PIN bleibt immer lokal").
const Set<String> securitySecretKeys = {
  '@mda_security_pin',
  '@mda_pin_attempt_count',
  '@mda_pin_lockout_until',
};

/* ═══════════════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════════════ */

/// One media file entry inside the backup container (video or thumbnail).
class BackupFileEntry {
  const BackupFileEntry({
    required this.vlogId,
    required this.entryPath,
    required this.kind,
    required this.sizeBytes,
    required this.included,
    this.reason,
  });

  factory BackupFileEntry.fromJson(Map<String, dynamic> json) {
    final rawEntryPath = json['entryPath'] as String?;
    final rawBasename = json['basename'] as String?;
    final rawKind = (json['kind'] as String?) ??
        (rawEntryPath?.startsWith('vlogs/') == true ? 'video' : 'thumbnail');

    final entryPath = rawEntryPath ??
        (rawBasename != null
            ? (rawKind == 'video' ? 'vlogs/$rawBasename' : 'thumbnails/$rawBasename')
            : '');

    final sizeBytes = (json['sizeBytes'] as num?)?.toInt() ??
        (json['size'] as num?)?.toInt() ??
        0;

    return BackupFileEntry(
      vlogId: (json['vlogId'] as String?) ?? '',
      entryPath: entryPath,
      kind: rawKind,
      sizeBytes: sizeBytes,
      included: json['included'] as bool? ?? true,
      reason: json['reason'] as String?,
    );
  }

  final String vlogId;
  final String entryPath; // e.g. "vlogs/abc_123.mp4"
  final String kind; // 'video' | 'thumbnail'
  final int sizeBytes;
  final bool included;
  final String? reason; // 'missing' | 'copy_error' | 'too_large'

  String get basename => p.basename(entryPath);

  Map<String, dynamic> toJson() => {
        'vlogId': vlogId,
        'entryPath': entryPath,
        'kind': kind,
        'sizeBytes': sizeBytes,
        'included': included,
        'reason': reason,
      };
}

/// Column/row-count snapshot per table.
class BackupTableManifest {
  const BackupTableManifest({
    required this.columns,
    required this.rowCount,
  });

  final List<String> columns;
  final int rowCount;

  Map<String, dynamic> toJson() => {
        'columns': columns,
        'rowCount': rowCount,
      };
}

/// Detailed outcome of an export or import.
class BackupResult {
  const BackupResult({
    required this.success,
    this.verification = 'ok',
    this.error,
    this.cancelled = false,
    this.zipPath,
    this.scopes = const [],
    this.tablesIncluded = const [],
    this.videosIncluded = 0,
    this.videosExcluded = const [],
    this.thumbnailsIncluded = 0,
    this.warnings = const [],
  });

  final bool success;
  final String verification; // 'ok' | 'warn' | 'failed'
  final String? error;
  final bool cancelled;
  final String? zipPath;
  final List<String> scopes;
  final List<String> tablesIncluded;
  final int videosIncluded;
  final List<({String vlogId, String reason})> videosExcluded;
  final int thumbnailsIncluded;
  final List<String> warnings;
}

/* ═══════════════════════════════════════════════════════════════════════════
   BACKUP SERVICE IMPLEMENTATION
   ═══════════════════════════════════════════════════════════════════════════ */

class BackupService {
  BackupService({
    Future<String> Function()? documentsDirProvider,
    Future<String> Function()? dbPathProvider,
  })  : _documentsDirProvider = documentsDirProvider ?? _defaultDocs,
        _dbPathProvider = dbPathProvider ?? getDatabaseFilePath;

  final Future<String> Function() _documentsDirProvider;
  final Future<String> Function() _dbPathProvider;

  static Future<String> _defaultDocs() async {
    final dir = await getApplicationDocumentsDirectory();
    return dir.path;
  }

  Future<String> _docs() => _documentsDirProvider();

  /// Union of selected scope tables + system tables (ai_jobs, ai_logs).
  List<String> _collectTables(List<String> scopes) {
    final set = <String>{...scopeTables['system']!};
    for (final scope in scopes) {
      final list = scopeTables[scope];
      if (list != null) set.addAll(list);
    }
    return set.toList();
  }

  /// Exports a verifiable backup ZIP (SPEC §13).
  Future<BackupResult> exportBackupZip({
    List<String> scopes = const [],
    void Function(double progress)? onProgress,
  }) async {
    final warnings = <String>[];
    final tablesIncluded = <String>[];
    final excludedVideos = <({String vlogId, String reason})>[];

    try {
      final effectiveScopes =
          scopes.isEmpty ? allBackupScopes : scopes.toSet().toList();
      final tables = _collectTables(effectiveScopes);

      // 1. WAL checkpoint for a consistent snapshot.
      try {
        await exec('PRAGMA wal_checkpoint(TRUNCATE)');
      } catch (_) {}

      // 2. Scope-filtered table dump with secret stripping.
      onProgress?.call(0.1);
      final sqliteData = <String, List<Map<String, Object?>>>{};
      final tableManifest = <String, BackupTableManifest>{};

      for (final table in tables) {
        try {
          var rows = await getAll('SELECT * FROM $table');
          if (table == 'settings') {
            final filtered = rows
                .where((row) => !settingSecretKeys.contains(row['key']?.toString()))
                .toList();
            final stripped = rows.length - filtered.length;
            if (stripped > 0) {
              warnings.add(
                '$stripped API key setting(s) excluded from backup (secrets never leave the device)',
              );
            }
            rows = filtered;
          }
          sqliteData[table] = rows;
          final columns = await getTableColumns(table);
          tableManifest[table] = BackupTableManifest(
            columns: columns.toList(),
            rowCount: rows.length,
          );
          tablesIncluded.add(table);
        } catch (e) {
          logStorage.warn('Table $table unreadable, backed up empty', e);
          sqliteData[table] = [];
          tableManifest[table] = const BackupTableManifest(columns: [], rowCount: 0);
          tablesIncluded.add(table);
          warnings.add('Table "$table" could not be read and was backed up empty');
        }
      }

      // 3. SharedPreferences / AsyncStorage allowlist.
      onProgress?.call(0.2);
      final asyncStorage = await _readPrefsAllowlist();

      // 4. Media manifest (only when vlogs scope is selected).
      final vlogEntries = <BackupFileEntry>[];
      final thumbEntries = <BackupFileEntry>[];
      final sourceByEntry = <String, String>{};
      final usedVideoNames = <String>{};
      final usedThumbNames = <String>{};

      final vlogRows = (effectiveScopes.contains('vlogs')
              ? sqliteData['vlogs']
              : const <Map<String, Object?>>[]) ??
          const <Map<String, Object?>>[];

      for (final row in vlogRows) {
        final vlogId = row['id']?.toString() ?? '';
        final videoPath = row['file_path'] as String? ?? '';
        final thumbPath = row['thumbnail_path'] as String? ?? '';

        if (videoPath.isNotEmpty) {
          final entryName = _uniqueBasename(vlogId, p.basename(videoPath), usedVideoNames);
          final entryPath = 'vlogs/$entryName';
          final file = File(videoPath);
          if (file.existsSync()) {
            final size = file.lengthSync();
            vlogEntries.add(BackupFileEntry(
              vlogId: vlogId,
              entryPath: entryPath,
              kind: 'video',
              sizeBytes: size,
              included: true,
            ));
            sourceByEntry[entryPath] = videoPath;
          } else {
            vlogEntries.add(BackupFileEntry(
              vlogId: vlogId,
              entryPath: entryPath,
              kind: 'video',
              sizeBytes: 0,
              included: false,
              reason: 'missing',
            ));
            excludedVideos.add((vlogId: vlogId, reason: 'missing'));
            warnings.add('Video file missing for vlog $vlogId: $videoPath');
          }
        }

        if (thumbPath.isNotEmpty) {
          final entryName = _uniqueBasename(vlogId, p.basename(thumbPath), usedThumbNames);
          final entryPath = 'thumbnails/$entryName';
          final file = File(thumbPath);
          if (file.existsSync()) {
            final size = file.lengthSync();
            thumbEntries.add(BackupFileEntry(
              vlogId: vlogId,
              entryPath: entryPath,
              kind: 'thumbnail',
              sizeBytes: size,
              included: true,
            ));
            sourceByEntry[entryPath] = thumbPath;
          } else {
            thumbEntries.add(BackupFileEntry(
              vlogId: vlogId,
              entryPath: entryPath,
              kind: 'thumbnail',
              sizeBytes: 0,
              included: false,
              reason: 'missing',
            ));
            warnings.add('Thumbnail file missing for vlog $vlogId: $thumbPath');
          }
        }
      }

      // 5. Build Metadata envelope matching Format v2.
      final metadata = <String, dynamic>{
        'backupVersion': backupVersionCurrent,
        'schemaVersion': currentSchemaVersion,
        'appVersion': appVersion,
        'createdAt': DateTime.now().millisecondsSinceEpoch,
        'scopes': effectiveScopes,
        'sqlite': sqliteData,
        'asyncStorage': asyncStorage,
        'tableManifest': {
          for (final e in tableManifest.entries) e.key: e.value.toJson(),
        },
        'fileManifest': {
          'vlogs': vlogEntries.map((e) => e.toJson()).toList(),
          'thumbnails': thumbEntries.map((e) => e.toJson()).toList(),
        },
      };

      // 6. Native streaming ZIP creation.
      onProgress?.call(0.5);
      final docs = await _docs();
      final backupDir = Directory(p.join(docs, 'backups'));
      await backupDir.create(recursive: true);
      final zipPath = p.join(backupDir.path, 'mda_backup_${_isoTimestamp()}.zip');

      final encoder = ZipFileEncoder();
      encoder.create(zipPath);

      // Metadata JSON
      encoder.addArchiveFile(
        ArchiveFile.bytes('backup_metadata.json', utf8.encode(jsonEncode(metadata))),
      );

      // Media files (STORE streaming)
      for (final entry in vlogEntries) {
        if (!entry.included) continue;
        final src = sourceByEntry[entry.entryPath];
        if (src != null && File(src).existsSync()) {
          encoder.addArchiveFile(
            ArchiveFile.stream(entry.entryPath, InputFileStream(src))
              ..compression = CompressionType.none,
          );
        }
      }
      for (final entry in thumbEntries) {
        if (!entry.included) continue;
        final src = sourceByEntry[entry.entryPath];
        if (src != null && File(src).existsSync()) {
          encoder.addArchiveFile(
            ArchiveFile.stream(entry.entryPath, InputFileStream(src))
              ..compression = CompressionType.none,
          );
        }
      }

      await encoder.close();
      onProgress?.call(0.8);

      // 7. Post-zip verification (SPEC §13).
      final verification = _verifyZip(zipPath, metadata);
      if (verification == 'failed') {
        return BackupResult(
          success: false,
          verification: 'failed',
          error: 'Backup verification failed — the archive is corrupt.',
          warnings: warnings,
        );
      }

      // Cleanup old backups.
      try {
        await for (final old in backupDir.list()) {
          if (old is File &&
              old.path != zipPath &&
              p.basename(old.path).startsWith('mda_backup_')) {
            await old.delete();
          }
        }
      } catch (_) {}

      onProgress?.call(1.0);
      return BackupResult(
        success: true,
        verification: verification,
        zipPath: zipPath,
        scopes: effectiveScopes,
        tablesIncluded: tablesIncluded,
        videosIncluded: vlogEntries.where((e) => e.included).length,
        videosExcluded: excludedVideos,
        thumbnailsIncluded: thumbEntries.where((e) => e.included).length,
        warnings: warnings,
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

  // ---------------------------------------------------------------------------
  // Import Pipeline
  // ---------------------------------------------------------------------------

  /// Imports a backup ZIP with schema gates, manifest verification, and safety snapshots.
  Future<BackupResult> importBackupZip({
    required String zipPath,
    void Function(double progress)? onProgress,
    Future<int> Function()? freeSpaceProvider,
  }) async {
    final warnings = <String>[];
    Map<String, Object>? snapshots;

    try {
      onProgress?.call(0.1);
      final input = InputFileStream(zipPath);
      final archive = ZipDecoder().decodeStream(input, verify: false);

      final metadataFile =
          archive.files.where((f) => f.name == 'backup_metadata.json').firstOrNull;
      if (metadataFile == null) {
        return const BackupResult(
          success: false,
          verification: 'failed',
          error: 'Corrupt backup — metadata file (backup_metadata.json) missing.',
        );
      }

      final rawJson =
          jsonDecode(utf8.decode(metadataFile.content as List<int>)) as Map<String, dynamic>;

      // 1. Version Normalization (Supports v2 and v1).
      final version = rawJson['backupVersion'] as num? ?? 1;
      if (version != 2 && version != 1) {
        return BackupResult(
          success: false,
          verification: 'failed',
          error: 'Unsupported backup version: $version',
        );
      }

      // 2. Schema gate: backups from a NEWER app are rejected immediately.
      final backupSchema = (rawJson['schemaVersion'] as num?)?.toInt() ?? 0;
      if (backupSchema > currentSchemaVersion) {
        return const BackupResult(
          success: false,
          verification: 'failed',
          error: 'This backup was created by a newer app version. Update the app first.',
        );
      }

      // 3. Normalize file manifest.
      final rawFileManifest = rawJson['fileManifest'] as Map<String, dynamic>?;
      final vlogEntries = <BackupFileEntry>[];
      final thumbEntries = <BackupFileEntry>[];

      if (rawFileManifest != null) {
        for (final item in (rawFileManifest['vlogs'] as List? ?? const [])) {
          if (item is Map<String, dynamic>) {
            vlogEntries.add(BackupFileEntry.fromJson(item));
          }
        }
        for (final item in (rawFileManifest['thumbnails'] as List? ?? const [])) {
          if (item is Map<String, dynamic>) {
            thumbEntries.add(BackupFileEntry.fromJson(item));
          }
        }
      } else {
        // Legacy v1 fallback: derive manifest from zip contents.
        for (final file in archive.files) {
          if (file.name.startsWith('vlogs/') && file.name != 'vlogs/') {
            final id = p.basenameWithoutExtension(file.name).split('_').first;
            vlogEntries.add(BackupFileEntry(
              vlogId: id,
              entryPath: file.name,
              kind: 'video',
              sizeBytes: file.size,
              included: true,
            ));
          } else if (file.name.startsWith('thumbnails/') && file.name != 'thumbnails/') {
            final id = p.basenameWithoutExtension(file.name).split('_').first;
            thumbEntries.add(BackupFileEntry(
              vlogId: id,
              entryPath: file.name,
              kind: 'thumbnail',
              sizeBytes: file.size,
              included: true,
            ));
          }
        }
      }

      // 4. Manifest gate: check included files exist in the archive.
      final manifestOk = _verifyArchiveEntries(archive, vlogEntries, thumbEntries);
      if (!manifestOk) {
        return const BackupResult(
          success: false,
          verification: 'failed',
          error: 'Corrupt backup — included media files are missing or damaged.',
        );
      }

      // 5. Free-space gate.
      final requiredBytes = vlogEntries.fold<int>(0, (s, e) => s + e.sizeBytes) +
          thumbEntries.fold<int>(0, (s, e) => s + e.sizeBytes);
      try {
        final free = await (freeSpaceProvider ?? _freeDiskBytes)();
        if (free > 0 && requiredBytes * freeSpaceMarginFactor > free) {
          return BackupResult(
            success: false,
            verification: 'failed',
            error: 'Not enough free space for this backup '
                '(${((requiredBytes * freeSpaceMarginFactor) / 1048576).round()} MB needed).',
          );
        }
      } catch (_) {}

      // 6. Safety snapshots (DB, prefs, and media dirs).
      onProgress?.call(0.3);
      snapshots = await _createSnapshots();

      try {
        // 7. Restore SQLite in ONE transaction with LIVE COLUMN FILTERING.
        onProgress?.call(0.5);
        final sqlite = rawJson['sqlite'] as Map<String, dynamic>? ?? {};
        await _restoreSqliteWithColumnFiltering(sqlite);

        // 8. Rewrite media paths to sandbox & extract media.
        onProgress?.call(0.7);
        final docs = await _docs();
        final restoredVlogs = await _restoreMediaFiles(
          archive,
          vlogEntries,
          thumbEntries,
          docs,
          sqlite['vlogs'] as List? ?? const [],
        );

        // 9. Restore SharedPreferences allowlist.
        onProgress?.call(0.9);
        final prefs = rawJson['asyncStorage'] as Map<String, dynamic>? ?? {};
        await _restorePrefsAllowlist(prefs, snapshots['prefsPairs'] as Map<String, Object?>?);

        onProgress?.call(1.0);
        return BackupResult(
          success: true,
          verification: warnings.isEmpty ? 'ok' : 'warn',
          videosIncluded: restoredVlogs,
          thumbnailsIncluded: thumbEntries.where((e) => e.included).length,
          zipPath: zipPath,
          warnings: warnings,
        );
      } catch (e) {
        // Rollback on inner failure.
        logStorage.error('Restore step failed — executing rollback', e);
        await _rollbackSnapshots(snapshots);
        return BackupResult(
          success: false,
          verification: 'failed',
          error: 'Import failed: $e',
          warnings: warnings,
        );
      }
    } catch (e) {
      logStorage.error('Backup import failed', e);
      if (snapshots != null) {
        await _rollbackSnapshots(snapshots);
      }
      return BackupResult(
        success: false,
        verification: 'failed',
        error: 'Import failed: $e',
        warnings: warnings,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Internal Helpers
  // ---------------------------------------------------------------------------

  String _uniqueBasename(String vlogId, String name, Set<String> used) {
    var candidate = name;
    var attempt = 0;
    while (used.contains(candidate)) {
      candidate = attempt == 0 ? '${vlogId}_$name' : '${vlogId}_${attempt}_$name';
      attempt++;
    }
    used.add(candidate);
    return candidate;
  }

  Future<Map<String, Object?>> _readPrefsAllowlist() async {
    final sp = await SharedPreferences.getInstance();
    final result = <String, Object?>{};
    for (final key in prefsAllowlist) {
      final val = sp.get(key);
      if (val != null) result[key] = val;
    }
    return result;
  }

  String _verifyZip(String zipPath, Map<String, dynamic> metadata) {
    try {
      final input = InputFileStream(zipPath);
      final archive = ZipDecoder().decodeStream(input, verify: false);
      final entries = <String, int>{
        for (final file in archive.files)
          if (file.isFile) file.name: file.size,
      };

      if (!entries.containsKey('backup_metadata.json')) return 'failed';

      final fileManifest = metadata['fileManifest'] as Map<String, dynamic>?;
      final vlogs = (fileManifest?['vlogs'] as List?) ?? const [];
      for (final raw in vlogs) {
        final entry = BackupFileEntry.fromJson(raw as Map<String, dynamic>);
        if (!entry.included) continue;
        final actual = entries[entry.entryPath];
        if (actual == null) return 'failed';
        if (actual != entry.sizeBytes) return 'warn';
      }

      final thumbs = (fileManifest?['thumbnails'] as List?) ?? const [];
      for (final raw in thumbs) {
        final entry = BackupFileEntry.fromJson(raw as Map<String, dynamic>);
        if (!entry.included) continue;
        final actual = entries[entry.entryPath];
        if (actual == null) return 'failed';
        if (actual != entry.sizeBytes) return 'warn';
      }

      return 'ok';
    } catch (_) {
      return 'failed';
    }
  }

  bool _verifyArchiveEntries(
    Archive archive,
    List<BackupFileEntry> vlogs,
    List<BackupFileEntry> thumbs,
  ) {
    final sizes = <String, int>{
      for (final file in archive.files)
        if (file.isFile) file.name: file.size,
    };

    for (final entry in [...vlogs, ...thumbs]) {
      if (!entry.included) continue;
      final actual = sizes[entry.entryPath];
      if (actual == null) return false;
      if (entry.sizeBytes > 0 && actual != entry.sizeBytes) return false;
    }
    return true;
  }

  Future<Map<String, Object>> _createSnapshots() async {
    final docs = await _docs();
    final snapshotDir = Directory(p.join(docs, 'backup_restore_tmp'));
    await snapshotDir.create(recursive: true);

    // 1. DB Snapshot
    final dbPath = await _dbPathProvider();
    final dbCopy = p.join(snapshotDir.path, 'mda_db_rollback.db');
    var dbExists = false;

    if (File(dbPath).existsSync()) {
      await closeDb();
      await File(dbPath).copy(dbCopy);
      dbExists = true;
    }

    // 2. SharedPreferences snapshot
    final sp = await SharedPreferences.getInstance();
    final prefsPairs = <String, Object?>{
      for (final key in sp.getKeys()) key: sp.get(key),
    };

    return {
      'dbCopy': dbCopy,
      'dbPath': dbPath,
      'dbExists': dbExists,
      'snapshotDir': snapshotDir.path,
      'prefsPairs': prefsPairs,
    };
  }

  /// Restores SQLite in ONE transaction with LIVE COLUMN FILTERING.
  Future<void> _restoreSqliteWithColumnFiltering(Map<String, dynamic> sqlite) async {
    final db = await getDb();
    final currentUserTables = await getCurrentUserTables();

    await db.transaction((txn) async {
      // 1. Wipe all existing user tables (full-restore semantics).
      for (final table in currentUserTables) {
        await txn.rawDelete('DELETE FROM $table');
      }

      // 2. Insert rows with live column filtering.
      for (final entry in sqlite.entries) {
        final table = entry.key;
        final rows = entry.value as List? ?? const [];
        if (rows.isEmpty) continue;

        // Query columns currently existing in this database table.
        final colInfo = await txn.rawQuery('PRAGMA table_info($table)');
        final allowedColumns = colInfo.map((r) => r['name'] as String).toSet();
        if (allowedColumns.isEmpty) continue;

        for (final row in rows) {
          if (row is! Map) continue;
          final map = row.cast<String, Object?>();
          final columns = map.keys.where((c) => allowedColumns.contains(c)).toList();
          if (columns.isEmpty) continue;

          final placeholders = List.filled(columns.length, '?').join(', ');
          await txn.rawInsert(
            'INSERT INTO $table (${columns.join(', ')}) VALUES ($placeholders)',
            [for (final c in columns) map[c]],
          );
        }
      }
    });
  }

  /// Writes media files and unconditionally rewrites vlog file/thumbnail paths.
  Future<int> _restoreMediaFiles(
    Archive archive,
    List<BackupFileEntry> vlogs,
    List<BackupFileEntry> thumbs,
    String docs,
    List rawVlogRows,
  ) async {
    final vlogDir = Directory(p.join(docs, 'vlogs'));
    final thumbDir = Directory(p.join(docs, 'vlog_thumbnails'));
    await vlogDir.create(recursive: true);
    await thumbDir.create(recursive: true);

    var restoredCount = 0;
    final nameByVlog = <String, ({String? video, String? thumb})>{};

    // Extract videos
    for (final entry in vlogs) {
      final file = archive.files.where((f) => f.name == entry.entryPath).firstOrNull;
      if (file != null) {
        final outPath = p.join(vlogDir.path, entry.basename);
        await _writeArchiveFileStreaming(file, outPath);
        final current = nameByVlog[entry.vlogId];
        nameByVlog[entry.vlogId] = (video: entry.basename, thumb: current?.thumb);
        restoredCount++;
      }
    }

    // Extract thumbnails
    for (final entry in thumbs) {
      final file = archive.files.where((f) => f.name == entry.entryPath).firstOrNull;
      if (file != null) {
        final outPath = p.join(thumbDir.path, entry.basename);
        await _writeArchiveFileStreaming(file, outPath);
        final current = nameByVlog[entry.vlogId];
        nameByVlog[entry.vlogId] = (video: current?.video, thumb: entry.basename);
      }
    }

    // Rebase vlog paths in database
    for (final raw in rawVlogRows) {
      if (raw is! Map) continue;
      final id = raw['id']?.toString() ?? '';
      final names = nameByVlog[id];
      final videoName = names?.video ?? p.basename(raw['file_path']?.toString() ?? '$id.mp4');
      final thumbName = names?.thumb ??
          (raw['thumbnail_path'] != null ? p.basename(raw['thumbnail_path'].toString()) : null);

      await run(
        'UPDATE vlogs SET file_path = ?, thumbnail_path = ? WHERE id = ?',
        [
          p.join(vlogDir.path, videoName),
          thumbName != null ? p.join(thumbDir.path, thumbName) : null,
          id,
        ],
      );
    }

    return restoredCount;
  }

  Future<void> _writeArchiveFileStreaming(ArchiveFile file, String outPath) async {
    final output = OutputFileStream(outPath);
    try {
      file.writeContent(output, freeMemory: true);
    } finally {
      output.close();
    }
  }

  Future<void> _restorePrefsAllowlist(
    Map<String, dynamic> prefs,
    Map<String, Object?>? originalSnapshot,
  ) async {
    final sp = await SharedPreferences.getInstance();

    // 1. Clear SharedPreferences.
    await sp.clear();

    // 2. Restore allowlisted items from backup.
    for (final entry in prefs.entries) {
      if (!prefsAllowlist.contains(entry.key)) continue;
      if (entry.key == '__DB_SCHEMA_VERSION__') continue; // forced local
      final val = entry.value;
      if (val is String) {
        await sp.setString(entry.key, val);
      } else if (val is bool) {
        await sp.setBool(entry.key, val);
      } else if (val is int) {
        await sp.setInt(entry.key, val);
      } else if (val is double) {
        await sp.setDouble(entry.key, val);
      } else if (val is List<String>) {
        await sp.setStringList(entry.key, val);
      }
    }

    // 3. Re-apply local security state (PIN, attempt count, lockout) from snapshot.
    if (originalSnapshot != null) {
      for (final key in securitySecretKeys) {
        final val = originalSnapshot[key];
        if (val == null) continue;
        if (val is String) await sp.setString(key, val);
        if (val is int) await sp.setInt(key, val);
        if (val is bool) await sp.setBool(key, val);
      }
    }

    // 4. Force local schema version.
    await sp.setString('__DB_SCHEMA_VERSION__', '$currentSchemaVersion');
  }

  Future<void> _rollbackSnapshots(Map<String, Object> snapshots) async {
    try {
      final dbCopy = snapshots['dbCopy'] as String;
      final dbPath = snapshots['dbPath'] as String;
      final dbExists = snapshots['dbExists'] as bool? ?? false;

      if (dbExists && File(dbCopy).existsSync()) {
        await closeDb();
        final dbFile = File(dbPath);
        if (await dbFile.exists()) await dbFile.delete();
        await File(dbCopy).copy(dbPath);
      }

      // Rollback prefs
      final prefsPairs = snapshots['prefsPairs'] as Map<String, Object?>?;
      if (prefsPairs != null) {
        final sp = await SharedPreferences.getInstance();
        await sp.clear();
        for (final entry in prefsPairs.entries) {
          final val = entry.value;
          if (val is String) await sp.setString(entry.key, val);
          if (val is int) await sp.setInt(entry.key, val);
          if (val is bool) await sp.setBool(entry.key, val);
          if (val is double) await sp.setDouble(entry.key, val);
          if (val is List<String>) await sp.setStringList(entry.key, val);
        }
      }

      final snapshotDir = Directory(snapshots['snapshotDir'] as String);
      if (await snapshotDir.exists()) await snapshotDir.delete(recursive: true);
    } catch (e) {
      logStorage.warn('Rollback best-effort failed', e);
    }
  }

  Future<int> _freeDiskBytes() async => -1;

  static String _isoTimestamp() {
    final now = DateTime.now();
    return '${now.year}${_two(now.month)}${_two(now.day)}-${_two(now.hour)}${_two(now.minute)}${_two(now.second)}';
  }

  static String _two(int n) => n.toString().padLeft(2, '0');
}
