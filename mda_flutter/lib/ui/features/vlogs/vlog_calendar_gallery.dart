/// VlogCalendarGallery — BeReal-style calendar (SPEC §15, §11).
/// 1:1 port of RN `VlogCalendarGallery.tsx`:
/// - Monday-first 7-column grid; cell `(screenWidth−48)/7`, thumb ×1.15
/// - Day grouping by LOCAL calendar day from `timestamp` (RN key
///   `year-month-day`), newest first within a day
/// - Today ring (even on empty days); vlog days = dangerFill cards +
///   thumbnails + duration badge + stack counter
/// - Month arrows (› disabled at the current month) + swipe between months
/// - Stats row (Total Vlogs / Recorded minutes)
/// - Missing thumbnails are fetched lazily (RN `ThumbnailFetcher` parity):
///   fire-and-forget extraction, persisted via `updateVlog`
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../core/utils.dart';
import '../../../data/models/saved_vlog.dart';
import '../../../data/providers.dart';
import 'vlog_viewer_modal.dart';

/// Configurable layout constants (mirror the RN file header).
class VlogCalendarConfig {
  const VlogCalendarConfig();

  /// Monday-first weekday header (RN `WEEKDAYS`).
  static const List<String> weekdays = [
    'MON',
    'TUE',
    'WED',
    'THU',
    'FRI',
    'SAT',
    'SUN',
  ];
}

class VlogCalendarGallery extends ConsumerStatefulWidget {
  const VlogCalendarGallery({super.key});

  @override
  ConsumerState<VlogCalendarGallery> createState() =>
      _VlogCalendarGalleryState();
}

class _VlogCalendarGalleryState extends ConsumerState<VlogCalendarGallery> {
  /// Months back from the current month (0 = this month; never negative —
  /// RN `canGoForward = monthOffset > 0` parity).
  int _monthOffset = 0;

  /// Horizontal swipe state for month navigation (RN gesture parity:
  /// threshold 20 % of the grid width, spring-back when not committed).
  double _dragDx = 0;
  static const double _swipeFraction = 0.2;

  /// Vlogs grouped by LOCAL calendar day from `timestamp`
  /// (RN `vlogsByDate`: key `year-month-day`, each day newest first).
  /// `timestamp` (not the `dateStr` string) is authoritative: the RN app's
  /// own backups carry German display strings (`18.4.2026 14:20`) that never
  /// match a `YYYY-MM-DD` lookup — grouping by them hides every video.
  Map<String, List<SavedVlog>> _byDay(List<SavedVlog> vlogs) {
    final map = <String, List<SavedVlog>>{};
    for (final vlog in vlogs) {
      final d = DateTime.fromMillisecondsSinceEpoch(vlog.timestamp);
      final key = '${d.year}-${d.month}-${d.day}';
      map.putIfAbsent(key, () => []).add(vlog);
    }
    for (final day in map.values) {
      day.sort((a, b) => b.timestamp.compareTo(a.timestamp));
    }
    return map;
  }

  DateTime get _displayMonth {
    final now = DateTime.now();
    return DateTime(now.year, now.month - _monthOffset, 1);
  }

  void _goToMonth(int delta) {
    setState(() {
      _monthOffset = (_monthOffset + delta).clamp(0, 1200);
      _dragDx = 0;
    });
  }

  void _openViewer(List<SavedVlog> dayVlogs) {
    showVlogViewer(context, vlogs: dayVlogs);
  }

  @override
  Widget build(BuildContext context) {
    final vlogs = ref.watch(vlogsProvider);
    final byDay = _byDay(vlogs);
    final month = _displayMonth;
    final monthLabel = _monthName(month.month);
    final totalSeconds = vlogs.fold<int>(0, (sum, v) => sum + v.durationSec);
    final screenWidth = MediaQuery.sizeOf(context).width;
    final canGoForward = _monthOffset > 0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Month nav
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '$monthLabel ${month.year}',
                style: const TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
              Row(
                children: [
                  _arrow('‹', () => _goToMonth(1)),
                  const SizedBox(width: 8),
                  _arrow('›', canGoForward ? () => _goToMonth(-1) : null),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        // Stats row
        if (vlogs.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Expanded(
                  child: _StatBox(
                    label: 'Total Vlogs',
                    value: '${vlogs.length}',
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _StatBox(
                    label: 'Recorded (m)',
                    value: '${(totalSeconds / 60).round()}',
                  ),
                ),
              ],
            ),
          ),
        if (vlogs.isNotEmpty) const SizedBox(height: 12),
        // Grid (swipeable between months — RN pan-gesture parity).
        Expanded(
          child: GestureDetector(
            behavior: HitTestBehavior.translucent,
            onHorizontalDragUpdate: (details) {
              setState(() => _dragDx += details.delta.dx);
            },
            onHorizontalDragEnd: (details) {
              final threshold = screenWidth * _swipeFraction;
              if (_dragDx > threshold) {
                _goToMonth(1); // swipe right → older month
              } else if (_dragDx < -threshold && canGoForward) {
                _goToMonth(-1); // swipe left → newer month
              } else {
                setState(() => _dragDx = 0); // spring back
              }
            },
            onHorizontalDragCancel: () => setState(() => _dragDx = 0),
            child: Transform.translate(
              offset: Offset(_dragDx * 0.15, 0),
              child: _MonthGrid(
                key: ValueKey('vlog-month-${month.year}-${month.month}'),
                year: month.year,
                month: month.month,
                byDay: byDay,
                onDayTap: _openViewer,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _arrow(String glyph, VoidCallback? onPress) {
    final enabled = onPress != null;
    return GestureDetector(
      onTap: onPress,
      child: Container(
        width: 36,
        height: 36,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: AppColors.glassSurfaceMedium,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.glassBorder),
        ),
        child: Text(
          glyph,
          style: TextStyle(
            color: enabled ? AppColors.textPrimary : AppColors.textMuted,
            fontSize: 22,
            fontWeight: FontWeight.w700,
            height: 1.0,
          ),
        ),
      ),
    );
  }

  static String _monthName(int month) {
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return months[month - 1];
  }
}

class _StatBox extends StatelessWidget {
  const _StatBox({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.glassBackground,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.glassBorderSubtle, width: 1),
      ),
      child: Column(
        children: [
          Text(
            value,
            style: const TextStyle(
              color: AppColors.textPrimary,
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
          Text(
            label,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
          ),
        ],
      ),
    );
  }
}

class _MonthGrid extends ConsumerWidget {
  const _MonthGrid({
    super.key,
    required this.year,
    required this.month,
    required this.byDay,
    required this.onDayTap,
  });

  final int year;
  final int month;
  final Map<String, List<SavedVlog>> byDay;
  final ValueChanged<List<SavedVlog>> onDayTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final now = DateTime.now();
    final daysInMonth = DateTime(year, month + 1, 0).day;
    // Monday-first offset (RN parity: `(getDay() + 6) % 7` — Sunday → 6).
    // Dart `weekday`: 1 = Monday … 7 = Sunday, so leading blanks = weekday−1.
    final firstDayMon = DateTime(year, month, 1).weekday - 1;
    final screenWidth = MediaQuery.sizeOf(context).width;
    final cellSize = (screenWidth - 48) / 7;
    final thumbHeight = cellSize * 1.15;
    final cells = <Widget>[];
    // Days whose first vlog lacks a thumbnail: ONE backfill widget per day,
    // collected here and mounted once below the grid (constructing a widget
    // without mounting it schedules nothing — the old code built it inline
    // and discarded it, so missing thumbnails never regenerated).
    final backfills = <Widget>[];

    for (var i = 0; i < firstDayMon; i++) {
      cells.add(SizedBox(width: cellSize, height: cellSize));
    }

    for (var day = 1; day <= daysInMonth; day++) {
      // RN key format `year-month-day` (matches [_byDay]).
      final dayVlogs = byDay['$year-$month-$day'] ?? const [];
      final isToday =
          now.year == year && now.month == month && now.day == day;
      if (dayVlogs.isNotEmpty) {
        // Lazily backfill a missing thumbnail (RN `ThumbnailFetcher`):
        // fire-and-forget, persisted via updateVlog, never blocks the grid.
        final first = dayVlogs.first;
        if (first.thumbnailPath == null || first.thumbnailPath!.isEmpty) {
          backfills.add(
            _ThumbnailBackfill(
              key: ValueKey('thumb-backfill-${first.id}'),
              vlog: first,
            ),
          );
        }
      }

      cells.add(
        GestureDetector(
          onTap: dayVlogs.isEmpty ? null : () => onDayTap(dayVlogs),
          child: SizedBox(
            width: cellSize,
            height: thumbHeight + 10,
            child: Padding(
              padding: const EdgeInsets.all(3),
              child: dayVlogs.isEmpty
                  ? Container(
                      width: 32,
                      height: 32,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: isToday
                            ? Border.all(
                                color: AppColors.primaryAction,
                                width: 2,
                              )
                            : null,
                      ),
                      child: Text(
                        '$day',
                        style: TextStyle(
                          color: isToday
                              ? AppColors.primaryAction
                              : AppColors.textMuted,
                          fontSize: 14,
                          fontWeight: isToday
                              ? FontWeight.w800
                              : FontWeight.w500,
                        ),
                      ),
                    )
                  : Container(
                      clipBehavior: Clip.antiAlias,
                      decoration: BoxDecoration(
                        color: AppColors.dangerFill,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: isToday
                              ? AppColors.primaryAction
                              : AppColors.dangerBorderMedium,
                          width: isToday ? 2 : 1,
                        ),
                      ),
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          _DayThumbnail(vlog: dayVlogs.first),
                          // Day number
                          Positioned(
                            top: 3,
                            left: 5,
                            child: Text(
                              '$day',
                              style: const TextStyle(
                                color: AppColors.textPrimary,
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                                shadows: [
                                  Shadow(color: Colors.black, blurRadius: 3),
                                ],
                              ),
                            ),
                          ),
                          // Duration badge
                          Positioned(
                            bottom: 3,
                            right: 4,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 4,
                                vertical: 1,
                              ),
                              decoration: BoxDecoration(
                                color: AppColors.overlayVideoStrong,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                _durationLabel(dayVlogs.first.durationSec),
                                style: const TextStyle(
                                  color: AppColors.textPrimary,
                                  fontSize: 9,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ),
                          // Stack counter
                          if (dayVlogs.length > 1)
                            Positioned(
                              top: 3,
                              right: 4,
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 4,
                                  vertical: 1,
                                ),
                                decoration: BoxDecoration(
                                  color: AppColors.primaryAction,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  '${dayVlogs.length}',
                                  style: const TextStyle(
                                    color: AppColors.primaryActionText,
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
            ),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              for (final day in VlogCalendarConfig.weekdays)
                Expanded(
                  child: Text(
                    day,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: AppColors.textMuted,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Expanded(
            child: SingleChildScrollView(
              child: Wrap(spacing: 0, runSpacing: 6, children: cells),
            ),
          ),
          // Invisible workers: one post-frame thumbnail extraction per
          // thumbnail-less day (RN `ThumbnailFetcher` parity). Zero layout
          // impact — they only schedule work, then persist via updateVlog.
          for (final backfill in backfills) backfill,
        ],
      ),
    );
  }

  static String _durationLabel(int seconds) {
    final m = seconds ~/ 60;
    final s = (seconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }
}

/// Shows the vlog's thumbnail file, or a play-icon placeholder when the file
/// is missing (imported backups can reference thumbnails that were never
/// extracted on this device — the backfill above regenerates them).
class _DayThumbnail extends StatelessWidget {
  const _DayThumbnail({required this.vlog});

  final SavedVlog vlog;

  @override
  Widget build(BuildContext context) {
    final path = vlog.thumbnailPath;
    if (path != null && path.isNotEmpty && File(path).existsSync()) {
      return Image.file(
        File(path),
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => _placeholderIcon(),
      );
    }
    return _placeholderIcon();
  }

  Widget _placeholderIcon() => Center(
    child: Icon(
      Mdi.get('playCircleOutline'),
      color: AppColors.textMuted,
      size: 20,
    ),
  );
}

/// Fire-and-forget thumbnail backfill (RN `ThumbnailFetcher` parity).
/// Constructing the widget schedules one post-frame extraction via
/// `ThumbnailService` and persists the result with `updateVlog`; the grid
/// itself never awaits it, so scrolling stays smooth.
class _ThumbnailBackfill extends ConsumerStatefulWidget {
  const _ThumbnailBackfill({super.key, required this.vlog});

  final SavedVlog vlog;

  @override
  ConsumerState<_ThumbnailBackfill> createState() =>
      _ThumbnailBackfillState();
}

class _ThumbnailBackfillState extends ConsumerState<_ThumbnailBackfill> {
  bool _scheduled = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Post-initState AND post-first-frame safe: schedules exactly once.
    if (_scheduled) return;
    _scheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) => _run());
  }

  Future<void> _run() async {
    if (!mounted) return;
    final vlog = widget.vlog;
    final video = File(vlog.filePath);
    if (!video.existsSync()) return;
    final thumb = await ref
        .read(thumbnailServiceProvider)
        .getThumbnail(vlogId: vlog.id, videoPath: vlog.filePath);
    if (!mounted || thumb == null || thumb.isEmpty) return;
    await ref.read(appDataProvider.notifier).updateVlog(vlog.id, {
      'thumbnail_path': thumb,
    });
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

/// Canonical grouping helper, unit-testable without widgets:
/// local-day key `year-month-day` from `timestamp` (RN parity).
Map<String, List<SavedVlog>> groupVlogsByLocalDay(List<SavedVlog> vlogs) {
  final map = <String, List<SavedVlog>>{};
  for (final vlog in vlogs) {
    final d = DateTime.fromMillisecondsSinceEpoch(vlog.timestamp);
    map
        .putIfAbsent(
          '${d.year}-${d.month}-${d.day}',
          () => [],
        )
        .add(vlog);
  }
  for (final day in map.values) {
    day.sort((a, b) => b.timestamp.compareTo(a.timestamp));
  }
  return map;
}

/// Local `YYYY-MM-DD` key for a timestamp (display/grouping joins).
String vlogDayKey(int timestampMs) =>
    toLocalDateString(DateTime.fromMillisecondsSinceEpoch(timestampMs));
