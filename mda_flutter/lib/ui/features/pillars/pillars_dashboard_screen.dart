/// PillarsDashboardScreen — Masteries dashboard (Phase 5 ships the real one).
/// Phase 2 placeholder so the Masteries entry point is reachable.
library;

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';

class PillarsDashboardScreen extends StatelessWidget {
  const PillarsDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Mdi.get('pillar'), color: AppColors.gold, size: 48),
              const SizedBox(height: 16),
              const Text(
                'Masteries',
                style: TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 26,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Coming in Phase 5',
                style: TextStyle(color: AppColors.textMuted, fontSize: 14),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
