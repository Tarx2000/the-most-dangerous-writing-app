/// Isolated UI review harness. Run with `flutter run -t tool/redesign_preview.dart`.
/// All ratings, goals and preferences live in memory; no production DB writes.
library;

import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:liquid_glass_easy/liquid_glass_easy.dart';
import 'package:mda_flutter/app.dart';
import 'package:mda_flutter/core/rating_day.dart';
import 'package:mda_flutter/data/app_data.dart';
import 'package:mda_flutter/data/database/db.dart';
import 'package:sqflite/sqflite.dart' show inMemoryDatabasePath;
import 'package:mda_flutter/data/models/pillar.dart';
import 'package:mda_flutter/data/models/wellbeing_checkin.dart';
import 'package:mda_flutter/data/providers.dart';
import 'package:mda_flutter/data/security_providers.dart';
import 'package:mda_flutter/marionette_harness.dart';
import 'package:mda_flutter/domain/use_cases/session_engine.dart';
import 'package:mda_flutter/ui/features/writing/writing_screen.dart';

// Review-only VM entry points. Freeze the real editor at reproducible idle
// stages instead of racing an eight-second timer while taking screenshots.
void previewWriting() => goRouter.push<void>(
  '/writing',
  extra: {'timeIndex': 3, 'diffIndex': 1, 'mode': 'journal'},
);

SessionEngine? _previewEngine() {
  SessionEngine? engine;
  void visit(Element element) {
    if (element is StatefulElement && element.widget is WritingScreen) {
      final dynamic state = element.state;
      engine = state.engineForTesting as SessionEngine;
    }
    if (element.widget is EditableText) {
      final field = element.widget as EditableText;
      const text =
          'A little more space to think.\n\n'
          'The words keep moving, one sentence at a time. '
          'I do not need a perfect beginning. I only need to stay with the page.\n\n'
          'This is where the next thought begins.';
      field.controller.text = text;
      field.onChanged?.call(text);
    }
    element.visitChildren(visit);
  }

  WidgetsBinding.instance.rootElement?.visitChildren(visit);
  engine?.stopTimers();
  return engine;
}

void previewDangerEarly() => _previewEngine()?.idleRatio.value = 0.45;
void previewDangerMiddle() => _previewEngine()?.idleRatio.value = 0.75;
void previewDangerLate() => _previewEngine()?.idleRatio.value = 0.98;
void previewHideKeyboard() => FocusManager.instance.primaryFocus?.unfocus();
void previewDeath() =>
    _previewEngine()?.start(difficultyLimitMs: 1, sessionDurationMin: 15);

final List<FrameTiming> _frames = [];
bool _recordFrames = false;
void startFrameProbe() {
  _frames.clear();
  _recordFrames = true;
}

String stopFrameProbe() {
  _recordFrames = false;
  final build =
      _frames.map((f) => f.buildDuration.inMicroseconds / 1000).toList()
        ..sort();
  final raster =
      _frames.map((f) => f.rasterDuration.inMicroseconds / 1000).toList()
        ..sort();
  double percentile(List<double> values, double p) =>
      values.isEmpty ? 0 : values[((values.length - 1) * p).round()];
  return jsonEncode({
    'frames': _frames.length,
    'buildMedianMs': percentile(build, 0.5),
    'buildP95Ms': percentile(build, 0.95),
    'rasterMedianMs': percentile(raster, 0.5),
    'rasterP95Ms': percentile(raster, 0.95),
  });
}

class _PreviewStorage extends StorageNotifier {
  @override
  AppData build() {
    final today = RatingDay.at(DateTime.now()).date;
    return AppData(
      isLoaded: true,
      preferences: const PreferencesState(autoGenerateSummaries: false),
      wellbeing: [
        for (final (offset, score) in [
          (20, 3),
          (19, 4),
          (15, 7),
          (14, 6),
          (8, 4),
          (3, 8),
          (1, 9),
        ])
          WellbeingCheckin(
            dayKey: RatingDay(
              DateTime(today.year, today.month, today.day - offset),
            ).key,
            overall: score,
            domains: {
              for (final d in LifeDomain.values)
                d: (score + d.index % 3 - 1).clamp(0, 10),
            },
            completedWheelAt: DateTime(
              today.year,
              today.month,
              today.day - offset,
              12,
            ).millisecondsSinceEpoch,
            updatedAt: DateTime(
              today.year,
              today.month,
              today.day - offset,
              12,
            ).millisecondsSinceEpoch,
          ),
      ],
      pillars: [
        Pillar(
          id: 'rest',
          title: 'Rest before midnight',
          description: 'Make room for recovery.',
          type: PillarType.time,
          scope: PillarScope.daily,
          createdAt: DateTime(
            today.year,
            today.month,
            today.day - 5,
            12,
          ).millisecondsSinceEpoch,
        ),
        Pillar(
          id: 'focus',
          title: 'Focused work',
          type: PillarType.rating,
          scope: PillarScope.adaptive,
          createdAt: 0,
        ),
      ],
      pillarLogs: [
        for (var i = 1; i <= 6; i++)
          PillarLog(
            id: 'focus-$i',
            pillarId: 'focus',
            valueNum: (i + 3).toDouble(),
            timestamp: DateTime(
              today.year,
              today.month,
              today.day - i,
              12,
            ).millisecondsSinceEpoch,
          ),
      ],
    );
  }

  @override
  Future<void> loadAll({bool force = false}) async {}
  @override
  Future<List<Pillar>> getStableCheckinSelection(bool isWeekly) async =>
      getPillarsForCheckIn(isWeekly);
  @override
  Future<List<PillarLog>> getPillarLogs(String pillarId) async =>
      state.pillarLogs.where((l) => l.pillarId == pillarId).toList();
  @override
  Future<void> saveWellbeing(WellbeingCheckin entry) async =>
      state = state.copyWith(
        wellbeing: [
          entry,
          ...state.wellbeing.where((e) => e.dayKey != entry.dayKey),
        ],
      );
  @override
  Future<void> savePillarLog(PillarLog log) async => state = state.copyWith(
    pillarLogs: [
      ...state.pillarLogs.where(
        (l) =>
            !(l.pillarId == log.pillarId &&
                RatingDay.at(
                      DateTime.fromMillisecondsSinceEpoch(l.timestamp),
                    ).key ==
                    RatingDay.at(
                      DateTime.fromMillisecondsSinceEpoch(log.timestamp),
                    ).key),
      ),
      log,
    ],
  );
  @override
  Future<void> completeCheckin(int timestamp) async {}
  @override
  Future<void> upsertPillar(Pillar pillar) async => state = state.copyWith(
    pillars: [pillar, ...state.pillars.where((p) => p.id != pillar.id)],
  );
  @override
  Future<void> togglePillarActive(String id) async => state = state.copyWith(
    pillars: [
      for (final p in state.pillars)
        p.id == id ? p.copyWith(isActive: !p.isActive) : p,
    ],
  );
}

Future<void> main() async {
  final container = ProviderContainer(
    overrides: [appDataProvider.overrideWith(_PreviewStorage.new)],
  );
  ensureMarionette(container);
  setDatabasePathForTest(inMemoryDatabasePath);
  setPrefsAccess(() async => {}, (key, value) async {});
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  await SystemChrome.setEnabledSystemUIMode(
    SystemUiMode.manual,
    overlays: [SystemUiOverlay.bottom],
  );
  await LiquidGlassShaders.ensureLoaded();
  SchedulerBinding.instance.addTimingsCallback((frames) {
    if (_recordFrames && _frames.length < 2000) _frames.addAll(frames);
  });
  container.read(securityControllerProvider).debugUnlockAllForTest();
  runApp(
    UncontrolledProviderScope(container: container, child: const MdaApp()),
  );
}
