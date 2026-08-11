/// Unit tests for the streak calculator (SPEC §8).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/domain/use_cases/streak_calculator.dart';

void main() {
  // Fixed "today" so the tests are deterministic.
  final today = DateTime(2026, 8, 11, 12);

  group('eligibility', () {
    test('non-eligible notes never touch the streak', () {
      final result = applyNoteToStreak(
        won: true,
        durationMin: 2,
        isQuickNote: false,
        isTweet: false,
        currentStreak: 5,
        lastWinDate: '2026-08-10',
        streakHistory: const ['2026-08-09', '2026-08-10'],
        now: today,
      );
      expect(result.streak, 5);
      expect(result.streakIncreased, isFalse);
      expect(result.history, hasLength(2));
    });

    test('lost sessions are not eligible', () {
      final result = applyNoteToStreak(
        won: false,
        durationMin: 5,
        isQuickNote: false,
        isTweet: false,
        currentStreak: 5,
        lastWinDate: '2026-08-10',
        streakHistory: const ['2026-08-10'],
        now: today,
      );
      expect(result.streak, 5);
    });

    test('tweets and quick notes are not eligible', () {
      for (final note in [
        (won: true, durationMin: 5, isQuickNote: false, isTweet: true),
        (won: true, durationMin: 5, isQuickNote: true, isTweet: false),
      ]) {
        final result = applyNoteToStreak(
          won: note.won,
          durationMin: note.durationMin,
          isQuickNote: note.isQuickNote,
          isTweet: note.isTweet,
          currentStreak: 3,
          lastWinDate: '2026-08-10',
          streakHistory: const ['2026-08-10'],
          now: today,
        );
        expect(result.streak, 3);
        expect(result.streakIncreased, isFalse);
      }
    });
  });

  group('streak progression', () {
    test('consecutive day → streak + 1', () {
      final result = applyNoteToStreak(
        won: true,
        durationMin: 5,
        isQuickNote: false,
        isTweet: false,
        currentStreak: 4,
        lastWinDate: '2026-08-10', // yesterday
        streakHistory: const ['2026-08-09', '2026-08-10'],
        now: today,
      );
      expect(result.streak, 5);
      expect(result.streakIncreased, isTrue);
      expect(result.history, contains('2026-08-11'));
    });

    test('gap → streak resets to 1 (no popup for an existing streak)', () {
      final result = applyNoteToStreak(
        won: true,
        durationMin: 5,
        isQuickNote: false,
        isTweet: false,
        currentStreak: 4,
        lastWinDate: '2026-08-05', // long gap
        streakHistory: const ['2026-08-05'],
        now: today,
      );
      expect(result.streak, 1);
      expect(result.streakIncreased, isFalse);
    });

    test('first win ever → streak 1 with popup', () {
      final result = applyNoteToStreak(
        won: true,
        durationMin: 5,
        isQuickNote: false,
        isTweet: false,
        currentStreak: 0,
        lastWinDate: '',
        streakHistory: const [],
        now: today,
      );
      expect(result.streak, 1);
      expect(result.streakIncreased, isTrue);
    });

    test('same-day repeat → unchanged', () {
      final result = applyNoteToStreak(
        won: true,
        durationMin: 5,
        isQuickNote: false,
        isTweet: false,
        currentStreak: 7,
        lastWinDate: '2026-08-11', // today
        streakHistory: const ['2026-08-11'],
        now: today,
      );
      expect(result.streak, 7);
      expect(result.streakIncreased, isFalse);
    });
  });
}
