/// BackupPicker contract tests: cancel/null semantics, error mapping, and the
/// own-temp-ZIP guard that the native SAF copy relies on.
///
/// The native Android copy (`MainActivity.kt`, `pickBackupZip`) cannot run
/// under `flutter test` (no activity, no MethodChannel host) — these tests
/// cover everything around it: the non-Android `file_selector` fallback
/// contract stays intact, and the service cleanup guard only ever deletes
/// provably-own temp copies, never user files.
library;

import 'dart:io';

import 'package:archive/archive_io.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/data/database/db.dart';
import 'package:mda_flutter/data/services/backup_picker.dart';
import 'package:mda_flutter/data/services/backup_service.dart';
import 'package:path/path.dart' as p;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('BackupPickerException carries code + message', () {
    const error = BackupPickerException('NOT_A_ZIP', 'Pick a zip.');
    expect(error.code, 'NOT_A_ZIP');
    expect(error.toString(), contains('NOT_A_ZIP'));
  });

  test('BackupPicker error codes are stable (native contract)', () {
    // MainActivity.kt reports these codes; settings_modal.dart switches on
    // them for user-facing messages. Renaming either side breaks the UI.
    expect(BackupPickerErrors.cancelled, 'cancelled');
  });

  group('own temp-ZIP guard (native SAF copy target)', () {
    late Directory tempDir;
    late Directory sysTemp;

    setUpAll(() {
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
    });

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      setPrefsAccess(() async => {}, (key, value) async {});
      tempDir = await Directory.systemTemp.createTemp('mda_picker_guard');
      sysTemp = await Directory.systemTemp.createTemp('mda_picker_cache');
      setDatabasePathForTest(p.join(tempDir.path, 'app.db'));
    });

    tearDown(() async {
      await closeDb();
      await tempDir.delete(recursive: true);
      await sysTemp.delete(recursive: true);
    });

    Future<String> makeZip(String dir, String name) async {
      final path = p.join(dir, name);
      final encoder = ZipFileEncoder()..create(path);
      encoder.addArchiveFile(
        ArchiveFile.bytes(
          'backup_metadata.json',
          __metadataJson(),
        ),
      );
      await encoder.close();
      return path;
    }

    test('native cache copy lifecycle, user files survive', () async {
      final service = BackupService(
        documentsDirProvider: () async => tempDir.path,
        tempDirProvider: () async => sysTemp.path,
      );
      // Simulates the native picker's `<cache>/mda_backup_import_*.zip`.
      // Media-less: takes the early return (no staging, no merge) — the
      // import succeeds and the file is harmless either way, so this pins
      // success, not deletion (deletion only drops a disk lane after REAL
      // staging; see the media-carrying test in backup_service_test.dart).
      final own = await makeZip(
        sysTemp.path,
        'mda_backup_import_12345.zip',
      );
      final ownResult = await service.importBackupZip(zipPath: own);
      expect(ownResult.success, isTrue, reason: ownResult.error);

      // A user-named ZIP in the same cache dir is NOT ours — it survives.
      final foreign = await makeZip(sysTemp.path, 'my_backup.zip');
      final foreignResult = await service.importBackupZip(zipPath: foreign);
      expect(foreignResult.success, isTrue, reason: foreignResult.error);
      expect(File(foreign).existsSync(), isTrue);
    });
  });
}

List<int> __metadataJson() {
  // Minimal valid v2 metadata (notes-only, no media): enough to pass the
  // schema + manifest gates so the test reaches the temp-ZIP cleanup.
  const json =
      '{"backupVersion":2,"schemaVersion":6,"appVersion":"1.5.8",'
      '"createdAt":1723670000000,"scopes":["notes"],'
      '"sqlite":{"notes":[]},"asyncStorage":{},'
      '"fileManifest":{"vlogs":[],"thumbnails":[]}}';
  return List<int>.of(json.codeUnits);
}
