/// Real hit-testing guards against a feed that exists offscreen but cannot be used.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/data/app_data.dart';
import 'package:mda_flutter/data/providers.dart';
import 'package:mda_flutter/ui/features/home/home_shell.dart';
import 'package:mda_flutter/ui/features/start/start_screen.dart';
import 'package:mda_flutter/ui/core/widgets/liquid_glass_nav.dart';
import 'package:mda_flutter/ui/core/widgets/tick_dial.dart';

class _Storage extends StorageNotifier {
  _Storage({this.enableLiquidGlass = false});

  final bool enableLiquidGlass;
  @override
  AppData build() => AppData(
    isLoaded: true,
    preferences: PreferencesState(enableLiquidGlass: enableLiquidGlass),
  );
}

Future<void> _pumpHome(WidgetTester tester, bool glass) async {
  tester.view.physicalSize = const Size(400, 850);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        appDataProvider.overrideWith(() => _Storage(enableLiquidGlass: glass)),
      ],
      child: const MaterialApp(home: Scaffold(body: HomeShell())),
    ),
  );
  await tester.pump();
}

Future<void> _tapTab(WidgetTester tester, String label) async {
  // The package paints selected/unselected labels in two clipped,
  // non-interactive layers. Tap their shared position to reach its hit target.
  final text = find
      .descendant(of: find.byType(LiquidGlassNav), matching: find.text(label))
      .first;
  await tester.tapAt(tester.getCenter(text));
}

Future<void> _openFeed(WidgetTester tester) async {
  // Incremental events cross 50% before release: the old implementation
  // stopped processing the gesture at that point and never committed it.
  final gesture = await tester.startGesture(const Offset(200, 650));
  await gesture.moveBy(const Offset(0, -30));
  await tester.pump();
  for (var i = 0; i < 6; i++) {
    await gesture.moveBy(const Offset(0, -80));
    await tester.pump(const Duration(milliseconds: 80));
  }
  await gesture.up();
  await tester.pumpAndSettle();
}

void main() {
  for (final glass in [false, true]) {
    group('Liquid Glass $glass', () {
      if (glass) {
        testWidgets(
          'hold then drag across tabs selects only on release, in both directions',
          (tester) async {
            await _pumpHome(tester, glass);
            Offset center(String label) => tester.getCenter(
              find
                  .descendant(
                    of: find.byType(LiquidGlassNav),
                    matching: find.text(label),
                  )
                  .first,
            );
            for (final target in ['Check-in', 'Journal', 'Vlog', 'Circles']) {
              final current = target == 'Check-in'
                  ? 'Journal'
                  : target == 'Journal'
                  ? 'Check-in'
                  : target == 'Vlog'
                  ? 'Journal'
                  : 'Vlog';
              final gesture = await tester.startGesture(center(current));
              await tester.pump(const Duration(milliseconds: 150));
              final destination = center(target);
              final start = center(current);
              for (var i = 1; i <= 8; i++) {
                await gesture.moveTo(Offset.lerp(start, destination, i / 8)!);
                await tester.pump(const Duration(milliseconds: 30));
              }
              // Moving the preview must not change the active session yet.
              final currentTitle = switch (current) {
                'Check-in' => 'Check-in',
                'Vlog' => 'Video Journal',
                _ => 'Free Writing',
              };
              expect(
                find
                    .descendant(
                      of: find.byType(StartScreen),
                      matching: find.text(currentTitle),
                    )
                    .hitTestable(),
                findsOneWidget,
              );
              await gesture.up();
              await tester.pumpAndSettle();
              final title = switch (target) {
                'Check-in' => 'Check-in',
                'Vlog' => 'Video Journal',
                'Circles' => 'Relationship Journal',
                _ => 'Free Writing',
              };
              expect(
                find
                    .descendant(
                      of: find.byType(StartScreen),
                      matching: find.text(title),
                    )
                    .hitTestable(),
                findsOneWidget,
              );
            }
            expect(tester.takeException(), isNull);
            await tester.pumpWidget(const SizedBox());
          },
        );

        testWidgets('held tab selection clamps to both ends of the bar', (
          tester,
        ) async {
          await _pumpHome(tester, glass);
          var gesture = await tester.startGesture(const Offset(70, 805));
          await tester.pump(const Duration(milliseconds: 150));
          await gesture.moveTo(const Offset(500, 805));
          await tester.pump(const Duration(milliseconds: 200));
          await gesture.up();
          await tester.pumpAndSettle();
          expect(find.text('Check-in').first.hitTestable(), findsOneWidget);
          gesture = await tester.startGesture(const Offset(325, 805));
          await tester.pump(const Duration(milliseconds: 150));
          await gesture.moveTo(const Offset(-100, 805));
          await tester.pump(const Duration(milliseconds: 200));
          await gesture.up();
          await tester.pumpAndSettle();
          expect(find.text('Free Writing').hitTestable(), findsOneWidget);
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox());
        });
      }

      testWidgets(
        'nav selects modes and preserves the selected vlog duration',
        (tester) async {
          await _pumpHome(tester, glass);
          expect(find.text('Free Writing'), findsOneWidget);
          await _tapTab(tester, 'Circles');
          await tester.pump(const Duration(milliseconds: 300));
          expect(find.text('Relationship Journal'), findsOneWidget);
          await _tapTab(tester, 'Vlog');
          await tester.pump(const Duration(milliseconds: 300));
          tester.widget<TickDial>(find.byType(TickDial)).onSelect(3);
          await tester.pump();
          expect(
            tester.widget<TickDial>(find.byType(TickDial)).selectedIndex,
            3,
          );
          await _tapTab(tester, 'Check-in');
          await tester.pump(const Duration(milliseconds: 300));
          expect(find.text('Check-in').first, findsOneWidget);
          await tester.pumpWidget(const SizedBox());
        },
      );

      testWidgets(
        'horizontal swipe reaches the library without changing mode',
        (tester) async {
          await _pumpHome(tester, glass);
          await tester.flingFrom(
            const Offset(350, 160),
            const Offset(-320, 0),
            1200,
          );
          await tester.pumpAndSettle();
          expect(find.text('Library').hitTestable(), findsOneWidget);
          await tester.pumpWidget(const SizedBox());
        },
      );

      testWidgets(
        'upward drag beyond halfway opens an interactive feed; downward closes',
        (tester) async {
          await _pumpHome(tester, glass);
          expect(find.text('FEED'), findsNothing);
          await _openFeed(tester);
          expect(find.text('FEED').hitTestable(), findsOneWidget);
          expect(find.text('Journal').hitTestable(), findsNothing);
          await tester.drag(find.text('FEED'), const Offset(0, 500));
          await tester.pumpAndSettle();
          expect(find.text('FEED'), findsNothing);
          expect(find.text('Free Writing').hitTestable(), findsOneWidget);
          await tester.pumpWidget(const SizedBox());
        },
      );

      testWidgets('feed opens from Circles mode as well', (tester) async {
        await _pumpHome(tester, glass);
        await _tapTab(tester, 'Circles');
        await tester.pump(const Duration(milliseconds: 300));
        await _openFeed(tester);
        expect(find.text('FEED').hitTestable(), findsOneWidget);
        await tester.tap(find.byIcon(Icons.keyboard_arrow_down));
        await tester.pumpAndSettle();
        expect(find.text('Relationship Journal').hitTestable(), findsOneWidget);
        await tester.pumpWidget(const SizedBox());
      });

      testWidgets('cancelled reveal returns to the start page', (tester) async {
        await _pumpHome(tester, glass);
        final gesture = await tester.startGesture(const Offset(200, 650));
        await gesture.moveBy(const Offset(0, -30));
        await gesture.moveBy(const Offset(0, -120));
        await tester.pump();
        await gesture.cancel();
        await tester.pumpAndSettle();
        expect(find.text('FEED'), findsNothing);
        expect(find.text('Free Writing').hitTestable(), findsOneWidget);
        await tester.pumpWidget(const SizedBox());
      });

      testWidgets(
        'nav tabs switch the library in place without leaving the page',
        (tester) async {
          await _pumpHome(tester, glass);
          // Swipe horizontally to the Library page.
          await tester.flingFrom(
            const Offset(350, 160),
            const Offset(-320, 0),
            1200,
          );
          await tester.pumpAndSettle();
          expect(find.text('Library').hitTestable(), findsOneWidget);
          // Tapping Circles must NOT jump back to Start (RN sessionMode parity).
          // The nav pill entry is tapped explicitly via LiquidGlassNav (no header
          // tab pills exist in RN — the visible section is mode-driven only).
          await _tapTab(tester, 'Circles');
          await tester.pumpAndSettle();
          expect(find.text('Library').hitTestable(), findsOneWidget);
          expect(find.text('Free Writing'), findsNothing);
          expect(find.text('Relationship Journal'), findsNothing);
          // The layout must be overflow-free on a 400 px phone (the old header
          // pills + lock pill overflowed the header row here).
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox());
        },
      );

      testWidgets('library shows no header tab pills (RN parity)', (
        tester,
      ) async {
        await _pumpHome(tester, glass);
        await tester.flingFrom(
          const Offset(350, 160),
          const Offset(-320, 0),
          1200,
        );
        await tester.pumpAndSettle();
        // Section content is mode-driven; no Notes/Check-ins/Circles/Vlogs chips.
        expect(find.text('Notes'), findsNothing);
        expect(find.text('Check-ins'), findsNothing);
        expect(find.text('Vlogs'), findsNothing);
        // The locked overlay shows the RN lock card (per-section copy).
        expect(find.text('Notes Protected'), findsOneWidget);
        await tester.pumpWidget(const SizedBox());
      });
    });
  }
}
