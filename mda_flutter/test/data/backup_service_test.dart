/// Backup roundtrip tests (SPEC §13): export → import → compare,
/// secrets never travel, schema/manifest gates, rollback.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/data/database/db.dart';
import 'package:mda_flutter/data/database/repositories/notes_repository.dart';
import 'package:mda_flutter/data/database/repositories/settings_repository.dart';
import 'package:mda_flutter/data/models/saved_note.dart';
import 'package:mda_flutter/data/services/backup_service.dart';
import 'package:mda_flutter/data/services/settings_service.dart';
import 'package:archive/archive_io.dart';
import 'package:path/path.dart' as p;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  late Directory tempDir;
  late BackupService service;
  late SettingsService settings;

  setUpAll(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    setPrefsAccess(() async => {}, (key, value) async {});
    tempDir = await Directory.systemTemp.createTemp('mda_backup_test');
    // A real file catches failures hidden by in-memory tests: imports close and
    // reopen SQLite to snapshot and restore its contents.
    setDatabasePathForTest(p.join(tempDir.path, 'app.db'));
    settings = SettingsService(SettingsRepository());
    service = BackupService(documentsDirProvider: () async => tempDir.path);
    // Seed data.
    final notesRepo = NotesRepository();
    await notesRepo.insertNote(
      SavedNote(
        id: 'n1',
        text: List.generate(50, (i) => 'word$i').join(' '),
        dateStr: '2026-08-11',
        timestamp: 1,
        durationMin: 5,
        won: true,
        aiTitle: 'Seeded Title',
      ),
    );
    await settings.setRaw('AI_OLLAMA_API_KEY', 'super-secret-key');
    await settings.setRaw('USER_FONT_IDX', '2');
  });

  tearDown(() async {
    await closeDb();
    await tempDir.delete(recursive: true);
  });

  Future<String> writeBackup(
    Map<String, dynamic> metadata, {
    Map<String, List<int>> files = const {},
  }) async {
    final path = p.join(tempDir.path, 'fixture.zip');
    final encoder = ZipFileEncoder()..create(path);
    encoder.addArchiveFile(
      ArchiveFile.bytes(
        'backup_metadata.json',
        utf8.encode(jsonEncode(metadata)),
      ),
    );
    for (final file in files.entries) {
      encoder.addArchiveFile(ArchiveFile.bytes(file.key, file.value));
    }
    await encoder.close();
    return path;
  }

  test(
    'missing SQLite payload is rejected before wiping existing notes',
    () async {
      final path = await writeBackup({'backupVersion': 2});
      final result = await service.importBackupZip(zipPath: path);
      expect(result.success, isFalse);
      expect(await getAll('SELECT * FROM notes'), hasLength(1));
    },
  );

  test('table manifest mismatch preserves existing database', () async {
    final path = await writeBackup({
      'backupVersion': 2,
      'sqlite': {'notes': []},
      'tableManifest': {
        'notes': {
          'columns': ['id'],
          'rowCount': 1,
        },
      },
    });
    final result = await service.importBackupZip(zipPath: path);
    expect(result.success, isFalse);
    expect(await getAll('SELECT * FROM notes'), hasLength(1));
  });

  test(
    'secrets from foreign backups are ignored and the local PIN survives',
    () async {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('@mda_security_pin', 'local-pin');
      final path = await writeBackup({
        'backupVersion': 2,
        'sqlite': {
          'settings': [
            {'key': 'AI_OLLAMA_API_KEY', 'value': 'foreign-secret'},
            {'key': 'AI_NEURALWATT_API_KEY', 'value': 'foreign-secret'},
            {'key': 'USER_FONT_IDX', 'value': '3'},
          ],
        },
        'asyncStorage': {'@mda_security_pin': 'foreign-pin'},
      });
      final result = await service.importBackupZip(zipPath: path);
      expect(result.success, isTrue, reason: result.error);
      expect(await settings.raw('AI_OLLAMA_API_KEY'), isNull);
      expect(await settings.raw('AI_NEURALWATT_API_KEY'), isNull);
      expect(prefs.getString('@mda_security_pin'), 'local-pin');
      expect(await settings.raw('USER_FONT_IDX'), '3');
    },
  );

  test(
    'failure after media replacement restores original database and videos',
    () async {
      final original = File(p.join(tempDir.path, 'vlogs', 'same.mp4'));
      await original.parent.create(recursive: true);
      await original.writeAsString('original recording');
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('local-state', 'keep');
      final path = await writeBackup(
        {
          'backupVersion': 2,
          'sqlite': {'notes': []},
          'fileManifest': {
            'vlogs': [
              {
                'vlogId': 'v1',
                'entryPath': 'vlogs/same.mp4',
                'kind': 'video',
                'sizeBytes': 3,
                'included': true,
              },
            ],
            'thumbnails': [],
          },
        },
        files: {
          'vlogs/same.mp4': [1, 2, 3],
        },
      );
      final result = await service.importBackupZip(
        zipPath: path,
        onStage: (stage) {
          if (stage == 'Restoring settings…') {
            throw StateError('Simulated post-media failure');
          }
        },
      );
      expect(result.success, isFalse);
      expect(await original.readAsString(), 'original recording');
      expect(await getAll('SELECT * FROM notes'), hasLength(1));
      expect(prefs.getString('local-state'), 'keep');
    },
  );

  test(
    'excluded media is not extracted even if the ZIP contains that entry',
    () async {
      final path = await writeBackup(
        {
          'backupVersion': 2,
          'sqlite': {'notes': []},
          'fileManifest': {
            'vlogs': [
              {
                'vlogId': 'v1',
                'entryPath': 'vlogs/excluded.mp4',
                'kind': 'video',
                'sizeBytes': 3,
                'included': false,
              },
            ],
            'thumbnails': [],
          },
        },
        files: {
          'vlogs/excluded.mp4': [1, 2, 3],
        },
      );
      final result = await service.importBackupZip(zipPath: path);
      expect(result.success, isTrue, reason: result.error);
      expect(result.videosIncluded, 0);
      expect(
        await File(p.join(tempDir.path, 'vlogs', 'excluded.mp4')).exists(),
        isFalse,
      );
      expect(
        await Directory(p.join(tempDir.path, 'backup_restore_tmp')).exists(),
        isFalse,
      );
    },
  );

  test('duplicate media basenames are rejected before changes', () async {
    final path = await writeBackup(
      {
        'backupVersion': 2,
        'sqlite': {'notes': []},
        'fileManifest': {
          'vlogs': [
            for (final folder in ['a', 'b'])
              {
                'vlogId': folder,
                'entryPath': '$folder/same.mp4',
                'kind': 'video',
                'sizeBytes': 1,
                'included': true,
              },
          ],
          'thumbnails': [],
        },
      },
      files: {
        'a/same.mp4': [1],
        'b/same.mp4': [2],
      },
    );
    final result = await service.importBackupZip(zipPath: path);
    expect(result.success, isFalse);
    expect(await getAll('SELECT * FROM notes'), hasLength(1));
  });

  test(
    'exported preference JSON matches RN AsyncStorage value encoding',
    () async {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        'FEATURE_FLAGS',
        '{"ENABLE_TWEET_IN_JOURNAL_MODE":true}',
      );
      final result = await service.exportBackupZip(scopes: ['settings']);
      expect(result.success, isTrue, reason: result.error);
      final archive = ZipDecoder().decodeBytes(
        await File(result.zipPath!).readAsBytes(),
      );
      final metadata = jsonDecode(
        utf8.decode(
          archive.files
              .firstWhere((file) => file.name == 'backup_metadata.json')
              .content,
        ),
      );
      expect(metadata['asyncStorage']['FEATURE_FLAGS'], {
        'ENABLE_TWEET_IN_JOURNAL_MODE': true,
      });
    },
  );

  test(
    'legacy RN media paths with URL-encoded basenames resolve locally',
    () async {
      final path = await writeBackup(
        {
          'backupVersion': 1,
          'sqlite': {
            'vlogs': [
              {
                'id': 'legacy-id',
                'file_path': 'file:///old/vlogs/my%20video.mp4',
                'thumbnail_path': 'file:///old/thumbs/my%20thumb.jpg',
                'date_str': '2026-09-17',
                'timestamp': 1,
                'duration_sec': 1,
              },
            ],
          },
        },
        files: {
          'vlogs/my video.mp4': [1, 2],
          'thumbnails/my thumb.jpg': [3],
        },
      );
      final result = await service.importBackupZip(zipPath: path);
      expect(result.success, isTrue, reason: result.error);
      final row = await getFirst('SELECT * FROM vlogs WHERE id = ?', [
        'legacy-id',
      ]);
      expect(await File(row!['file_path'] as String).readAsBytes(), [1, 2]);
      expect(await File(row['thumbnail_path'] as String).readAsBytes(), [3]);
    },
  );

  test('export→import roundtrip preserves notes and settings', () async {
    final export = await service.exportBackupZip(scopes: ['notes', 'settings']);
    expect(export.success, isTrue);
    expect(export.verification, 'ok');
    final zipPath = export.zipPath!;
    expect(File(zipPath).existsSync(), isTrue);

    // Wipe the DB, then import.
    await run('DELETE FROM notes');
    await run('DELETE FROM settings');

    final import = await service.importBackupZip(zipPath: zipPath);
    expect(import.success, isTrue, reason: import.error);

    final notes = await getAll('SELECT * FROM notes');
    expect(notes, hasLength(1));
    expect(notes.first['text'], contains('word0'));
    expect(notes.first['ai_title'], 'Seeded Title');

    final fontIdx = await settings.raw('USER_FONT_IDX');
    expect(fontIdx, '2');
  });

  test('secrets never travel: API keys are stripped from the export', () async {
    final export = await service.exportBackupZip(scopes: ['settings']);
    expect(export.success, isTrue);

    // Read the metadata from the zip directly.
    final archive = ZipDecoder().decodeBytes(
      File(export.zipPath!).readAsBytesSync(),
    );
    final metaFile = archive.files
        .where((f) => f.name == 'backup_metadata.json')
        .first;
    final meta =
        jsonDecode(utf8.decode(metaFile.content as List<int>))
            as Map<String, dynamic>;
    final sqlite = meta['sqlite'] as Map<String, dynamic>;
    final rows = sqlite['settings'] as List;
    final keys = rows.map((r) => (r as Map)['key']).toList();

    expect(keys, contains('USER_FONT_IDX'));
    expect(keys, isNot(contains('AI_OLLAMA_API_KEY')));
    expect(keys, isNot(contains('AI_NEURALWATT_API_KEY')));
  });

  test('newer-app backups are rejected by the schema gate', () async {
    // Build a fake v2 zip with a schema version beyond the current one.
    final zipPath = p.join(tempDir.path, 'future.zip');
    final encoder = ZipFileEncoder();
    encoder.create(zipPath);
    encoder.addArchiveFile(
      ArchiveFile.bytes(
        'backup_metadata.json',
        utf8.encode(
          jsonEncode({
            'backupVersion': 2,
            'schemaVersion': currentSchemaVersion + 100,
            'appVersion': '99.0.0',
            'scopes': ['notes'],
            'sqlite': {'notes': []},
            'fileManifest': {'vlogs': [], 'thumbnails': []},
          }),
        ),
      ),
    );
    await encoder.close();

    final result = await service.importBackupZip(zipPath: zipPath);
    expect(result.success, isFalse);
    expect(result.error, contains('newer app version'));
  });

  test('corrupt zips are rejected', () async {
    final zipPath = p.join(tempDir.path, 'garbage.zip');
    await File(zipPath).writeAsString('this is not a zip');

    final result = await service.importBackupZip(zipPath: zipPath);
    expect(result.success, isFalse);
  });

  test('rollback restores the DB after a failed import', () async {
    // Seed a marker row.
    await run('INSERT INTO settings (key, value) VALUES (?, ?)', [
      'MARKER',
      'keep-me',
    ]);

    // Craft an import that will fail mid-restore: metadata references a
    // nonexistent table (throws during the SQLite transaction).
    final zipPath = p.join(tempDir.path, 'broken.zip');
    final encoder = ZipFileEncoder();
    encoder.create(zipPath);
    encoder.addArchiveFile(
      ArchiveFile.bytes(
        'backup_metadata.json',
        utf8.encode(
          jsonEncode({
            'backupVersion': 2,
            'schemaVersion': 6,
            'appVersion': '1.5.8',
            'scopes': ['notes'],
            'sqlite': {
              'notes': [
                {'id': 'n1', 'text': null},
              ],
            },
            'fileManifest': {'vlogs': [], 'thumbnails': []},
          }),
        ),
      ),
    );
    await encoder.close();

    final result = await service.importBackupZip(zipPath: zipPath);
    expect(result.success, isFalse);

    // The marker must still exist after rollback.
    final marker = await settings.raw('MARKER');
    expect(marker, 'keep-me');
  });

  test('media roundtrip streams a vlog file through export→import', () async {
    // Create a ~6 MB pseudo-video file.
    final vlogDir = Directory(p.join(tempDir.path, 'vlogs'));
    await vlogDir.create(recursive: true);
    final videoPath = p.join(vlogDir.path, 'vid1.mp4');
    final chunk = List<int>.filled(1024 * 1024, 7); // 1 MB
    final out = File(videoPath).openWrite();
    for (var i = 0; i < 6; i++) {
      out.add(chunk);
    }
    await out.close();
    final videoSize = await File(videoPath).length();

    // DB row pointing at the file.
    await run(
      'INSERT INTO vlogs (id, file_path, date_str, timestamp, duration_sec, file_size_bytes) '
      'VALUES (?, ?, ?, ?, ?, ?)',
      ['v1', videoPath, '2026-08-11', 1, 60, videoSize],
    );

    final export = await service.exportBackupZip(scopes: ['vlogs']);
    expect(export.success, isTrue, reason: export.error);
    expect(export.verification, 'ok');

    // Wipe the media + rows, then import.
    await run('DELETE FROM vlogs');
    await File(videoPath).delete();

    final import = await service.importBackupZip(zipPath: export.zipPath!);
    expect(import.success, isTrue, reason: import.error);
    expect(import.videosIncluded, 1);

    final restoredPath =
        (await getFirst('SELECT file_path FROM vlogs WHERE id = ?', [
              'v1',
            ]))?['file_path']
            as String;
    expect(restoredPath, isNotNull);
    expect(await File(restoredPath).length(), videoSize);
  });

  test(
    'RN backup format compatibility: imports backup with entryPath, sizeBytes, and extra columns',
    () async {
      // Create a mock video file inside the temp archive
      final zipPath = p.join(tempDir.path, 'rn_backup.zip');
      final encoder = ZipFileEncoder();
      encoder.create(zipPath);

      final rnMetadata = {
        'backupVersion': 2,
        'schemaVersion': 6,
        'appVersion': '1.5.8',
        'createdAt': 1723670000000,
        'scopes': ['notes', 'settings', 'masteries', 'vlogs'],
        'sqlite': {
          'notes': [
            {
              'id': 'rn_note_1',
              'text': 'Note exported from React Native with extra columns',
              'date_str': '2026-08-14',
              'timestamp': 1723670000000,
              'duration_min': 5,
              'won': 1,
              'ai_title': 'RN Note Title',
              'future_rn_column_not_in_flutter': 'should_be_ignored_safely',
            },
          ],
          'settings': [
            {'key': 'USER_FONT_IDX', 'value': '4', 'updated_at': 1723670000000},
          ],
          'vlogs': [
            {
              'id': 'rn_vlog_1',
              'file_path': '/old/rn/path/vlogs/rn_vlog_1.mp4',
              'date_str': '2026-08-14',
              'timestamp': 1723670000000,
              'duration_sec': 30,
              'file_size_bytes': 100,
            },
          ],
        },
        'asyncStorage': {
          '__DB_SCHEMA_VERSION__': 6,
          'FEATURE_FLAGS': {'ENABLE_TWEET_IN_JOURNAL_MODE': true},
        },
        'fileManifest': {
          'vlogs': [
            {
              'vlogId': 'rn_vlog_1',
              'entryPath': 'vlogs/rn_vlog_1.mp4',
              'kind': 'video',
              'sizeBytes': 12,
              'included': true,
              'reason': null,
            },
          ],
          'thumbnails': [],
        },
      };

      encoder.addArchiveFile(
        ArchiveFile.bytes(
          'backup_metadata.json',
          utf8.encode(jsonEncode(rnMetadata)),
        ),
      );
      encoder.addArchiveFile(
        ArchiveFile.bytes('vlogs/rn_vlog_1.mp4', utf8.encode('dummy_video_')),
      );
      await encoder.close();

      // Import the RN backup
      final import = await service.importBackupZip(zipPath: zipPath);
      expect(import.success, isTrue, reason: import.error);

      // Verify notes and column filtering worked
      final note = await getFirst('SELECT * FROM notes WHERE id = ?', [
        'rn_note_1',
      ]);
      expect(note, isNotNull);
      expect(note!['ai_title'], 'RN Note Title');
      expect(note['text'], contains('Note exported from React Native'));

      // Verify vlogs path was rewritten to local sandbox
      final vlog = await getFirst('SELECT * FROM vlogs WHERE id = ?', [
        'rn_vlog_1',
      ]);
      expect(vlog, isNotNull);
      expect(vlog!['file_path'], contains('vlogs'));
      expect(File(vlog['file_path'] as String).existsSync(), isTrue);
    },
  );

  test(
    'scoped import without media preserves existing videos (RN parity)',
    () async {
      // An existing user video that this backup does not contain.
      final vlogDir = Directory(p.join(tempDir.path, 'vlogs'));
      await vlogDir.create(recursive: true);
      final existing = File(p.join(vlogDir.path, 'keep.mp4'));
      await existing.writeAsBytes(List<int>.filled(1024, 1));
      await run(
        'INSERT INTO vlogs (id, file_path, date_str, timestamp, duration_sec, file_size_bytes) '
        'VALUES (?, ?, ?, ?, ?, ?)',
        ['keep1', existing.path, '2026-08-11', 1, 10, 1024],
      );

      // A notes-only backup: no media manifest at all.
      final path = await writeBackup({
        'backupVersion': 2,
        'schemaVersion': 6,
        'appVersion': '1.5.8',
        'scopes': ['notes'],
        'sqlite': {
          'notes': [
            {
              'id': 'scoped1',
              'text': 'scoped import note with enough words to be valid ' * 8,
              'date_str': '2026-08-11',
              'timestamp': 2,
              'duration_min': 5,
              'won': 1,
            },
          ],
        },
        'fileManifest': {'vlogs': [], 'thumbnails': []},
      });

      final result = await service.importBackupZip(zipPath: path);
      expect(result.success, isTrue, reason: result.error);

      // The user's video file survives a media-less import (RN only touches a
      // media dir when that manifest is non-empty). The vlogs TABLE follows
      // full-restore semantics: a backup without vlogs rows clears it.
      expect(await existing.exists(), isTrue);
      expect(result.videosIncluded, 0);
    },
  );
}
