import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:liquid_glass_easy/liquid_glass_easy.dart';
import 'package:mda_flutter/ui/core/widgets/liquid_glass_options.dart';

Future<void> _pumpOptions(WidgetTester tester, List<int> changes) async {
  var selection = 1;
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Center(
          child: StatefulBuilder(
            builder: (context, setState) => LiquidGlassOptions(
              options: const ['EASY', 'MID', 'HARD'],
              selectedIndex: selection,
              onChanged: (index) {
                changes.add(index);
                setState(() => selection = index);
              },
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  testWidgets(
    'hold follows the finger and commits only on release in both directions',
    (tester) async {
      final changes = <int>[];
      await _pumpOptions(tester, changes);
      for (final (from, to, result) in [
        ('MID', 'HARD', 2),
        ('HARD', 'EASY', 0),
      ]) {
        final start = tester.getCenter(find.text(from));
        final end = tester.getCenter(find.text(to));
        final gesture = await tester.startGesture(start);
        await tester.pump(const Duration(milliseconds: 150));
        await gesture.moveTo(Offset.lerp(start, end, 0.5)!);
        await tester.pump(const Duration(milliseconds: 100));
        final moving = tester.widget<LiquidGlassMotionPill>(
          find.byType(LiquidGlassMotionPill),
        );
        expect(moving.active, isTrue);
        final oldCount = changes.length;
        await gesture.moveTo(end);
        await tester.pump(const Duration(milliseconds: 100));
        expect(changes.length, oldCount);
        await gesture.up();
        await tester.pumpAndSettle();
        expect(changes.last, result);
        expect(
          tester
              .widget<LiquidGlassOptions>(find.byType(LiquidGlassOptions))
              .selectedIndex,
          result,
        );
      }
      expect(changes, [2, 0]);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('cancelled hold restores the committed difficulty', (
    tester,
  ) async {
    final changes = <int>[];
    await _pumpOptions(tester, changes);
    final gesture = await tester.startGesture(
      tester.getCenter(find.text('MID')),
    );
    await tester.pump(const Duration(milliseconds: 150));
    await gesture.moveTo(tester.getCenter(find.text('HARD')));
    await tester.pump(const Duration(milliseconds: 100));
    await gesture.cancel();
    await tester.pumpAndSettle();
    expect(changes, isEmpty);
    expect(
      tester
          .widget<LiquidGlassOptions>(find.byType(LiquidGlassOptions))
          .selectedIndex,
      1,
    );
    final pill = tester.widget<LiquidGlassMotionPill>(
      find.byType(LiquidGlassMotionPill),
    );
    expect(pill.active, isFalse);
    expect(pill.center.dx, closeTo(135, 0.1));
    expect(tester.takeException(), isNull);
  });

  testWidgets('held selection clamps outside either end of the control', (
    tester,
  ) async {
    final changes = <int>[];
    await _pumpOptions(tester, changes);
    final bounds = tester.getRect(find.byType(LiquidGlassOptions));
    for (final (x, result) in [
      (bounds.right + 100, 2),
      (bounds.left - 100, 0),
    ]) {
      final gesture = await tester.startGesture(bounds.center);
      await tester.pump(const Duration(milliseconds: 150));
      await gesture.moveTo(Offset(x, bounds.center.dy));
      await tester.pump(const Duration(milliseconds: 100));
      await gesture.up();
      await tester.pumpAndSettle();
      expect(changes.last, result);
    }
    expect(changes, [2, 0]);
  });

  testWidgets(
    'tapping commits once and disposal during travel cancels cleanly',
    (tester) async {
      final changes = <int>[];
      await _pumpOptions(tester, changes);
      await tester.tap(find.text('MID'));
      await tester.pumpAndSettle();
      expect(changes, isEmpty);
      await tester.tap(find.text('EASY'));
      await tester.pump(const Duration(milliseconds: 40));
      expect(changes, [0]);
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
      expect(tester.takeException(), isNull);
    },
  );
}
