import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollCacheExtent;
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/ui/core/widgets/viewport_activity.dart';

void main() {
  testWidgets('cached offscreen content pauses and resumes on viewport entry', (
    tester,
  ) async {
    final scroll = ScrollController();
    addTearDown(scroll.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Align(
            alignment: Alignment.topCenter,
            child: SizedBox(
              height: 300,
              child: ListView(
                controller: scroll,
                scrollCacheExtent: const ScrollCacheExtent.pixels(1000),
                children: [
                  const SizedBox(height: 500),
                  ViewportActivity(
                    builder: (_, active) =>
                        SizedBox(height: 200, child: Text('playing:$active')),
                  ),
                  const SizedBox(height: 1000),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('playing:false', skipOffstage: false), findsOneWidget);
    scroll.jumpTo(450);
    await tester.pumpAndSettle();
    expect(find.text('playing:true'), findsOneWidget);
    scroll.jumpTo(750);
    await tester.pumpAndSettle();
    expect(find.text('playing:false', skipOffstage: false), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('reveal threshold, route overlays and lifecycle gate media', (
    tester,
  ) async {
    final reveal = ValueNotifier<double>(0.5);
    addTearDown(reveal.dispose);
    late BuildContext pageContext;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) {
            pageContext = context;
            return ViewportActivity(
              revealProgress: reveal,
              builder: (_, active) => Text('playing:$active'),
            );
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('playing:false', skipOffstage: false), findsOneWidget);
    reveal.value = 0.96;
    await tester.pumpAndSettle();
    expect(find.text('playing:true'), findsOneWidget);
    showDialog<void>(
      context: pageContext,
      builder: (_) => const AlertDialog(content: Text('Reader')),
    );
    await tester.pumpAndSettle();
    expect(find.text('playing:false', skipOffstage: false), findsOneWidget);
    Navigator.of(pageContext).pop();
    await tester.pumpAndSettle();
    expect(find.text('playing:true'), findsOneWidget);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await tester.pump();
    expect(find.text('playing:false', skipOffstage: false), findsOneWidget);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.text('playing:true'), findsOneWidget);
    reveal.value = 0.9;
    await tester.pumpAndSettle();
    expect(find.text('playing:false', skipOffstage: false), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
}
