/// VlogCalendarGallery — BeReal-style calendar (SPEC §15, §11).
/// Monday-first 7-column grid; thumb height cell×1.15; empty days = 32 px
/// circle; today ring; vlog days = dangerFill cards with thumbnails +
/// duration badges + stack counter; month swipe; stats row.
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../data/models/saved_vlog.dart';
import '../../../data/providers.dart';
import 'vlog_viewer_modal.dart';

class VlogCalendarGallery extends ConsumerStatefulWidget {
  const VlogCalendarGallery({super.key});

  @override
  ConsumerState<VlogCalendarGallery> createState() => _VlogCalendarGalleryState();
}

class _VlogCalendarGalleryState extends ConsumerState<VlogCalendarGallery> {
  late final PageController _pager = PageController(initialPage: 1200);
  int _monthOffset = 0;

  DateTime get _currentMonth {
    final now = DateTime.now();
    return DateTime(now.year, now.month - _monthOffset, 1);
  }

  @override
  void dispose() {
    _pager.dispose();
    super.dispose();
  }

  /// Vlogs grouped by local date string (shared helper for the grid).
  Map<String, List<SavedVlog>> _byDay(List<SavedVlog> vlogs) {
    final map = <String, List<SavedVlog>>{};
    for (final vlog in vlogs) {
      map.putIfAbsent(vlog.dateStr, () => []).add(vlog);
    }
    return map;
  }

  void _openViewer(List<SavedVlog> dayVlogs) {
    final overlay = Overlay.of(context);
    late final OverlayEntry entry;
    entry = OverlayEntry(
      builder: (context) => VlogViewerModal(
        vlogs: dayVlogs,
        onClose: () => entry.remove(),
      ),
    );
    overlay.insert(entry);
  }

  @override
  Widget build(BuildContext context) {
    final vlogs = ref.watch(vlogsProvider);
    final byDay = _byDay(vlogs);
    final month = _currentMonth;
    final monthLabel = _monthName(month.month);
    final totalSeconds = vlogs.fold<int>(0, (sum, v) => sum + v.durationSec);

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
                  _arrow('‹', () => _commitMonth(1)),
                  const SizedBox(width: 8),
                  _arrow('›', _monthOffset > 0 ? () => _commitMonth(-1) : null),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        // Stats row
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              Expanded(
                child: _StatBox(label: 'Total Vlogs', value: '${vlogs.length}'),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _StatBox(label: 'Recorded (m)', value: '${(totalSeconds / 60).round()}'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        // Grid
        Expanded(
          child: PageView.builder(
            controller: _pager,
            onPageChanged: (page) {
              final delta = page - 1200;
              if (delta != _monthOffset) {
                setState(() => _monthOffset = delta);
              }
            },
            itemBuilder: (context, page) {
              final monthDate = DateTime(month.year, month.month + (page - 1200), 1);
              return _MonthGrid(
                year: monthDate.year,
                month: monthDate.month,
                byDay: byDay,
                onDayTap: _openViewer,
              );
            },
          ),
        ),
      ],
    );
  }

  void _commitMonth(int delta) {
    setState(() => _monthOffset += delta);
    _pager.jumpToPage(1200 + _monthOffset);
  }

  Widget _arrow(String glyph, VoidCallback? onPress) {
    return GestureDetector(
      onTap: onPress,
      child: Container(
        width: 32,
        height: 32,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: AppColors.glassSurfaceMedium,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          glyph,
          style: TextStyle(
            color: onPress != null ? AppColors.textSecondary : AppColors.textMuted,
            fontSize: 22,
            fontWeight: FontWeight.w300,
          ),
        ),
      ),
    );
  }

  static String _monthName(int month) {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
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
          Text(label, style: const TextStyle(color: AppColors.textMuted, fontSize: 11)),
        ],
      ),
    );
  }
}

class _MonthGrid extends StatelessWidget {
  const _MonthGrid({
    required this.year,
    required this.month,
    required this.byDay,
    required this.onDayTap,
  });

  final int year;
  final int month;
  final Map<String, List<SavedVlog>> byDay;
  final ValueChanged<List<SavedVlog>> onDayTap;

  static const _weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final daysInMonth = DateTime(year, month + 1, 0).day;
    final firstDayMon = DateTime(year, month, 1).weekday % 7;
    final screenWidth = MediaQuery.sizeOf(context).width;
    final cellSize = (screenWidth - 48) / 7;
    final thumbHeight = cellSize * 1.15;
    final cells = <Widget>[];

    for (var i = 0; i < firstDayMon; i++) {
      cells.add(SizedBox(width: cellSize, height: cellSize));
    }

    for (var day = 1; day <= daysInMonth; day++) {
      final dateStr =
          '${year.toString().padLeft(4, '0')}-${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';
      final dayVlogs = byDay[dateStr] ?? const [];
      final isToday = now.year == year && now.month == month && now.day == day;
      final isFuture = DateTime(year, month, day).isAfter(DateTime(now.year, now.month, now.day));

      cells.add(GestureDetector(
        onTap: dayVlogs.isEmpty ? null : () => onDayTap(dayVlogs),
        child: SizedBox(
          width: cellSize,
          height: isFuture ? cellSize : thumbHeight,
          child: Padding(
            padding: const EdgeInsets.all(2),
            child: dayVlogs.isEmpty
                ? Container(
                    width: 32,
                    height: 32,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: isToday
                          ? Border.all(color: AppColors.primaryAction, width: 2)
                          : null,
                    ),
                    child: Text(
                      '$day',
                      style: TextStyle(
                        color: isToday ? AppColors.primaryAction : AppColors.textSecondary,
                        fontSize: 14,
                        fontWeight: isToday ? FontWeight.w800 : FontWeight.w500,
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
                        if (dayVlogs.first.thumbnailPath != null)
                          Image.file(
                            File(dayVlogs.first.thumbnailPath!),
                            fit: BoxFit.cover,
                            errorBuilder: (_, _, _) => _placeholderIcon(),
                          )
                        else
                          _placeholderIcon(),
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
                              shadows: [Shadow(color: Colors.black, blurRadius: 3)],
                            ),
                          ),
                        ),
                        // Duration badge
                        Positioned(
                          bottom: 3,
                          right: 4,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
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
                              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
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
      ));
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              for (final day in _weekDays)
                Expanded(
                  child: Text(
                    day,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: AppColors.textMuted,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Wrap(spacing: 0, runSpacing: 0, children: cells),
        ],
      ),
    );
  }

  Widget _placeholderIcon() => Center(
        child: Icon(Mdi.get('playCircleOutline'), color: AppColors.textMuted, size: 28),
      );

  static String _durationLabel(int seconds) {
    final m = seconds ~/ 60;
    final s = (seconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }
}
