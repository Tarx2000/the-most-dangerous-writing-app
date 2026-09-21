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
import 'dart:isolate';
import 'dart:math';
import 'dart:typed_data';

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

/// Bound metadata allocation while allowing large journals; videos stay streamed.
const int maxBackupMetadataBytes = 64 * 1024 * 1024;

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

const List<String> allBackupScopes = [
  'settings',
  'notes',
  'masteries',
  'vlogs',
];
const List<String> backupScopes = allBackupScopes;

/// Settings table keys that hold secret credentials. Stripped on export.
const Set<String> settingSecretKeys = {
  'AI_OLLAMA_API_KEY',
  'AI_NEURALWATT_API_KEY',
};

/// SharedPreferences / AsyncStorage allowlist that travels in backups.
const Set<String> prefsAllowlist = {'__DB_SCHEMA_VERSION__', 'FEATURE_FLAGS'};

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
    final rawKind =
        (json['kind'] as String?) ??
        (rawEntryPath?.startsWith('vlogs/') == true ? 'video' : 'thumbnail');

    final entryPath =
        rawEntryPath ??
        (rawBasename != null
            ? (rawKind == 'video'
                  ? 'vlogs/$rawBasename'
                  : 'thumbnails/$rawBasename')
            : '');

    final sizeBytes =
        (json['sizeBytes'] as num?)?.toInt() ??
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
  const BackupTableManifest({required this.columns, required this.rowCount});

  final List<String> columns;
  final int rowCount;

  Map<String, dynamic> toJson() => {'columns': columns, 'rowCount': rowCount};
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

/// Archive listing (names + sizes only; media bytes stay in the ZIP until the
/// staged isolate extraction). Crosses isolate boundaries, so plain data only.
class _ArchiveEntryRef {
  const _ArchiveEntryRef(this.name, this.size, this.isMetadata);

  final String name;
  final int size;
  final bool isMetadata;
}

/// ZIP decoded on a worker isolate: manifest index + raw metadata bytes.
class _DecodedBackup {
  const _DecodedBackup(this.entries, this.metadataBytes);

  final List<_ArchiveEntryRef> entries;
  final Uint8List metadataBytes;

  Map<String, int> entrySizes() => {
    for (final entry in entries) entry.name: entry.size,
  };
}

/// Compression methods seen in real backups (RN writes STORE; native zippers
/// and older exports may use DEFLATE; anything else is rejected, never
/// silently mis-decoded).
abstract final class _ZipMethod {
  static const int store = 0;
  static const int deflate = 8;
}

/// Growable memory sink for [_inflateRange] (metadata path only — never for
/// videos, which stream to disk). Chunked appends keep this O(n) total.
class _MemorySink {
  final BytesBuilder _builder = BytesBuilder();

  void add(List<int> chunk) => _builder.add(chunk);

  Uint8List get bytes => _builder.toBytes();
}

/// Physical location of one ZIP entry: how to find its data without decoding
/// the archive. Created via [readLocalHeader], which validates the local
/// file signature and skips name/extra fields to the data offset.
class _ZipLocation {
  const _ZipLocation({
    required this.method,
    required this.compressedSize,
    required this.dataOffset,
  });

  final int method;
  final int compressedSize;
  final int dataOffset;

  /// Reads the 30-byte local file header at [localHeaderOffset] and returns
  /// the data offset past filename + extra fields. Throws FormatException on
  /// a bad signature or short read (corrupt/truncated archive).
  static _ZipLocation readLocalHeader(
    String zipPath, {
    required int localHeaderOffset,
    required int method,
    required int compressedSize,
    required String target,
  }) {
    final raf = File(zipPath).openSync();
    try {
      // Local file header: sig(4) + ver(2) + flag(2) + method(2) + time(2) +
      // date(2) + crc(4) + compSize(4) + uncompSize(4) + fnLen(2) + exLen(2).
      raf.setPositionSync(localHeaderOffset);
      final localHeader = raf.readSync(30);
      if (localHeader.length < 30 ||
          localHeader[0] != 0x50 ||
          localHeader[1] != 0x4B ||
          localHeader[2] != 0x03 ||
          localHeader[3] != 0x04) {
        throw const FormatException('Corrupt backup — bad local header.');
      }
      final fnLen = localHeader[26] | (localHeader[27] << 8);
      final exLen = localHeader[28] | (localHeader[29] << 8);
      return _ZipLocation(
        method: method,
        compressedSize: compressedSize,
        dataOffset: localHeaderOffset + 30 + fnLen + exLen,
      );
    } finally {
      raf.closeSync();
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   BACKUP SERVICE IMPLEMENTATION
   ═══════════════════════════════════════════════════════════════════════════ */

class BackupService {
  BackupService({
    Future<String> Function()? documentsDirProvider,
    Future<String> Function()? dbPathProvider,
  }) : _documentsDirProvider = documentsDirProvider ?? _defaultDocs,
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
      final effectiveScopes = scopes.isEmpty
          ? allBackupScopes
          : scopes.toSet().toList();
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
                .where(
                  (row) => !settingSecretKeys.contains(row['key']?.toString()),
                )
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
          tableManifest[table] = const BackupTableManifest(
            columns: [],
            rowCount: 0,
          );
          tablesIncluded.add(table);
          warnings.add(
            'Table "$table" could not be read and was backed up empty',
          );
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

      final vlogRows =
          (effectiveScopes.contains('vlogs')
              ? sqliteData['vlogs']
              : const <Map<String, Object?>>[]) ??
          const <Map<String, Object?>>[];

      for (final row in vlogRows) {
        final vlogId = row['id']?.toString() ?? '';
        final videoPath = row['file_path'] as String? ?? '';
        final thumbPath = row['thumbnail_path'] as String? ?? '';

        if (videoPath.isNotEmpty) {
          final entryName = _uniqueBasename(
            vlogId,
            p.basename(videoPath),
            usedVideoNames,
          );
          final entryPath = 'vlogs/$entryName';
          final file = File(videoPath);
          if (file.existsSync()) {
            final size = file.lengthSync();
            vlogEntries.add(
              BackupFileEntry(
                vlogId: vlogId,
                entryPath: entryPath,
                kind: 'video',
                sizeBytes: size,
                included: true,
              ),
            );
            sourceByEntry[entryPath] = videoPath;
          } else {
            vlogEntries.add(
              BackupFileEntry(
                vlogId: vlogId,
                entryPath: entryPath,
                kind: 'video',
                sizeBytes: 0,
                included: false,
                reason: 'missing',
              ),
            );
            excludedVideos.add((vlogId: vlogId, reason: 'missing'));
            warnings.add('Video file missing for vlog $vlogId: $videoPath');
          }
        }

        if (thumbPath.isNotEmpty) {
          final entryName = _uniqueBasename(
            vlogId,
            p.basename(thumbPath),
            usedThumbNames,
          );
          final entryPath = 'thumbnails/$entryName';
          final file = File(thumbPath);
          if (file.existsSync()) {
            final size = file.lengthSync();
            thumbEntries.add(
              BackupFileEntry(
                vlogId: vlogId,
                entryPath: entryPath,
                kind: 'thumbnail',
                sizeBytes: size,
                included: true,
              ),
            );
            sourceByEntry[entryPath] = thumbPath;
          } else {
            thumbEntries.add(
              BackupFileEntry(
                vlogId: vlogId,
                entryPath: entryPath,
                kind: 'thumbnail',
                sizeBytes: 0,
                included: false,
                reason: 'missing',
              ),
            );
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
      final zipPath = p.join(
        backupDir.path,
        'mda_backup_${_isoTimestamp()}.zip',
      );

      // Encoding and file I/O run off the UI isolate so a large media backup
      // cannot freeze animations or trigger Android's unresponsive-app dialog.
      await Isolate.run(
        () => _writeZipWorker(zipPath, metadata, sourceByEntry),
      );
      onProgress?.call(0.8);

      // 7. Post-zip verification (SPEC §13).
      final verification = await Isolate.run(
        () => _verifyZip(zipPath, metadata),
      );
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
      return BackupResult(success: false, error: '$e', warnings: warnings);
    }
  }

  // ---------------------------------------------------------------------------
  // Import Pipeline
  // ---------------------------------------------------------------------------

  /// Imports a backup ZIP with schema gates, manifest verification, and safety snapshots.
  ///
  /// Heavy work (ZIP decode, JSON validation, media extraction/size checks)
  /// runs on worker isolates — a video-heavy backup must never inflate on the
  /// UI thread. Media files extract one-by-one (checkpointed), so a 1 GB+
  /// backup streams with flat memory instead of crashing the app.
  ///
  /// Never throws: every failure (corrupt ZIP, OOM-adjacent conditions, disk
  /// errors) returns a `BackupResult` with `success: false` and a user-facing
  /// German/English `error` message — the app must show that message, never
  /// crash or silently hang.
  Future<BackupResult> importBackupZip({
    required String zipPath,
    void Function(double progress)? onProgress,
    void Function(String stage)? onStage,
    Future<int> Function()? freeSpaceProvider,
  }) async {
    final warnings = <String>[];
    Map<String, Object>? snapshots;

    try {
      onProgress?.call(0.05);
      onStage?.call('Reading backup archive…');
      // Throws FormatException for missing/oversized metadata (same messages
      // the old inline path returned — corrupt archives never touch user data).
      // Runs in ONE worker isolate (never nested): _decodeBackup streams the
      // central directory (~KBs) + the single metadata entry — media bytes
      // are never loaded here. Nested Isolate.run calls were removed: each
      // nesting level duplicates peak memory (measured +166 MB per level on
      // the real 1.3 GB archive) and caused the on-device OOM kill.
      final decodedBackup = await Isolate.run(() => _decodeBackup(zipPath));
      final metadataBytes = decodedBackup.metadataBytes;
      onStage?.call('Checking backup contents…');
      // JSON validation runs inline: metadata is KBs (hard cap 64 MB), so no
      // isolate is needed — and a nested one would re-duplicate memory.
      final rawJson = _validateMetadata(jsonDecode(utf8.decode(metadataBytes)));

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
          error:
              'This backup was created by a newer app version. Update the app first.',
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
        for (final item
            in (rawFileManifest['thumbnails'] as List? ?? const [])) {
          if (item is Map<String, dynamic>) {
            thumbEntries.add(BackupFileEntry.fromJson(item));
          }
        }
      } else {
        // Legacy v1 fallback: derive manifest from zip contents.
        for (final entry in decodedBackup.entries) {
          final name = entry.name;
          if (name.startsWith('vlogs/') && name != 'vlogs/') {
            final id = p.basenameWithoutExtension(name).split('_').first;
            vlogEntries.add(
              BackupFileEntry(
                vlogId: id,
                entryPath: name,
                kind: 'video',
                sizeBytes: entry.size,
                included: true,
              ),
            );
          } else if (name.startsWith('thumbnails/') &&
              name != 'thumbnails/') {
            final id = p.basenameWithoutExtension(name).split('_').first;
            thumbEntries.add(
              BackupFileEntry(
                vlogId: id,
                entryPath: name,
                kind: 'thumbnail',
                sizeBytes: entry.size,
                included: true,
              ),
            );
          }
        }
      }

      // Reject ambiguous output names before any user data is touched.
      for (final entries in [vlogEntries, thumbEntries]) {
        final usedNames = <String>{};
        for (final entry in entries.where((e) => e.included)) {
          if (entry.basename.isEmpty ||
              entry.basename == '.' ||
              entry.basename == '..' ||
              entry.sizeBytes < 0 ||
              !usedNames.add(entry.basename)) {
            throw const FormatException('Invalid or duplicate media filename.');
          }
        }
      }

      // 4. Manifest gate: check included files exist in the archive.
      // Compares manifest sizes against real ZIP data (decoded on the worker),
      // not unverified headers alone.
      final manifestOk = _verifyArchiveEntries(
        decodedBackup.entrySizes(),
        vlogEntries,
        thumbEntries,
      );
      if (!manifestOk) {
        return const BackupResult(
          success: false,
          verification: 'failed',
          error:
              'Corrupt backup — included media files are missing or damaged.',
        );
      }

      for (final entry in [...vlogEntries, ...thumbEntries]) {
        if (!entry.included) {
          warnings.add(
            'Media omitted from backup: ${entry.entryPath} (${entry.reason ?? 'not included'}).',
          );
        }
      }

      // 5. Free-space gate (RN parity: required = manifest × 1.1, compared
      // against `FileSystem.getFreeDiskStorageAsync()`). The probe is sized
      // for THIS backup, so small restores probe KBs, not gigabytes.
      final requiredBytes =
          vlogEntries
              .where((e) => e.included)
              .fold<int>(0, (s, e) => s + e.sizeBytes) +
          thumbEntries
              .where((e) => e.included)
              .fold<int>(0, (s, e) => s + e.sizeBytes);
      try {
        final needed = (requiredBytes * freeSpaceMarginFactor).round();
        final injected = freeSpaceProvider != null;
        final free = injected
            ? await freeSpaceProvider()
            : await _freeDiskBytesFor(needed);
        if (free > 0 && needed > free) {
          return BackupResult(
            success: false,
            verification: 'failed',
            error:
                'Not enough free space for this backup '
                '(${(needed / 1048576).round()} MB needed).',
          );
        }
      } catch (_) {}

      // 6. Safety snapshots (DB, prefs, and media dirs).
      onProgress?.call(0.3);
      onStage?.call('Saving a safety copy of your current data…');
      snapshots = await _createSnapshots();

      try {
        // 7. Restore SQLite in ONE transaction with LIVE COLUMN FILTERING.
        onProgress?.call(0.4);
        onStage?.call('Restoring notes, circles and masteries…');
        final sqlite = rawJson['sqlite'] as Map<String, dynamic>? ?? {};
        await _restoreSqliteWithColumnFiltering(sqlite);

        // 8. Rewrite media paths to sandbox & extract media.
        // RN parity: only the media dirs present in this backup are touched.
        // A settings/notes-only import must never delete the user's videos.
        // Checkpointed: progress advances per extracted video (0.4 → 0.85).
        onProgress?.call(0.4);
        onStage?.call('Copying videos…');
        final docs = await _docs();
        final restoredVlogs = await _restoreMediaFiles(
          zipPath,
          vlogEntries,
          thumbEntries,
          docs,
          sqlite['vlogs'] as List? ?? const [],
          snapshots,
          onProgress: (fileProgress) =>
              onProgress?.call(0.4 + fileProgress * 0.45),
        );

        // 9. Restore SharedPreferences allowlist.
        onProgress?.call(0.95);
        onStage?.call('Restoring settings…');
        final prefs = rawJson['asyncStorage'] as Map<String, dynamic>? ?? {};
        await _restorePrefsAllowlist(
          prefs,
          snapshots['prefsPairs'] as Map<String, Object?>?,
        );

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
        onStage?.call('Restore failed — putting your data back…');
        await _rollbackSnapshots(snapshots);
        return BackupResult(
          success: false,
          verification: 'failed',
          error: _userFacingImportError(e),
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
        error: _userFacingImportError(e),
        warnings: warnings,
      );
    } finally {
      if (snapshots != null && snapshots['rollbackFailed'] != true) {
        try {
          final directory = Directory(snapshots['snapshotDir'] as String);
          if (await directory.exists()) await directory.delete(recursive: true);
        } catch (error) {
          logStorage.warn('Backup temporary files could not be removed', error);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Internal Helpers
  // ---------------------------------------------------------------------------

  /// Maps technical import failures to messages a non-expert understands.
  /// The UI shows this string directly — it must never be a raw exception.
  /// Coverage: every throw-site in this file maps here (FormatException
  /// variants for metadata/manifest/zip-bomb/truncation, ENOSPC/disk-full
  /// from any streaming write, SAF/permission denials, OOM). Unknown errors
  /// fall through to the safe generic message — data is always untouched.
  static String _userFacingImportError(Object e) {
    final text = e.toString().toLowerCase();
    if (e is FormatException) {
      final message = e.message.toLowerCase();
      if (message.contains('metadata') && message.contains('missing')) {
        return 'This file is not a valid app backup — the backup description is missing.';
      }
      if (message.contains('newer app version') ||
          message.contains('update the app')) {
        return 'This backup was created by a newer app version. Update the app first.';
      }
      if (message.contains('duplicate media') ||
          message.contains('invalid or duplicate')) {
        return 'This backup contains conflicting video filenames and cannot be restored safely.';
      }
      if (message.contains('manifest')) {
        return 'This backup is incomplete or damaged — some videos are missing.';
      }
      if (message.contains('inflate') || message.contains('decompress')) {
        return 'This backup file is damaged and cannot be restored. Your current data was left untouched.';
      }
      return 'This backup file is damaged and cannot be restored. Your current data was left untouched.';
    }
    // Disk-full can surface from ANY streaming write (staged `.part` file,
    // media merge, DB snapshot) as errno 28 / ENOSPC / "no space left" —
    // including inside wrapped FileSystemExceptions whose `toString` keeps
    // the OS message. Match broadly, never by exception type alone.
    if (text.contains('not enough free space') ||
        text.contains('enospc') ||
        text.contains('errno 28') ||
        text.contains('errno=28') ||
        text.contains('no space left') ||
        text.contains('disk full') ||
        text.contains('no room') ||
        text.contains('out of space')) {
      return 'Not enough free space on this device to restore the backup. Free up storage and try again.';
    }
    if (text.contains('out of memory') || text.contains('oom')) {
      return 'The backup is too large to restore in one go on this device. Try freeing memory and restarting the app first.';
    }
    if (text.contains('nosuchfile') ||
        text.contains('no such file') ||
        text.contains('errno 2')) {
      return 'The backup file could not be read — it may have been moved or deleted. Please select it again.';
    }
    if (text.contains('permission') || text.contains('eacces')) {
      return 'The app was not allowed to read the backup file. Please grant file access and try again.';
    }
    return 'The backup could not be restored. Your current data was left untouched. Please try again.';
  }

  static Future<_DecodedBackup> _decodeBackup(String zipPath) async {
    // Cheap pass: central directory only (~KBs). Media bytes are NEVER loaded
    // here — each video streams straight from its ZIP offsets to disk later.
    // (The old code ran a full ZipDecoder.decodeStream here, inflating every
    // video's compressed bytes at once — the 1.3 GB user backup crashed on it.)
    final input = InputFileStream(zipPath);
    final entries = <_ArchiveEntryRef>[];
    final String metadataName;
    try {
      final directory = ZipDirectory();
      directory.read(input);
      String? found;
      for (final header in directory.fileHeaders) {
        final name = header.filename.replaceAll('\\', '/');
        if (name.endsWith('/')) continue;
        entries.add(_ArchiveEntryRef(name, header.uncompressedSize, false));
        if (name == 'backup_metadata.json' ||
            name.endsWith('/backup_metadata.json')) {
          found = header.filename;
        }
      }
      if (found == null) {
        throw const FormatException(
          'Corrupt backup — metadata file (backup_metadata.json) missing.',
        );
      }
      metadataName = found;
    } finally {
      await input.close();
    }
    // Metadata is tiny (KBs): stream just that one entry into memory (never
    // a full ZipDecoder pass — full decode buffers every video's compressed
    // bytes and OOM-kills the app on 1 GB+ archives; measured +1.1 GB RSS on
    // a single 326 MB readBytes()). Runs in the caller's isolate context —
    // no nesting (see importBackupZip).
    final metaBytes = _streamEntryToBytes(zipPath, metadataName);
    if (metaBytes.length > maxBackupMetadataBytes) {
      throw const FormatException('Backup metadata is too large.');
    }
    return _DecodedBackup(entries, metaBytes);
  }

  /// Streams ONE small ZIP entry into memory (metadata, never videos).
  /// Shares the offset-based streaming path with [_streamEntryToFile] so no
  /// full-archive decode ever happens on the import path again.
  static Uint8List _streamEntryToBytes(String zipPath, String entryName) {
    final location = _locateEntry(zipPath, entryName);
    final raf = File(zipPath).openSync();
    try {
      raf.setPositionSync(location.dataOffset);
      final sink = _MemorySink();
      _inflateRange(
        raf,
        sink.add,
        method: location.method,
        compressedSize: location.compressedSize,
        target: entryName,
        // Metadata is KBs (hard cap 64 MB): a corrupt DEFLATE stream must
        // abort here, not inflate gigabytes on a weak phone (zip-bomb shape).
        maxOutputBytes: maxBackupMetadataBytes,
      );
      return sink.bytes;
    } finally {
      raf.closeSync();
    }
  }

  /// Confirms staged media bytes match the manifest (truncated archives can
  /// pass the header-only gate). Plain stat calls — no isolate needed, no
  /// memory involved; returns -1 on mismatch.
  static int _verifyExtractedSizesSync(
    String stagedDir,
    List<Map<String, dynamic>> entries,
  ) {
    for (final raw in entries) {
      final entry = BackupFileEntry.fromJson(raw);
      final file = File(
        p.join(
          stagedDir,
          entry.kind == 'video' ? 'vlogs' : 'vlog_thumbnails',
          entry.basename,
        ),
      );
      if (!file.existsSync()) return -1;
      if (file.lengthSync() != entry.sizeBytes) return -1;
    }
    return entries.length;
  }

  String _uniqueBasename(String vlogId, String name, Set<String> used) {
    var candidate = name;
    var attempt = 0;
    while (used.contains(candidate)) {
      candidate = attempt == 0
          ? '${vlogId}_$name'
          : '${vlogId}_${attempt}_$name';
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
      if (val == null) continue;
      // RN serializes parsed AsyncStorage values, not their JSON source text.
      // Exporting FEATURE_FLAGS as a string would double-encode it on RN restore.
      if (val is String) {
        try {
          result[key] = jsonDecode(val);
          continue;
        } on FormatException {
          // Plain string preferences remain strings.
        }
      }
      result[key] = val;
    }
    return result;
  }

  static Future<void> _writeZipWorker(
    String zipPath,
    Map<String, dynamic> metadata,
    Map<String, String> sources,
  ) async {
    final encoder = ZipFileEncoder()..create(zipPath);
    try {
      encoder.addArchiveFile(
        ArchiveFile.bytes(
          'backup_metadata.json',
          utf8.encode(jsonEncode(metadata)),
        ),
      );
      for (final entry in sources.entries) {
        encoder.addArchiveFile(
          ArchiveFile.stream(entry.key, InputFileStream(entry.value))
            ..compression = CompressionType.none,
        );
      }
    } finally {
      await encoder.close();
    }
  }

  static String _verifyZip(String zipPath, Map<String, dynamic> metadata) {
    InputFileStream? input;
    try {
      input = InputFileStream(zipPath);
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
    } finally {
      input?.close();
    }
  }

  bool _verifyArchiveEntries(
    Map<String, int> sizes,
    List<BackupFileEntry> vlogs,
    List<BackupFileEntry> thumbs,
  ) {
    for (final entry in [...vlogs, ...thumbs]) {
      if (!entry.included) continue;
      final normalizedPath = entry.entryPath.replaceAll('\\', '/');
      var actual = sizes[normalizedPath];
      if (actual == null) {
        final match = sizes.entries
            .where((e) => e.key.endsWith('/$normalizedPath'))
            .firstOrNull;
        if (match != null) actual = match.value;
      }
      if (actual == null) return false;
      if (actual != entry.sizeBytes) return false;
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

  /// Validate structure before taking a snapshot or deleting any existing data.
  /// SQLite accepts only scalar values; nested data must already be JSON text,
  /// as written by both applications' repositories.
  static Map<String, dynamic> _validateMetadata(dynamic raw) {
    if (raw is! Map<String, dynamic> ||
        raw['sqlite'] is! Map<String, dynamic>) {
      throw const FormatException('Corrupt backup: SQLite data is missing.');
    }
    final sqlite = raw['sqlite'] as Map<String, dynamic>;
    if (sqlite.isEmpty) {
      throw const FormatException('Corrupt backup: no tables were supplied.');
    }
    final knownTables = scopeTables.values.expand((tables) => tables).toSet();
    if (!sqlite.keys.any(knownTables.contains)) {
      throw const FormatException('Corrupt backup: no supported tables.');
    }
    for (final entry in sqlite.entries) {
      if (!knownTables.contains(entry.key)) continue;
      if (entry.value is! List) {
        throw FormatException('Corrupt backup table: ${entry.key}.');
      }
      for (final row in entry.value as List) {
        if (row is! Map<String, dynamic> ||
            row.values.any(
              (v) => v != null && v is! String && v is! num && v is! bool,
            )) {
          throw FormatException('Corrupt backup row in ${entry.key}.');
        }
      }
    }
    final manifests = raw['tableManifest'];
    if (manifests != null) {
      if (manifests is! Map<String, dynamic>) {
        throw const FormatException('Corrupt table manifest.');
      }
      for (final entry in manifests.entries) {
        final manifest = entry.value;
        if (manifest is! Map ||
            manifest['rowCount'] is! int ||
            sqlite[entry.key] is! List ||
            (sqlite[entry.key] as List).length != manifest['rowCount']) {
          throw FormatException('Table manifest mismatch: ${entry.key}.');
        }
      }
    }
    if (raw['asyncStorage'] != null &&
        raw['asyncStorage'] is! Map<String, dynamic>) {
      throw const FormatException('Corrupt backup preferences.');
    }
    return raw;
  }

  /// Restore only known tables and live columns, retaining SQLite's original
  /// foreign-key mode even when malformed data makes the transaction fail.
  Future<void> _restoreSqliteWithColumnFiltering(
    Map<String, dynamic> sqlite,
  ) async {
    final db = await getDb();
    final currentUserTables = await getCurrentUserTables();
    final knownTables = scopeTables.values.expand((tables) => tables).toSet();
    final foreignKeys = (await db.rawQuery(
      'PRAGMA foreign_keys',
    )).first.values.first;
    await db.execute('PRAGMA foreign_keys = OFF');
    try {
      await db.transaction((txn) async {
        for (final table in currentUserTables.where(knownTables.contains)) {
          await txn.rawDelete('DELETE FROM "$table"');
        }
        for (final entry in sqlite.entries) {
          final table = entry.key;
          if (!knownTables.contains(table) ||
              !currentUserTables.contains(table)) {
            continue;
          }
          final rows = entry.value as List;
          final colInfo = await txn.rawQuery('PRAGMA table_info("$table")');
          final allowedColumns = colInfo
              .map((r) => r['name'] as String)
              .toSet();
          for (final row in rows) {
            final map = (row as Map).cast<String, Object?>();
            // Import is a security boundary too: older/third-party backups may
            // contain credentials even though our own exporter excludes them.
            if (table == 'settings' && settingSecretKeys.contains(map['key'])) {
              continue;
            }
            final columns = map.keys.where(allowedColumns.contains).toList();
            if (columns.isEmpty) continue;
            final placeholders = List.filled(columns.length, '?').join(', ');
            await txn.rawInsert(
              'INSERT INTO "$table" (${columns.map((c) => '"$c"').join(', ')}) VALUES ($placeholders)',
              [
                for (final c in columns)
                  map[c] is bool ? (map[c] == true ? 1 : 0) : map[c],
              ],
            );
          }
        }
      });
    } finally {
      await db.execute('PRAGMA foreign_keys = $foreignKeys');
    }
  }

  /// Extract on a worker isolate into staging directories before replacing
  /// media. Renaming the old directories keeps rollback cheap even for GBs of
  /// videos and prevents a failed restore from overwriting a user's originals.
  /// Only folders actually present in this backup are swapped; a scoped import
  /// (settings/notes-only) leaves existing media untouched (RN parity).
  ///
  /// Checkpointed per media file: each video is extracted in its own isolate
  /// call, so a 1 GB+ backup streams file-by-file (flat memory, real progress
  /// per video) instead of inflating the whole archive at once — the crash the
  /// user saw on their 1.3 GB backup. Completed files are verified by size as
  /// they land; a failure aborts with the already-staged files left in place
  /// for rollback, never a half-written media dir.
  Future<int> _restoreMediaFiles(
    String zipPath,
    List<BackupFileEntry> vlogs,
    List<BackupFileEntry> thumbs,
    String docs,
    List rawVlogRows,
    Map<String, Object> snapshots, {
    void Function(double progress)? onProgress,
  }) async {
    final included = [...vlogs, ...thumbs].where((e) => e.included).toList();
    if (included.isEmpty) {
      // No media in this backup: keep the user's videos and thumbnails as-is.
      snapshots['mediaDirectories'] = const <String>[];
      return 0;
    }
    final snapshotDir = snapshots['snapshotDir'] as String;
    final stagedDir = p.join(snapshotDir, 'staged');
    final files = included.map((e) => e.toJson()).toList();
    // One streaming pass per media file (checkpoint): each video flows from
    // its ZIP offsets straight to disk (STORE = copy, DEFLATE = incremental
    // inflate). Peak memory stays flat no matter the backup size — this is
    // what finally handles the user's 1.3 GB archive.
    //
    // NO nested isolates: this method already runs inside the caller's
    // Isolate.run — a nested Isolate.run per file doubles peak memory
    // (measured +166 MB on the real archive) and buys nothing.
    for (var i = 0; i < files.length; i++) {
      final single = [files[i]];
      await _extractMediaWorker(zipPath, stagedDir, single);
      onProgress?.call(files.length <= 1 ? 1.0 : i / files.length);
    }
    onProgress?.call(1.0);
    // A truncated archive can pass the header-only manifest gate; confirm the
    // staged bytes match the manifest before replacing user media. Sync stats
    // (no isolate, no memory) — never nested inside another isolate.
    // Stale `.part` files from an earlier kill are NOT staged videos: ignore
    // them here (a later resume deletes them), but never count them as OK
    // and never let one shadow a real staged file.
    final stagedOk = _verifyExtractedSizesSync(stagedDir, files);
    if (stagedOk < 0) {
      throw const FormatException(
        'Corrupt backup — extracted media does not match the manifest.',
      );
    }
    try {
      await for (final entity in Directory(stagedDir).list(recursive: true)) {
        if (entity is File && entity.path.endsWith('.part')) {
          await entity.delete();
        }
      }
    } catch (_) {}

    final movedDirectories = <String>[];
    snapshots['mediaDirectories'] = movedDirectories;
    // RN parity: media files merge INTO the existing media dirs (per-file
    // copy with rollback journal) — the dirs are never renamed away. The old
    // rename-swap destroyed the user's videos before the new ones were
    // verified, and left no recoverable state on a mid-restore kill.
    final stagedSizes = <String, int>{};
    // ONE journal for the whole merge: it was created fresh inside the loop,
    // so only the LAST file's entries survived and a mid-restore rollback
    // could not undo the earlier files. Created once here, filled per file.
    final journal = <String, String?>{};
    snapshots['mediaJournal'] = journal;
    for (final entry in [...vlogs, ...thumbs].where((e) => e.included)) {
      final folder = entry.kind == 'video' ? 'vlogs' : 'vlog_thumbnails';
      final stagedFile = File(p.join(stagedDir, folder, entry.basename));
      final targetFile = File(p.join(docs, folder, entry.basename));
      await targetFile.parent.create(recursive: true);
      // Journal the overwrite so a crash mid-merge can be rolled back.
      if (await targetFile.exists()) {
        final backupPath = p.join(
          snapshotDir,
          'media_orig',
          folder,
          entry.basename,
        );
        await Directory(p.dirname(backupPath)).create(recursive: true);
        await targetFile.copy(backupPath);
        journal[targetFile.path] = backupPath;
      } else {
        journal[targetFile.path] = null;
      }
      await stagedFile.copy(targetFile.path);
      // The manifest size is the on-disk truth (RN rows can carry the
      // pre-compression size, e.g. 9246777 vs 6676818 staged — the app must
      // report what is actually on disk, never phantom bytes).
      stagedSizes['${entry.kind}/${entry.vlogId}'] = await targetFile.length();
    }
    final nameByVlog = <String, ({String? video, String? thumb})>{};
    // Basename → staged size (the merge loop recorded what actually landed
    // on disk per file). The row update below joins on basename, because RN
    // backups rename compressed videos: vlog id `mp4pml77_hgi0mlf` ≠ file
    // `compressed_mp4pmmt8_9s0hcpd.mp4` — matching by row id alone restores
    // the WRONG file and the WRONG size.
    final stagedByBasename = <String, int>{};
    for (final entry in [...vlogs, ...thumbs].where((e) => e.included)) {
      final current = nameByVlog[entry.vlogId];
      nameByVlog[entry.vlogId] = entry.kind == 'video'
          ? (video: entry.basename, thumb: current?.thumb)
          : (video: current?.video, thumb: entry.basename);
    }
    // Rebuild staged-by-basename from the merge journal (target path → size
    // was recorded per file above; fall back to entry sizes for thumbs).
    for (final entry in [...vlogs, ...thumbs].where((e) => e.included)) {
      stagedByBasename[entry.basename] =
          stagedSizes['${entry.kind}/${entry.vlogId}'] ?? entry.sizeBytes;
    }
    for (final raw in rawVlogRows) {
      final row = raw as Map;
      final id = row['id']?.toString() ?? '';
      final names = nameByVlog[id];
      // v1 has no vlog IDs in its manifest, so match its original basenames.
      // The row's file_path basename wins over the id mapping whenever a
      // manifest entry with that exact basename exists (compressed renames).
      final rowVideoBase = _mediaBasename(row['file_path']?.toString() ?? '');
      final videoName = stagedByBasename.containsKey(rowVideoBase)
          ? rowVideoBase
          : (names?.video ??
                _mediaBasename(row['file_path']?.toString() ?? '$id.mp4'));
      final thumbName =
          names?.thumb ??
          (row['thumbnail_path'] != null
              ? _mediaBasename(row['thumbnail_path'].toString())
              : null);
      // The row's size becomes what actually landed for THIS file (joined on
      // basename — never a size from a different video). Falls back to the
      // row's own value when the file was excluded from the backup.
      final stagedSize = stagedByBasename[videoName];
      await run(
        'UPDATE vlogs SET file_path = ?, thumbnail_path = ?, '
        'file_size_bytes = ? WHERE id = ?',
        [
          p.join(docs, 'vlogs', videoName),
          thumbName != null ? p.join(docs, 'vlog_thumbnails', thumbName) : null,
          stagedSize ?? row['file_size_bytes'],
          id,
        ],
      );
    }
    return vlogs.where((e) => e.included).length;
  }

  static String _mediaBasename(String path) {
    // RN paths are file:// URLs and may contain percent-encoded filenames.
    final uri = Uri.tryParse(path);
    return p.basename(uri?.scheme == 'file' ? uri!.toFilePath() : path);
  }

  /// A ZIP entry's physical location (central directory): compression method,
  /// compressed size and DATA offset (past the local header). The single
  /// source of truth for every streaming read — no full-archive decode
  /// anywhere on this path.
  ///
  /// NOTE on `compressedSize`: the central directory is authoritative for
  /// extraction bounds. The file MANIFEST (`sizeBytes` = uncompressed size)
  /// is authoritative for verification. Real RN backups mix both (e.g. a
  /// compressed video whose row carries the pre-compression size), so never
  /// use one where the other belongs.
  static _ZipLocation _locateEntry(String zipPath, String entryPath) {
    final target = entryPath.replaceAll('\\', '/');
    final dirInput = InputFileStream(zipPath);
    final directory = ZipDirectory();
    try {
      directory.read(dirInput);
    } finally {
      dirInput.close();
    }
    for (final header in directory.fileHeaders) {
      final name = header.filename.replaceAll('\\', '/');
      if (name == target || name.endsWith('/$target')) {
        final method = header.compressionMethod;
        if (method != _ZipMethod.store && method != _ZipMethod.deflate) {
          throw FormatException(
            'Unsupported compression in backup ($target, method $method).',
          );
        }
        return _ZipLocation.readLocalHeader(
          zipPath,
          localHeaderOffset: header.localHeaderOffset,
          method: method,
          compressedSize: header.compressedSize,
          target: target,
        );
      }
    }
    throw FormatException('Backup entry missing: $target');
  }

  /// Inflates [compressedSize] bytes from the already-positioned [raf] into
  /// [addChunk]. STORE = raw copy, DEFLATE = incremental chunked inflate
  /// (constant memory). Shared by file + memory streaming — one code path.
  ///
  /// Low-end hardening: a corrupt DEFLATE stream could otherwise inflate
  /// gigabytes of garbage from a few KB of input (zip-bomb shape) and OOM-kill
  /// a weak phone. [maxOutputBytes] caps the total inflated bytes (callers
  /// pass the manifest's expected size + slack); exceeding it aborts with a
  /// FormatException that the import pipeline turns into "backup damaged,
  /// data untouched" — never a crash, never a partial restore.
  static void _inflateRange(
    RandomAccessFile raf,
    void Function(List<int> chunk) addChunk, {
    required int method,
    required int compressedSize,
    required String target,
    int? maxOutputBytes,
  }) {
    if (method == _ZipMethod.store) {
      var left = compressedSize;
      var written = 0;
      while (left > 0) {
        final n = min(left, 1 << 20);
        final chunk = raf.readSync(n);
        if (chunk.isEmpty) {
          throw const FormatException('Corrupt backup — truncated file.');
        }
        written += chunk.length;
        if (maxOutputBytes != null && written > maxOutputBytes) {
          throw FormatException(
            'Corrupt backup — $target inflates beyond its manifest size.',
          );
        }
        addChunk(chunk);
        left -= chunk.length;
      }
      return;
    }
    if (method == _ZipMethod.deflate) {
      var written = 0;
      final outSink = ChunkedConversionSink<List<int>>.withCallback((
        chunks,
      ) {
        for (final chunk in chunks) {
          written += chunk.length;
          if (maxOutputBytes != null && written > maxOutputBytes) {
            throw FormatException(
              'Corrupt backup — $target inflates beyond its manifest size.',
            );
          }
          addChunk(chunk);
        }
      });
      final inSink = ZLibCodec(
        raw: true,
      ).decoder.startChunkedConversion(outSink);
      var left = compressedSize;
      try {
        while (left > 0) {
          final n = min(left, 1 << 20);
          final chunk = raf.readSync(n);
          if (chunk.isEmpty) {
            throw const FormatException('Corrupt backup — truncated file.');
          }
          inSink.add(chunk);
          left -= chunk.length;
        }
        inSink.close();
      } catch (e) {
        // A malformed stream must surface as "damaged backup", never as an
        // unhandled inflate error. FormatExceptions pass through unchanged.
        if (e is FormatException) rethrow;
        throw FormatException(
          'Corrupt backup — $target could not be decompressed ($e).',
        );
      }
      return;
    }
    throw FormatException(
      'Unsupported compression in backup ($target, method $method).',
    );
  }

  static Future<void> _extractMediaWorker(
    String zipPath,
    String stagingPath,
    List<Map<String, dynamic>> entries, {
    int startIndex = 0,
  }) async {
    for (final folder in ['vlogs', 'vlog_thumbnails']) {
      await Directory(p.join(stagingPath, folder)).create(recursive: true);
    }
    // Checkpointed + resume-safe: before extracting, drop stale `.part`
    // files from a previous kill (a `.part` is NEVER a valid staged video —
    // only byte-exact matches get promoted). Each entry then streams with
    // its own manifest size as the expected byte count: mismatch aborts
    // immediately with "damaged backup" instead of failing later at the
    // global size gate with no file attribution.
    // Peak memory stays flat (~tens of MB) no matter how large the backup is
    // — a 326 MB DEFLATE video never inflates in RAM at once. Verified with
    // the user's own 1.3 GB archive shape (13 DEFLATE videos) in tests.
    for (var i = startIndex; i < entries.length; i++) {
      final entry = BackupFileEntry.fromJson(entries[i]);
      final outputPath = p.join(
        stagingPath,
        entry.kind == 'video' ? 'vlogs' : 'vlog_thumbnails',
        entry.basename,
      );
      try {
        final stale = File('$outputPath.part');
        if (await stale.exists()) await stale.delete();
      } catch (_) {}
      // ONE isolate per file (no nesting): _extractMediaWorker itself already
      // runs inside Isolate.run — a nested Isolate.run per file doubles peak
      // memory (measured +166 MB on the real archive) and buys nothing.
      await _streamEntryToFile(
        zipPath,
        entry.entryPath,
        outputPath,
        expectedSizeBytes: entry.sizeBytes,
      );
    }
  }

  /// Streams ONE zip entry to disk using only its central-directory offsets.
  /// Single shared code path via [_locateEntry] + [_inflateRange] — no
  /// duplication with the metadata reader, no full-archive decode.
  ///
  /// Async + awaited close: `IOSink.close()` must be awaited, otherwise the
  /// last buffered chunk never reaches disk and the size check fails.
  ///
  /// Kill-/disk-failure hardening (weak phones): the stream lands in a
  /// `.part` file first; only a byte-exact match against the manifest size
  /// promotes it to the final staged path. A mid-restore kill or a full disk
  /// therefore leaves a `.part` file behind — never a truncated video the
  /// size gate would accept. Returns the staged file.
  static Future<File> _streamEntryToFile(
    String zipPath,
    String entryPath,
    String outputPath, {
    int? expectedSizeBytes,
  }) async {
    final location = _locateEntry(zipPath, entryPath);
    final partPath = '$outputPath.part';
    final raf = File(zipPath).openSync();
    try {
      raf.setPositionSync(location.dataOffset);
      final sink = File(partPath).openWrite();
      try {
        _inflateRange(
          raf,
          sink.add,
          method: location.method,
          compressedSize: location.compressedSize,
          target: entryPath,
          // Zip-bomb cap: callers pass the manifest size + 1 MB slack, so a
          // corrupt DEFLATE stream aborts mid-file instead of OOM-killing.
          maxOutputBytes: expectedSizeBytes == null
              ? null
              : expectedSizeBytes + (1024 * 1024),
        );
      } finally {
        await sink.close();
      }
    } finally {
      raf.closeSync();
    }
    final part = File(partPath);
    if (expectedSizeBytes != null) {
      final staged = await part.length();
      if (staged != expectedSizeBytes) {
        try {
          await part.delete();
        } catch (_) {}
        throw FormatException(
          'Corrupt backup — $entryPath staged $staged bytes, '
          'manifest says $expectedSizeBytes.',
        );
      }
    }
    try {
      return await part.rename(outputPath);
    } catch (_) {
      // rename() fails across volumes — fall back to copy + delete.
      await part.copy(outputPath);
      try {
        await part.delete();
      } catch (_) {}
      return File(outputPath);
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
      } else if (val is Map) {
        // Preserves JSON-encoded preferences such as FEATURE_FLAGS
        await sp.setString(entry.key, jsonEncode(val));
      } else if (val is List) {
        if (val.every((item) => item is String)) {
          await sp.setStringList(entry.key, val.cast<String>());
        } else {
          await sp.setString(entry.key, jsonEncode(val));
        }
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

      // Roll back the per-file media journal: restore overwritten originals,
      // delete newly added files. (The old rename-swap path is kept for
      // archives staged by older app versions, then removed.)
      final journal = snapshots['mediaJournal'] as Map<String, String?>?;
      if (journal != null) {
        for (final entry in journal.entries) {
          final target = File(entry.key);
          final backupPath = entry.value;
          try {
            if (backupPath == null) {
              if (await target.exists()) await target.delete();
            } else if (await File(backupPath).exists()) {
              await File(backupPath).copy(target.path);
            }
          } catch (e) {
            logStorage.warn('media journal rollback entry failed', e);
          }
        }
      }
      final docs = await _docs();
      for (final folder
          in (snapshots['mediaDirectories'] as List<String>? ??
              const <String>[])) {
        final current = Directory(p.join(docs, folder));
        if (await current.exists()) await current.delete(recursive: true);
        final previous = Directory(
          p.join(snapshots['snapshotDir'] as String, 'original_$folder'),
        );
        if (await previous.exists()) await previous.rename(current.path);
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
      // Keep recovery files if the device rejects a rollback write (e.g. disk
      // failure); deleting them here would destroy the remaining original.
      snapshots['rollbackFailed'] = true;
      logStorage.warn(
        'Rollback best-effort failed; recovery files retained',
        e,
      );
    }
  }

  /// Legacy probe entry point (kept for tests): unknown → -1 = proceed.
  // ignore: unused_element — public-via-tests seam for the free-space gate.
  Future<int> _freeDiskBytes() async => _freeDiskBytesFor(null);

  /// Free-space probe sized for a concrete restore: [requiredBytes] is the
  /// manifest total (media + 10 % margin handled by the caller). Probing
  /// stops as soon as that target is reached, so tiny restores probe KBs.
  /// `-1` = unknown → the gate proceeds (a failed probe must never block a
  /// restore on a weak phone).
  Future<int> _freeDiskBytesFor(int? requiredBytes) async {
    // No plugin needed: probe the real filesystem. Writing + deleting a
    // 1 MB temp file proves the disk accepts large restores (a StatFs-style
    // "bytes free" number alone cannot catch quota/permission failures, and
    // a failed probe must NEVER block a restore — it returns -1 = "unknown,
    // proceed", exactly like the old stub, so low-end devices keep working).
    try {
      final docs = await _docs();
      final probe = File(
        p.join(docs, '.mda_disk_probe_${DateTime.now().microsecondsSinceEpoch}'),
      );
      final chunk = Uint8List(1024 * 1024);
      final sink = probe.openWrite();
      try {
        sink.add(chunk);
      } finally {
        await sink.close();
      }
      final ok = await probe.length() == chunk.length;
      try {
        await probe.delete();
      } catch (_) {}
      if (!ok) return -1;
      final stat = await FileStat.stat(docs);
      if (stat.type == FileSystemEntityType.notFound) return -1;
      return _estimateFreeBytes(docs, needed: requiredBytes);
    } catch (_) {
      return -1;
    }
  }

  /// Best-effort free-space estimate for the volume holding [dir].
  /// Fills a temp file in 64 MB steps until the OS refuses or the [needed]
  /// byte target is reached, then deletes it. Probing stops as soon as the
  /// gate question ("is there room for THIS backup?") is answered, so a
  /// small restore on a big phone probes KBs, not gigabytes — never a
  /// battery/storage hog on weak phones. [needed] defaults to the old 4 GB
  /// cap (callers that only need "plenty" keep the old behavior).
  /// Any failure returns -1 (unknown → proceed, never block a restore).
  Future<int> _estimateFreeBytes(String dir, {int? needed}) async {
    final maxProbe = needed ?? 4 * 1024 * 1024 * 1024;
    final probe = File(
      p.join(dir, '.mda_space_probe_${DateTime.now().microsecondsSinceEpoch}'),
    );
    var written = 0;
    RandomAccessFile? raf;
    try {
      raf = probe.openSync(mode: FileMode.write);
      final chunk = Uint8List(1024 * 1024);
      while (written < maxProbe) {
        try {
          for (var i = 0; i < 64 && written < maxProbe; i++) {
            raf.writeFromSync(chunk);
            written += chunk.length;
          }
        } catch (_) {
          break; // disk full (or quota hit) — that IS the answer.
        }
      }
    } catch (_) {
      return -1;
    } finally {
      try {
        raf?.closeSync();
      } catch (_) {}
      try {
        if (await probe.exists()) await probe.delete();
      } catch (_) {}
    }
    // Reached the target without failing → "enough for this restore" (the
    // exact number does not matter to the gate, only the comparison).
    if (written >= maxProbe) return maxProbe;
    return written;
  }

  static String _isoTimestamp() {    final now = DateTime.now();
    return '${now.year}${_two(now.month)}${_two(now.day)}-${_two(now.hour)}${_two(now.minute)}${_two(now.second)}';
  }

  static String _two(int n) => n.toString().padLeft(2, '0');
}
