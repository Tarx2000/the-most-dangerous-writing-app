/// Vlog calendar grouping tests — the regression that hid every video.
///
/// The RN backups carry German display strings in `date_str`
/// (`18.4.2026 14:20`), so any grid that looks days up by `dateStr` shows an
/// empty calendar even with 13 videos restored. RN groups by LOCAL calendar
/// day derived from `timestamp` (key `year-month-day`); this suite pins that.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/data/models/saved_vlog.dart';
import 'package:mda_flutter/ui/features/vlogs/vlog_calendar_gallery.dart';

SavedVlog _vlog(String id, int timestampMs) => SavedVlog(
  id: id,
  filePath: '/docs/vlogs/$id.mp4',
  dateStr: '18.4.2026 14:20', // German RN display string — must be IGNORED.
  timestamp: timestampMs,
  durationSec: 60,
);

void main() {
  group('groupVlogsByLocalDay', () {
    test('groups by timestamp day, newest first', () {
      final day1a = DateTime(2026, 4, 18, 10, 0).millisecondsSinceEpoch;
      final day1b = DateTime(2026, 4, 18, 14, 20).millisecondsSinceEpoch;
      final day2 = DateTime(2026, 4, 19, 1, 0).millisecondsSinceEpoch;
      final grouped = groupVlogsByLocalDay([
        _vlog('a', day1a),
        _vlog('b', day2),
        _vlog('c', day1b),
      ]);
      expect(grouped.keys, containsAll(['2026-4-18', '2026-4-19']));
      expect(
        grouped['2026-4-18']!.map((v) => v.id).toList(),
        ['c', 'a'],
        reason: 'newest first within a day (RN parity)',
      );
    });

    test('ignores German dateStr from RN backups', () {
      // All three rows share the SAME German display string, but their
      // timestamps fall on different days — grouping by dateStr would merge
      // them into one phantom day and show nothing.
      final grouped = groupVlogsByLocalDay([
        _vlog(
          'a',
          DateTime(2026, 3, 31, 2, 42).millisecondsSinceEpoch,
        ),
        _vlog('b', DateTime(2026, 4, 9, 23, 10).millisecondsSinceEpoch),
        _vlog('c', DateTime(2026, 5, 3, 3, 10).millisecondsSinceEpoch),
      ]);
      expect(grouped.length, 3);
      expect(grouped.keys, containsAll(['2026-3-31', '2026-4-9', '2026-5-3']));
    });

    test('midnight boundary splits days (local time)', () {
      final before = DateTime(2026, 4, 18, 23, 59).millisecondsSinceEpoch;
      final after = DateTime(2026, 4, 19, 0, 1).millisecondsSinceEpoch;
      final grouped = groupVlogsByLocalDay([
        _vlog('a', before),
        _vlog('b', after),
      ]);
      expect(grouped.length, 2);
    });

    test('empty input yields empty map', () {
      expect(groupVlogsByLocalDay(const []), isEmpty);
    });
  });

  group('vlogDayKey', () {
    test('formats a timestamp as local YYYY-MM-DD', () {
      final ts = DateTime(2026, 8, 11, 21, 54).millisecondsSinceEpoch;
      expect(vlogDayKey(ts), '2026-08-11');
    });
  });
}
