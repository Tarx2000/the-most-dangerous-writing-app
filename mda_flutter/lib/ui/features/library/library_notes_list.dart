/// LibraryNotesList — grouped note list with date headers (SPEC §15).
/// Grouping: month headers for newest/oldest, "By Length (Words)" for
/// longest-text, `${durationMin} Min Sessions` otherwise (parity with
/// `useLibraryNotes.ts`).
library;

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../data/models/saved_note.dart';
import '../../core/widgets/animated_scale_button.dart';

class LibraryNotesList extends StatelessWidget {
  const LibraryNotesList({
    super.key,
    required this.notes,
    required this.sortBy,
    required this.emptyTitle,
    required this.emptySubtitle,
    this.reflectionsOnly = false,
    this.onNoteTap,
  });

  final List<SavedNote> notes;
  final SortOption sortBy;
  final String emptyTitle;
  final String emptySubtitle;
  final bool reflectionsOnly;
  final ValueChanged<SavedNote>? onNoteTap;

  @override
  Widget build(BuildContext context) {
    final sorted = _sortNotes(notes, sortBy);
    final groups = _groupNotes(sorted, sortBy);

    if (groups.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 100,
                height: 100,
                decoration: BoxDecoration(
                  color: AppColors.glassSurfaceMinimal,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.dangerBorderLight, width: 1),
                ),
                child: const Icon(
                  Icons.edit_outlined,
                  color: AppColors.primaryAction,
                  size: 48,
                ),
              ),
              const SizedBox(height: 20),
              Text(
                emptyTitle,
                style: const TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                emptySubtitle,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
              ),
            ],
          ),
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 90),
      itemCount: groups.length,
      itemBuilder: (context, index) {
        final group = groups[index];
        if (group is _GroupHeader) {
          return Padding(
            padding: const EdgeInsets.fromLTRB(8, 18, 8, 8),
            child: Row(
              children: [
                Text(
                  group.label,
                  style: const TextStyle(
                    color: AppColors.textPrimary,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Expanded(child: Divider(color: AppColors.glassBorder, height: 1, thickness: 1)),
              ],
            ),
          );
        }
        final note = group as SavedNote;
        return _NoteCardItem(note: note, onTap: onNoteTap);
      },
    );
  }

  static List<SavedNote> _sortNotes(List<SavedNote> notes, SortOption sortBy) {
    final sorted = [...notes];
    switch (sortBy) {
      case SortOption.newest:
        sorted.sort((a, b) => b.timestamp.compareTo(a.timestamp));
      case SortOption.oldest:
        sorted.sort((a, b) => a.timestamp.compareTo(b.timestamp));
      case SortOption.longest:
        sorted.sort((a, b) => b.durationMin.compareTo(a.durationMin));
      case SortOption.shortest:
        sorted.sort((a, b) => a.durationMin.compareTo(b.durationMin));
      case SortOption.longestText:
        sorted.sort((a, b) => b.wordCount.compareTo(a.wordCount));
    }
    return sorted;
  }

  /// Groups into `_GroupHeader | SavedNote` items (parity with RN grouping).
  static List<Object> _groupNotes(List<SavedNote> notes, SortOption sortBy) {
    if (notes.isEmpty) return const [];
    final groups = <Object>[];

    if (sortBy == SortOption.longestText) {
      groups.add(const _GroupHeader('By Length (Words)'));
      groups.addAll(notes);
      return groups;
    }

    if (sortBy == SortOption.newest || sortBy == SortOption.oldest) {
      // Month headers (local-timezone month labels).
      String? currentMonth;
      for (final note in notes) {
        final month = _monthLabel(note.dateTime);
        if (month != currentMonth) {
          currentMonth = month;
          groups.add(_GroupHeader(month));
        }
        groups.add(note);
      }
      return groups;
    }

    // Duration groups.
    String? currentDuration;
    for (final note in notes) {
      final label = '${note.durationMin} Min Sessions';
      if (label != currentDuration) {
        currentDuration = label;
        groups.add(_GroupHeader(label));
      }
      groups.add(note);
    }
    return groups;
  }

  static String _monthLabel(DateTime dt) {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    return '${months[dt.month - 1]} ${dt.year}';
  }
}

class _GroupHeader {
  const _GroupHeader(this.label);

  final String label;
}

class _NoteCardItem extends StatelessWidget {
  const _NoteCardItem({required this.note, this.onTap});

  final SavedNote note;
  final ValueChanged<SavedNote>? onTap;

  @override
  Widget build(BuildContext context) {
    final durationLabel = note.isTweet
        ? 'Tweet'
        : note.isQuickNote
            ? 'Quick Note'
            : '${note.durationMin} Min';
    final winIcon = note.won ? '🔥' : '💀';

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AnimatedScaleButton(
        onPress: onTap == null ? null : () => onTap!(note),
        activeScale: 0.97,
        child: Container(          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.cardBackground,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppColors.glassBorder, width: 1),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '$durationLabel $winIcon',
                    style: const TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    _dateLabel(note.dateTime),
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              if (note.aiTitle != null && note.aiTitle!.isNotEmpty) ...[
                Text(
                  note.aiTitle!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.textPrimary,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
              ],
              Text(
                note.text,
                maxLines: note.aiTitle != null ? 1 : 3,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: 14,
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _dateLabel(DateTime dt) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(dt.year, dt.month, dt.day);
    if (day == today) return 'Today';
    if (day == today.subtract(const Duration(days: 1))) return 'Yesterday';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${months[dt.month - 1]} ${dt.day}';
  }
}
