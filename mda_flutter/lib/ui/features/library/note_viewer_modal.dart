/// NoteViewerModal — full note reader (port of `NoteViewerModal.tsx`, SPEC §15).
/// Backdrop `overlayVideoStrong` · sheet `surfaceMedium`, radius 32 ·
/// AI title 22/900 · date 20/900 · meta "123 words • 5 min" red uppercase ·
/// AI summary card · failure box (Phase 4 wires the retry) · Generate AI
/// Summary pill · full text in the user font/size · Delete (confirm-in-sheet).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../data/models/saved_note.dart';
import '../../../data/providers.dart';
import '../../core/widgets/animated_scale_button.dart';
import '../../core/widgets/rich_text.dart';

class NoteViewerModal extends ConsumerStatefulWidget {
  const NoteViewerModal({super.key, required this.note, required this.onClose, this.onDeleted});

  final SavedNote note;
  final VoidCallback onClose;
  final VoidCallback? onDeleted;

  @override
  ConsumerState<NoteViewerModal> createState() => _NoteViewerModalState();
}

class _NoteViewerModalState extends ConsumerState<NoteViewerModal> {
  bool _confirmDelete = false;
  late bool _aiQueued = false;

  SavedNote get _note => widget.note;

  Future<void> _handleDelete() async {
    vibrate(HapticPatterns.lockAll);
    await ref.read(appDataProvider.notifier).deleteNote(_note.id);
    if (mounted) widget.onDeleted?.call();
    widget.onClose();
  }

  @override
  Widget build(BuildContext context) {
    final note = _note;
    final prefs = ref.watch(preferencesProvider);

    return Material(
      color: AppColors.overlayVideoStrong,
      child: GestureDetector(
        onVerticalDragEnd: (details) {
          if (details.primaryVelocity != null && details.primaryVelocity! > 1000) {
            widget.onClose();
          }
        },
        child: Align(
          alignment: Alignment.bottomCenter,
          child: Container(
            height: MediaQuery.sizeOf(context).height * 0.88 + 20,
            decoration: const BoxDecoration(
              color: AppColors.surfaceMedium,
              borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
            ),
            child: ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
              child: Column(
                children: [
                  // Handle
                  const SizedBox(height: 10),
                  Container(
                    width: 40,
                    height: 5,
                    decoration: BoxDecoration(
                      color: AppColors.grey,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                  // Header
                  Padding(
                    padding: const EdgeInsets.fromLTRB(24, 14, 24, 8),
                    child: Row(
                      children: [
                        IconButton(
                          onPressed: widget.onClose,
                          icon: Icon(Mdi.get('close'), color: AppColors.textSecondary),
                        ),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                note.aiTitle ?? 'Untitled Entry',
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: AppColors.textPrimary,
                                  fontSize: 22,
                                  fontWeight: FontWeight.w900,
                                  height: 1.1,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                note.dateStr,
                                style: const TextStyle(
                                  color: AppColors.textPrimary,
                                  fontSize: 20,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Text(
                      '${note.wordCount} words • ${note.durationMin} min',
                      style: const TextStyle(
                        color: AppColors.primaryAction,
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.2,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  // Scrollable body
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(24, 8, 24, 120),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _buildAiSummaryCard(note),
                          const SizedBox(height: 16),
                          _buildAiActions(note),
                          const SizedBox(height: 20),
                          Text(
                            note.text,
                            style: TextStyle(
                              color: AppColors.textInput,
                              fontSize: prefs.sizeIndex >= 0 && prefs.sizeIndex < 4
                                  ? const [14.0, 18.0, 24.0, 32.0][prefs.sizeIndex]
                                  : 18,
                              height: 1.55,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  // Footer: delete
                  Padding(
                    padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
                    child: _confirmDelete ? _buildConfirmDelete() : _buildDeleteButton(),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildAiSummaryCard(SavedNote note) {
    final summary = note.aiSummary;
    if (summary == null || summary.isEmpty) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.glassSurfaceMinimal,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.glassBorderSubtle, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Mdi.get('brain'), color: AppColors.primaryAction, size: 18),
              const SizedBox(width: 8),
              const Text(
                'AI SUMMARY',
                style: TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.5,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          for (final bullet in summary)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: AppRichText(
                '• $bullet',
                style: const TextStyle(color: AppColors.textBody, fontSize: 15, height: 1.4),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildAiActions(SavedNote note) {
    if (!note.isEligibleForAi) return const SizedBox.shrink();
    return AnimatedScaleButton(
      onPress: () => setState(() => _aiQueued = true), // Phase 4: real queue
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
        decoration: BoxDecoration(
          color: AppColors.dangerTint,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.dangerBorder, width: 1),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Mdi.get('creation'), color: AppColors.primaryAction, size: 16),
            const SizedBox(width: 8),
            Text(
              _aiQueued ? 'Processing...' : 'Generate AI Summary',
              style: const TextStyle(
                color: AppColors.primaryAction,
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDeleteButton() {
    return AnimatedScaleButton(
      onPress: () => setState(() => _confirmDelete = true),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.dangerTint,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.dangerBorderLight, width: 1),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Mdi.get('trashCanOutline'), color: AppColors.primaryAction, size: 18),
            const SizedBox(width: 8),
            const Text(
              'Delete Entry',
              style: TextStyle(
                color: AppColors.primaryAction,
                fontSize: 15,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildConfirmDelete() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.dangerSubtle,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.dangerBorderMedium, width: 1),
      ),
      child: Column(
        children: [
          const Text(
            'Delete this entry forever?',
            style: TextStyle(color: AppColors.textPrimary, fontSize: 15, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: AnimatedScaleButton(
                  onPress: () => setState(() => _confirmDelete = false),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(
                      color: AppColors.glassHighlight,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Text(
                      'Cancel',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppColors.textPrimary, fontSize: 14, fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: AnimatedScaleButton(
                  onPress: _handleDelete,
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(
                      color: AppColors.primaryAction,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Text(
                      'Delete',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppColors.primaryActionText, fontSize: 14, fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Helper: exposes the note viewer as a full-screen overlay entry.
Future<void> showNoteViewer(
  BuildContext context, {
  required SavedNote note,
  VoidCallback? onDeleted,
}) {
  final overlay = Overlay.of(context);
  late final OverlayEntry entry;
  entry = OverlayEntry(
    builder: (context) => NoteViewerModal(
      note: note,
      onClose: () => entry.remove(),
      onDeleted: onDeleted,
    ),
  );
  overlay.insert(entry);
  return Future.value();
}
