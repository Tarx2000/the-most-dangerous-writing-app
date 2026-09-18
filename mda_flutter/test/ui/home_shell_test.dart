/// Real hit-testing guards against a feed that exists offscreen but cannot be used.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/data/app_data.dart';
import 'package:mda_flutter/data/providers.dart';
import 'package:mda_flutter/ui/features/home/home_shell.dart';
import 'package:mda_flutter/ui/core/widgets/liquid_glass_nav.dart';
import 'package:mda_flutter/ui/core/widgets/tick_dial.dart';

class _Storage extends StorageNotifier {
  @override
  AppData build() => const AppData(isLoaded: true);
}

Future<void> _pumpHome(WidgetTester tester) async {
  tester.view.physicalSize = const Size(400, 850);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [appDataProvider.overrideWith(_Storage.new)],
      child: const MaterialApp(home: Scaffold(body: HomeShell())),
    ),
  );
  await tester.pump();
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
  testWidgets('nav selects modes and preserves the selected vlog duration', (
    tester,
  ) async {
    await _pumpHome(tester);
    expect(find.text('Free Writing'), findsOneWidget);
    await tester.tap(find.text('Circles'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Relationship Journal'), findsOneWidget);
    await tester.tap(find.text('Vlog'));
    await tester.pump(const Duration(milliseconds: 300));
    tester.widget<TickDial>(find.byType(TickDial)).onSelect(3);
    await tester.pump();
    expect(tester.widget<TickDial>(find.byType(TickDial)).selectedIndex, 3);
    await tester.tap(find.text('Check-in'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('OKAY'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('horizontal swipe reaches the library without changing mode', (
    tester,
  ) async {
    await _pumpHome(tester);
    await tester.flingFrom(const Offset(350, 160), const Offset(-320, 0), 1200);
    await tester.pumpAndSettle();
    expect(find.text('Library').hitTestable(), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'upward drag beyond halfway opens an interactive feed; downward closes',
    (tester) async {
      await _pumpHome(tester);
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
    await _pumpHome(tester);
    await tester.tap(find.text('Circles'));
    await tester.pump(const Duration(milliseconds: 300));
    await _openFeed(tester);
    expect(find.text('FEED').hitTestable(), findsOneWidget);
    await tester.tap(find.byIcon(Icons.keyboard_arrow_down));
    await tester.pumpAndSettle();
    expect(find.text('Relationship Journal').hitTestable(), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('cancelled reveal returns to the start page', (tester) async {
    await _pumpHome(tester);
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

  testWidgets('nav tabs switch the library in place without leaving the page', (
    tester,
  ) async {
    await _pumpHome(tester);
    // Swipe horizontally to the Library page.
    await tester.flingFrom(const Offset(350, 160), const Offset(-320, 0), 1200);
    await tester.pumpAndSettle();
    expect(find.text('Library').hitTestable(), findsOneWidget);
    // Tapping Circles must NOT jump back to Start (RN sessionMode parity).
    // The library tab chip (13px) and the nav pill label (10px) share the
    // text — tap the nav pill entry explicitly via LiquidGlassNav.
    await tester.tap(
      find.descendant(
        of: find.byType(LiquidGlassNav),
        matching: find.text('Circles'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Library').hitTestable(), findsOneWidget);
    expect(find.text('Free Writing'), findsNothing);
    expect(find.text('Relationship Journal'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });
}
