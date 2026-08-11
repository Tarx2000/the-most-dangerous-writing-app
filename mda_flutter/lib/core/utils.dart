/// Core utilities ported 1:1 from the RN app's `src/lib/utils.ts`.
/// All date logic is local-timezone based (streak days must never drift).
library;

import 'dart:math';

import 'config/app_config.dart';

/// Generates a unique id — base-36 millisecond timestamp + random suffix
/// (same shape as the RN `generateId()`, e.g. `lxyz1234_a7f3k9p`).
String generateId() {
  final ts = DateTime.now().millisecondsSinceEpoch.toRadixString(36);
  final suffix = Random().nextInt(0x7fffffff).toRadixString(36);
  return '${ts}_$suffix';
}

/// Local-timezone YYYY-MM-DD — the key format for streak days and date grouping.
String toLocalDateString(DateTime dt) {
  final y = dt.year.toString().padLeft(4, '0');
  final m = dt.month.toString().padLeft(2, '0');
  final d = dt.day.toString().padLeft(2, '0');
  return '$y-$m-$d';
}

/// Word count — the single source of truth (matches `countWords` in utils.ts).
int countWords(String text) {
  final trimmed = text.trim();
  if (trimmed.isEmpty) return 0;
  return trimmed.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).length;
}

/// Tweet classification: at or below [tweetThreshold] words.
bool isTweet(int wordCount) => wordCount <= tweetThreshold;

/// Streak eligibility — shared by saveNote and the boot-time recalculation.
bool isStreakEligible({
  required bool won,
  required int durationMin,
  required bool isQuickNote,
  required bool isTweet,
}) {
  return won && durationMin >= 3 && !isQuickNote && !isTweet;
}

/// Relative time like "2h ago" / "3d ago" (approximates `formatRelativeTime`).
String formatRelativeTime(DateTime dt) {
  final diff = DateTime.now().difference(dt);
  if (diff.inSeconds < 60) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 7) return '${diff.inDays}d ago';
  if (diff.inDays < 30) return '${(diff.inDays / 7).floor()}w ago';
  if (diff.inDays < 365) return '${(diff.inDays / 30).floor()}mo ago';
  return '${(diff.inDays / 365).floor()}y ago';
}

/// Session date label like the RN `formatSessionDate` (e.g. "Aug 11, 2026").
String formatSessionDate(DateTime dt) {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return '${months[dt.month - 1]} ${dt.day}, ${dt.year}';
}

/// Day label for calendar headers (e.g. "Mon").
String weekdayShort(DateTime dt) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  // DateTime.weekday: 1=Monday..7=Sunday
  return days[dt.weekday - 1];
}
