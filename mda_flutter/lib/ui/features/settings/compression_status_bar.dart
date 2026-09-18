/// CompressionStatusBar — active compression jobs with progress
/// (port of `CompressionStatusBar.tsx`).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../data/providers.dart';
import '../../core/widgets/shimmer_line.dart';

class CompressionStatusBar extends ConsumerWidget {
  const CompressionStatusBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(compressionQueueStateProvider).value;
    final job = state?.currentJob;
    final failedCount =
        state?.jobs.where((j) => j.status == 'failed').length ?? 0;
    // RN parity: visible while queued, processing, OR failed (failures need
    // the red card + retry surface, not silence). Hidden only when idle.
    final hasActivity =
        state != null &&
        (state.pendingCount > 0 ||
            state.isProcessing ||
            job?.status == 'processing' ||
            failedCount > 0);
    if (state == null || !hasActivity) {
      return const SizedBox.shrink();
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.glassBackground,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: failedCount > 0
                ? AppColors.dangerBorderStrong
                : AppColors.glassBorder,
            width: 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Mdi.get(state.isProcessing ? 'loading' : 'zipBoxOutline'),
                  color: failedCount > 0
                      ? AppColors.danger
                      : AppColors.primaryAction,
                  size: 18,
                ),
                const SizedBox(width: 8),
                Text(
                  state.pendingCount > 0
                      ? 'Compressing ${state.pendingCount} video${state.pendingCount != 1 ? 's' : ''}'
                      : 'Compression Jobs',
                  style: const TextStyle(
                    color: AppColors.textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const Spacer(),
                Text(
                  '${state.pendingCount + (state.isProcessing ? 1 : 0)} active',
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
                ),
              ],
            ),
            const SizedBox(height: 10),
            if (job != null && state.isProcessing) ...[
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: job.progress,
                  minHeight: 5,
                  backgroundColor: AppColors.glassSurface,
                  valueColor: const AlwaysStoppedAnimation(AppColors.orange),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '${(job.progress * 100).round()}% · balancing size and quality',
                style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
              ),
            ] else
              const ShimmerLine(width: 180, height: 10),
          ],
        ),
      ),
    );
  }
}
