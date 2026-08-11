/// PillarDetailScreen — mastery detail (SPEC §10).
/// Trend graph of the last 30 logs with pan-scrub + haptic ticks + floating
/// value bubble (130 px, clamped) · reflections list · edit modal that bumps
/// the version ("UPDATE TO VERSION v+1") · hard delete.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../data/models/pillar.dart';
import '../../../data/models/saved_note.dart';
import '../../../data/providers.dart';
import '../../core/widgets/animated_scale_button.dart';
import '../../core/widgets/base_modal.dart';

class PillarDetailScreen extends ConsumerStatefulWidget {
  const PillarDetailScreen({super.key, required this.pillarId});

  final String pillarId;

  @override
  ConsumerState<PillarDetailScreen> createState() => _PillarDetailScreenState();
}

class _PillarDetailScreenState extends ConsumerState<PillarDetailScreen> {
  static const int _maxLogPoints = 30;

  List<PillarLog> _logs = [];
  int? _scrubIndex;

  Pillar? get _pillar {
    for (final p in ref.watch(pillarsProvider)) {
      if (p.id == widget.pillarId) return p;
    }
    return null;
  }

  List<SavedNote> get _reflections {
    final notes = ref.watch(notesProvider);
    return notes.where((n) => n.pillarId == widget.pillarId).toList();
  }

  @override
  void initState() {
    super.initState();
    _loadLogs();
  }

  Future<void> _loadLogs() async {
    final logs = await ref.read(appDataProvider.notifier).getPillarLogs(widget.pillarId);
    if (mounted) setState(() => _logs = logs);
  }

  void _openEditModal() {
    final pillar = _pillar;
    if (pillar == null) return;
    showBaseModal(
      context,
      title: 'Edit Mastery',
      heightFactor: 0.8,
      builder: (close) => _DetailEditForm(
        pillar: pillar,
        onSave: (updated) async {
          await ref.read(appDataProvider.notifier).upsertPillar(updated);
          vibrate(HapticPatterns.unlockSuccess);
          await _loadLogs();
        },
        onClose: close,
        onDeleted: () {
          close();
          if (mounted) context.pop();
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pillar = _pillar;
    if (pillar == null) {
      return const Scaffold(
        backgroundColor: AppColors.background,
        body: Center(
          child: Text('Mastery not found', style: TextStyle(color: AppColors.textMuted)),
        ),
      );
    }
    final reflections = _reflections;
    final recentLogs = _logs.length <= _maxLogPoints
        ? _logs
        : _logs.sublist(_logs.length - _maxLogPoints);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 16, 0),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => context.pop(),
                    icon: Icon(Mdi.get('arrowLeft'), color: AppColors.textSecondary),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          pillar.title,
                          style: const TextStyle(
                            color: AppColors.textPrimary,
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        if (pillar.description != null)
                          Text(
                            pillar.description!,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                          ),
                      ],
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
                  const SizedBox(width: 8),
                  IconButton(
                    onPressed: _openEditModal,
                    icon: Icon(Mdi.get('pencilOutline'), color: AppColors.textSecondary),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                children: [
                  // Trend graph
                  if (recentLogs.isNotEmpty) ...[
                    _TrendGraph(
                      logs: recentLogs,
                      scrubIndex: _scrubIndex,
                      onScrub: (i) => setState(() => _scrubIndex = i),
                      onScrubEnd: () => setState(() => _scrubIndex = null),
                    ),
                    const SizedBox(height: 20),
                  ],
                  // Reflections
                  Text(
                    'REFLECTIONS (${reflections.length})',
                    style: const TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.5,
                    ),
                  ),
                  const SizedBox(height: 10),
                  if (reflections.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 20),
                      child: Text(
                        'Reflections from your check-ins appear here.',
                        style: TextStyle(color: AppColors.textMuted, fontSize: 14),
                      ),
                    ),
                  for (final note in reflections)
                    _ReflectionRow(note: note, pillar: pillar),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Trend graph: line + gradient area, pan-scrub with a floating value bubble
/// (130 px wide, clamped to the screen — SPEC §10).
class _TrendGraph extends StatelessWidget {
  const _TrendGraph({
    required this.logs,
    required this.scrubIndex,
    required this.onScrub,
    required this.onScrubEnd,
  });

  final List<PillarLog> logs;
  final int? scrubIndex;
  final ValueChanged<int> onScrub;
  final VoidCallback onScrubEnd;

  @override
  Widget build(BuildContext context) {
    final values = logs.map((l) => l.valueNum ?? 0).toList();
    final minV = values.reduce((a, b) => a < b ? a : b);
    final maxV = values.reduce((a, b) => a > b ? a : b);
    final range = maxV - minV == 0 ? 1.0 : maxV - minV;
    final normalized = [for (final v in values) (v - minV) / range];

    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final height = 160.0;
        final selected = scrubIndex;

        return SizedBox(
          height: height,
          child: GestureDetector(
            onHorizontalDragUpdate: (details) {
              final index = (details.localPosition.dx / width * (logs.length - 1))
                  .round()
                  .clamp(0, logs.length - 1);
              if (index != scrubIndex) {
                vibrate(10);
                onScrub(index);
              }
            },
            onHorizontalDragEnd: (_) => onScrubEnd(),
            child: Stack(
              children: [
                // Line + gradient area
                CustomPaint(
                  size: Size(width, height),
                  painter: _TrendPainter(normalized: normalized),
                ),
                // Scrub bubble
                if (selected != null && selected < logs.length)
                  Positioned(
                    left: (selected / (logs.length - 1) * width - 65)
                        .clamp(0.0, width - 130),
                    top: 4,
                    child: Container(
                      width: 130,
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceRaised,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: AppColors.glassBorderMedium, width: 1),
                      ),
                      child: Column(
                        children: [
                          Text(
                            logs[selected].valueNum?.toStringAsFixed(1) ??
                                logs[selected].valueStr ??
                                '',

                            style: const TextStyle(
                              color: AppColors.textPrimary,
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          Text(
                            _dateShort(logs[selected].timestamp),
                            style: const TextStyle(color: AppColors.textMuted, fontSize: 10),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  static String _dateShort(int ms) {
    final dt = DateTime.fromMillisecondsSinceEpoch(ms);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${months[dt.month - 1]} ${dt.day}';
  }
}

class _TrendPainter extends CustomPainter {
  const _TrendPainter({required this.normalized});

  final List<double> normalized;

  @override
  void paint(Canvas canvas, Size size) {
    if (normalized.length < 2) return;
    final step = size.width / (normalized.length - 1);

    final line = Path();
    final fill = Path()..moveTo(0, size.height);
    for (var i = 0; i < normalized.length; i++) {
      final x = i * step;
      final y = size.height - 8 - normalized[i] * (size.height - 24);
      if (i == 0) {
        line.moveTo(x, y);
      } else {
        line.lineTo(x, y);
      }
      fill.lineTo(x, y);
    }
    fill
      ..lineTo(size.width, size.height)
      ..close();

    canvas.drawPath(
      fill,
      Paint()
        ..shader = LinearGradient(
          colors: [
            AppColors.primaryAction.withValues(alpha: 0.25),
            AppColors.primaryAction.withValues(alpha: 0.0),
          ],
        ).createShader(Offset.zero & size),
    );
    canvas.drawPath(
      line,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..strokeCap = StrokeCap.round
        ..color = AppColors.primaryAction,
    );
  }

  @override
  bool shouldRepaint(covariant _TrendPainter oldDelegate) =>
      oldDelegate.normalized != normalized;
}

class _ReflectionRow extends StatelessWidget {
  const _ReflectionRow({required this.note, required this.pillar});

  final SavedNote note;
  final Pillar pillar;

  @override
  Widget build(BuildContext context) {
    final isPrior = pillar.lastEditedAt != null &&
        note.timestamp < pillar.lastEditedAt! &&
        pillar.lastEditedAt! > pillar.createdAt + 2000;
    final version = note.pillarVersion;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.cardBackground,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.glassBorderFaint, width: 1),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (note.pillarValue != null)
                  Text(
                    '${note.pillarValue!.toStringAsFixed(1)} · ',
                    style: const TextStyle(
                      color: AppColors.gold,
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                if (version != null && version < pillar.version)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.glassSurface,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      'v$version',
                      style: const TextStyle(
                        color: AppColors.primaryAction,
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                if (isPrior) ...[
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.dangerTint,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text(
                      'Prior Definition',
                      style: TextStyle(
                        color: AppColors.gold,
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
                const Spacer(),
                Text(
                  _dateLabel(note.dateTime),
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              note.text,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13, height: 1.4),
            ),
          ],
        ),
      ),
    );
  }

  static String _dateLabel(DateTime dt) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${months[dt.month - 1]} ${dt.day}';
  }
}

/// Edit form with version-bump button ("UPDATE TO VERSION v+1").
class _DetailEditForm extends StatefulWidget {
  const _DetailEditForm({
    required this.pillar,
    required this.onSave,
    required this.onClose,
    this.onDeleted,
  });

  final Pillar pillar;
  final ValueChanged<Pillar> onSave;
  final VoidCallback onClose;
  final VoidCallback? onDeleted;

  @override
  State<_DetailEditForm> createState() => _DetailEditFormState();
}

class _DetailEditFormState extends State<_DetailEditForm> {
  late final TextEditingController _titleController =
      TextEditingController(text: widget.pillar.title);
  late final TextEditingController _descriptionController =
      TextEditingController(text: widget.pillar.description ?? '');
  bool _confirmDelete = false;

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pillar = widget.pillar;
    final nextVersion = pillar.version + 1;

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: _titleController,
            style: const TextStyle(color: AppColors.textInput, fontSize: 16),
            cursorColor: AppColors.primaryAction,
            decoration: const InputDecoration(
              border: InputBorder.none,
              hintStyle: TextStyle(color: AppColors.placeholder),
            ),
          ),
          TextField(
            controller: _descriptionController,
            maxLines: 2,
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
            cursorColor: AppColors.primaryAction,
            decoration: const InputDecoration(
              border: InputBorder.none,
              hintStyle: TextStyle(color: AppColors.placeholder),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Saving bumps the version when title or description changes.',
            style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
          ),
          const SizedBox(height: 12),
          AnimatedScaleButton(
            onPress: () {
              final newTitle = _titleController.text.trim().isEmpty
                  ? pillar.title
                  : _titleController.text.trim();
              final newDescription = _descriptionController.text.trim().isEmpty
                  ? null
                  : _descriptionController.text.trim();
              widget.onSave(pillar.copyWith(
                title: newTitle,
                description: () => newDescription,
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
                'UPDATE TO VERSION v$nextVersion',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: AppColors.primaryActionText,
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),
          AnimatedScaleButton(
            onPress: () => setState(() => _confirmDelete = true),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 13),
              decoration: BoxDecoration(
                color: AppColors.dangerSubtle,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.dangerBorderLight, width: 1),
              ),
              child: const Text(
                'DELETE MASTERY',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppColors.primaryAction,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          if (_confirmDelete) ...[
            const SizedBox(height: 10),
            Text(
              'This deletes the mastery and all its history forever.',
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
            ),
            const SizedBox(height: 8),
            AnimatedScaleButton(
              onPress: () async {
                await refDeleteMastery(context, pillar.id);
                widget.onDeleted?.call();
              },
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 13),
                decoration: BoxDecoration(
                  color: AppColors.primaryAction,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Text(
                  'DELETE FOREVER',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: AppColors.primaryActionText,
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Deletes a mastery via the nearest ProviderScope container.
Future<void> refDeleteMastery(BuildContext context, String pillarId) {
  return ProviderScope.containerOf(context, listen: false)
      .read(appDataProvider.notifier)
      .deletePillar(pillarId);
}
