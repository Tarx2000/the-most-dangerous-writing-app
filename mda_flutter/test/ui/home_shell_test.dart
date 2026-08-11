/// Widget tests for the HomeShell (SPEC §14):
/// nav tab switching, pager pages, feed reveal gesture.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/ui/features/home/home_shell.dart';

Widget _wrap() {
  return ProviderScope(
    child: const MaterialApp(home: Scaffold(body: HomeShell())),
  );
}

void main() {
  testWidgets('nav tabs switch the start page mode', (tester) async {
    await tester.pumpWidget(_wrap());
    await tester.pump();

    // Start in journal mode.
    expect(find.text('FREE WRITING'), findsOneWidget);

    // Circles tab → relationship journal.
    await tester.tap(find.text('Circles'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('RELATIONSHIP JOURNAL'), findsOneWidget);

    // Vlog tab → video journal.
    await tester.tap(find.text('Vlog'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('VIDEO JOURNAL'), findsOneWidget);

    // Check-in tab.
    await tester.tap(find.text('Check-in'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('OKAY'), findsOneWidget); // score 5 tier label (uppercase)

    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('swiping the pager shows the library', (tester) async {
    await tester.pumpWidget(_wrap());
    await tester.pump();

    expect(find.text('Library'), findsNothing);
    // Start the fling on the hero area — the TickDial claims its own
    // horizontal drags and would swallow the pager gesture otherwise.
    await tester.flingFrom(const Offset(400, 160), const Offset(-500, 0), 1200);
    await tester.pumpAndSettle(const Duration(milliseconds: 400));
    expect(find.text('Library'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('upward drag reveals the feed layer, downward closes it',
      (tester) async {
    await tester.pumpWidget(_wrap());
    await tester.pump();

    // Drag up far enough to commit the reveal (≥ 40% of the screen).
    await tester.drag(
      find.byType(PageView),
      const Offset(0, -600),
      warnIfMissed: false,
    );
    await tester.pumpAndSettle(const Duration(milliseconds: 400));

    // The feed title is now visible.
    expect(find.text('FEED'), findsOneWidget);

    // Drag back down to close.
    await tester.drag(
      find.text('FEED'),
      const Offset(0, 600),
    );
    await tester.pumpAndSettle(const Duration(milliseconds: 400));
    expect(find.text('FREE WRITING'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
  });
}
