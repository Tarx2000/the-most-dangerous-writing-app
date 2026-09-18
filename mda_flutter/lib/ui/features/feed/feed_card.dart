/// FeedCard — story / tweet / check-in / circle variants (SPEC §14, port of
/// `FeedCard.tsx`). TYPE_COLORS: journal=textSecondary, circle=danger,
/// checkin=gold, clip=orange. Card: row, 16/20 padding, bottom border
/// glassSurface. Avatars: bordered circle (emoji / initial / star / bird).
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:video_player/video_player.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../core/utils.dart';
import '../../../data/models/saved_note.dart';
import '../../../data/models/saved_vlog.dart';
import '../../../data/providers.dart';
import '../../../domain/use_cases/mastery_logic.dart';
import '../../core/widgets/animated_scale_button.dart';
import '../../core/widgets/viewport_activity.dart';

const int storyPreviewWords = 50;

/// Feed item types (SPEC §14). `circle` = story for a person.
enum FeedItemType { story, circle, tweet, checkin, clip }

class FeedItemData {
  const FeedItemData({
    required this.type,
    required this.timestamp,
    this.note,
    this.vlog,
    this.personName,
    this.personId,
  });

  final FeedItemType type;
  final int timestamp;
  final SavedNote? note;
  final SavedVlog? vlog;
  final String? personName;
  final String? personId;
}

class FeedCard extends ConsumerWidget {
  const FeedCard({
    super.key,
    required this.item,
    required this.onOpenEntry,
    this.onOpenVlog,
    this.revealProgress,
  });

  final Animation<double>? revealProgress;
  final FeedItemData item;
  final ValueChanged<SavedNote> onOpenEntry;
  final ValueChanged<SavedVlog>? onOpenVlog;

  static Color _accentFor(FeedItemData item) {
    switch (item.type) {
      case FeedItemType.story:
        return AppColors.textSecondary;
      case FeedItemType.circle:
        return AppColors.primaryAction;
      case FeedItemType.tweet:
        return AppColors.primaryAction;
      case FeedItemType.checkin:
        return AppColors.gold;
      case FeedItemType.clip:
        return AppColors.orange;
    }
  }

  static String _truncateWords(String text, int maxWords) {
    final words = text
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty)
        .toList();
    if (words.length <= maxWords) return text;
    return '${words.take(maxWords).join(' ')}…';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final note = item.note;
    final feed = ref.watch(feedDataProvider);
    final entryId = note?.id ?? item.vlog?.id;
    final isBookmarked = feed.bookmarkedNoteIds.contains(entryId);
    final comment = feed.feedComments[entryId];
    final accent = _accentFor(item);
    final categoryLabel = _categoryLabel(item);

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 20),
      decoration: const BoxDecoration(
        border: Border(
          bottom: BorderSide(color: AppColors.glassSurface, width: 1),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Avatar column
          _Avatar(item: item, accent: accent),
          const SizedBox(width: 12),
          // Content column
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      categoryLabel,
                      style: TextStyle(
                        color: accent,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1,
                      ),
                    ),
                    const Spacer(),
                    Text(
                      formatRelativeTime(
                        DateTime.fromMillisecondsSinceEpoch(item.timestamp),
                      ),
                      style: const TextStyle(
                        color: AppColors.textMuted,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                ..._buildBody(note),
                if (entryId != null) ...[
                  const SizedBox(height: 8),
                  _CommentSection(
                    entryId: entryId,
                    comment: comment,
                    isBookmarked: isBookmarked,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildBody(SavedNote? note) {
    final n = note;
    switch (item.type) {
      case FeedItemType.checkin:
        final score = n?.alignmentScore ?? 5;
        final details = getAlignmentTier(score);
        return [
          Row(
            children: [
              Text(
                '$score/10',
                style: TextStyle(
                  color: _accentFor(item),
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                details.label.toUpperCase(),
                style: TextStyle(
                  color: _accentFor(item),
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            _truncateWords(n?.text ?? '', 40),
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: AppColors.textTweet,
              fontSize: 15,
              height: 1.4,
            ),
          ),
        ];
      case FeedItemType.tweet:
        return [
          const SizedBox(height: 4),
          Text(
            n?.text ?? '',
            style: const TextStyle(
              color: AppColors.textTweet,
              fontSize: 15,
              height: 1.4,
            ),
          ),
        ];
      case FeedItemType.clip:
        return [
          const SizedBox(height: 4),
          ViewportActivity(
            revealProgress: revealProgress,
            builder: (context, active) => FeedVideoCard(
              vlog: item.vlog,
              active: active,
              onTap: onOpenVlog,
            ),
          ),
        ];
      case FeedItemType.circle:
      case FeedItemType.story:
        return [
          if (n?.aiTitle != null && n!.aiTitle!.isNotEmpty)
            Text(
              n.aiTitle!,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: AppColors.textPrimary,
                fontSize: 16,
                fontWeight: FontWeight.w700,
                height: 1.3,
              ),
            ),
          const SizedBox(height: 4),
          Text(
            _truncateWords(n?.text ?? '', storyPreviewWords),
            maxLines: 4,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: AppColors.textBodyDim,
              fontSize: 14,
              height: 1.45,
            ),
          ),
          const SizedBox(height: 8),
          AnimatedScaleButton(
            onPress: n == null ? null : () => onOpenEntry(n),
            child: const Text(
              'Read more',
              style: TextStyle(
                color: AppColors.primaryAction,
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ];
    }
  }

  static String _categoryLabel(FeedItemData item) {
    switch (item.type) {
      case FeedItemType.story:
        return 'Journal';
      case FeedItemType.circle:
        return 'Circle';
      case FeedItemType.tweet:
        return 'Tweet';
      case FeedItemType.checkin:
        return 'Check-in';
      case FeedItemType.clip:
        return 'Vlog';
    }
  }
}

/// Avatar column: checkin=emoji, circle=initial (danger border),
/// tweet=bird (danger border), journal=star (border token).
class _Avatar extends StatelessWidget {
  const _Avatar({required this.item, required this.accent});

  final FeedItemData item;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final (Color borderColor, Widget child) = switch (item.type) {
      FeedItemType.checkin => (
        accent,
        Text(
          getAlignmentTier(item.note?.alignmentScore ?? 5).emoji,
          style: const TextStyle(fontSize: 18),
        ),
      ),
      FeedItemType.circle => (
        AppColors.primaryAction,
        Text(
          (item.personName ?? '').isEmpty
              ? '?'
              : item.personName!.characters.first.toUpperCase(),
          style: const TextStyle(
            color: AppColors.primaryAction,
            fontSize: 15,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
      FeedItemType.tweet => (
        AppColors.primaryAction,
        Icon(Mdi.get('twitter'), color: AppColors.primaryAction, size: 14),
      ),
      FeedItemType.clip => (
        AppColors.orange,
        Icon(Mdi.get('videoOutline'), color: AppColors.orange, size: 16),
      ),
      FeedItemType.story => (
        AppColors.border,
        Icon(
          Mdi.get('starFourPoints'),
          color: AppColors.textSecondary,
          size: 16,
        ),
      ),
    };
    return Container(
      width: 38,
      height: 38,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: borderColor, width: 1.5),
      ),
      child: child,
    );
  }
}

/// Bookmark + comment UI (SPEC §14: comments ≤ 500 chars).
class _CommentSection extends ConsumerStatefulWidget {
  const _CommentSection({
    required this.entryId,
    required this.comment,
    required this.isBookmarked,
  });

  final String entryId;
  final String? comment;
  final bool isBookmarked;

  @override
  ConsumerState<_CommentSection> createState() => _CommentSectionState();
}

class _CommentSectionState extends ConsumerState<_CommentSection> {
  bool _editing = false;
  late final TextEditingController _controller = TextEditingController(
    text: widget.comment ?? '',
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final comment = widget.comment;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (comment != null && comment.isNotEmpty && !_editing)
          Container(
            width: double.infinity,
            margin: const EdgeInsets.only(bottom: 6),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.glassSurfaceSubtle,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              comment,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: AppColors.textBodyDim,
                fontSize: 12,
                height: 1.4,
              ),
            ),
          ),
        if (_editing)
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  maxLength: 500,
                  style: const TextStyle(
                    color: AppColors.textInput,
                    fontSize: 13,
                  ),
                  cursorColor: AppColors.primaryAction,
                  decoration: const InputDecoration(
                    isDense: true,
                    counterText: '',
                    hintText: 'Add a comment...',
                    hintStyle: TextStyle(
                      color: AppColors.placeholder,
                      fontSize: 13,
                    ),
                    border: InputBorder.none,
                  ),
                ),
              ),
              AnimatedScaleButton(
                onPress: () async {
                  await ref
                      .read(appDataProvider.notifier)
                      .saveFeedComment(widget.entryId, _controller.text);
                  if (mounted) setState(() => _editing = false);
                },
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 6),
                  child: Text(
                    'Save',
                    style: TextStyle(
                      color: AppColors.primaryAction,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ],
          ),
        Row(
          children: [
            AnimatedScaleButton(
              onPress: () => ref
                  .read(appDataProvider.notifier)
                  .toggleBookmark(widget.entryId),
              child: Semantics(
                label: widget.isBookmarked
                    ? 'Remove bookmark'
                    : 'Bookmark entry',
                button: true,
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Icon(
                    widget.isBookmarked
                        ? Mdi.get('bookmark')
                        : Mdi.get('bookmarkOutline'),
                    color: widget.isBookmarked
                        ? AppColors.primaryAction
                        : AppColors.textMuted,
                    size: 18,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 4),
            AnimatedScaleButton(
              onPress: () => setState(() {
                _editing = !_editing;
                _controller.text = widget.comment ?? '';
              }),
              child: Semantics(
                label: 'Comment on entry',
                button: true,
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Icon(
                    Mdi.get('commentOutline'),
                    color: AppColors.textMuted,
                    size: 18,
                  ),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Muted inline video. The viewport gate owns visibility; this widget owns
/// the native player and reconciles visibility with the autoplay preference.
class FeedVideoCard extends ConsumerStatefulWidget {
  const FeedVideoCard({
    super.key,
    required this.vlog,
    this.onTap,
    this.active = true,
  });

  final SavedVlog? vlog;
  final ValueChanged<SavedVlog>? onTap;
  final bool active;

  @override
  ConsumerState<FeedVideoCard> createState() => _FeedVideoCardState();
}

class _FeedVideoCardState extends ConsumerState<FeedVideoCard> {
  VideoPlayerController? _controller;
  bool _initialized = false;
  bool _muted = true;
  bool _playing = false;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final vlog = widget.vlog;
    if (vlog == null) return;
    final controller = VideoPlayerController.file(File(vlog.filePath));
    _controller = controller;
    try {
      await controller.initialize();
      // A compression update or fast scroll may replace/dispose this player
      // before the native initialization returns. Never operate on its successor.
      if (!mounted || controller != _controller) return;
      await controller.setVolume(_muted ? 0 : 1);
      await controller.setLooping(true);
      if (!mounted || controller != _controller) return;
      setState(() => _initialized = true);
      _syncPlayback();
    } catch (_) {
      if (mounted && controller == _controller) setState(() => _failed = true);
    }
  }

  Future<void> _syncPlayback() async {
    final controller = _controller;
    if (!_initialized || controller == null) return;
    final shouldPlay =
        widget.active && ref.read(feedDataProvider).autoPlayFeedVideos;
    if (shouldPlay == _playing) return;
    _playing = shouldPlay;
    try {
      if (shouldPlay) {
        await controller.play();
      } else {
        await controller.pause();
      }
    } catch (_) {
      // Missing/replaced files are recoverable and must not crash the feed.
      if (mounted && controller == _controller) {
        setState(() {
          _failed = true;
          _playing = false;
        });
      }
    }
  }

  Future<void> _toggleMute() async {
    final controller = _controller;
    if (controller == null || !_initialized) return;
    setState(() => _muted = !_muted);
    try {
      await controller.setVolume(_muted ? 0 : 1);
    } catch (_) {
      // A controller may be released while a platform call is in flight.
    }
  }

  @override
  void didUpdateWidget(covariant FeedVideoCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.vlog?.id != widget.vlog?.id ||
        oldWidget.vlog?.filePath != widget.vlog?.filePath) {
      _controller?.dispose();
      _controller = null;
      _initialized = false;
      _failed = false;
      _playing = false;
      _load();
    } else {
      _syncPlayback();
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    _controller = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(
      feedDataProvider.select((feed) => feed.autoPlayFeedVideos),
      (_, _) => _syncPlayback(),
    );
    final vlog = widget.vlog;
    if (vlog == null) return const SizedBox.shrink();
    final controller = _controller;

    return GestureDetector(
      onTap: _toggleMute,
      child: AspectRatio(
        aspectRatio: 9 / 16,
        child: Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: AppColors.surfaceOverlay,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: AppColors.orange.withValues(alpha: 0.15),
              width: 1,
            ),
          ),
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (controller != null && _initialized)
                Center(
                  child: AspectRatio(
                    aspectRatio: controller.value.aspectRatio,
                    child: VideoPlayer(controller),
                  ),
                )
              else
                ColoredBox(
                  color: AppColors.overlayVideoStrong,
                  child: Center(
                    child: _failed
                        ? const Text(
                            'Video unavailable',
                            style: TextStyle(color: AppColors.textMuted),
                          )
                        : Icon(
                            Mdi.get('playCircleOutline'),
                            color: AppColors.orange,
                            size: 40,
                          ),
                  ),
                ),
              // Mute button
              Positioned(
                top: 8,
                right: 8,
                child: GestureDetector(
                  onTap: _toggleMute,
                  child: Container(
                    width: 44,
                    height: 44,
                    alignment: Alignment.center,
                    decoration: const BoxDecoration(
                      color: AppColors.overlayVideoMuted,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      _muted ? Mdi.get('volumeOff') : Mdi.get('volumeHigh'),
                      color: AppColors.textPrimary,
                      size: 15,
                    ),
                  ),
                ),
              ),
              if (widget.onTap != null)
                Positioned(
                  bottom: 8,
                  left: 8,
                  child: IconButton(
                    tooltip: 'Open video',
                    onPressed: () => widget.onTap!(vlog),
                    style: IconButton.styleFrom(
                      backgroundColor: AppColors.overlayVideoStrong,
                    ),
                    icon: const Icon(
                      Icons.fullscreen,
                      color: AppColors.textPrimary,
                    ),
                  ),
                ),
              // Duration badge
              Positioned(
                bottom: 8,
                right: 8,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.overlayVideoStrong,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '${(vlog.durationSec / 60).ceil()} min',
                    style: const TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
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
