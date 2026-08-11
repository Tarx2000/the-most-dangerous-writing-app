/// LibraryScreen — the library (SPEC §15, §14).
/// Header (title + AI badge + count) · sort row · 4 tabs:
/// Notes / Check-ins / Circles / Vlogs.
/// Phase 3 ships Notes + Check-ins + Circles list; Vlogs tab arrives with
/// the calendar gallery in Phase 6.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../data/models/person.dart';
import '../../../data/models/saved_note.dart';
import '../../../data/providers.dart';
import '../../core/widgets/action_sheet.dart';
import '../../core/widgets/animated_scale_button.dart';
import '../vlogs/vlog_calendar_gallery.dart';
import 'library_notes_list.dart';
import 'note_viewer_modal.dart';
import 'person_profile_modal.dart';

class LibraryScreen extends ConsumerStatefulWidget {
  const LibraryScreen({super.key});

  @override
  ConsumerState<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends ConsumerState<LibraryScreen> {
  int _tabIndex = 0;
  SortOption _sortBy = SortOption.newest;

  void _openSortSheet() async {
    final option = await showActionSheet<SortOption>(
      context,
      title: 'Sort by',
      selected: _sortBy,
      options: [
        for (final option in SortOption.values)
          ActionSheetOption(value: option, label: _sortLabel(option), icon: _sortIcon(option)),
      ],
    );
    if (option != null) setState(() => _sortBy = option);
  }

  static String _sortLabel(SortOption option) {
    switch (option) {
      case SortOption.newest:
        return 'Newest';
      case SortOption.oldest:
        return 'Oldest';
      case SortOption.longest:
        return 'Longest';
      case SortOption.shortest:
        return 'Shortest';
      case SortOption.longestText:
        return 'Most Words';
    }
  }

  static String _sortIcon(SortOption option) {
    switch (option) {
      case SortOption.newest:
        return 'sortDescending';
      case SortOption.oldest:
        return 'sortAscending';
      case SortOption.longest:
        return 'timerSandFull';
      case SortOption.shortest:
        return 'timerSandEmpty';
      case SortOption.longestText:
        return 'formatLetterCase';
    }
  }

  void _openNoteViewer(SavedNote note) {
    showNoteViewer(context, note: note);
  }

  void _openPersonProfile(Person person) {
    final overlay = Overlay.of(context);
    late final OverlayEntry entry;
    entry = OverlayEntry(
      builder: (context) => PersonProfileModal(
        personId: person.id,
        onClose: () => entry.remove(),
      ),
    );
    overlay.insert(entry);
  }

  @override
  Widget build(BuildContext context) {
    final notes = ref.watch(notesProvider);
    final persons = ref.watch(personsProvider);
    final checkins = notes.where((n) => n.isAlignmentReflection).toList();
    final journalNotes = notes.where((n) => !n.isAlignmentReflection).toList();

    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 16, 24, 4),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Library',
                  style: TextStyle(
                    color: AppColors.textPrimary,
                    fontSize: 32,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.5,
                  ),
                ),
                Row(
                  children: [
                    // AI badge
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: AppColors.dangerTint,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Text(
                        'AI',
                        style: TextStyle(
                          color: AppColors.primaryAction,
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    // Lock button (security lands in Phase 7)
                    AnimatedScaleButton(
                      onPress: () {},
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: AppColors.glassBackground,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: AppColors.glassBorder, width: 1),
                        ),
                        child: Icon(Mdi.get('lockOutline'), color: AppColors.textSecondary, size: 18),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(
              '${notes.length} Entries • ${persons.length} Circles',
              style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
            ),
          ),
          // Sort row (notes + checkins tabs only)
          if (_tabIndex <= 1)
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 14, 24, 4),
              child: _SortRow(
                sortBy: _sortBy,
                onPress: _openSortSheet,
              ),
            ),
          // Tabs
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 10, 24, 8),
            child: Row(
              children: [
                for (var i = 0; i < _tabs.length; i++)
                  _LibraryTab(
                    label: _tabs[i],
                    active: _tabIndex == i,
                    onTap: () => setState(() => _tabIndex = i),
                  ),
              ],
            ),
          ),
          // Content
          Expanded(
            child: IndexedStack(
              index: _tabIndex,
              children: [
                // Notes
                LibraryNotesList(
                  notes: journalNotes.where((n) => n.personId == null).toList(),
                  sortBy: _sortBy,
                  emptyTitle: 'No entries yet',
                  emptySubtitle: 'Complete your first writing session to see it here.',
                  onNoteTap: _openNoteViewer,
                ),
                // Check-ins
                LibraryNotesList(
                  notes: checkins,
                  sortBy: _sortBy,
                  emptyTitle: 'No check-ins yet',
                  emptySubtitle: 'Reflections from your alignment check-ins appear here.',
                  reflectionsOnly: true,
                  onNoteTap: _openNoteViewer,
                ),
                // Circles
                _CirclesTab(persons: persons, onPersonTap: _openPersonProfile),
                // Vlogs (calendar gallery)
                const VlogCalendarGallery(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static const _tabs = ['Notes', 'Check-ins', 'Circles', 'Vlogs'];
}

class _LibraryTab extends StatelessWidget {
  const _LibraryTab({required this.label, required this.active, required this.onTap});

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: AnimatedScaleButton(
        onPress: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: active ? AppColors.glassHighlight : AppColors.glassSurfaceSubtle,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: active ? AppColors.glassBorderMedium : AppColors.glassBorderFaint,
              width: 1,
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: active ? AppColors.textPrimary : AppColors.textSecondary,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}

class _SortRow extends StatelessWidget {
  const _SortRow({required this.sortBy, required this.onPress});

  final SortOption sortBy;
  final VoidCallback onPress;

  static const _labels = {
    SortOption.newest: 'Newest',
    SortOption.oldest: 'Oldest',
    SortOption.longest: 'Longest',
    SortOption.shortest: 'Shortest',
    SortOption.longestText: 'Most Words',
  };

  @override
  Widget build(BuildContext context) {
    return AnimatedScaleButton(
      onPress: onPress,
      child: Row(
        children: [
          Icon(Mdi.get('sort'), color: AppColors.textSecondary, size: 16),
          const SizedBox(width: 8),
          Text(
            'Sort by: ${_labels[sortBy]}',
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 14, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

/// Circles tab — person list; tap opens the profile modal.
class _CirclesTab extends StatelessWidget {
  const _CirclesTab({required this.persons, this.onPersonTap});

  final List<Person> persons;
  final ValueChanged<Person>? onPersonTap;

  @override
  Widget build(BuildContext context) {
    if (persons.isEmpty) {
      return const Center(
        child: Text(
          'No circles yet — add a person from the start screen',
          style: TextStyle(color: AppColors.textMuted, fontSize: 14),
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: persons.length,
      itemBuilder: (context, index) {
        final person = persons[index];
        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: AnimatedScaleButton(
            onPress: onPersonTap == null ? null : () => onPersonTap!(person),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.surfaceCard,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    alignment: Alignment.center,
                    decoration: const BoxDecoration(
                      color: AppColors.glassHighlight,
                      shape: BoxShape.circle,
                    ),
                    child: Text(
                      person.name.isEmpty ? '?' : person.name[0].toUpperCase(),
                      style: const TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          person.displayName,
                          style: const TextStyle(
                            color: AppColors.textPrimary,
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        if (person.relationship != null)
                          Text(
                            person.relationship!,
                            style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                          ),
                      ],
                    ),
                  ),
                  Icon(Mdi.get('chevronRight'), color: AppColors.textMuted, size: 18),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
