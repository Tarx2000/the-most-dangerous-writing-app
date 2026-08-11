/// Streak calculation — pure logic ported from `storageOps.saveNote`
/// and `utils.isStreakEligible` (SPEC §8).
library;

import '../../core/utils.dart';

/// Result of applying a note to the streak.
class StreakResult {
  const StreakResult({
    required this.streak,
    required this.streakIncreased,
    required this.history,
  });

  final int streak;
  final bool streakIncreased;
  final List<String> history;
}

/// Applies a newly saved note to the streak state.
///
/// Rules (SPEC §8):
///  - Only streak-eligible notes count: `won && durationMin >= 3 &&
///    !isQuickNote && !isTweet` (vlogs/check-ins never count).
///  - Consecutive day (`lastWinDate == yesterday`) → streak + 1.
///  - Gap (`lastWinDate != yesterday && != today`) → streak resets to 1.
///  - Same-day repeat → no change.
///  - `streakIncreased` is true on +1, or when a fresh streak starts
///    from a previous streak of 0.
StreakResult applyNoteToStreak({
  required bool won,
  required int durationMin,
  required bool isQuickNote,
  required bool isTweet,
  required int currentStreak,
  required String lastWinDate,
  required List<String> streakHistory,
  DateTime? now,
}) {
  final today = toLocalDateString(now ?? DateTime.now());
  final eligible = isStreakEligible(
    won: won,
    durationMin: durationMin,
    isQuickNote: isQuickNote,
    isTweet: isTweet,
  );
  if (!eligible) {
    return StreakResult(
      streak: currentStreak,
      streakIncreased: false,
      history: streakHistory,
    );
  }

  final yesterday = toLocalDateString((now ?? DateTime.now()).subtract(const Duration(days: 1)));
  final history = <String>[...streakHistory, today];

  if (lastWinDate == yesterday) {
    // Consecutive day → streak grows.
    return StreakResult(
      streak: currentStreak + 1,
      streakIncreased: true,
      history: history,
    );
  }
  if (lastWinDate != today) {
    // Gap (or first win ever) → fresh streak of 1.
    return StreakResult(
      streak: 1,
      streakIncreased: currentStreak == 0,
      history: history,
    );
  }
  // Same-day repeat → unchanged.
  return StreakResult(
    streak: currentStreak,
    streakIncreased: false,
    history: streakHistory,
  );
}
