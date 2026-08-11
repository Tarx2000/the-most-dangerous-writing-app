/// Home screen — hosts the 3-layer HomeShell + the streak popup layer.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../data/providers.dart';
import '../../core/widgets/streak_popup.dart';
import 'home_shell.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Trigger the crash-proof boot (runs once, in the background).
    ref.watch(storageReadyProvider);
    final popup = ref.watch(pendingStreakPopupProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Stack(
        children: [
          const HomeShell(),
          if (popup != null)
            StreakPopup(
              streak: popup.streak,
              streakHistory: popup.history,
              onClose: () => ref.read(appDataProvider.notifier).dismissStreakPopup(),
            ),
        ],
      ),
    );
  }
}
