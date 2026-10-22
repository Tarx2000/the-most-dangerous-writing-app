/// Widget test for the WritingScreen core flow (SPEC §8):
/// render → type → word counter updates → idle death → overlay → resume.
///
/// Typing is driven through the EditableText's real `onChanged` handler
/// (the exact same code path as real input) so the flow is deterministic.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/core/utils.dart';
import 'package:mda_flutter/data/app_data.dart';
import 'package:mda_flutter/data/models/person.dart';
import 'package:mda_flutter/data/providers.dart';
import 'package:mda_flutter/data/security_providers.dart';
import 'package:mda_flutter/domain/use_cases/security_controller.dart';
import 'package:mda_flutter/domain/use_cases/session_engine.dart';
import 'package:mda_flutter/ui/features/circles/circle_picker_sheet.dart';
import 'package:mda_flutter/ui/features/writing/vaporizing_editable_text.dart';
import 'package:mda_flutter/ui/features/writing/writing_screen.dart';

class _TestAppDataNotifier extends StorageNotifier {
  final List<Person> _initialPersons;
  _TestAppDataNotifier([this._initialPersons = const []]);

  @override
  AppData build() => AppData(isLoaded: true, persons: _initialPersons);

  @override
  Future<String?> addPerson(String name) async {
    final p = Person(
      id: 'person_${state.persons.length + 1}',
      name: name,
      createdAt: 1000,
    );
    state = state.copyWith(persons: [...state.persons, p]);
    return p.id;
  }
}

Widget _wrap(Widget child, {List<Override> overrides = const []}) {
  return ProviderScope(
    overrides: overrides,
    child: MaterialApp(home: child),
  );
}

void main() {
  testWidgets('typing updates the word counter and the death flow works', (
    tester,
  ) async {
    await tester.pumpWidget(
      _wrap(
        const WritingScreen(
          params: WritingParams(
            timeIndex: 1,
            diffIndex: 1, // MID = 8 s idle limit
            mode: 'journal',
          ),
        ),
      ),
    );

    // The engine lives on the private state class — access it dynamically.
    final dynamic state = tester.state(find.byType(WritingScreen));
    final engine = state.engineForTesting as SessionEngine;

    // Session countdown visible (5 min = 05:00).
    expect(find.text('05:00'), findsOneWidget);
    expect(find.text('FREE WRITE'), findsNothing);

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

  testWidgets('tweet mode blocks typing past 45 words and preserves newlines', (
    tester,
  ) async {
    await tester.pumpWidget(
      _wrap(
        const WritingScreen(
          params: WritingParams(
            timeIndex: 0,
            diffIndex: 1,
            mode: 'journal',
            isTweet: true,
          ),
        ),
      ),
    );

    final dynamic state = tester.state(find.byType(WritingScreen));
    final engine = state.engineForTesting as SessionEngine;

    final words = List.generate(60, (i) => i == 10 ? 'w$i\n' : 'w$i').join(' ');
    await _type(tester, words);

    // Counter clamps to 45 (blocked), no more, and preserves line breaks.
    expect(engine.wordCount.value, 45);
    expect(find.textContaining('45 words'), findsOneWidget);
    expect(find.text('NEW TWEET'), findsNothing);
    final editable = tester.widget<EditableText>(
      find.bySubtype<EditableText>(),
    );
    expect(editable.controller.text.contains('\n'), isTrue);

    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'writing area stays above keyboard, SAVE ENTRY only appears when keyboard is dismissed, auto-scrolls, and supports selection + batch delete',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1.0;
      tester.view.viewInsets = const FakeViewPadding(bottom: 320);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetViewInsets);

      await tester.pumpWidget(
        _wrap(
          const WritingScreen(
            params: WritingParams(
              timeIndex: 1,
              diffIndex: 1,
              mode: 'journal',
              isQuickNote: true,
            ),
          ),
        ),
      );
      await tester.pump();

      // While keyboard is open, SAVE ENTRY stays hidden and TextField ends right at top of keyboard.
      expect(find.text('SAVE ENTRY'), findsNothing);
      final textFieldRect = tester.getRect(find.byType(TextField));
      expect(textFieldRect.bottom, closeTo(844 - 320, 0.5));

      // Type many lines so the content overflows the visible area above the keyboard.
      final manyLines = List.generate(
        35,
        (i) => 'Line number $i of text',
      ).join('\n');
      await _type(tester, manyLines);
      await tester.pump();

      final textField = tester.widget<TextField>(find.byType(TextField));
      expect(textField.enableInteractiveSelection, isTrue);
      final scrollController = textField.scrollController!;
      expect(scrollController.position.maxScrollExtent, greaterThan(0));
      expect(
        scrollController.offset,
        closeTo(scrollController.position.maxScrollExtent, 1.0),
      );

      // Select a batch of text and delete it.
      final editable = tester.widget<EditableText>(
        find.bySubtype<EditableText>(),
      );
      editable.controller.selection = const TextSelection(
        baseOffset: 0,
        extentOffset: 50,
      );
      await tester.pump();
      expect(editable.controller.selection.isCollapsed, isFalse);

      final remainingText = manyLines.substring(50);
      await _type(tester, remainingText);
      expect(editable.controller.text, remainingText);

      // Dismiss keyboard -> SAVE ENTRY appears at the bottom.
      tester.view.viewInsets = FakeViewPadding.zero;
      await tester.pump();
      expect(find.text('SAVE ENTRY'), findsOneWidget);

      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'CirclePickerBody filters best matches on top, shows Add Person at bottom, and confirms creation',
    (tester) async {
      String? selectedPersonId;
      final initialPersons = [
        const Person(id: 'p1', name: 'Johanna', createdAt: 100),
        const Person(id: 'p2', name: 'Anna', createdAt: 200),
        const Person(id: 'p3', name: 'Max', createdAt: 300),
      ];

      await tester.pumpWidget(
        _wrap(
          Scaffold(
            body: CirclePickerBody(
              selectedId: null,
              onSelect: (id) => selectedPersonId = id,
            ),
          ),
          overrides: [
            appDataProvider.overrideWith(
              () => _TestAppDataNotifier(initialPersons),
            ),
            securityControllerProvider.overrideWith((ref) {
              return SecurityController(
                storage: ref.watch(secureStorageServiceProvider),
              )..isCirclesUnlocked = true;
            }),
          ],
        ),
      );
      await tester.pumpAndSettle();

      // Search for "anna": exact match "Anna" should be ranked above substring match "Johanna",
      // and "Add Person" at the bottom.
      await tester.enterText(find.byType(TextField), 'anna');
      await tester.pumpAndSettle();

      expect(find.text('Anna'), findsOneWidget);
      expect(find.text('Johanna'), findsOneWidget);
      expect(find.text('Max'), findsNothing);
      expect(find.text('Add Person'), findsOneWidget);

      final annaY = tester.getCenter(find.text('Anna')).dy;
      final johannaY = tester.getCenter(find.text('Johanna')).dy;
      final addPersonY = tester.getCenter(find.text('Add Person')).dy;
      expect(annaY, lessThan(johannaY));
      expect(johannaY, lessThan(addPersonY));

      // Search for a non-existent person "Tarik": only "Add Person" is shown.
      await tester.enterText(find.byType(TextField), 'Tarik');
      await tester.pumpAndSettle();

      expect(find.text('Anna'), findsNothing);
      expect(find.text('Johanna'), findsNothing);
      expect(find.text('Max'), findsNothing);
      expect(find.text('Add Person'), findsOneWidget);

      // Tap "Add Person" -> ConfirmDialog appears -> tap "Yes" -> person is added and selected.
      await tester.tap(find.text('Add Person'));
      await tester.pumpAndSettle();

      expect(find.text('Yes'), findsOneWidget);
      await tester.tap(find.text('Yes'));
      await tester.pumpAndSettle();

      expect(selectedPersonId, 'person_4');
    },
  );

  test(
    'simultaneous word vaporization fades the entire displayed text together',
    () {
      const sample =
          'first second third fourth fifth sixth seventh eighth ninth tenth';
      const baseStyle = TextStyle(color: Color(0xFFFFFFFF), fontSize: 18);

      // Below threshold (<= 0.30): full opacity, single unsplit TextSpan.
      final spanIdle = buildVaporizingTextSpan(
        text: sample,
        ratio: 0.25,
        style: baseStyle,
      );
      expect(spanIdle.text, sample);
      expect(spanIdle.children, isNull);
      expect(spanIdle.style?.color?.a, closeTo(1.0, 0.001));

      // Mid danger (0.65): every word in the span fades simultaneously.
      final spanMid = buildVaporizingTextSpan(
        text: sample,
        ratio: 0.65,
        style: baseStyle,
      );
      expect(spanMid.text, sample);
      expect(spanMid.children, isNull);
      final midAlpha = spanMid.style!.color!.a;
      expect(midAlpha, lessThan(1.0));
      expect(midAlpha, greaterThan(vaporizeMinOpacity));

      // Peak danger (>= 0.95): reaches vaporizeMinOpacity across all words.
      final spanPeak = buildVaporizingTextSpan(
        text: sample,
        ratio: 0.96,
        style: baseStyle,
      );
      expect(spanPeak.style?.color?.a, closeTo(vaporizeMinOpacity, 0.001));

      // truncateToWords preserves line breaks while clamping word count.
      expect(
        truncateToWords('hello world\nthird fourth fifth', 3),
        'hello world\nthird',
      );
    },
  );
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
