import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/data/app_data.dart';
import 'package:mda_flutter/data/models/pillar.dart';
import 'package:mda_flutter/data/providers.dart';
import 'package:mda_flutter/ui/features/alignment/alignment_writing_screen.dart';
import 'package:mda_flutter/ui/features/writing/death_overlay.dart';

class _Storage extends StorageNotifier {
  @override
  AppData build() => const AppData(
    isLoaded: true,
    pillars: [
      Pillar(
        id: 'sleep',
        title: 'Sleep',
        type: PillarType.time,
        scope: PillarScope.daily,
        createdAt: 0,
      ),
    ],
  );

  @override
  Future<void> completeCheckin(int timestamp) async {
    state = state.copyWith(
      preferences: state.preferences.copyWith(lastReflectionDate: timestamp),
    );
  }

  @override
  Future<void> savePillarLog(PillarLog log) async {
    state = state.copyWith(lastLogDate: DateTime.now().millisecondsSinceEpoch);
  }
}

class _WeeklyStorage extends _Storage {
  @override
  AppData build() => const AppData(
    isLoaded: true,
    adviceCards: [
      AdviceCard(id: 'advice', text: 'Take a quiet moment', createdAt: 0),
    ],
  );
}

void main() {
  testWidgets(
    'weekly advice without masteries still enters the reflection deck',
    (tester) async {
      final container = ProviderContainer(
        overrides: [appDataProvider.overrideWith(_WeeklyStorage.new)],
      );
      addTearDown(container.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(
            home: AlignmentWritingScreen(isWeekly: true),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('LOG & CONTINUE'));
      await tester.pumpAndSettle();
      expect(find.text('WRITE REFLECTIONS'), findsOneWidget);
      expect(find.text('Take a quiet moment'), findsOneWidget);
      expect(container.read(preferencesProvider).lastReflectionDate, isNotNull);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'logging enters the deck; typing resets danger and idle death clears text',
    (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [appDataProvider.overrideWith(_Storage.new)],
          child: const MaterialApp(home: AlignmentWritingScreen()),
        ),
      );
      await tester.pump();
      await tester.tap(find.text('LOG & CONTINUE'));
      await tester.pumpAndSettle();
      expect(find.text('WRITE REFLECTIONS'), findsOneWidget);
      await tester.tap(find.text('Sleep'));
      await tester.pump();
      await tester.enterText(find.byType(TextField), 'First thought');
      await tester.pump(const Duration(seconds: 8));
      await tester.enterText(
        find.byType(TextField),
        'First thought and another',
      );
      await tester.pump(const Duration(seconds: 8));
      expect(
        tester.widget<DeathOverlay>(find.byType(DeathOverlay)).visible,
        isFalse,
      );
      await tester.pump(const Duration(seconds: 5));
      await tester.pump(const Duration(milliseconds: 250));
      expect(
        tester.widget<DeathOverlay>(find.byType(DeathOverlay)).visible,
        isTrue,
      );
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        isEmpty,
      );
      await tester.pumpWidget(const SizedBox());
    },
  );
}
