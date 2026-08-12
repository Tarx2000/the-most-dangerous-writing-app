/// DeveloperToolsPanel — dev-mode gated tools (port of `DeveloperToolsPanel.tsx`).
/// Benchmark modal · AsyncStorage/DB inspector · log mode · sandbox.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/haptics.dart';
import '../../../core/logger.dart';
import '../../../core/theme/app_colors.dart';
import '../../../data/database/db.dart';
import '../../../data/providers.dart';
import '../../core/widgets/animated_scale_button.dart';
import '../../core/widgets/base_modal.dart';
import '../../core/widgets/settings_primitives.dart';

class DeveloperToolsPanel extends ConsumerWidget {
  const DeveloperToolsPanel({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final devMode = ref.watch(preferencesProvider).devMode;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SettingsSectionHeader('DEVELOPER TOOLS', icon: 'developerBoard'),
        const SizedBox(height: 12),
        SettingsCard(
          active: devMode,
          children: [
            SettingsRow(
              icon: 'flaskOutline',
              title: 'Developer Mode',
              subtitle: devMode ? 'Dev tools enabled' : 'Long-press the settings cog to enable',
              value: devMode ? 'ON' : 'OFF',
              valueColor: devMode ? AppColors.gold : null,
            ),
            if (devMode) ...[
              const SettingsDivider(),
              SettingsRow(
                icon: 'stopwatchOutline',
                title: 'Benchmark',
                subtitle: 'Run a startup performance benchmark',
                onTap: () => _openBenchmark(context, ref),
              ),
              const SettingsDivider(),
              SettingsRow(
                icon: 'databaseOutline',
                title: 'Database Inspector',
                subtitle: 'Inspect SQLite contents',
                onTap: () => _openInspector(context, ref),
              ),
              const SettingsDivider(),
              SettingsRow(
                icon: 'fileDocumentOutline',
                title: 'Log Mode',
                subtitle: 'Verbose logging to console',
                value: getLogMode() ? 'ON' : 'OFF',
                onTap: () {
                  final next = !getLogMode();
                  ref.read(appDataProvider.notifier).setPreference(logMode: next);
                },
              ),
            ],
          ],
        ),
      ],
    );
  }

  void _openBenchmark(BuildContext context, WidgetRef ref) {
    showBaseModal(
      context,
      title: 'Benchmark',
      heightFactor: 0.5,
      builder: (close) => BenchmarkView(ref: ref),
    );
  }

  void _openInspector(BuildContext context, WidgetRef ref) {
    showBaseModal(
      context,
      title: 'Database Inspector',
      heightFactor: 0.7,
      builder: (close) => InspectorView(ref: ref),
    );
  }
}

/// Minimal benchmark: counts rows + measures a load cycle.
class BenchmarkView extends ConsumerWidget {
  const BenchmarkView({super.key, required this.ref});

  final WidgetRef ref;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      children: [
        const Text(
          'Startup timing is logged via perf markers.',
          style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
        ),
        const SizedBox(height: 16),
        AnimatedScaleButton(
          onPress: () async {
            vibrate(HapticPatterns.dialPress);
            final sw = Stopwatch()..start();
            await getAll('SELECT COUNT(*) AS c FROM notes');
            final notesMs = sw.elapsedMilliseconds;
            sw.reset();
            sw.start();
            await getAll('SELECT COUNT(*) AS c FROM pillar_logs');
            final logsMs = sw.elapsedMilliseconds;
            sw.reset();
            sw.start();
            await getAll('SELECT COUNT(*) AS c FROM vlogs');
            final vlogsMs = sw.elapsedMilliseconds;

            if (context.mounted) {
              showBaseModal(context, title: 'Results', heightFactor: 0.4,
                  builder: (close) => Column(children: [
                        _resultRow('notes', notesMs),
                        _resultRow('pillar_logs', logsMs),
                        _resultRow('vlogs', vlogsMs),
                      ]));
            }
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.primaryAction,
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Text(
              'RUN BENCHMARK',
              style: TextStyle(
                color: AppColors.primaryActionText,
                fontSize: 14,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _resultRow(String label, int ms) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 14)),
            Text('$ms ms', style: const TextStyle(color: AppColors.textPrimary, fontSize: 14)),
          ],
        ),
      );
}

/// Row counts per table.
class InspectorView extends ConsumerWidget {
  const InspectorView({super.key, required this.ref});

  final WidgetRef ref;

  static const _tables = [
    'notes', 'persons', 'vlogs', 'settings', 'pillars', 'advice_cards',
    'pillar_logs', 'pillar_versions', 'ai_jobs', 'ai_logs',
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FutureBuilder<List<Map<String, Object?>>>(
      future: _loadCounts(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator(color: AppColors.primaryAction));
        }
        final counts = snapshot.data!;
        return ListView.builder(
          itemCount: counts.length,
          itemBuilder: (context, index) {
            final row = counts[index];
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    row['table'] as String,
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
                  ),
                  Text(
                    '${row['count']}',
                    style: const TextStyle(color: AppColors.textPrimary, fontSize: 13),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Future<List<Map<String, Object?>>> _loadCounts() async {
    final result = <Map<String, Object?>>[];
    for (final table in _tables) {
      try {
        final rows = await getAll('SELECT COUNT(*) AS c FROM $table');
        result.add({'table': table, 'count': rows.first['c'] ?? 0});
      } catch (_) {
        result.add({'table': table, 'count': '?'});
      }
    }
    return result;
  }
}
