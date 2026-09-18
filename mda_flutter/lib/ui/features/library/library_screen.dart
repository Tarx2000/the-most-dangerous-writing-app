/// LibraryScreen — the library (SPEC §15, §14).
/// Header (title + AI badge + count) · sort row · 4 tabs:
/// Notes / Check-ins / Circles / Vlogs.
/// Each section observes its security tier; protected content is not mounted
/// while locked, so accessibility cannot expose it behind an overlay.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../data/ai_providers.dart';
import '../../../data/models/person.dart';
import '../../../data/models/saved_note.dart';
import '../../../data/providers.dart';
import '../../../data/security_providers.dart';
import '../../core/widgets/action_sheet.dart';
import '../../core/widgets/animated_scale_button.dart';
import '../vlogs/vlog_calendar_gallery.dart';
import 'library_notes_list.dart';
import 'note_viewer_modal.dart';
import 'person_profile_modal.dart';

class LibraryScreen extends ConsumerStatefulWidget {
  /// Shared session mode from the home shell (RN `sessionMode` parity):
  /// journal → Notes, checkin → Check-ins, circles → Circles, vlog → Vlogs.
  /// The home nav pill drives this — the Library never jumps pages on tab taps.
  const LibraryScreen({super.key, this.mode = 'journal'});

  final String mode;

  @override
  ConsumerState<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends ConsumerState<LibraryScreen> {
  int _tabIndex = 0;
  SortOption _sortBy = SortOption.newest;

  /// Maps the shared session mode to the library tab (RN `LibraryScreenInner`).
  static int _tabForMode(String mode) {
    switch (mode) {
      case 'circles':
        return 2;
      case 'vlog':
        return 3;
      case 'checkin':
        return 1;
      case 'journal':
      default:
        return 0;
    }
  }

  @override
  void initState() {
    super.initState();
    _tabIndex = _tabForMode(widget.mode);
  }

  @override
  void didUpdateWidget(covariant LibraryScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Nav pill tapped while on this page: switch content in place (RN parity).
    if (widget.mode != oldWidget.mode) {
      setState(() => _tabIndex = _tabForMode(widget.mode));
    }
  }

  void _openSortSheet() async {
    final option = await showActionSheet<SortOption>(
      context,
      title: 'Sort by',
      selected: _sortBy,
      options: [
        for (final option in SortOption.values)
          ActionSheetOption(
            value: option,
            label: _sortLabel(option),
            icon: _sortIcon(option),
          ),
      ],
    );
    if (option != null) setState(() => _sortBy = option);
  }

  static String _sortLabel(SortOption option) {
    // RN parity (`SORT_OPTIONS_DATA` in LibraryScreen.tsx): full labels.
    switch (option) {
      case SortOption.newest:
        return 'Newest First';
      case SortOption.oldest:
        return 'Oldest First';
      case SortOption.longest:
        return 'Longest Session';
      case SortOption.shortest:
        return 'Shortest Session';
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

  Future<void> _openPersonProfile(Person person) async {
    final security = ref.read(securityControllerProvider);
    final prefs = ref.read(preferencesProvider);
    final allowed = await security.unlockProfile(
      preferPinAuth: prefs.preferPinAuth,
      useBiometrics: prefs.useBiometrics,
      lockTimeoutMins: prefs.lockTimeoutMins,
    );
    if (!allowed || !mounted) return;
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

  Future<void> _unlockCurrentTab() async {
    final security = ref.read(securityControllerProvider);
    final prefs = ref.read(preferencesProvider);
    final unlocked = _tabIndex == 2
        ? await security.unlockCircles(
            preferPinAuth: prefs.preferPinAuth,
            useBiometrics: prefs.useBiometrics,
            lockTimeoutMins: prefs.lockTimeoutMins,
          )
        : await security.unlockNotes(
            preferPinAuth: prefs.preferPinAuth,
            useBiometrics: prefs.useBiometrics,
            lockTimeoutMins: prefs.lockTimeoutMins,
          );
    if (unlocked) vibrate(HapticPatterns.unlockSuccess);
  }

  @override
  Widget build(BuildContext context) {
    final security = ref.watch(securityControllerProvider);
    final locked = _tabIndex == 2
        ? !security.isCirclesUnlocked
        : !security.isNotesUnlocked;
    final notes = ref.watch(notesProvider);
    final persons = ref.watch(personsProvider);
    final checkins = notes.where((n) => n.isAlignmentReflection).toList();
    final journalNotes = notes.where((n) => !n.isAlignmentReflection).toList();

    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // RN parity: title + live AI badge share one row; the
                      // badge only exists while the queue is processing.
                      // Wrapped in Flexible so the badge never overflows the
                      // title on narrow phones.
                      Row(
                        children: [
                          const Flexible(
                            child: Text(
                              'Library',
                              style: TextStyle(
                                color: AppColors.textPrimary,
                                fontSize: 32,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          const _AiProcessingBadge(),
                        ],
                      ),
                      Text(
                        '${notes.length} Entries • ${persons.length} Circles',
                        style: const TextStyle(
                          color: AppColors.textSecondary,
                          fontSize: 16,
                        ),
                      ),
                    ],
                  ),
                ),
                _LockPill(
                  locked: locked,
                  onTap: () {
                    if (locked) {
                      _unlockCurrentTab();
                    } else {
                      vibrate(HapticPatterns.lockAll);
                      security.lockAll();
                    }
                  },
                ),
              ],
            ),
          ),
          if (_tabIndex <= 1)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
              child: _SortDropdown(
                sortBy: _sortBy,
                onPress: _openSortSheet,
              ),
            ),
          // The tab strip stays reachable while locked so Circles can request
          // its own lower tier without granting access to private notes.
          // RN drives the visible section from the shared session mode — no
          // header tab bar exists there; this strip mirrors it in place so
          // the nav pill and the page never disagree.
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
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
          Expanded(
            child: locked
                ? _LibraryLockedContent(
                    section: _tabs[_tabIndex],
                    onUnlock: _unlockCurrentTab,
                  )
                : switch (_tabIndex) {
                    0 => LibraryNotesList(
                      notes: journalNotes
                          .where((n) => n.personId == null)
                          .toList(),
                      sortBy: _sortBy,
                      emptyTitle: 'No entries yet',
                      emptySubtitle:
                          'Complete your first writing session to see it here.',
                      onNoteTap: _openNoteViewer,
                    ),
                    1 => LibraryNotesList(
                      notes: checkins,
                      sortBy: _sortBy,
                      emptyTitle: 'No check-ins yet',
                      emptySubtitle:
                          'Reflections from your alignment check-ins appear here.',
                      reflectionsOnly: true,
                      onNoteTap: _openNoteViewer,
                    ),
                    2 => _CirclesTab(
                      persons: persons,
                      onPersonTap: _openPersonProfile,
                    ),
                    _ => const VlogCalendarGallery(),
                  },
          ),
        ],
      ),
    );
  }

  static const _tabs = ['Notes', 'Check-ins', 'Circles', 'Vlogs'];
}

class _LibraryLockedContent extends StatelessWidget {
  const _LibraryLockedContent({required this.section, required this.onUnlock});
  final String section;
  final VoidCallback onUnlock;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Mdi.get('lockOutline'), color: AppColors.textDim, size: 32),
          const SizedBox(height: 14),
          Text(
            '$section are locked',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: AppColors.textPrimary,
              fontSize: 17,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Verify your identity to continue.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.textMuted, fontSize: 13),
          ),
          const SizedBox(height: 20),
          AnimatedScaleButton(
            onPress: onUnlock,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 13),
              decoration: BoxDecoration(
                color: AppColors.primaryAction,
                borderRadius: BorderRadius.circular(30),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Mdi.get('fingerprint'),
                    color: AppColors.primaryActionText,
                    size: 19,
                  ),
                  const SizedBox(width: 8),
                  const Text(
                    'Unlock',
                    style: TextStyle(
                      color: AppColors.primaryActionText,
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class _LibraryTab extends StatelessWidget {
  const _LibraryTab({
    required this.label,
    required this.active,
    required this.onTap,
  });

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
            color: active
                ? AppColors.glassHighlight
                : AppColors.glassSurfaceSubtle,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: active
                  ? AppColors.glassBorderMedium
                  : AppColors.glassBorderFaint,
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
    SortOption.newest: 'Newest First',
    SortOption.oldest: 'Oldest First',
    SortOption.longest: 'Longest Session',
    SortOption.shortest: 'Shortest Session',
    SortOption.longestText: 'Most Words',
  };

  @override
  Widget build(BuildContext context) {
    return AnimatedScaleButton(
      onPress: onPress,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.glassBorder, width: 1),
        ),
        child: Row(
          children: [
            Icon(Mdi.get('sort'), color: AppColors.textSecondary, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text.rich(
                TextSpan(
                  text: 'Sort by: ',
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 14,
                  ),
                  children: [
                    TextSpan(
                      text: _labels[sortBy],
                      style: const TextStyle(
                        color: AppColors.textPrimary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Icon(
              Mdi.get('chevronDown'),
              color: AppColors.textSecondary,
              size: 20,
            ),
          ],
        ),
      ),
    );
  }
}

/// Sort dropdown alias (RN `filterDropdownBtn` naming parity).
typedef _SortDropdown = _SortRow;

/// Live AI-processing badge (RN parity): rendered only while the AI queue is
/// processing, with a spinner + batch progress (current/total) or "AI".
class _AiProcessingBadge extends ConsumerWidget {
  const _AiProcessingBadge();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final queue = ref.watch(aiQueueStateProvider);
    final asyncState = queue.valueOrNull;
    if (asyncState == null || !asyncState.isProcessing) {
      return const SizedBox.shrink();
    }
    final pending = asyncState.pendingCount;
    return Container(
      margin: const EdgeInsets.only(left: 8),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.dangerTint,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.dangerBorder, width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(
            width: 10,
            height: 10,
            child: CircularProgressIndicator(
              strokeWidth: 1.5,
              color: AppColors.primaryAction,
            ),
          ),
          const SizedBox(width: 4),
          Text(
            pending > 0 ? '$pending AI' : 'AI',
            style: const TextStyle(
              color: AppColors.primaryAction,
              fontSize: 10,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

/// Morphing lock/unlock pill (RN `AnimatedScaleButton` + `AnimatedLockIcon`
/// parity): red "Unlock" pill when locked, glass "Lock" pill when unlocked.
/// The label cross-fades with scale (Unlock 0.85→1 → Lock 1→0.85 over
/// 250 ms); the lock icon rotates open like a shackle over 300 ms.
class _LockPill extends StatefulWidget {
  const _LockPill({required this.locked, required this.onTap});

  final bool locked;
  final VoidCallback onTap;

  @override
  State<_LockPill> createState() => _LockPillState();
}

class _LockPillState extends State<_LockPill>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 300),
  );
  late final Animation<double> _iconTurns = Tween<double>(begin: 0, end: 0.5)
      .animate(
        CurvedAnimation(parent: _controller, curve: Curves.easeOutQuad),
      );

  @override
  void initState() {
    super.initState();
    if (!widget.locked) _controller.value = 1;
  }

  @override
  void didUpdateWidget(covariant _LockPill oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.locked != oldWidget.locked) {
      if (widget.locked) {
        _controller.reverse();
      } else {
        _controller.forward();
      }
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final locked = widget.locked;
    return AnimatedScaleButton(
      onPress: widget.onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOutCubic,
        padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 10),
        decoration: BoxDecoration(
          color: locked ? AppColors.primaryAction : AppColors.glassBackground,
          borderRadius: BorderRadius.circular(100),
          border: Border.all(
            color: locked ? AppColors.primaryAction : AppColors.glassBorder,
            width: 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            RotationTransition(
              turns: _iconTurns,
              child: Icon(
                Mdi.get(locked ? 'lock' : 'lockOpenOutline'),
                color: locked
                    ? AppColors.primaryActionText
                    : AppColors.textPrimary,
                size: 16,
              ),
            ),
            const SizedBox(width: 6),
            AnimatedDefaultTextStyle(
              duration: const Duration(milliseconds: 250),
              curve: Curves.easeOutCubic,
              style: TextStyle(
                color: locked
                    ? AppColors.primaryActionText
                    : AppColors.textPrimary,
                fontSize: 14,
                fontWeight: FontWeight.w700,
              ),
              child: AnimatedScale(
                scale: locked ? 1.0 : 0.97,
                duration: const Duration(milliseconds: 250),
                curve: Curves.easeOutCubic,
                child: Text(locked ? 'Unlock' : 'Lock'),
              ),
            ),
          ],
        ),
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
                            style: const TextStyle(
                              color: AppColors.textMuted,
                              fontSize: 12,
                            ),
                          ),
                      ],
                    ),
                  ),
                  Icon(
                    Mdi.get('chevronRight'),
                    color: AppColors.textMuted,
                    size: 18,
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
