import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/data/app_data.dart';
import 'package:mda_flutter/data/database/db.dart';
import 'package:mda_flutter/data/models/saved_note.dart';
import 'package:mda_flutter/data/models/person.dart';
import 'package:mda_flutter/data/providers.dart';
import 'package:mda_flutter/data/security_providers.dart';
import 'package:mda_flutter/data/services/secure_storage_service.dart';
import 'package:mda_flutter/domain/use_cases/security_controller.dart';
import 'package:mda_flutter/ui/features/library/library_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _EmptySecureStorage extends SecureStorageService {
  @override
  Future<String?> readPin() async => null;

  @override
  Future<int> readAttemptCount() async => 0;

  @override
  Future<int> readLockoutUntil() async => 0;

  @override
  Future<void> writePin(String pin) async {}

  @override
  Future<void> writeAttemptCount(int count) async {}

  @override
  Future<void> writeLockoutUntil(int timestamp) async {}

  @override
  Future<void> clearPinState() async {}
}

class _FakeSecurityController extends SecurityController {
  _FakeSecurityController() : super(storage: _EmptySecureStorage());

  @override
  bool get isNotesUnlocked => false;

  @override
  bool get isCirclesUnlocked => true;
}

class _TestStorageNotifier extends StorageNotifier {
  @override
  AppData build() {
    return const AppData(
      isLoaded: true,
      notes: [
        SavedNote(
          id: 'secret-note-1',
          text: 'TOP SECRET CONFIDENTIAL JOURNAL ENTRY TEXT',
          dateStr: '2026-10-25',
          timestamp: 1729864800000,
          durationMin: 5,
          won: true,
          aiTitle: 'CLASSIFIED TITLE',
        ),
      ],
      persons: [
        Person(
          id: 'person-1',
          name: 'Public Circle Contact',
          createdAt: 1729864800000,
        ),
      ],
    );
  }
}

void main() {
  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    setPrefsAccess(() async => {}, (key, value) async {});
  });

  group('LibraryScreen security leak prevention', () {
    testWidgets(
      'Locked journal redacts note text and title with bullet masking',
      (tester) async {
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              appDataProvider.overrideWith(() => _TestStorageNotifier()),
              securityControllerProvider.overrideWith(
                (ref) => _FakeSecurityController(),
              ),
            ],
            child: const MaterialApp(home: Scaffold(body: LibraryScreen())),
          ),
        );
        await tester.pump();

        // Ensure confidential plain text is NEVER rendered when journal is locked
        expect(
          find.text('TOP SECRET CONFIDENTIAL JOURNAL ENTRY TEXT'),
          findsNothing,
        );
        expect(find.text('CLASSIFIED TITLE'), findsNothing);
        expect(find.textContaining('TOP SECRET'), findsNothing);

        // Verify "Notes Protected" lock screen is present
        expect(find.text('Notes Protected'), findsOneWidget);
      },
    );

    testWidgets(
      'Rapid switching between Circles and Journal never leaks plaintext',
      (tester) async {
        var mode = 'journal';

        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              appDataProvider.overrideWith(() => _TestStorageNotifier()),
              securityControllerProvider.overrideWith(
                (ref) => _FakeSecurityController(),
              ),
            ],
            child: StatefulBuilder(
              builder: (context, setState) => MaterialApp(
                home: Scaffold(
                  body: Column(
                    children: [
                      Expanded(child: LibraryScreen(mode: mode)),
                      TextButton(
                        onPressed: () => setState(() => mode = 'circles'),
                        child: const Text('GOTO_CIRCLES'),
                      ),
                      TextButton(
                        onPressed: () => setState(() => mode = 'journal'),
                        child: const Text('GOTO_JOURNAL'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pump();

        // Switch to Circles tab (unlocked)
        await tester.tap(find.text('GOTO_CIRCLES'));
        await tester.pump(const Duration(milliseconds: 50));
        expect(find.text('Public Circle Contact'), findsOneWidget);

        // Switch back rapidly to Journal tab (locked)
        await tester.tap(find.text('GOTO_JOURNAL'));
        await tester.pump(
          const Duration(milliseconds: 16),
        ); // Single frame into transition

        // Assert no plaintext leakage occurs mid-transition
        expect(
          find.text('TOP SECRET CONFIDENTIAL JOURNAL ENTRY TEXT'),
          findsNothing,
        );
        expect(find.text('CLASSIFIED TITLE'), findsNothing);
        expect(find.textContaining('TOP SECRET'), findsNothing);

        // Let animation settle
        await tester.pumpAndSettle();

        expect(
          find.text('TOP SECRET CONFIDENTIAL JOURNAL ENTRY TEXT'),
          findsNothing,
        );
        expect(find.text('CLASSIFIED TITLE'), findsNothing);
        expect(find.text('Notes Protected'), findsOneWidget);
      },
    );
  });
}
