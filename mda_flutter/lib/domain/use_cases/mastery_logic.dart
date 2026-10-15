/// Masteries & alignment domain logic (SPEC §10) — ported from
/// `storageOps.createPillarsOps` + `alignmentScores.ts`.
library;

import 'dart:math';

import '../../core/rating_day.dart';
import '../../data/models/pillar.dart';

/// Alignment tier for a score (0–10). Pure threshold table (SPEC §3/§10).
class AlignmentTier {
  const AlignmentTier({
    required this.minScore,
    required this.maxScore,
    required this.label,
    required this.emoji,
  });

  final int minScore;
  final int maxScore;
  final String label;
  final String emoji;
}

const List<AlignmentTier> alignmentTiers = [
  AlignmentTier(minScore: 0, maxScore: 2, label: 'Struggling', emoji: '😵'),
  AlignmentTier(minScore: 3, maxScore: 4, label: 'Drifting', emoji: '😕'),
  AlignmentTier(minScore: 5, maxScore: 5, label: 'Okay', emoji: '😐'),
  AlignmentTier(minScore: 6, maxScore: 7, label: 'Good', emoji: '😊'),
  AlignmentTier(minScore: 8, maxScore: 9, label: 'Great', emoji: '😄'),
  AlignmentTier(minScore: 10, maxScore: 10, label: 'Aligned', emoji: '😎'),
];

AlignmentTier getAlignmentTier(int score) {
  for (final tier in alignmentTiers) {
    if (score >= tier.minScore && score <= tier.maxScore) return tier;
  }
  return alignmentTiers.first;
}

/// Check-in rate limit (SPEC §10): 3 hours since the last pillar log.
const int checkinRateLimitMs = 3 * 60 * 60 * 1000;

/// Pick limits per check-in scope (SPEC §10): 2 daily/adaptive, 3 weekly.
const int dailyPickLimit = 2;
const int weeklyPickLimit = 3;

/// Picks pillars for the check-in (SPEC §10): filters by scope, shuffles
/// randomly, limits the count, and (weekly only) adds one smart advice card.
List<Pillar> pickPillarsForCheckIn({
  required List<Pillar> allPillars,
  required bool isWeekly,
  Random? random,
  List<PillarLog> logs = const [],
  DateTime? now,
}) {
  final rng = random ?? Random();
  final limit = isWeekly ? weeklyPickLimit : dailyPickLimit;
  final instant = now ?? DateTime.now();
  final eligible = allPillars
      .where((p) => p.isActive)
      .where(
        (p) => isWeekly
            ? effectiveScope(p, logs) != PillarScope.daily
            : effectiveScope(p, logs) != PillarScope.weekly,
      )
      .where((p) => masteryOverdueDays(p, logs, instant) >= 0)
      .toList();
  final result = <Pillar>[];
  while (eligible.isNotEmpty && result.length < limit) {
    final weights = [
      for (final p in eligible)
        pow(1 + masteryOverdueDays(p, logs, instant), 2).toDouble(),
    ];
    var roll = rng.nextDouble() * weights.reduce((a, b) => a + b);
    var index = weights.length - 1;
    for (var i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        index = i;
        break;
      }
    }
    result.add(eligible.removeAt(index));
  }
  return result;
}

RatingDay _logDay(PillarLog log) => log.dayKey == null
    ? RatingDay.at(DateTime.fromMillisecondsSinceEpoch(log.timestamp))
    : RatingDay.parse(log.dayKey!);

PillarScope effectiveScope(Pillar pillar, List<PillarLog> logs) =>
    pillar.scope == PillarScope.adaptive &&
        adaptiveProgress(pillar: pillar, logs: logs) >= 1
    ? PillarScope.weekly
    : pillar.scope;

/// -1 (or less) means not due. Zero means due today, so never-rated goals
/// and just-reactivated goals start without an artificial overdue bonus.
int masteryOverdueDays(Pillar pillar, List<PillarLog> logs, DateTime now) {
  if (!pillar.isActive) return -1;
  final own = logs.where((l) => l.pillarId == pillar.id).toList()
    ..sort((a, b) => a.timestamp.compareTo(b.timestamp));
  final today = RatingDay.at(now);
  final last = own.lastOrNull;
  if (pillar.reactivatedAt != null &&
      (last == null || last.timestamp < pillar.reactivatedAt!)) {
    return today.daysSince(
      RatingDay.at(DateTime.fromMillisecondsSinceEpoch(pillar.reactivatedAt!)),
    );
  }
  if (last != null && _logDay(last).key == today.key) return -1;
  if (last == null) {
    return pillar.createdAt <= 0
        ? 0
        : max(
            0,
            today.daysSince(
              RatingDay.at(
                DateTime.fromMillisecondsSinceEpoch(pillar.createdAt),
              ),
            ),
          );
  }
  final interval = effectiveScope(pillar, own) == PillarScope.weekly ? 7 : 1;
  return today.daysSince(_logDay(last)) - interval;
}

/// Weighted random advice pick (SPEC §10):
/// weight = max(0.1, daysSinceLastReflected) / (reflectionCount + 1) with a
/// 30-day staleness baseline so never-reflected cards get high weight.
AdviceCard? pickSmartAdvice({
  required List<AdviceCard> cards,
  int? nowMs,
  Random? random,
}) {
  if (cards.isEmpty) return null;
  final now = nowMs ?? DateTime.now().millisecondsSinceEpoch;
  final rng = random ?? Random();

  final weighted = <(AdviceCard, double)>[];
  var totalWeight = 0.0;
  for (final card in cards) {
    if (!card.isActive) continue;
    final last = card.lastReflectedAt ?? now - 30 * 24 * 60 * 60 * 1000;
    final daysSince = (now - last) / (24 * 60 * 60 * 1000);
    final weight = max(0.1, daysSince) / (card.reflectionCount + 1);
    weighted.add((card, weight));
    totalWeight += weight;
  }
  if (weighted.isEmpty) return cards.first;

  var roll = rng.nextDouble() * totalWeight;
  for (final (card, weight) in weighted) {
    roll -= weight;
    if (roll <= 0) return card;
  }
  return weighted.last.$1; // fallback (SPEC: last card)
}

/// Adaptive graduation progress = min(uniqueDays / adaptiveDays, 1).
/// Non-adaptive pillars always return 0 (SPEC §10).
double adaptiveProgress({
  required Pillar pillar,
  required List<PillarLog> logs,
}) {
  if (pillar.scope != PillarScope.adaptive) return 0;
  final uniqueDays = logs
      .where((log) => log.pillarId == pillar.id)
      .map(
        (log) =>
            log.dayKey ??
            RatingDay.at(
              DateTime.fromMillisecondsSinceEpoch(log.timestamp),
            ).key,
      )
      .toSet()
      .length;
  return (uniqueDays / max(1, pillar.adaptiveDays)).clamp(0.0, 1.0);
}

/// Sparkline values for the dashboard card: last 7 logs normalized 0–1.
List<double> sparklineValues(List<PillarLog> logs) {
  final numeric = logs.where((l) => l.valueNum != null).toList();
  final last7 = numeric.length <= 7
      ? numeric
      : numeric.sublist(numeric.length - 7);
  if (last7.isEmpty) return const [];
  final values = last7.map((l) => l.valueNum ?? 0).toList();
  final minV = values.reduce(min);
  final maxV = values.reduce(max);
  final range = maxV - minV;
  if (range == 0) return List.filled(values.length, 0.5);
  return [for (final v in values) (v - minV) / range];
}
