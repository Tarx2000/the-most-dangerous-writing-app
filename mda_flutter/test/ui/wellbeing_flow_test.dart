import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/core/rating_day.dart';
import 'package:mda_flutter/data/app_data.dart';
import 'package:mda_flutter/data/models/wellbeing_checkin.dart';
import 'package:mda_flutter/data/providers.dart';
import 'package:mda_flutter/data/security_providers.dart';
import 'package:mda_flutter/ui/core/widgets/custom_slider.dart';
import 'package:mda_flutter/ui/features/alignment/wellbeing_screen.dart';

class _Storage extends StorageNotifier {
  @override
  AppData build() => const AppData(
    isLoaded: true,
    preferences: PreferencesState(enableLiquidGlass: false),
  );
  @override
  Future<void> saveWellbeing(WellbeingCheckin entry) async {
    state = state.copyWith(wellbeing: [entry]);
  }
}

class _ExistingStorage extends _Storage {
  @override
  AppData build() => AppData(
    isLoaded: true,
    preferences: const PreferencesState(enableLiquidGlass: false),
    wellbeing: [
      WellbeingCheckin(
        dayKey: RatingDay.at(DateTime.now()).key,
        overall: 7,
        domains: {LifeDomain.health: 9},
        updatedAt: DateTime.now().millisecondsSinceEpoch,
      ),
    ],
  );
}

final _unlocked = StateProvider<bool>((ref) => false);

void main() {
  testWidgets(
    'existing ratings are hidden until authenticated and hide again on lock',
    (tester) async {
      final container = ProviderContainer(
        overrides: [
          appDataProvider.overrideWith(_ExistingStorage.new),
          isNotesUnlockedProvider.overrideWith((ref) => ref.watch(_unlocked)),
        ],
      );
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(home: WellbeingScreen()),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Unlock today’s check-in'), findsOneWidget);
      expect(find.byType(CustomSlider), findsNothing);
      container.read(_unlocked.notifier).state = true;
      await tester.pumpAndSettle();
      expect(
        tester.widget<CustomSlider>(find.byType(CustomSlider).first).value,
        7,
      );
      container.read(_unlocked.notifier).state = false;
      await tester.pumpAndSettle();
      expect(find.byType(CustomSlider), findsNothing);
      expect(find.text('Unlock today’s check-in'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      container.dispose();
    },
  );

  testWidgets(
    'untouched scores are missing; zero and a partial wheel save without writing',
    (tester) async {
      final container = ProviderContainer(
        overrides: [appDataProvider.overrideWith(_Storage.new)],
      );
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(home: WellbeingScreen()),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('—'), findsOneWidget);
      final overall = find.byType(CustomSlider).first;
      tester.widget<CustomSlider>(overall).onChanged(0);
      await tester.pump();
      await tester.tap(find.byType(Switch));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Health'),
        240,
        scrollable: find.byType(Scrollable).first,
      );
      final health = find.byWidgetPredicate(
        (w) => w is CustomSlider && w.label == 'Health',
      );
      tester.widget<CustomSlider>(health).onChanged(8);
      await tester.pump();
      await tester.scrollUntilVisible(
        find.text('Save check-in'),
        450,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Save check-in'));
      await tester.pumpAndSettle();
      final entry = container.read(wellbeingProvider).single;
      expect(entry.dayKey, RatingDay.at(DateTime.now()).key);
      expect(entry.overall, 0);
      expect(entry.domains, {LifeDomain.health: 8});
      expect(entry.completedWheelAt, isNotNull);
      expect(find.byType(TextField), findsNothing);
      expect(find.text('Checked in.'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      container.dispose();
    },
  );

  for (final glass in [false, true]) {
    testWidgets(
      'slider endpoints, tap, drag cancellation and accessibility, glass=$glass',
      (tester) async {
        final handle = tester.ensureSemantics();
        int? value;
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Center(
                child: SizedBox(
                  width: 280,
                  child: StatefulBuilder(
                    builder: (context, update) => CustomSlider(
                      value: value,
                      min: 0,
                      max: 10,
                      enableGlass: glass,
                      label: 'Health',
                      onChanged: (v) => update(() => value = v),
                      onCancelled: (v) => update(() => value = v),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        final rect = tester.getRect(find.byType(CustomSlider));
        await tester.tapAt(Offset(rect.left + 24, rect.center.dy));
        await tester.pumpAndSettle();
        expect(value, 0);
        await tester.tapAt(Offset(rect.right - 24, rect.center.dy));
        await tester.pumpAndSettle();
        expect(value, 10);
        final gesture = await tester.startGesture(rect.center);
        await gesture.moveBy(const Offset(-50, 0));
        await tester.pump();
        await gesture.cancel();
        await tester.pumpAndSettle();
        expect(value, 10);
        final semantics = tester.getSemantics(find.bySemanticsLabel('Health'));
        expect(semantics.label, 'Health');
        expect(semantics.value, '10 of 10');
        expect(tester.binding.hasScheduledFrame, isFalse);
        handle.dispose();
        await tester.pumpWidget(const SizedBox());
      },
    );
  }
}
