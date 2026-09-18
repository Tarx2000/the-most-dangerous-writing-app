/// FeedScreen — the social feed (SPEC §14, port of `FeedScreen.tsx`).
/// Merges notes + vlogs newest-first; filters (All/Bookmarked + type
/// checkboxes); bookmarks/comments; scroll-to-top after 300 px; top/bottom
/// fade masks; the reveal/close gestures live in the HomeShell.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../data/models/saved_note.dart';
import '../../../data/models/saved_vlog.dart';
import '../vlogs/vlog_viewer_modal.dart';
import '../../../data/providers.dart';
import '../../core/widgets/animated_scale_button.dart';
import '../library/note_viewer_modal.dart';
import 'feed_card.dart';

class FeedScreen extends ConsumerStatefulWidget {
  const FeedScreen({
    super.key,
    this.onClose,
    this.onOverscrollPull,
    this.onOverscrollEnd,
    this.onOverscrollEndWithVelocity,
    this.revealProgress,
  });

  final Animation<double>? revealProgress;
  final VoidCallback? onClose;
  final ValueChanged<double>? onOverscrollPull;
  final VoidCallback? onOverscrollEnd;

  /// Top-edge fling velocity (px/s, signed) for the projected close decision.
  final ValueChanged<double>? onOverscrollEndWithVelocity;

  @override
  ConsumerState<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends ConsumerState<FeedScreen> {
  final ScrollController _scroll = ScrollController();
  bool _showScrollTop = false;
  bool _onlyBookmarked = false;
  bool _filterJournals = true;
  bool _filterTweets = true;
  bool _filterVlogs = true;
  bool _filterCheckins = true;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      final show = _scroll.offset > 300;
      if (show != _showScrollTop) {
        setState(() => _showScrollTop = show);
      }
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  List<FeedItemData> _buildItems() {
    final notes = ref.watch(notesProvider);
    final vlogs = ref.watch(vlogsProvider);
    final bookmarks = ref.watch(feedDataProvider).bookmarkedNoteIds;

    final persons = {
      for (final person in ref.watch(personsProvider)) person.id: person.name,
    };
    final items = <FeedItemData>[
      for (final note in notes)
        if (note.isAlignmentReflection)
          FeedItemData(
            type: FeedItemType.checkin,
            timestamp: note.timestamp,
            note: note,
          )
        else if (note.isTweet)
          FeedItemData(
            type: FeedItemType.tweet,
            timestamp: note.timestamp,
            note: note,
          )
        else if (note.personId != null)
          FeedItemData(
            type: FeedItemType.circle,
            timestamp: note.timestamp,
            note: note,
            personId: note.personId,
            personName: persons[note.personId],
          )
        else
          FeedItemData(
            type: FeedItemType.story,
            timestamp: note.timestamp,
            note: note,
          ),
      for (final vlog in vlogs)
        FeedItemData(
          type: FeedItemType.clip,
          timestamp: vlog.timestamp,
          vlog: vlog,
        ),
    ];

    return items.where((item) => _passesFilters(item, bookmarks)).toList()
      ..sort((a, b) => b.timestamp.compareTo(a.timestamp));
  }

  bool _passesFilters(FeedItemData item, List<String> bookmarks) {
    if (_onlyBookmarked &&
        !bookmarks.contains(item.note?.id ?? item.vlog?.id)) {
      return false;
    }
    switch (item.type) {
      case FeedItemType.story:
      case FeedItemType.circle:
        return _filterJournals;
      case FeedItemType.tweet:
        return _filterTweets;
      case FeedItemType.checkin:
        return _filterCheckins;
      case FeedItemType.clip:
        return _filterVlogs;
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = _buildItems();

    return Container(
      color: AppColors.background,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 4),
              child: Row(
                children: [
                  Icon(
                    Mdi.get('newspaperVariantOutline'),
                    color: AppColors.primaryAction,
                    size: 20,
                  ),
                  const SizedBox(width: 10),
                  const Text(
                    'FEED',
                    style: TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 28,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -0.5,
                    ),
                  ),
                  const Spacer(),
                  if (widget.onClose != null)
                    IconButton(
                      icon: const Icon(
                        Icons.keyboard_arrow_down,
                        color: AppColors.textSecondary,
                        size: 28,
                      ),
                      onPressed: widget.onClose,
                    ),
                ],
              ),
            ),
            // Filter chips
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _FilterChip(
                      label: _onlyBookmarked ? 'Bookmarked' : 'All',
                      active: _onlyBookmarked,
                      onTap: () =>
                          setState(() => _onlyBookmarked = !_onlyBookmarked),
                    ),
                    _FilterChip(
                      label: 'Journals',
                      active: _filterJournals,
                      onTap: () =>
                          setState(() => _filterJournals = !_filterJournals),
                    ),
                    _FilterChip(
                      label: 'Tweets',
                      active: _filterTweets,
                      onTap: () =>
                          setState(() => _filterTweets = !_filterTweets),
                    ),
                    _FilterChip(
                      label: 'Vlogs',
                      active: _filterVlogs,
                      onTap: () => setState(() => _filterVlogs = !_filterVlogs),
                    ),
                    _FilterChip(
                      label: 'Check-ins',
                      active: _filterCheckins,
                      onTap: () =>
                          setState(() => _filterCheckins = !_filterCheckins),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 4),
            // List with fade masks
            Expanded(
              child: Stack(
                children: [
                  if (items.isEmpty)
                    const Center(
                      child: Text(
                        'Nothing here yet',
                        style: TextStyle(
                          color: AppColors.textMuted,
                          fontSize: 14,
                        ),
                      ),
                    )
                  else
                    NotificationListener<ScrollNotification>(
                      onNotification: (notification) {
                        if (notification.depth != 0) return false;
                        if (notification is OverscrollNotification &&
                            notification.dragDetails != null &&
                            notification.overscroll < 0) {
                          widget.onOverscrollPull?.call(
                            -notification.overscroll,
                          );
                        } else if (notification is ScrollEndNotification) {
                          // Forward real fling velocity: home_shell projects
                          // the landing spot (RN `FeedScreen.tsx` close rule),
                          // so a top-edge flick closes instead of snapping back.
                          final rawVelocity =
                              notification.dragDetails?.primaryVelocity ?? 0;
                          widget.onOverscrollEndWithVelocity?.call(rawVelocity);
                          widget.onOverscrollEnd?.call();
                        }
                        return false;
                      },
                      child: ListView.builder(
                        physics: const ClampingScrollPhysics(
                          parent: AlwaysScrollableScrollPhysics(),
                        ),
                        controller: _scroll,
                        itemCount: items.length,
                        itemBuilder: (context, index) {
                          final item = items[index];
                          return FeedCard(
                            key: ValueKey(item.note?.id ?? item.vlog?.id),
                            item: item,
                            revealProgress: widget.revealProgress,
                            onOpenVlog: _openVlog,
                            onOpenEntry: (note) => _openNote(note),
                          );
                        },
                      ),
                    ),
                  // Top fade mask (32 px)
                  const Positioned(
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 32,
                    child: IgnorePointer(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [AppColors.background, Colors.transparent],
                          ),
                        ),
                      ),
                    ),
                  ),
                  // Bottom fade mask (60 px)
                  const Positioned(
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 60,
                    child: IgnorePointer(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.bottomCenter,
                            end: Alignment.topCenter,
                            colors: [AppColors.background, Colors.transparent],
                          ),
                        ),
                      ),
                    ),
                  ),
                  // Scroll-to-top button
                  if (_showScrollTop)
                    Positioned(
                      bottom: 24,
                      right: 20,
                      child: AnimatedScaleButton(
                        onPress: () => _scroll.animateTo(
                          0,
                          duration: const Duration(milliseconds: 300),
                          curve: Curves.easeOutCubic,
                        ),
                        child: Container(
                          width: 40,
                          height: 40,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: AppColors.overlayLockAndroid,
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: AppColors.glassBorderMedium,
                              width: 1,
                            ),
                          ),
                          child: Icon(
                            Mdi.get('arrowUp'),
                            color: AppColors.textPrimary,
                            size: 20,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _openVlog(SavedVlog vlog) {
    showVlogViewer(context, vlogs: [vlog]);
  }

  void _openNote(SavedNote note) {
    showNoteViewer(context, note: note);
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
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
      padding: const EdgeInsets.symmetric(horizontal: 3),
      child: AnimatedScaleButton(
        onPress: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            color: active ? AppColors.dangerTint : AppColors.glassSurfaceSubtle,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: active
                  ? AppColors.dangerBorder
                  : AppColors.glassBorderFaint,
              width: 1,
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: active ? AppColors.primaryAction : AppColors.textSecondary,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ),
    );
  }
}
