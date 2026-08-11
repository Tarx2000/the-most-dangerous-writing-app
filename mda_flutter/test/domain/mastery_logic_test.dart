/// Mastery domain logic tests (SPEC §10) — check-in pick, smart advice,
/// adaptive progress, alignment tiers, version bumping.
library;

import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/data/database/db.dart';
import 'package:mda_flutter/data/models/pillar.dart';
import 'package:mda_flutter/data/providers.dart';
import 'package:mda_flutter/domain/use_cases/mastery_logic.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

Pillar _pillar(String id, PillarScope scope) => Pillar(
      id: id,
      title: id,
      type: PillarType.rating,
      scope: scope,
      createdAt: 1,
      adaptiveDays: 14,
    );

void main() {
  group('getAlignmentTier', () {
    test('maps scores to tiers', () {
      expect(getAlignmentTier(1).label, 'Struggling');
      expect(getAlignmentTier(5).label, 'Okay');
      expect(getAlignmentTier(7).label, 'Good');
      expect(getAlignmentTier(10).label, 'Aligned');
      expect(getAlignmentTier(10).emoji, '😎');
    });
  });

  group('pickPillarsForCheckIn', () {
    test('daily picks 2 from daily+adaptive; weekly picks 3 from weekly+adaptive',
        () {
      final pillars = [
        _pillar('a', PillarScope.daily),
        _pillar('b', PillarScope.daily),
        _pillar('c', PillarScope.adaptive),
        _pillar('d', PillarScope.weekly),
        _pillar('e', PillarScope.weekly),
      ];
      final rng = Random(42);

      final daily = pickPillarsForCheckIn(allPillars: pillars, isWeekly: false, random: rng);
      expect(daily.length, 2);
      expect(daily.every((p) => p.scope == PillarScope.daily || p.scope == PillarScope.adaptive), isTrue);

      final weekly = pickPillarsForCheckIn(allPillars: pillars, isWeekly: true, random: rng);
      expect(weekly.length, 3);
      expect(weekly.every((p) => p.scope == PillarScope.weekly || p.scope == PillarScope.adaptive), isTrue);
    });

    test('skips inactive pillars', () {
      final pillars = [
        _pillar('a', PillarScope.daily),
        _pillar('b', PillarScope.daily).copyWith(isActive: false),
      ];
      final picked = pickPillarsForCheckIn(allPillars: pillars, isWeekly: false, random: Random(1));
      expect(picked.single.id, 'a');
    });
  });

  group('pickSmartAdvice', () {
    test('never-reflected cards get high weight (staleness baseline)', () {
      final now = DateTime.now().millisecondsSinceEpoch;
      final cards = [
        AdviceCard(
          id: 'fresh',
          text: 'reflected yesterday',
          createdAt: 1,
          lastReflectedAt: now - 24 * 60 * 60 * 1000,
          reflectionCount: 3,
        ),
        AdviceCard(id: 'stale', text: 'never reflected', createdAt: 1),
      ];
      // Deterministic: draw until we've seen a few samples.
      final rng = Random(7);
      var staleWins = 0;
      for (var i = 0; i < 20; i++) {
        final pick = pickSmartAdvice(cards: cards, nowMs: now, random: rng);
        if (pick?.id == 'stale') staleWins++;
      }
      expect(staleWins, greaterThan(10));
    });

    test('returns null on empty cards', () {
      expect(pickSmartAdvice(cards: const []), isNull);
    });
  });

  group('adaptiveProgress', () {
    test('counts unique days against adaptiveDays', () {
      final pillar = _pillar('a', PillarScope.adaptive);
      final day = DateTime.now();
      final logs = [
        for (var i = 0; i < 5; i++)
          PillarLog(
            id: 'l$i',
            pillarId: 'a',
            valueNum: 5,
            valueStr: '5',
            timestamp: day.subtract(Duration(days: i)).millisecondsSinceEpoch,
          ),
      ];
      final progress = adaptiveProgress(pillar: pillar, logs: logs);
      expect(progress, closeTo(5 / 14, 0.001));

      // Same-day logs count once.
      final sameDayLogs = [
        for (var i = 0; i < 20; i++)
          PillarLog(
            id: 's$i',
            pillarId: 'a',
            valueNum: 5,
            valueStr: '5',
            timestamp: day.millisecondsSinceEpoch + i,
          ),
      ];
      expect(adaptiveProgress(pillar: pillar, logs: sameDayLogs), closeTo(1 / 14, 0.001));
    });

    test('non-adaptive pillars are always 0', () {
      final pillar = _pillar('a', PillarScope.daily);
      expect(adaptiveProgress(pillar: pillar, logs: const []), 0);
    });
  });

  group('upsertPillar version bump (integration)', () {
    setUpAll(() {
      TestWidgetsFlutterBinding.ensureInitialized();
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
      setDatabasePathForTest(inMemoryDatabasePath);
    });

    setUp(() {
      setPrefsAccess(() async => {}, (key, value) async {});
    });

    tearDown(() async {
      await closeDb();
    });

    test('new pillar gets version 1; content change bumps to 2', () async {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      final notifier = container.read(appDataProvider.notifier);
      await notifier.loadAll();

      final pillar = Pillar(
        id: 'p1',
        title: 'Sleep',
        type: PillarType.rating,
        scope: PillarScope.daily,
        createdAt: DateTime.now().millisecondsSinceEpoch,
        version: 1,
      );
      await notifier.upsertPillar(pillar);
      expect(container.read(pillarsProvider).first.version, 1);

      // Identical re-save → no bump.
      await notifier.upsertPillar(pillar);
      expect(container.read(pillarsProvider).first.version, 1);

      // Description changed → bump.
      await notifier.upsertPillar(pillar.copyWith(description: () => 'deeper sleep'));
      expect(container.read(pillarsProvider).first.version, 2);

      // Title changed → bump.
      await notifier.upsertPillar(
          pillar.copyWith(description: () => 'deeper sleep', title: 'Sleep Better'));
      final updated = container.read(pillarsProvider).first;
      expect(updated.version, 3);
      expect(updated.title, 'Sleep Better');

      final version = await notifier.getPillarVersion('p1', 3);
      expect(version?.title, 'Sleep Better');
    });
  });
}
