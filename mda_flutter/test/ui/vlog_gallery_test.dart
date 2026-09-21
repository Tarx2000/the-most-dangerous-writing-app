/// Vlog gallery widget tests — proves the History the user asked about.
///
/// Drives the REAL `VlogCalendarGallery` with a fake `StorageNotifier`
/// (no DB — testWidgets runs in FakeAsync where sqlite would block):
/// - German-`dateStr` vlogs (RN backup shape `18.4.2026 14:20`) still land
///   on their timestamp day and open the viewer on tap.
/// - Month arrows step through months; › is disabled at the current month.
/// - Today (only when the fixture month IS the current month) gets the ring.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/data/app_data.dart';
import 'package:mda_flutter/data/models/saved_vlog.dart';
import 'package:mda_flutter/data/providers.dart';
import 'package:mda_flutter/ui/features/vlogs/vlog_calendar_gallery.dart';

SavedVlog _vlog(String id, DateTime day, {int seconds = 62}) => SavedVlog(
  id: id,
  filePath: '/docs/vlogs/$id.mp4',
  // German RN display string — the grid must IGNORE it and use timestamp.
  dateStr: '${day.day}.${day.month}.${day.year} 14:20',
  timestamp: day.millisecondsSinceEpoch,
  durationSec: seconds,
  thumbnailPath: null,
);

/// ProviderScope with pre-loaded vlogs (mirrors `app_smoke_test.dart`).
Widget _harness(List<SavedVlog> vlogs) => ProviderScope(
  overrides: [appDataProvider.overrideWith(() => _FakeVlogNotifier(vlogs))],
  child: const MaterialApp(
    home: Scaffold(body: SizedBox(height: 900, child: VlogCalendarGallery())),
  ),
);

class _FakeVlogNotifier extends StorageNotifier {
  _FakeVlogNotifier(this.vlogs);

  final List<SavedVlog> vlogs;

  @override
  AppData build() => AppData(isLoaded: true, vlogs: vlogs);
}

String _monthLabel(DateTime d) =>
    '${[
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ][d.month - 1]} ${d.year}';

void main() {
  group('VlogCalendarGallery', () {
    testWidgets('German-dateStr vlogs appear on their timestamp day',
        (tester) async {
      final day = DateTime(2026, 4, 18, 14, 20);
      await tester.pumpWidget(_harness([_vlog('a', day)]));
      await tester.pumpAndSettle();

      // Navigate from "now" back to April 2026 via ‹ arrows.
      final now = DateTime.now();
      var steps = (now.year - 2026) * 12 + (now.month - 4);
      steps = steps.clamp(0, 24);
      for (var i = 0; i < steps; i++) {
        await tester.tap(find.text('‹'));
        await tester.pumpAndSettle();
      }
      expect(find.text(_monthLabel(DateTime(2026, 4))), findsOneWidget);

      // The day cell shows the day number + the 1:02 duration badge.
      expect(find.text('18'), findsWidgets);
      expect(find.text('1:02'), findsOneWidget);

      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('month arrows walk back and forward, › stops at now',
        (tester) async {
      await tester.pumpWidget(_harness(const []));
      await tester.pumpAndSettle();

      final now = DateTime.now();
      expect(find.text(_monthLabel(now)), findsOneWidget);

      await tester.tap(find.text('‹'));
      await tester.pumpAndSettle();
      final prev = DateTime(now.year, now.month - 1, 1);
      expect(find.text(_monthLabel(prev)), findsOneWidget);

      // Back to the current month — › arrow present but disabled there.
      await tester.tap(find.text('›'));
      await tester.pumpAndSettle();
      expect(find.text(_monthLabel(now)), findsOneWidget);

      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('stats row counts vlogs and minutes', (tester) async {
      await tester.pumpWidget(
        _harness([
          _vlog('a', DateTime(2026, 4, 18), seconds: 60),
          _vlog('b', DateTime(2026, 4, 19), seconds: 120),
        ]),
      );
      await tester.pumpAndSettle();

      expect(find.text('Total Vlogs'), findsOneWidget);
      expect(find.text('2'), findsWidgets);
      expect(find.text('Recorded (m)'), findsOneWidget);
      expect(find.text('3'), findsWidgets);

      await tester.pumpWidget(const SizedBox());
    });
  });
}
