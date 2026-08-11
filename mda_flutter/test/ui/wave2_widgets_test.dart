/// Widget tests for Wave 2 components: CalendarView (record-day rendering,
/// month navigation) and NoteViewerModal (sections render, delete confirm).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/core/theme/app_colors.dart';
import 'package:mda_flutter/core/utils.dart';
import 'package:mda_flutter/data/models/saved_note.dart';
import 'package:mda_flutter/ui/core/widgets/calendar_view.dart';
import 'package:mda_flutter/ui/features/library/note_viewer_modal.dart';

void main() {
  group('CalendarView', () {
    testWidgets('record days get the danger fill and today gets a ring',
        (tester) async {
      final now = DateTime.now();
      final today = toLocalDateString(now);
      final yesterday = toLocalDateString(now.subtract(const Duration(days: 1)));

      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: CalendarView(
              currentStreak: 2,
              streakHistory: [today, yesterday],
            ),
          ),
        ),
      ));

      // Hero streak title.
      expect(find.textContaining('2-day'), findsOneWidget);

      // Record day cell → danger fill.
      final recordCell = tester.widget<Container>(
        find.byKey(ValueKey('cal-day-$today')),
      );
      final recordDecor = recordCell.decoration as BoxDecoration;
      expect(recordDecor.color, AppColors.primaryAction);

      // Normal day cell → no fill.
      final plainDay = now.day >= 3 ? now.day - 2 : now.day + 1;
      final plainDate = toLocalDateString(DateTime(now.year, now.month, plainDay));
      final plainCell = tester.widget<Container>(
        find.byKey(ValueKey('cal-day-$plainDate')),
      );
      final plainDecor = plainCell.decoration as BoxDecoration;
      expect(plainDecor.color, isNull);

      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('month arrows navigate back in time', (tester) async {
      final now = DateTime.now();
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: CalendarView(currentStreak: 0, streakHistory: const []),
          ),
        ),
      ));

      final currentLabel =
          '${_monthName(now.month)} ${now.year}';
      expect(find.text(currentLabel), findsOneWidget);

      // Go one month back.
      await tester.tap(find.text('‹'));
      await tester.pumpAndSettle(const Duration(milliseconds: 400));
      final prevMonth = DateTime(now.year, now.month - 1, 1);
      expect(
        find.text('${_monthName(prevMonth.month)} ${prevMonth.year}'),
        findsOneWidget,
      );

      // Forward arrow re-enabled.
      await tester.tap(find.text('›'));
      await tester.pumpAndSettle(const Duration(milliseconds: 400));
      expect(find.text(currentLabel), findsOneWidget);

      await tester.pumpWidget(const SizedBox());
    });
  });

  group('NoteViewerModal', () {
    testWidgets('renders title, meta, summary and delete confirm',
        (tester) async {
      final note = SavedNote(
        id: 'n1',
        text: 'A long enough entry text that is not a tweet and has words. '
            'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do.',
        dateStr: '2026-08-11',
        timestamp: 1,
        durationMin: 5,
        won: true,
        aiTitle: 'My First Title',
        aiSummary: const ['bullet one', 'bullet two'],
      );

      await tester.pumpWidget(ProviderScope(
        child: MaterialApp(
          home: NoteViewerModal(note: note, onClose: () {}),
        ),
      ));

      expect(find.text('My First Title'), findsOneWidget);
      expect(find.text('AI SUMMARY'), findsOneWidget);
      expect(find.textContaining('bullet one'), findsOneWidget);
      expect(find.text('Delete Entry'), findsOneWidget);

      // Delete opens the inline confirm.
      await tester.tap(find.text('Delete Entry'));
      await tester.pump();
      expect(find.text('Delete this entry forever?'), findsOneWidget);

      // Cancel closes the confirm.
      await tester.tap(find.text('Cancel'));
      await tester.pump();
      expect(find.text('Delete this entry forever?'), findsNothing);

      await tester.pumpWidget(const SizedBox());
    });
  });
}

String _monthName(int month) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return months[month - 1];
}
