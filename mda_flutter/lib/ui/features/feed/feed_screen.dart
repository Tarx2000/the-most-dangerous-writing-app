/// FeedScreen — placeholder for Phase 8 (the reveal layer is functional).
/// Shows the feed scaffolding so the swipe-up gesture is testable end-to-end.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../data/providers.dart';

class FeedScreen extends ConsumerWidget {
  const FeedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notes = ref.watch(notesProvider);

    return Container(
      color: AppColors.background,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 8),
              child: Row(
                children: [
                  Icon(Mdi.get('twitter'), color: AppColors.primaryAction, size: 20),
                  const SizedBox(width: 10),
                  const Text(
                    'FEED',
                    style: TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 28,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 24),
              child: Text(
                'Your private social feed (filters, bookmarks and comments ship in Phase 8)',
                style: TextStyle(color: AppColors.textMuted, fontSize: 13),
              ),
            ),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: notes.isNotEmpty ? notes.length : 1,
                itemBuilder: (context, index) {
                  if (notes.isEmpty) {
                    return const Center(
                      child: Padding(
                        padding: EdgeInsets.only(top: 120),
                        child: Text(
                          'No entries yet',
                          style: TextStyle(color: AppColors.textMuted, fontSize: 15),
                        ),
                      ),
                    );
                  }
                  final note = notes[index];
                  return Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppColors.cardBackground,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: AppColors.glassBorder, width: 1),
                    ),
                    child: Text(
                      note.text,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
