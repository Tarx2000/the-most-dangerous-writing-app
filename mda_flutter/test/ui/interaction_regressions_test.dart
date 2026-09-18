import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/ui/core/widgets/animated_scale_button.dart';
import 'package:mda_flutter/ui/core/widgets/base_modal.dart';

void main() {
  testWidgets('a short hold never triggers the four-second developer action', (
    tester,
  ) async {
    var longPresses = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Center(
          child: AnimatedScaleButton(
            onPress: () {},
            longPressDuration: const Duration(seconds: 4),
            onLongPress: () => longPresses++,
            child: const Text('Settings'),
          ),
        ),
      ),
    );
    final gesture = await tester.startGesture(
      tester.getCenter(find.text('Settings')),
    );
    await tester.pump(const Duration(seconds: 1));
    await gesture.up();
    await tester.pump(const Duration(seconds: 5));
    expect(longPresses, 0);
    final held = await tester.startGesture(
      tester.getCenter(find.text('Settings')),
    );
    await tester.pump(const Duration(seconds: 4));
    expect(longPresses, 1);
    await held.up();
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('a short editor sheet remains above the keyboard', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1;
    tester.view.viewInsets = const FakeViewPadding(bottom: 350);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpWidget(
      const MaterialApp(
        home: BaseModal(
          title: 'API Key',
          heightFactor: 0.4,
          child: SingleChildScrollView(
            child: Column(
              children: [TextField(), SizedBox(height: 12), Text('SAVE')],
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(tester.getBottomRight(find.text('SAVE')).dy, lessThan(450));
    expect(find.text('SAVE').hitTestable(), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
}
