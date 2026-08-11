/// PillarsDashboardScreen — Masteries dashboard (SPEC §10).
/// Active / Paused sections, inline create modal (title, description, type,
/// scope, adaptive days), progress X/14 + sparkline per card.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../core/utils.dart';
import '../../../data/models/pillar.dart';
import '../../../data/providers.dart';
import '../../../domain/use_cases/mastery_logic.dart';
import '../../core/widgets/animated_scale_button.dart';
import '../../core/widgets/base_modal.dart';

class PillarsDashboardScreen extends ConsumerStatefulWidget {
  const PillarsDashboardScreen({super.key});

  @override
  ConsumerState<PillarsDashboardScreen> createState() => _PillarsDashboardScreenState();
}

class _PillarsDashboardScreenState extends ConsumerState<PillarsDashboardScreen> {
  @override
  Widget build(BuildContext context) {
    final pillars = ref.watch(pillarsProvider);
    final active = pillars.where((p) => p.isActive).toList();
    final paused = pillars.where((p) => !p.isActive).toList();

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 16, 0),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => context.pop(),
                    icon: Icon(Mdi.get('arrowLeft'), color: AppColors.textSecondary),
                  ),
                  Icon(Mdi.get('pillar'), color: AppColors.gold, size: 24),
                  const SizedBox(width: 10),
                  const Text(
                    'Masteries',
                    style: TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 26,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const Spacer(),
                  AnimatedScaleButton(
                    onPress: _openCreateModal,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                      decoration: BoxDecoration(
                        color: AppColors.dangerTint,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: AppColors.dangerBorder, width: 1),
                      ),
                      child: Row(
                        children: [
                          Icon(Mdi.get('plus'), color: AppColors.primaryAction, size: 16),
                          const SizedBox(width: 6),
                          const Text(
                            'New Mastery',
                            style: TextStyle(
                              color: AppColors.primaryAction,
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                children: [
                  if (active.isEmpty && paused.isEmpty)
                    const Padding(
                      padding: EdgeInsets.only(top: 140),
                      child: Center(
                        child: Text(
                          'No masteries yet — create your first growth area.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: AppColors.textMuted, fontSize: 14),
                        ),
                      ),
                    ),
                  for (final pillar in active)
                    _PillarCard(pillar: pillar, paused: false),
                  if (paused.isNotEmpty) ...[
                    const Padding(
                      padding: EdgeInsets.fromLTRB(8, 20, 8, 8),
                      child: Text(
                        'PAUSED',
                        style: TextStyle(
                          color: AppColors.textSecondary,
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.5,
                        ),
                      ),
                    ),
                    for (final pillar in paused)
                      _PillarCard(pillar: pillar, paused: true),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _openCreateModal() {
    showBaseModal(
      context,
      title: 'New Mastery',
      heightFactor: 0.85,
      builder: (close) => _PillarFormModal(
        onSave: (pillar) async {
          await ref.read(appDataProvider.notifier).upsertPillar(pillar);
          vibrate(HapticPatterns.unlockSuccess);
        },
        onClose: close,
      ),
    );
  }
}

/// Pillar card: title, type/scope chips, X/14 progress, sparkline.
class _PillarCard extends ConsumerWidget {
  const _PillarCard({required this.pillar, required this.paused});

  final Pillar pillar;
  final bool paused;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final progress = ref
        .watch(_pillarLogsProvider(pillar.id))
        .valueOrNull ?? <PillarLog>[];
    final adaptive = adaptiveProgress(pillar: pillar, logs: progress);
    final spark = sparklineValues(progress);

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AnimatedScaleButton(
        onPress: () => context.push('/masteries/${pillar.id}'),
        activeScale: 0.98,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: paused ? AppColors.glassSurfaceSubtle : AppColors.cardBackground,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: paused ? AppColors.glassBorderFaint : AppColors.glassBorder,
              width: 1,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    Mdi.get(pillar.type == PillarType.rating
                        ? 'starOutline'
                        : pillar.type == PillarType.time
                            ? 'clockOutline'
                            : pillar.type == PillarType.boolean
                                ? 'toggleSwitchOutline'
                                : 'textBoxOutline'),
                    color: paused ? AppColors.textMuted : AppColors.gold,
                    size: 20,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      pillar.title,
                      style: TextStyle(
                        color: paused ? AppColors.textMuted : AppColors.textPrimary,
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  if (pillar.version > 1)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppColors.glassSurface,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        'v${pillar.version}',
                        style: const TextStyle(
                          color: AppColors.primaryAction,
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              // Progress row (adaptive graduation only)
              if (pillar.scope == PillarScope.adaptive) ...[
                Row(
                  children: [
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: adaptive,
                          minHeight: 6,
                          backgroundColor: AppColors.glassSurface,
                          valueColor: const AlwaysStoppedAnimation(AppColors.gold),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      '${(uniqueDaysOf(pillar.id, progress))}/${pillar.adaptiveDays} days',
                      style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  adaptive >= 1
                      ? 'Graduated! 🎉'
                      : '${(adaptive * 100).round()}% to graduate',
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                ),
              ] else
                Text(
                  '${pillar.scope.name} · ${pillar.type.name}',
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                ),
              if (spark.isNotEmpty) ...[
                const SizedBox(height: 10),
                SizedBox(
                  height: 30,
                  width: 80,
                  child: CustomPaint(
                    painter: _SparklinePainter(values: spark, color: AppColors.primaryAction),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Unique adaptive days for a pillar (dashboard label).
int uniqueDaysOf(String pillarId, List<PillarLog> logs) {
  return logs
      .map((log) {
        final dt = DateTime.fromMillisecondsSinceEpoch(log.timestamp);
        return '${dt.year}-${dt.month}-${dt.day}';
      })
      .toSet()
      .length;
}

final _pillarLogsProvider = FutureProvider.family<List<PillarLog>, String>(
  (ref, pillarId) => ref.read(appDataProvider.notifier).getPillarLogs(pillarId),
);

class _SparklinePainter extends CustomPainter {
  const _SparklinePainter({required this.values, required this.color});

  final List<double> values;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.length < 2) return;
    final step = size.width / (values.length - 1);
    final path = Path();
    for (var i = 0; i < values.length; i++) {
      final x = i * step;
      final y = size.height - values[i] * size.height;
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..color = color,
    );
  }

  @override
  bool shouldRepaint(covariant _SparklinePainter oldDelegate) =>
      oldDelegate.values != values;
}

/// Create/edit mastery form (title, description, type pills, scope pills,
/// adaptive-days input).
class _PillarFormModal extends StatefulWidget {
  const _PillarFormModal({required this.onSave, required this.onClose});

  final ValueChanged<Pillar> onSave;
  final VoidCallback onClose;

  @override
  State<_PillarFormModal> createState() => _PillarFormModalState();
}

class _PillarFormModalState extends State<_PillarFormModal> {
  late final TextEditingController _titleController = TextEditingController();
  late final TextEditingController _descriptionController = TextEditingController();
  late final TextEditingController _daysController = TextEditingController(text: '14');
  PillarType _type = PillarType.rating;
  PillarScope _scope = PillarScope.daily;

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _daysController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: _titleController,
            autofocus: true,
            style: const TextStyle(color: AppColors.textInput, fontSize: 16),
            cursorColor: AppColors.primaryAction,
            decoration: const InputDecoration(
              hintText: 'Mastery title',
              hintStyle: TextStyle(color: AppColors.placeholder),
              border: InputBorder.none,
            ),
          ),
          TextField(
            controller: _descriptionController,
            maxLines: 2,
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
            cursorColor: AppColors.primaryAction,
            decoration: const InputDecoration(
              hintText: 'Description (optional)',
              hintStyle: TextStyle(color: AppColors.placeholder),
              border: InputBorder.none,
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'TYPE',
            style: TextStyle(
              color: AppColors.textSecondary,
              fontSize: 12,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.5,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            children: [
              for (final type in PillarType.values)
                _ChoiceChip(
                  label: type.name,
                  active: _type == type,
                  onTap: () => setState(() => _type = type),
                ),
            ],
          ),
          const SizedBox(height: 14),
          const Text(
            'SCOPE',
            style: TextStyle(
              color: AppColors.textSecondary,
              fontSize: 12,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.5,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            children: [
              for (final scope in PillarScope.values)
                _ChoiceChip(
                  label: scope.name,
                  active: _scope == scope,
                  onTap: () => setState(() => _scope = scope),
                ),
            ],
          ),
          if (_scope == PillarScope.adaptive) ...[
            const SizedBox(height: 14),
            TextField(
              controller: _daysController,
              keyboardType: TextInputType.number,
              style: const TextStyle(color: AppColors.textInput, fontSize: 15),
              cursorColor: AppColors.primaryAction,
              decoration: const InputDecoration(
                labelText: 'Adaptive days to graduate',
                labelStyle: TextStyle(color: AppColors.textMuted, fontSize: 12),
                border: InputBorder.none,
              ),
            ),
          ],
          const SizedBox(height: 20),
          AnimatedScaleButton(
            onPress: () {
              final title = _titleController.text.trim();
              if (title.isEmpty) return;
              final days = int.tryParse(_daysController.text.trim()) ?? 14;
              widget.onSave(Pillar(
                id: generateId(),
                title: title,
                type: _type,
                scope: _scope,
                createdAt: DateTime.now().millisecondsSinceEpoch,
                adaptiveDays: days.clamp(1, 365),
                isActive: true,
                description: _descriptionController.text.trim().isEmpty
                    ? null
                    : _descriptionController.text.trim(),
                version: 1,
              ));
              widget.onClose();
            },
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 14),
              decoration: BoxDecoration(
                color: AppColors.primaryAction,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(
                'CREATE MASTERY',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: AppColors.primaryActionText,
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ChoiceChip extends StatelessWidget {
  const _ChoiceChip({required this.label, required this.active, required this.onTap});

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AnimatedScaleButton(
      onPress: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: active ? AppColors.dangerTint : AppColors.glassSurfaceSubtle,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: active ? AppColors.dangerBorder : AppColors.glassBorderFaint,
            width: 1,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: active ? AppColors.primaryAction : AppColors.textSecondary,
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}
