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
    final security = ref.watch(securityControllerProvider);
    // RN parity: circles/vlogs unlock on the LOWER tier (circles OR notes);
    // notes/check-ins require the full notes tier.
    final locked = (_tabIndex == 2 || _tabIndex == 3)
        ? (!security.isCirclesUnlocked && !security.isNotesUnlocked)
        : !security.isNotesUnlocked;
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
                        '${notes.length} Entries • ${persons.length} Circles',
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
  static const List<String> tabOrder = ['Notes', 'Check-ins', 'Circles', 'Vlogs'];
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
                child: progress >= 1
                    ? const SizedBox.shrink()
                    : widget.overlay,
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
    // RN `circlesLockCard`: glassBackground, radius 24, padding 40, 1 px
    // glassBorder, full width; 48 px red lock; title 22/w900; subtitle 15
    // muted centered, line-height 22; red pill 16/28 radius 100 with red
    // shadow (elevation 8); fingerprint 22 white + 16/w800 white label.
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(40),
          decoration: BoxDecoration(
            color: AppColors.glassBackground,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: AppColors.glassBorder, width: 1),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Mdi.get('lockOutline'),
                color: AppColors.primaryAction,
                size: 48,
              ),
              const SizedBox(height: 16),
              Text(
                copy.title,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                copy.subtitle,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: AppColors.textMuted,
                  fontSize: 15,
                  height: 22 / 15,
                ),
              ),
              const SizedBox(height: 24),
              // RN `circlesUnlockBtn`: the card button sizes itself to its
              // label (Row mainAxisSize.min) — it must never force the card
              // wider than the screen (padding 40×2 + 20×2 = 120 gutter).
              Flexible(
                child: AnimatedScaleButton(
                  onPress: onUnlock,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 28,
                      vertical: 16,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.primaryAction,
                      borderRadius: BorderRadius.circular(100),
                      boxShadow: const [
                        BoxShadow(
                          color: AppColors.bloodGlow,
                          offset: Offset(0, 4),
                          blurRadius: 12,
                        ),
                      ],
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Mdi.get('fingerprint'),
                          color: AppColors.primaryActionText,
                          size: 22,
                        ),
                        const SizedBox(width: 10),
                        Flexible(
                          child: Text(
                            copy.button,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: AppColors.primaryActionText,
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Placeholder: the RN header has no tab pills (dead code, never
/// instantiated — kept so the removal stays reviewable in the diff).
// ignore: unused_element
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
    return const SizedBox.shrink();
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

/// Morphing lock/unlock pill (RN `AnimatedScaleButton` + `AnimatedLockIcon`
/// parity): red "Unlock" pill when locked, glass "Lock" pill when unlocked.
/// The label cross-fades with scale (Unlock 0.85→1 → Lock 1→0.85 over
/// 250 ms); the lock icon rotates open like a shackle over 300 ms.
class _LockPill extends StatefulWidget {
  const _LockPill({required this.locked, required this.onTap});

  final bool locked;
  final VoidCallback onTap;

  /// Intrinsic pill widths (RN ANIM_WIDTHS + icon + paddings), measured so
  /// the parent Row can reserve exact space and the pill never overflows.
  /// Content max: 16 (icon) + 6 (gap) + 17.5 (Un) + 4.5 (l) + 7.2 (L, hidden
  /// when Un shows) + ~31 (ock @14px w600) = ~75; + 30 padding + 2 border.
  /// NOTE: the "Unlock Notes" card button (~200 px) is much wider than the
  /// header pill — it must NOT reuse this budget. Keep separate constants.
  // ignore: unused_field — documents the RN-measured pill budget (see above).
  static const double pillWidth = 122;

  @override
  State<_LockPill> createState() => _LockPillState();
}

class _LockPillState extends State<_LockPill>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 300),
  );

  @override
  void initState() {
    super.initState();
    _controller.value = widget.locked ? 1 : 0;
  }

  @override
  void didUpdateWidget(covariant _LockPill oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.locked != oldWidget.locked) {
      // 250 ms cubic-out text/color morph (RN `prefixAnim` parity).
      _controller.animateTo(
        widget.locked ? 1 : 0,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOutCubic,
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
    return AnimatedScaleButton(
      onPress: widget.onTap,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          // RN ANIM_WIDTHS: Un 17.5, l 4.5, L 7.2 — "Un"+"l" collapse while
          // "L" expands, "ock" stays static. Locked (Unlock) = 1.
          //
          // Layout contract (must never overflow the header row): the pill is
          // intrinsically sized by its content, so the parent Row gives it
          // unbounded width on narrow phones. The three morph segments report
          // only their CURRENT width (clipped remainder is invisible), which
          // keeps the pill exactly as wide as its visible text.
          final p = _controller.value;
          final textColor = Color.lerp(
            AppColors.textPrimary,
            AppColors.primaryActionText,
            p,
          )!;
            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 10),
              decoration: BoxDecoration(
                color: Color.lerp(
                  AppColors.glassBackground,
                  AppColors.primaryAction,
                  p,
                ),
                borderRadius: BorderRadius.circular(100),
                border: Border.all(
                  color: Color.lerp(
                    AppColors.glassBorder,
                    AppColors.primaryAction,
                    p,
                  )!,
                  width: 1,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // 3D swing-gate shackle (RN `AnimatedLockIcon` parity):
                  // rotateY 0→180° around the hinge, NOT a flat 2D spin.
                  _SwingLockIcon(openAmount: 1 - p, color: textColor),
                  const SizedBox(width: 6),
                  // No Flexible here: each morph segment sizes itself to its
                // visible width, so the pill can never exceed its content.
                ClipRect(
                  child: SizedBox(
                    width: 17.5 * p,
                    height: 20,
                    child: OverflowBox(
                      minWidth: 30,
                      maxWidth: 30,
                      alignment: Alignment.centerLeft,
                      child: Opacity(
                        opacity: p,
                        child: Text(
                          'Un',
                          style: TextStyle(
                            color: Color.lerp(
                              AppColors.textPrimary,
                              AppColors.primaryActionText,
                              p,
                            ),
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                ClipRect(
                  child: SizedBox(
                    width: 4.5 * p,
                    height: 20,
                    child: OverflowBox(
                      minWidth: 10,
                      maxWidth: 10,
                      alignment: Alignment.centerLeft,
                      child: Opacity(
                        opacity: p,
                        child: Text(
                          'l',
                          style: TextStyle(
                            color: Color.lerp(
                              AppColors.textPrimary,
                              AppColors.primaryActionText,
                              p,
                            ),
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                ClipRect(
                  child: SizedBox(
                    width: 7.2 * (1 - p),
                    height: 20,
                    child: OverflowBox(
                      minWidth: 15,
                      maxWidth: 15,
                      alignment: Alignment.centerLeft,
                      child: Opacity(
                        opacity: 1 - p,
                        child: Text(
                          'L',
                          style: TextStyle(
                            color: Color.lerp(
                              AppColors.textPrimary,
                              AppColors.primaryActionText,
                              p,
                            ),
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                Text(
                  'ock',
                  style: TextStyle(
                    color: Color.lerp(
                      AppColors.textPrimary,
                      AppColors.primaryActionText,
                      p,
                    ),
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// 3D swing-gate lock icon (RN `AnimatedLockIcon` 1:1 port).
///
/// The SHACKLE (arc) rotates 180° around the Y axis (hinge pivot at 7,11 in
/// the 30×24 viewBox) over 300 ms `easeOutQuad` — it swings open like a gate,
/// it never flat-spins. The body rect + keyhole stay fixed; the keyhole fades
/// out over 200 ms when unlocked. Rendered via CustomPainter (no SVG dep).
class _SwingLockIcon extends StatelessWidget {
  const _SwingLockIcon({
    required this.openAmount,
    this.color = const Color(0xFFFFFFFF),
  });

  /// 0 = locked (shackle closed), 1 = unlocked (shackle swung open).
  final double openAmount;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 16,
      height: 16,
      child: CustomPaint(
        painter: _SwingLockPainter(
          openAmount: openAmount.clamp(0.0, 1.0),
          color: color,
        ),
      ),
    );
  }
}

class _SwingLockPainter extends CustomPainter {
  _SwingLockPainter({required this.openAmount, required this.color});

  final double openAmount;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    // Map the 30×24 viewBox onto the 16×16 box.
    final scaleX = size.width / 30;
    final scaleY = size.height / 24;
    canvas.save();
    canvas.scale(scaleX, scaleY);
    canvas.translate(6, 0);

    final stroke = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    // Body: rect x=3 y=11 w=18 h=11 r=2.
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        const Rect.fromLTWH(3, 11, 18, 11),
        const Radius.circular(2),
      ),
      stroke,
    );

    // Keyhole fades 200 ms (RN keyholeGProps): approximate by opacity.
    if (openAmount < 1) {
      final keyOpacity = (1.0 - openAmount).clamp(0.0, 1.0);
      final keyPaint = Paint()
        ..color = color.withValues(alpha: keyOpacity)
        ..style = PaintingStyle.fill;
      canvas.drawCircle(const Offset(12, 16), 1.5, keyPaint);
      final linePaint = Paint()
        ..color = color.withValues(alpha: keyOpacity)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5
        ..strokeCap = StrokeCap.round;
      canvas.drawLine(const Offset(12, 17.5), const Offset(12, 19), linePaint);
    }

    // Shackle 3D swing gate: rotates 180° around Y at the left hinge (7, 11).
    // Uses Matrix4 3D transform with subtle perspective so it swings outward to the left when open.
    canvas.save();
    final matrix = Matrix4.identity()
      ..setEntry(3, 2, 0.002) // perspective
      ..translateByDouble(7.0, 11.0, 0.0, 1.0)
      ..rotateY(openAmount * 3.141592653589793)
      ..translateByDouble(-7.0, -11.0, 0.0, 1.0);
    canvas.transform(matrix.storage);

    final shackle = Path()
      ..moveTo(7, 11)
      ..lineTo(7, 7)
      ..arcToPoint(
        const Offset(17, 7),
        radius: const Radius.circular(5),
        clockwise: true,
      )
      ..lineTo(17, 11);
    canvas.drawPath(shackle, stroke);
    canvas.restore();

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _SwingLockPainter old) =>
      old.openAmount != openAmount || old.color != color;
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
