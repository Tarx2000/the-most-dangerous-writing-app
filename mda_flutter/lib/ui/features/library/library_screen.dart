/// LibraryScreen — the library (SPEC §15, §14).
/// Header (title + AI badge + count) · sort row · 4 tabs:
/// Notes / Check-ins / Circles / Vlogs.
/// Each section observes its security tier; protected content is not mounted
/// while locked, so accessibility cannot expose it behind an overlay.
library;

import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
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
import '../../core/widgets/glass_pill.dart';
import '../../core/widgets/rating_unlock.dart';
import '../vlogs/vlog_calendar_gallery.dart';
import '../alignment/wellbeing_history_section.dart';
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
    // A Navigator route (not a bare OverlayEntry): Back navigation works,
    // the PIN layer stays above, and provider scope is always valid — the
    // old OverlayEntry crashed with dependOnInheritedWidget… before
    // initState() completed (see PORT_AUDIT: sheets must be routes).
    await showGeneralDialog<void>(
      context: context,
      barrierColor: Colors.transparent,
      transitionDuration: const Duration(milliseconds: 200),
      pageBuilder: (context, animation, secondaryAnimation) =>
          PersonProfileModal(
            personId: person.id,
            onClose: () => Navigator.of(context).pop(),
          ),
    );
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
    // RN parity: circles/vlogs unlock on the LOWER tier (circles OR notes);
    // notes/check-ins require the full notes tier.
    final isNotesUnlocked = ref.watch(isNotesUnlockedProvider);
    final isCirclesUnlocked = ref.watch(
      securityControllerProvider.select((c) => c.isCirclesUnlocked),
    );
    final locked = (_tabIndex == 2 || _tabIndex == 3)
        ? (!isCirclesUnlocked && !isNotesUnlocked)
        : !isNotesUnlocked;
    final notes = ref.watch(notesProvider);
    final persons = ref.watch(personsProvider);
    final checkins = notes.where((n) => n.isAlignmentReflection).toList();
    final journalNotes = notes.where((n) => !n.isAlignmentReflection).toList();
    final screenHeight = MediaQuery.sizeOf(context).height;

    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
            // RN `headerRow`: title block + lock pill share one row. The
            // pill is intrinsically narrow (icon + short label); the title
            // block takes the rest. Both texts ellipsize on tiny phones.
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // RN parity: title + live AI badge share one row; the
                      // badge only exists while the queue is processing.
                      // The badge sits BELOW the title (not beside it): at
                      // 400 px the title (~115 px) + pill (~110 px) + badge
                      // would otherwise exceed the header row.
                      const Text(
                        'Library',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: AppColors.textPrimary,
                          fontSize: 32,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const _AiProcessingBadge(),
                      Text(
                        _tabIndex == 1
                            ? '${ref.watch(wellbeingProvider.select((w) => w.length))} check-ins • ${checkins.length} reflections'
                            : '${notes.length} Entries • ${persons.length} Circles',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppColors.textSecondary,
                          fontSize: 16,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                _LockPill(
                  locked: locked,
                  onTap: () {
                    if (locked) {
                      _unlockCurrentTab();
                    } else {
                      vibrate(HapticPatterns.lockAll);
                      ref.read(securityControllerProvider).lockAll();
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
                prefix: _tabIndex == 1 ? 'Reflections: ' : 'Sort by: ',
              ),
            ),
          // RN has NO header tab pills: the visible section is driven only by
          // the shared session mode (bottom nav). This strip therefore does
          // not exist — removed for 1:1 parity.
          //
          // Lock/unlock cross-fade (RN `unlockProgress` spring parity,
          // springDefault damping 30 / stiffness 200): content scales
          // 0.95→1 + fades 0→1 while the overlay slides up off-screen and
          // fades 1→0. Instant switches look broken by comparison.
          Expanded(
            child: _LockCrossFade(
              locked: locked,
              screenHeight: screenHeight,
              overlay: _LibraryLockedContent(
                tabIndex: _tabIndex,
                onUnlock: _unlockCurrentTab,
              ),
              content: switch (_tabIndex) {
                0 => LibraryNotesList(
                  notes: journalNotes.where((n) => n.personId == null).toList(),
                  sortBy: _sortBy,
                  emptyTitle: 'No entries yet',
                  emptySubtitle:
                      'Complete your first writing session to see it here.',
                  onNoteTap: _openNoteViewer,
                ),
                1 => LibraryNotesList(
                  header: const WellbeingHistorySection(),
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
          ),
        ],
      ),
    );
  }

  // Kept as documentation of the RN tab order (the visible section is driven
  // by the shared session mode, not by local state). Referenced by the lock
  // card copy helper below so it never goes stale.
  static const List<String> tabOrder = [
    'Notes',
    'Check-ins',
    'Circles',
    'Vlogs',
  ];
}

/// Lock/unlock cross-fade (RN `unlockProgress` parity).
///
/// RN drives one spring (`springDefault`: damping 30, stiffness 200) from 0
/// (locked) to 1 (unlocked): content fades 0→1 + scales 0.95→1 while the
/// overlay fades 1→0 + slides `0→−screenHeight`. Both directions use the
/// same spring; no timing curves, no overshoot (scales ≤ 1.0).
class _LockCrossFade extends StatefulWidget {
  const _LockCrossFade({
    required this.locked,
    required this.screenHeight,
    required this.overlay,
    required this.content,
  });

  final bool locked;
  final double screenHeight;
  final Widget overlay;
  final Widget content;

  @override
  State<_LockCrossFade> createState() => _LockCrossFadeState();
}

class _LockCrossFadeState extends State<_LockCrossFade>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 600),
  );

  @override
  void initState() {
    super.initState();
    _controller.value = widget.locked ? 0 : 1;
  }

  @override
  void didUpdateWidget(covariant _LockCrossFade oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.locked != oldWidget.locked) {
      // Spring to the new state (RN `withSpring(unlockProgress)` parity).
      // `animateTo` with a spring description below replaces timing curves.
      _controller.animateWith(
        SpringSimulation(
          const SpringDescription(damping: 30, stiffness: 200, mass: 0.8),
          _controller.value,
          widget.locked ? 0 : 1,
          0,
        ),
      );
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Cheap children: the overlay card + list are built once; animation
    // frames only move transforms/opacity (no per-frame rebuilds).
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final progress = _controller.value;
        return Stack(
          children: [
            Opacity(
              opacity: progress,
              child: Transform.scale(
                scale: 0.95 + 0.05 * progress,
                child: widget.content,
              ),
            ),
            Opacity(
              opacity: 1 - progress,
              child: Transform.translate(
                offset: Offset(0, -widget.screenHeight * progress),
                child: progress >= 1 ? const SizedBox.shrink() : widget.overlay,
              ),
            ),
          ],
        );
      },
    );
  }
}

/// RN lock card copy per section (LibraryScreen.tsx circlesLockTitle etc.;
/// VlogCalendarGallery.tsx for vlogs). Notes/check-ins share the notes copy.
/// Index order follows [_LibraryScreenState.tabOrder].
({String title, String subtitle, String button}) _lockCopyForTab(int index) {
  assert(
    index >= 0 && index < _LibraryScreenState.tabOrder.length,
    'lock copy index out of tab order',
  );
  switch (index) {
    case 2:
      return (
        title: 'Circles Protected',
        subtitle: 'Verify your identity to view your circles',
        button: 'Unlock Circles',
      );
    case 3:
      return (
        title: 'Vlogs Protected',
        subtitle: 'Verify your identity to view your video journals',
        button: 'Unlock Vlogs',
      );
    default:
      return (
        title: 'Notes Protected',
        subtitle: 'Verify your identity to view your notes',
        button: 'Unlock Notes',
      );
  }
}

class _LibraryLockedContent extends StatelessWidget {
  const _LibraryLockedContent({required this.tabIndex, required this.onUnlock});
  final int tabIndex;
  final VoidCallback onUnlock;

  @override
  Widget build(BuildContext context) {
    final copy = _lockCopyForTab(tabIndex);
    return VaultLockCard(
      title: copy.title,
      subtitle: copy.subtitle,
      buttonLabel: copy.button,
      onUnlock: onUnlock,
    );
  }
}

class _SortRow extends StatelessWidget {
  const _SortRow({
    required this.sortBy,
    required this.onPress,
    this.prefix = 'Sort by: ',
  });

  final SortOption sortBy;
  final String prefix;
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
                  text: prefix,
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
/// processing, with a spinner + pending count. Left-aligned under the title
/// (never beside it — the header row has no room for a third element).
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
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(top: 4, bottom: 2),
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
      ),
    );
  }
}

/// Keep each action a single label: clipping individual letters breaks with
/// Flutter font metrics and accessibility text scaling.
class _LockPill extends StatelessWidget {
  const _LockPill({required this.locked, required this.onTap});

  final bool locked;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GlassPill(
    label: locked ? 'Unlock' : 'Lock',
    semanticLabel: locked ? 'Unlock Library' : 'Lock Library',
    icon: locked ? Icons.lock_outline_rounded : Icons.lock_open_rounded,
    selected: locked,
    onPressed: onTap,
  );
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
      padding: EdgeInsets.fromLTRB(
        16,
        16,
        16,
        MediaQuery.paddingOf(context).bottom + 110,
      ),
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
                border: Border.all(color: AppColors.glassBorderFaint, width: 1),
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
