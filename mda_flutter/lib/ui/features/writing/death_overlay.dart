/// Death overlay — "YOU DIED" screen (SPEC §8).
/// Fades in over 300 ms; buttons "Return to Menu" (primary) and "I don't care, let me write" (secondary).
library;

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../core/widgets/animated_scale_button.dart';

class DeathOverlay extends StatelessWidget {
  const DeathOverlay({
    super.key,
    required this.visible,
    required this.subtitle,
    this.primaryLabel = 'Return to Menu',
    this.secondaryLabel,
    this.continueLabel = "I don't care, let me write",
    this.onReturnToMenu,
    this.onContinue,
  });

  final bool visible;
  final String subtitle;
  final String primaryLabel;
  final String? secondaryLabel;
  final String continueLabel;
  final VoidCallback? onReturnToMenu;
  final VoidCallback? onContinue;

  @override
  Widget build(BuildContext context) {
    final effectiveSecondary = secondaryLabel ?? continueLabel;

    return AnimatedOpacity(
      opacity: visible ? 1 : 0,
      duration: const Duration(milliseconds: 300),
      child: IgnorePointer(
        ignoring: !visible,
        child: Container(
          color: AppColors.deathOverlay,
          padding: const EdgeInsets.symmetric(horizontal: 30),
          child: SafeArea(
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'YOU DIED',
                    style: const TextStyle(
                      color: AppColors.danger,
                      fontSize: 44,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 15),
                  Text(
                    subtitle,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 18,
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 40),
                  // Primary button: Return to Menu
                  AnimatedScaleButton(
                    onPress: onReturnToMenu,
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 40),
                      decoration: BoxDecoration(
                        color: AppColors.primaryAction,
                        borderRadius: BorderRadius.circular(AppRadius.round),
                      ),
                      child: Text(
                        primaryLabel,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: AppColors.primaryActionText,
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 15),
                  // Secondary button: I don't care, let me write
                  AnimatedScaleButton(
                    onPress: onContinue,
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 15),
                      child: Text(
                        effectiveSecondary,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: AppColors.textMuted,
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
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
}
