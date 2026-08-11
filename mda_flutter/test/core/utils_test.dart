/// Unit tests for the core utils — parity with the RN `utils.test.ts`.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/core/utils.dart';

void main() {
  group('countWords', () {
    test('counts whitespace-separated words', () {
      expect(countWords('hello world'), 2);
      expect(countWords('  hello   world  '), 2);
      expect(countWords(''), 0);
      expect(countWords('   '), 0);
      expect(countWords('one'), 1);
    });
  });

  group('isTweet', () {
    test('threshold boundary at 45 words', () {
      expect(isTweet(45), true);
      expect(isTweet(44), true);
      expect(isTweet(46), false);
    });
  });

  group('isStreakEligible', () {
    test('requires won, >=3 min, not quick, not tweet', () {
      expect(isStreakEligible(won: true, durationMin: 3, isQuickNote: false, isTweet: false), true);
      expect(isStreakEligible(won: false, durationMin: 3, isQuickNote: false, isTweet: false), false);
      expect(isStreakEligible(won: true, durationMin: 2, isQuickNote: false, isTweet: false), false);
      expect(isStreakEligible(won: true, durationMin: 3, isQuickNote: true, isTweet: false), false);
      expect(isStreakEligible(won: true, durationMin: 3, isQuickNote: false, isTweet: true), false);
      // Check-in reflections (durationMin 1) are never streak-eligible.
      expect(isStreakEligible(won: true, durationMin: 1, isQuickNote: false, isTweet: false), false);
    });
  });

  group('toLocalDateString', () {
    test('formats local YYYY-MM-DD with zero padding', () {
      expect(toLocalDateString(DateTime(2026, 1, 5)), '2026-01-05');
      expect(toLocalDateString(DateTime(2026, 12, 31)), '2026-12-31');
    });
  });

  group('generateId', () {
    test('produces unique ids', () {
      final a = generateId();
      final b = generateId();
      expect(a, isNot(equals(b)));
      expect(a, isNotEmpty);
    });
  });

  group('formatRelativeTime', () {
    test('handles minutes/hours/days', () {
      final now = DateTime.now();
      expect(formatRelativeTime(now.subtract(const Duration(minutes: 5))), '5m ago');
      expect(formatRelativeTime(now.subtract(const Duration(hours: 3))), '3h ago');
      expect(formatRelativeTime(now.subtract(const Duration(days: 2))), '2d ago');
    });
  });
}
