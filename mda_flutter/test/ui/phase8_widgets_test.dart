/// Phase 8 widget tests — settings modal renders, feed filters work.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/data/app_data.dart';
import 'package:mda_flutter/data/database/db.dart';
import 'package:mda_flutter/data/models/saved_note.dart';
import 'package:mda_flutter/data/providers.dart';
import 'package:mda_flutter/ui/features/feed/feed_screen.dart';
import 'package:mda_flutter/ui/features/settings/settings_modal.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUpAll(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
  });

  setUp(() {
    setPrefsAccess(() async => {}, (key, value) async {});
  });

  group('SettingsModal', () {
    testWidgets('renders all sections', (tester) async {
      await tester.pumpWidget(ProviderScope(
        child: MaterialApp(
          home: Scaffold(
            body: SizedBox(
              height: 700,
              child: SettingsModal(onClose: () {}),
            ),
          ),
        ),
      ));
      await tester.pump();

      expect(find.text('APPEARANCE'), findsOneWidget);
      expect(find.text('SECURITY & STORAGE'), findsOneWidget);
      expect(find.text('FEED & SYSTEM'), findsOneWidget);
      expect(find.text('BACKUP & IMPORT'), findsOneWidget);
      expect(find.text('AI SETTINGS'), findsOneWidget);
      expect(find.text('DEVELOPER TOOLS'), findsOneWidget);

      // Font chips + reading size + preview.
      expect(find.text('Playfair'), findsOneWidget);
      expect(find.text('Reading Size'), findsOneWidget);
      expect(find.textContaining('quick brown fox'), findsOneWidget);

      await tester.pumpWidget(const SizedBox());
    });
  });

  group('FeedScreen filters', () {
    testWidgets('type chips hide and show items', (tester) async {
      // Fake storage (no DB — testWidgets runs in FakeAsync where real
      // sqlite I/O would block).
      final container = ProviderContainer(overrides: [
        appDataProvider.overrideWith(() => _FakeStorageNotifier()),
      ]);
      addTearDown(container.dispose);

      await tester.pumpWidget(UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: Scaffold(body: FeedScreen())),
      ));
      await tester.pump();

      // Both items visible initially.
      expect(find.text('Journal'), findsWidgets);
      expect(find.text('Tweet'), findsWidgets);

      // Disable tweets → the tweet disappears.
      await tester.tap(find.text('Tweets').first);
      await tester.pump();
      expect(
        find.text('Tweet').evaluate().length,
        lessThanOrEqualTo(1), // only the filter chip label remains
      );

      await tester.pumpWidget(const SizedBox());
    });
  });
}

/// StorageNotifier stand-in with pre-seeded data (no database access).
class _FakeStorageNotifier extends StorageNotifier {
  @override
  AppData build() {
    return const AppData(
      isLoaded: true,
      notes: [
        SavedNote(
          id: 's1',
          text: 'A long journal story with enough words to be a story entry',
          dateStr: '2026-08-11',
          timestamp: 2000,
          durationMin: 5,
          won: true,
          aiTitle: 'My Story',
        ),
        SavedNote(
          id: 't1',
          text: 'a tiny tweet',
          dateStr: '2026-08-11',
          timestamp: 1000,
          durationMin: 0,
          won: false,
          isTweet: true,
        ),
      ],
    );
  }
}
