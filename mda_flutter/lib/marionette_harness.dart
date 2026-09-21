/// Debug-only Marionette harness — lets an AI agent drive the running app
/// (tap / scroll / screenshot / logs) via the Marionette MCP server or CLI.
///
/// WHY THIS FILE EXISTS:
/// Marionette is a "Playwright for Flutter apps": the app installs a binding
/// (`MarionetteBinding`) that exposes VM service extensions, and the agent
/// connects through `marionette_mcp` / `marionette` CLI to inspect the widget
/// tree, tap buttons, enter text, and verify behavior — without a human
/// clicking through the emulator. This is what makes autonomous verification
/// of flows like "Settings → Import Backup ZIP → confirm → success Snackbar"
/// possible.
///
/// SAFETY:
/// Everything here is gated on `kDebugMode` at the call site (`main.dart`),
/// so NONE of this ships in release builds:
/// - The binding is never initialized in release (like the RN app's dev-only
///   tooling), so profiles/release binaries contain no Marionette code paths.
/// - The import-test extensions seed data into the DEBUG database only. They
///   run through the same `StorageNotifier.importBackupZip` pipeline as the
///   real UI, so they exercise the real restore/rollback code — they just
///   skip the file picker and the PIN/biometric prompt, which an agent
///   cannot operate natively.
/// - The PIN is never in backups and is never restored (SPEC §13); these
///   extensions never read or write PIN material.
///
/// HOW TO RUN (agent loop):
///  1. `flutter run` (debug) on the emulator — copy the VM service URI from
///     the console, e.g. `ws://127.0.0.1:9101/ws`.
///  2. `marionette --uri <uri> get-interactive-elements` — see the screen.
///  3. `marionette --uri <uri> tap --key <key> / --text "<label>"` to act,
///     `take-screenshots` to see, `get-logs` to check for exceptions.
///  4. For backup import: `call_custom_extension mdaTest.exportBackup`
///     then `mdaTest.importBackup`, then `mdaTest.backupState` to assert the
///     note count matches — no human confirmation needed.
///
/// SINGLE-BINDING RULE:
/// Flutter allows only ONE WidgetsBinding per process. `main.dart` must call
/// [ensureMarionette] BEFORE any other binding initialization, and tests must
/// NOT call it (they run under `flutter test` with their own test binding —
/// see `FLUTTER_TEST` guard in `main.dart`).
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:marionette_flutter/marionette_flutter.dart';

import 'core/logger.dart' show debugLogSink, logStorage;
import 'core/utils.dart';
import 'data/app_data.dart';
import 'data/models/saved_note.dart';
import 'data/providers.dart';
import 'data/security_providers.dart';
import 'ui/core/widgets/animated_scale_button.dart';
import 'ui/features/settings/backup_scope_picker.dart';

/// Set by [ensureMarionette] in debug runs; read by the test extensions so
/// they can reach the app's Riverpod container without a BuildContext.
ProviderContainer? _debugContainer;

/// Call ONCE from `main()`, before `runApp`, gated on
/// `kDebugMode && !FLUTTER_TEST` (see `lib/main.dart`).
///
/// Also wires app logging into Marionette's `get_logs` tool via a
/// [PrintLogCollector] + `debugPrint` tee, and wraps the childless
/// [MarionetteDeviceConfig] support is intentionally omitted: text-scale /
/// brightness overrides are not needed for backup verification.
void ensureMarionette(ProviderContainer container) {
  _debugContainer = container;
  final logCollector = PrintLogCollector();
  // Mirror the app's own logger (STORAGE/AI/DB/…) into get_logs: the app
  // never calls debugPrint for domain logs, so the debugPrint tee alone
  // would leave get_logs empty.
  debugLogSink = logCollector.addLog;
  logStorage.info('marionette harness attached');
  MarionetteBinding.ensureInitialized(
    MarionetteConfiguration(
      // 1. Custom design-system widgets the built-in matcher cannot see.
      //    The app's primary button renders through GestureDetector already
      //    (built-in), but registering the app types explicitly makes taps
      //    land on the semantic button node instead of an inner pad.
      isInteractiveWidget: (type) =>
          type == AnimatedScaleButton ||
          type == BackupScopePicker ||
          // Settings rows/menus/dialog buttons are tappable surfaces.
          type.toString() == 'SettingsRow' ||
          type.toString() == 'ConfirmDialog' ||
          type.toString() == '_SettingsModalState',
      // 2. Text extraction for tap-by-label: AnimatedScaleButton/SettingsRow
      //    carry their label as a child Text; walking the subtree exposes
      //    labels like "Export Backup ZIP" / "Import Backup ZIP" / "Restore".
      extractText: _extractAppText,
      // 3. App logs for `get_logs` (backup errors, import stages, crashes).
      logCollector: logCollector,
      // 4. `shouldStopTraversal` stays null (Marionette docs: filtering
      //    scroll containers hides nested content from the agent).
    ),
  );

  // Route Flutter's debugPrint into the collector (tee, not replace: keeps
  // the default throttling behavior intact).
  final defaultDebugPrint = debugPrint;
  debugPrint = (String? message, {int? wrapWidth}) {
    if (message != null) logCollector.addLog(message);
    defaultDebugPrint(message, wrapWidth: wrapWidth);
  };

  _registerBackupTestExtensions();
}

/// Extracts agent-matchable text from the app's custom button/row widgets by
/// walking the element subtree for rendered [Text]/[RichText]/[EditableText].
String? _extractAppText(Element element) {
  final widget = element.widget;
  final typeName = widget.runtimeType.toString();
  final isAppControl =
      widget is AnimatedScaleButton ||
      widget is BackupScopePicker ||
      typeName == 'SettingsRow' ||
      typeName == 'ConfirmDialog' ||
      typeName == '_SettingsModalState';
  if (!isAppControl) return null;
  final buffer = StringBuffer();
  _collectRenderedText(element, buffer);
  final result = buffer.toString().trim();
  return result.isEmpty ? null : result;
}

/// Depth-first collection of rendered text under [element].
void _collectRenderedText(Element element, StringBuffer buffer) {
  final widget = element.widget;
  if (widget is Text) {
    final text = widget.data ?? widget.textSpan?.toPlainText() ?? '';
    if (text.trim().isNotEmpty) {
      if (buffer.isNotEmpty) buffer.write(' ');
      buffer.write(text.trim());
    }
    return;
  }
  if (widget is RichText) {
    final text = widget.text.toPlainText().trim();
    if (text.isNotEmpty) {
      if (buffer.isNotEmpty) buffer.write(' ');
      buffer.write(text);
    }
    return;
  }
  if (widget is EditableText) {
    final text = widget.controller.text.trim();
    if (text.isNotEmpty) {
      if (buffer.isNotEmpty) buffer.write(' ');
      buffer.write(text);
    }
    return;
  }
  element.visitChildren((child) => _collectRenderedText(child, buffer));
}

/// Debug-only extensions that let the agent verify the backup import/export
/// pipeline end-to-end WITHOUT the native file picker or the biometric/PIN
/// prompt (both are unusable for an agent):
///
/// - `mdaTest.exportBackup` → exports all scopes to a temp ZIP, returns path.
/// - `mdaTest.importBackup` → imports it back through the REAL
///   `StorageNotifier.importBackupZip` pipeline (queues drain, schema gate,
///   rollback, `loadAll(force: true)`), returns success + counts.
/// - `mdaTest.backupState` → returns authoritative DB counts (notes, vlogs,
///   pillars, persons) so the agent can assert restore correctness itself.
/// - `mdaTest.seedNote` → inserts one probe note (text passed as param) so
///   the agent can test export→wipe→import→verify round-trips.
void _registerBackupTestExtensions() {
  registerMarionetteExtension(
    name: 'mdaTest.exportBackup',
    description:
        'Exports a full backup ZIP (all scopes) via the real export pipeline. '
        'Returns zipPath, tablesIncluded, videosIncluded, thumbnailsIncluded.',
    callback: (params) async {
      final container = _debugContainer;
      if (container == null) {
        return MarionetteExtensionResult.error(
          0,
          'No debug container (app not booted with ensureMarionette).',
        );
      }
      final result = await container
          .read(appDataProvider.notifier)
          .exportBackupZip(const ['settings', 'notes', 'masteries', 'vlogs']);
      return MarionetteExtensionResult.success({
        'success': '${result.success}',
        'verification': result.verification,
        'zipPath': result.zipPath ?? '',
        'tablesIncluded': result.tablesIncluded.join(','),
        'videosIncluded': '${result.videosIncluded}',
        'thumbnailsIncluded': '${result.thumbnailsIncluded}',
        'warnings': result.warnings.join(' | '),
        'error': result.error ?? '',
      });
    },
  );

  registerMarionetteExtension(
    name: 'mdaTest.importBackup',
    description:
        'Imports a backup ZIP through the real restore pipeline '
        '(queue drain, schema gate, rollback, reload). '
        'Param: zipPath (absolute path from mdaTest.exportBackup). '
        'Skips the file picker and the PIN/biometric prompt (debug only).',
    inputSchema: ExtensionInputSchema(
      properties: {
        'zipPath': ExtensionParam.string(
          description: 'Absolute path of the backup ZIP to restore.',
        ),
      },
      required: const ['zipPath'],
    ),
    callback: (params) async {
      final container = _debugContainer;
      if (container == null) {
        return MarionetteExtensionResult.error(
          0,
          'No debug container (app not booted with ensureMarionette).',
        );
      }
      final zipPath = (params['zipPath'] ?? '').trim();
      if (zipPath.isEmpty) {
        return MarionetteExtensionResult.invalidParams(
          'Missing required parameter: zipPath',
        );
      }
      if (!File(zipPath).existsSync()) {
        return MarionetteExtensionResult.invalidParams(
          'Backup ZIP not found: $zipPath',
        );
      }
      final result = await container
          .read(appDataProvider.notifier)
          .importBackupZip(zipPath);
      return MarionetteExtensionResult.success({
        'success': '${result.success}',
        'verification': result.verification,
        'videosIncluded': '${result.videosIncluded}',
        'thumbnailsIncluded': '${result.thumbnailsIncluded}',
        'tablesIncluded': result.tablesIncluded.join(','),
        'warnings': result.warnings.join(' | '),
        'error': result.error ?? '',
      });
    },
  );

  registerMarionetteExtension(
    name: 'mdaTest.backupState',
    description:
        'Returns authoritative counts (notes, vlogs, pillars, persons, '
        'noteIds sample, schemaVersion) so the agent can assert that an '
        'import actually restored data.',
    callback: (params) async {
      final container = _debugContainer;
      if (container == null) {
        return MarionetteExtensionResult.error(
          0,
          'No debug container (app not booted with ensureMarionette).',
        );
      }
      final AppData data = container.read(appDataProvider);
      final noteIds = data.notes.take(5).map((n) => n.id).join(',');
      final noteTexts = data.notes
          .take(3)
          .map((n) => n.text.length > 60 ? '${n.text.substring(0, 60)}…' : n.text)
          .join(' || ');
      return MarionetteExtensionResult.success({
        'isLoaded': '${data.isLoaded}',
        'noteCount': '${data.notes.length}',
        'vlogCount': '${data.vlogs.length}',
        'pillarCount': '${data.pillars.length}',
        'personCount': '${data.persons.length}',
        'sampleNoteIds': noteIds,
        'sampleNoteTexts': noteTexts,
      });
    },
  );

  registerMarionetteExtension(
    name: 'mdaTest.seedNote',
    description:
        'Inserts one probe note with the given text (default: a Marionette '
        'probe marker) so the agent can verify export→import round-trips. '
        'Returns the new note id and the total note count.',
    inputSchema: ExtensionInputSchema(
      properties: {
        'text': ExtensionParam.string(
          description: 'Note text to insert.',
          defaultValue: 'MARIONETTE_PROBE_NOTE',
        ),
      },
    ),
    callback: (params) async {
      final container = _debugContainer;
      if (container == null) {
        return MarionetteExtensionResult.error(
          0,
          'No debug container (app not booted with ensureMarionette).',
        );
      }
      final text = (params['text'] ?? '').trim().isEmpty
          ? 'MARIONETTE_PROBE_NOTE'
          : params['text']!.trim();
      final now = DateTime.now();
      final note = SavedNote(
        id: generateId(),
        text: text,
        dateStr: toLocalDateString(now),
        timestamp: now.millisecondsSinceEpoch,
        durationMin: 3,
        won: true,
      );
      await container.read(appDataProvider.notifier).saveNote(note);
      final count = container.read(appDataProvider).notes.length;
      // Reasonably-sized (never binary); safe for the VM-service string map.
      final safeText = jsonEncode(
        text.length > 200 ? '${text.substring(0, 200)}…' : text,
      );
      return MarionetteExtensionResult.success({
        'noteId': note.id,
        'noteCount': '$count',
        'text': safeText,
      });
    },
  );

  // -- Security test hook ----------------------------------------------------
  // Unlocks ALL tiers (circles + profile + notes + feed) without biometrics
  // or the PIN pad, so the agent can verify locked content (library lists,
  // the vlog calendar, profile modals) on an emulator that has no enrolled
  // biometrics. Debug-only, like every extension in this file: the release
  // binary never registers it. Never touches PIN material — it only flips
  // the in-memory tier flags, exactly as a successful biometric auth would.
  registerMarionetteExtension(
    name: 'mdaTest.unlockAll',
    description:
        'Unlocks all security tiers in memory (circles, profile, notes, '
        'feed) without biometrics or PIN. Debug-only: lets the agent verify '
        'locked screens on an emulator with no enrolled biometrics.',
    callback: (params) async {
      final container = _debugContainer;
      if (container == null) {
        return MarionetteExtensionResult.error(
          0,
          'No debug container (app not booted with ensureMarionette).',
        );
      }
      container.read(securityControllerProvider).debugUnlockAllForTest();
      final security = container.read(securityControllerProvider);
      return MarionetteExtensionResult.success({
        'isNotesUnlocked': '${security.isNotesUnlocked}',
        'isCirclesUnlocked': '${security.isCirclesUnlocked}',
        'isProfileUnlocked': '${security.isProfileUnlocked}',
      });
    },
  );
}
