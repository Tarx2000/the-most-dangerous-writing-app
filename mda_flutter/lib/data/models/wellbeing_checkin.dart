import 'dart:convert';

import '../../core/rating_day.dart';

enum LifeDomain {
  health('Health'),
  work('Work & career'),
  finances('Finances'),
  familyFriends('Family & friends'),
  partnership('Partnership'),
  growth('Personal growth'),
  recreation('Rest & recreation'),
  home('Living environment');

  const LifeDomain(this.label);
  final String label;
}

/// An observation, independent of whether a reflection was written.
class WellbeingCheckin {
  WellbeingCheckin({
    required this.dayKey,
    this.overall,
    Map<LifeDomain, int> domains = const {},
    this.completedWheelAt,
    required this.updatedAt,
  }) : domains = Map.unmodifiable(domains) {
    RatingDay.parse(dayKey);
    if (completedWheelAt != null && domains.isEmpty) {
      throw ArgumentError('A completed wheel needs an actual domain rating.');
    }
    if ((overall != null && (overall! < 0 || overall! > 10)) ||
        domains.values.any((v) => v < 0 || v > 10)) {
      throw ArgumentError('Wellbeing scores must be between 0 and 10');
    }
  }

  final String dayKey;
  final int? overall;
  final Map<LifeDomain, int> domains;
  final int? completedWheelAt;
  final int updatedAt;

  int? score(LifeDomain? domain) => domain == null ? overall : domains[domain];

  Map<String, Object?> toRow() => {
    'day_key': dayKey,
    'overall': overall,
    'domains': jsonEncode({
      for (final e in domains.entries) e.key.name: e.value,
    }),
    'completed_wheel_at': completedWheelAt,
    'updated_at': updatedAt,
  };

  factory WellbeingCheckin.fromRow(Map<String, Object?> row) {
    final raw = jsonDecode(row['domains'] as String);
    if (raw is! Map<String, dynamic>) {
      throw const FormatException('Invalid domains');
    }
    final domains = <LifeDomain, int>{};
    for (final e in raw.entries) {
      final domain = LifeDomain.values
          .where((d) => d.name == e.key)
          .firstOrNull;
      if (domain == null || e.value is! int) {
        throw const FormatException('Invalid domain score');
      }
      domains[domain] = e.value as int;
    }
    return WellbeingCheckin(
      dayKey: row['day_key'] as String,
      overall: row['overall'] as int?,
      domains: domains,
      completedWheelAt: row['completed_wheel_at'] as int?,
      updatedAt: row['updated_at'] as int,
    );
  }
}
