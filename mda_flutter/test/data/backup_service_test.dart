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
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  late Directory tempDir;
  late BackupService service;
  late SettingsService settings;

  setUpAll(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
    setDatabasePathForTest(inMemoryDatabasePath);
  });

  setUp(() async {
    setPrefsAccess(() async => {}, (key, value) async {});
    tempDir = await Directory.systemTemp.createTemp('mda_backup_test');
    settings = SettingsService(SettingsRepository());
    service = BackupService(
      settings: settings,
      documentsDirProvider: () async => tempDir.path,
    );
    // Seed data.
    final notesRepo = NotesRepository();
    await notesRepo.insertNote(SavedNote(
      id: 'n1',
      text: List.generate(50, (i) => 'word$i').join(' '),
      dateStr: '2026-08-11',
      timestamp: 1,
      durationMin: 5,
      won: true,
      aiTitle: 'Seeded Title',
    ));
    await settings.setRaw('AI_OLLAMA_API_KEY', 'super-secret-key');
    await settings.setRaw('USER_FONT_IDX', '2');
  });

  tearDown(() async {
    await closeDb();
    await tempDir.delete(recursive: true);
  });

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
    final archive = ZipDecoder().decodeBytes(File(export.zipPath!).readAsBytesSync());
    final metaFile =
        archive.files.where((f) => f.name == 'backup_metadata.json').first;
    final meta = jsonDecode(utf8.decode(metaFile.content as List<int>)) as Map<String, dynamic>;
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
    encoder.addArchiveFile(ArchiveFile.bytes(
      'backup_metadata.json',
      utf8.encode(jsonEncode({
        'backupVersion': 2,
        'schemaVersion': currentSchemaVersion + 100,
        'appVersion': '99.0.0',
        'scopes': ['notes'],
        'sqlite': {'notes': []},
        'fileManifest': {'vlogs': [], 'thumbnails': []},
      })),
    ));
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
    await run('INSERT INTO settings (key, value) VALUES (?, ?)', ['MARKER', 'keep-me']);

    // Craft an import that will fail mid-restore: metadata references a
    // nonexistent table (throws during the SQLite transaction).
    final zipPath = p.join(tempDir.path, 'broken.zip');
    final encoder = ZipFileEncoder();
    encoder.create(zipPath);
    encoder.addArchiveFile(ArchiveFile.bytes(
      'backup_metadata.json',
      utf8.encode(jsonEncode({
        'backupVersion': 2,
        'schemaVersion': 6,
        'appVersion': '1.5.8',
        'scopes': ['notes'],
        'sqlite': {'does_not_exist': []},
        'fileManifest': {'vlogs': [], 'thumbnails': []},
      })),
    ));
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

    final restoredPath = (await getFirst('SELECT file_path FROM vlogs WHERE id = ?', ['v1']))
        ?['file_path'] as String;
    expect(restoredPath, isNotNull);
    expect(await File(restoredPath).length(), videoSize);
  });
}
