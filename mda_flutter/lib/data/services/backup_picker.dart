/// Native SAF backup picker — Dart side of the
/// `com.anonymous.mda_flutter/backup_picker` MethodChannel (see
/// `MainActivity.kt`).
///
/// WHY this file exists: `file_selector_android`'s `toFileResponse()` does
/// `new byte[size]` + `readFully()` on the picked file — a SINGLE 1.3 GB
/// allocation that OOM-kills the app (512 MB heap) inside `onActivityResult`,
/// before any Dart backup code runs (proven by the S24 Ultra logcat:
/// `OutOfMemoryError: Failed to allocate a 1295951840 byte allocation`
/// with `growth limit 536870912`). This channel instead streams the SAF
/// document to the app cache in 4 MB chunks natively and returns only the
/// cache path — peak RAM stays flat no matter the backup size.
///
/// Contract:
/// - `pickBackupZip({onCopyProgress})` → cache path (`String`), `null` when
///   the user cancels, throws [BackupPickerException] on native errors
///   (NOT_A_ZIP / COPY_FAILED / PERMISSION_DENIED / …).
/// - Non-Android platforms (iOS/desktop/tests): falls back to `file_selector`
///   (`openFile`), which is fine there — the OOM is an Android-plugin issue.
/// - The native copy lands in `<cache>/mda_backup_import_*.zip`, so the
///   service's [_deleteOwnTempZip] guard accepts the cache dir — and deletes
///   it only AFTER verified media staging (never before extraction, or the
///   workers read a ghost path).
library;

import 'dart:async';
import 'dart:io';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/services.dart';

/// Native error codes the picker surfaces (mirrors MainActivity.kt).
abstract final class BackupPickerErrors {
  static const cancelled = 'cancelled';
}

/// Thrown when the native picker reports a failure (never on cancel —
/// cancel returns `null` instead).
class BackupPickerException implements Exception {
  const BackupPickerException(this.code, [this.message]);

  final String code;
  final String? message;

  @override
  String toString() => 'BackupPickerException($code): $message';
}

/// Picks a `.zip` backup and returns a LOCAL filesystem path to it.
///
/// On Android the native SAF picker streams the document into the app cache
/// (chunked, with [onCopyProgress] 0..1) and returns that cache path.
/// Everywhere else the legacy `file_selector` path is used.
class BackupPicker {
  const BackupPicker();

  static const MethodChannel _channel = MethodChannel(
    'com.anonymous.mda_flutter/backup_picker',
  );
  static const EventChannel _progress = EventChannel(
    'com.anonymous.mda_flutter/backup_picker/progress',
  );

  MethodChannel get _method => _channel;
  EventChannel get _events => _progress;

  /// Opens the picker. Returns the local ZIP path, or `null` on cancel.
  Future<String?> pickBackupZip({
    void Function(double progress)? onCopyProgress,
  }) async {
    if (!Platform.isAndroid) {
      return _pickViaFileSelector();
    }
    StreamSubscription<dynamic>? subscription;
    try {
      if (onCopyProgress != null) {
        subscription = _events.receiveBroadcastStream().listen((event) {
          final progress = (event as num?)?.toDouble();
          // -1.0 = native copy finished (success or failure); not progress.
          if (progress != null && progress >= 0) {
            onCopyProgress(progress.clamp(0.0, 1.0));
          }
        });
      }
      final path = await _method.invokeMethod<String>('pickBackupZip');
      return path;
    } on PlatformException catch (e) {
      throw BackupPickerException(e.code, e.message);
    } finally {
      await subscription?.cancel();
    }
  }

  /// Legacy fallback for non-Android platforms (and tests): the
  /// `file_selector` plugin is safe there — the `new byte[size]` OOM is an
  /// Android-implementation issue only.
  Future<String?> _pickViaFileSelector() async {
    const typeGroup = XTypeGroup(
      label: 'ZIP',
      extensions: ['zip'],
      mimeTypes: [
        'application/zip',
        'application/x-zip-compressed',
        'application/octet-stream',
        'application/x-compressed',
        'multipart/x-zip',
      ],
    );
    final file = await openFile(acceptedTypeGroups: [typeGroup]);
    if (file == null) return null;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      throw const BackupPickerException(
        'NOT_A_ZIP',
        'Please select a valid .zip backup file.',
      );
    }
    return file.path;
  }
}
