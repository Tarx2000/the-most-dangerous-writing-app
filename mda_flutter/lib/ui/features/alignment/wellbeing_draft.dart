import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/models/wellbeing_checkin.dart';
import '../../../data/providers.dart';

class WellbeingDraft {
  WellbeingDraft({
    required this.dayKey,
    this.overall,
    Map<LifeDomain, int> domains = const {},
    this.fullWheel = false,
  }) : domains = Map.unmodifiable(domains);
  final String dayKey;
  final int? overall;
  final Map<LifeDomain, int> domains;
  final bool fullWheel;
  bool get hasRatings => overall != null || domains.isNotEmpty;
}

class WellbeingDraftNotifier extends StateNotifier<WellbeingDraft> {
  WellbeingDraftNotifier(String dayKey, WellbeingCheckin? existing)
    : super(
        WellbeingDraft(
          dayKey: dayKey,
          overall: existing?.overall,
          domains: existing?.domains ?? const {},
        ),
      );

  void setOverall(int? value) => state = WellbeingDraft(
    dayKey: state.dayKey,
    overall: value,
    domains: state.domains,
    fullWheel: state.fullWheel,
  );
  void setDomain(LifeDomain domain, int? value) {
    final values = {...state.domains};
    if (value == null) {
      values.remove(domain);
    } else {
      values[domain] = value;
    }
    state = WellbeingDraft(
      dayKey: state.dayKey,
      overall: state.overall,
      domains: values,
      fullWheel: state.fullWheel,
    );
  }

  void setFullWheel(bool full) => state = WellbeingDraft(
    dayKey: state.dayKey,
    overall: state.overall,
    domains: state.domains,
    fullWheel: full,
  );
}

final wellbeingDraftProvider = StateNotifierProvider.autoDispose
    .family<WellbeingDraftNotifier, WellbeingDraft, String>((ref, dayKey) {
      final existing = ref
          .read(wellbeingProvider)
          .where((e) => e.dayKey == dayKey)
          .firstOrNull;
      return WellbeingDraftNotifier(dayKey, existing);
    });
