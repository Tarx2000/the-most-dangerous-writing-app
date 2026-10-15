import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:liquid_glass_easy/liquid_glass_easy.dart';
import 'package:mda_flutter/data/app_data.dart';
import 'package:mda_flutter/data/providers.dart';
import 'package:mda_flutter/domain/use_cases/session_engine.dart';
import 'package:mda_flutter/ui/core/widgets/tick_dial.dart';
import 'package:mda_flutter/ui/features/library/library_screen.dart';
import 'package:mda_flutter/ui/features/writing/danger_overlay.dart';
import 'package:mda_flutter/ui/features/writing/death_overlay.dart';
import 'package:mda_flutter/ui/features/writing/writing_screen.dart';

class _Storage extends StorageNotifier {
  @override
  AppData build() => const AppData(isLoaded: true);
}

Widget _wrap(Widget child, {double scale = 1, double keyboard = 0}) =>
    ProviderScope(
      overrides: [appDataProvider.overrideWith(_Storage.new)],
      child: MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(scale),
            viewInsets: EdgeInsets.only(bottom: keyboard),
          ),
          child: child!,
        ),
        home: Scaffold(resizeToAvoidBottomInset: false, body: child),
      ),
    );

void main() {
  testWidgets('setup duration uses minutes, without countdown punctuation', (
    tester,
  ) async {
    await tester.pumpWidget(
      _wrap(
        TickDial(
          data: const [3, 5, 10, 15, 30, 60],
          selectedIndex: 3,
          onSelect: (_) {},
        ),
      ),
    );
    expect(find.text('15 min', findRichText: true), findsOneWidget);
    expect(find.textContaining(':00', findRichText: true), findsNothing);
  });

  testWidgets('library unlock label stays whole with large text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(_wrap(const LibraryScreen(), scale: 1.6));
    await tester.pumpAndSettle();
    expect(find.text('Unlock'), findsOneWidget);
    expect(find.text('Un'), findsNothing);
    expect(find.bySemanticsLabel('Unlock Library'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'death actions remain reachable above the keyboard at large text',
    (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final actions = <String>[];
      await tester.pumpWidget(
        _wrap(
          DeathOverlay(
            visible: true,
            subtitle: 'You stopped writing for too long.',
            onReturnToMenu: () => actions.add('menu'),
            onSaveWhatsLeft: () => actions.add('save'),
            onContinue: () => actions.add('continue'),
          ),
          scale: 1.6,
          keyboard: 280,
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(LiquidGlassButton), findsOneWidget);
      for (final label in [
        'Return to Menu',
        "Save What's Left",
        "I don't care, let me write",
      ]) {
        await tester.ensureVisible(find.text(label));
        await tester.pumpAndSettle();
        await tester.tap(find.text(label));
        await tester.pumpAndSettle();
      }
      expect(actions, ['menu', 'save', 'continue']);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'warning covers the centre throughout, with a smooth full field',
    (tester) async {
      final ratio = ValueNotifier(0.0);
      addTearDown(ratio.dispose);
      const key = ValueKey('fog');
      await tester.pumpWidget(
        _wrap(
          Center(
            child: RepaintBoundary(
              key: key,
              child: SizedBox(
                width: 240,
                height: 360,
                child: ColoredBox(
                  color: Colors.black,
                  child: CustomPaint(
                    painter: DangerPainter(
                      ratio,
                      const AlwaysStoppedAnimation(0),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      Future<List<int>> sample(double value) async {
        ratio.value = value;
        await tester.pump();
        final boundary = tester.renderObject<RenderRepaintBoundary>(
          find.byKey(key),
        );
        return (await tester.runAsync(() async {
          final image = boundary.toImageSync();
          final bytes = (await image.toByteData(
            format: ui.ImageByteFormat.rawRgba,
          ))!;
          final samples = [
            for (final (x, y) in [
              (2, 180),
              (120, 180),
              (120, 20),
              (120, 340),
              (238, 180),
            ])
              bytes.getUint8((y * image.width + x) * 4),
          ];
          image.dispose();
          return samples;
        }))!;
      }

      expect(await sample(0), everyElement(0));
      final early = await sample(0.45);
      expect(early.first, greaterThan(early[1]));
      expect(early[1], greaterThanOrEqualTo(early.first * 0.75));
      final middle = await sample(0.75);
      expect(middle[1], closeTo(middle.first, 1));
      final late = await sample(0.99);
      expect(late[1], greaterThan(middle[1]));
      expect(late[1], greaterThan(50));
      expect(late[2], late[1]);
      expect(late[3], late[1]);
      expect(late.last, closeTo(late.first, 1));
    },
  );

  testWidgets('danger blur disappears immediately when typing resumes', (
    tester,
  ) async {
    final engine = SessionEngine();
    addTearDown(engine.dispose);
    await tester.pumpWidget(_wrap(DangerOverlay(engine: engine)));
    expect(find.byType(BackdropFilter), findsNothing);
    engine.idleRatio.value = 0.9;
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byType(BackdropFilter), findsOneWidget);
    engine.idleRatio.value = 0;
    await tester.pump();
    expect(find.byType(BackdropFilter), findsNothing);
    expect(tester.binding.hasScheduledFrame, isFalse);
  });

  testWidgets(
    'visual progress interpolates engine ticks without changing time',
    (tester) async {
      final engine = SessionEngine();
      addTearDown(engine.dispose);
      await tester.pumpWidget(_wrap(DangerOverlay(engine: engine)));
      double visualRatio() => tester
          .widgetList<CustomPaint>(find.byType(CustomPaint))
          .map((w) => w.painter)
          .whereType<DangerPainter>()
          .single
          .idleRatio
          .value;
      engine.idleRatio.value = 0.7;
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(visualRatio(), inExclusiveRange(0.0, 0.7));
      expect(engine.idleRatio.value, 0.7);
      await tester.pump(const Duration(milliseconds: 50));
      expect(visualRatio(), closeTo(0.7, 0.001));
      engine.idleRatio.value = 0;
      await tester.pump();
      expect(visualRatio(), 0);
      expect(tester.binding.hasScheduledFrame, isFalse);
    },
  );

  testWidgets(
    'writing warning fills the window despite keyboard and safe insets',
    (tester) async {
      tester.view.physicalSize = const Size(402, 874);
      tester.view.devicePixelRatio = 1;
      tester.view.padding = const FakeViewPadding(top: 62, bottom: 34);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPadding);
      await tester.pumpWidget(
        _wrap(
          const WritingScreen(
            params: WritingParams(timeIndex: 1, diffIndex: 1, mode: 'journal'),
          ),
          keyboard: 328,
        ),
      );
      await tester.pump();
      expect(
        tester.getRect(find.byType(DangerOverlay)),
        const Rect.fromLTWH(0, 0, 402, 874),
      );
      await tester.pumpWidget(const SizedBox());
    },
  );
}
