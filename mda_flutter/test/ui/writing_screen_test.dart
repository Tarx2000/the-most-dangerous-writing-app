/// Widget test for the WritingScreen core flow (SPEC §8):
/// render → type → word counter updates → idle death → overlay → resume.
///
/// Typing is driven through the EditableText's real `onChanged` handler
/// (the exact same code path as real input) so the flow is deterministic.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/domain/use_cases/session_engine.dart';
import 'package:mda_flutter/ui/features/writing/writing_screen.dart';

Widget _wrap(Widget child) {
  return ProviderScope(
    child: MaterialApp(
      home: child,
    ),
  );
}

void main() {
  testWidgets('typing updates the word counter and the death flow works',
      (tester) async {
    await tester.pumpWidget(_wrap(const WritingScreen(
      params: WritingParams(
        timeIndex: 1,
        diffIndex: 1, // MID = 8 s idle limit
        mode: 'journal',
      ),
    )));

    // The engine lives on the private state class — access it dynamically.
    final dynamic state = tester.state(find.byType(WritingScreen));
    final engine = state.engineForTesting as SessionEngine;

    // Session countdown visible (5 min = 05:00).
    expect(find.text('FREE WRITE'), findsOneWidget);

    // Simulate typing through the real onChanged handler.
    await _type(tester, 'one two three four');
    expect(find.textContaining('4 words'), findsOneWidget);

    // Append more words — fast path stays consistent.
    await _type(tester, 'one two three four five six seven eight');
    expect(find.textContaining('8 words'), findsOneWidget);

    // Idle past the 8 s MID limit → death overlay becomes visible.
    for (var i = 0; i < 90; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(engine.phase.value, SessionPhase.death);
    expect(find.text('YOU DIED'), findsOneWidget);

    // "I don't care, let me write" resumes free writing.
    await tester.tap(find.text("I don't care, let me write"));
    await tester.pump(const Duration(milliseconds: 400));
    expect(engine.isContinuingAfterLoss, isTrue);
    expect(find.text('SAVE WHAT\'S LEFT'), findsOneWidget);

    // Teardown: dispose the engine timers cleanly.
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('tweet mode blocks typing past 45 words', (tester) async {
    await tester.pumpWidget(_wrap(const WritingScreen(
      params: WritingParams(
        timeIndex: 0,
        diffIndex: 1,
        mode: 'journal',
        isTweet: true,
      ),
    )));

    final dynamic state = tester.state(find.byType(WritingScreen));
    final engine = state.engineForTesting as SessionEngine;

    final words = List.generate(60, (i) => 'w$i').join(' ');
    await _type(tester, words);

    // Counter clamps to 45 (blocked), no more.
    expect(engine.wordCount.value, 45);
    expect(find.textContaining('45 words'), findsOneWidget);
    expect(find.text('NEW TWEET'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
  });
}

/// Drives a text change through the real `onChanged` path:
/// controller value first (as the framework does), then the handler.
Future<void> _type(WidgetTester tester, String text) async {
  final editable = tester.widget<EditableText>(find.bySubtype<EditableText>());
  editable.controller.value = TextEditingValue(
    text: text,
    selection: TextSelection.collapsed(offset: text.length),
  );
  editable.onChanged?.call(text);
  await tester.pump();
}
