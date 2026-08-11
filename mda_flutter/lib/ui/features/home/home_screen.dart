/// Home screen placeholder — Phase 2 replaces this with the real StartScreen
/// (hero, TickDial, difficulty pills, start button). Shows the booted state
/// so we can verify the storage layer end-to-end on-device.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../data/providers.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Trigger the crash-proof boot (runs once, in the background).
    ref.watch(storageReadyProvider);
    final notes = ref.watch(notesProvider);
    final persons = ref.watch(personsProvider);
    final vlogs = ref.watch(vlogsProvider);
    final pillars = ref.watch(pillarsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Mdi.get('notebookEdit'), color: AppColors.primaryAction, size: 56),
              const SizedBox(height: 16),
              const Text(
                'Most Dangerous Writing App',
                style: TextStyle(color: AppColors.textPrimary, fontSize: 20, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 24),
              Text(
                'notes: ${notes.length} · circles: ${persons.length} · vlogs: ${vlogs.length} · masteries: ${pillars.length}',
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
