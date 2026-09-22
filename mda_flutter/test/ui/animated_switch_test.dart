import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/ui/core/widgets/animated_switch.dart';

void main() {
  testWidgets('AnimatedSwitch toggles on tap and respects disabled state', (
    tester,
  ) async {
    bool value = false;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) {
              return Center(
                child: AnimatedSwitch(
                  value: value,
                  onChanged: (val) {
                    setState(() {
                      value = val;
                    });
                  },
                ),
              );
            },
          ),
        ),
      ),
    );

    // Initial value is false
    expect(value, isFalse);

    // Tap switch
    await tester.tap(find.byType(AnimatedSwitch));
    await tester.pumpAndSettle();
    expect(value, isTrue);

    // Tap again
    await tester.tap(find.byType(AnimatedSwitch));
    await tester.pumpAndSettle();
    expect(value, isFalse);
  });

  testWidgets('AnimatedSwitch does not toggle when disabled', (tester) async {
    bool value = false;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: AnimatedSwitch(
              value: value,
              disabled: true,
              onChanged: (val) {
                value = val;
              },
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.byType(AnimatedSwitch));
    await tester.pumpAndSettle();
    expect(value, isFalse);
  });

  testWidgets('AnimatedSwitch supports drag gesture', (tester) async {
    bool value = false;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) {
              return Center(
                child: AnimatedSwitch(
                  value: value,
                  onChanged: (val) {
                    setState(() {
                      value = val;
                    });
                  },
                ),
              );
            },
          ),
        ),
      ),
    );

    // Drag from left to right across the switch
    final switchFinder = find.byType(AnimatedSwitch);
    await tester.drag(switchFinder, const Offset(30, 0));
    await tester.pumpAndSettle();
    expect(value, isTrue);

    // Drag from right to left
    await tester.drag(switchFinder, const Offset(-30, 0));
    await tester.pumpAndSettle();
    expect(value, isFalse);
  });

  testWidgets('AnimatedSwitch renders custom icons and respects sizes', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Column(
            children: [
              AnimatedSwitch(
                value: true,
                size: AnimatedSwitchSize.sm,
                onIcon: Icon(Icons.check, key: ValueKey('check-icon')),
              ),
              AnimatedSwitch(
                value: false,
                size: AnimatedSwitchSize.lg,
                offIcon: Icon(Icons.close, key: ValueKey('close-icon')),
              ),
            ],
          ),
        ),
      ),
    );

    expect(find.byKey(const ValueKey('check-icon')), findsOneWidget);
    expect(find.byKey(const ValueKey('close-icon')), findsOneWidget);
  });
}
