/// Death overlay — "YOU DIED" screen (SPEC §8).
/// Fades in over 300 ms; buttons "Return to Menu" and "I don't care, let me write".
library;

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../core/widgets/animated_scale_button.dart';

class DeathOverlay extends StatelessWidget {
  const DeathOverlay({
    super.key,
    required this.visible,
    required this.subtitle,
    this.continueLabel = "I don't care, let me write",
    this.onReturnToMenu,
    this.onContinue,
  });

  final bool visible;
  final String subtitle;
  final String continueLabel;
  final VoidCallback? onReturnToMenu;
  final VoidCallback? onContinue;

  @override
  Widget build(BuildContext context) {
    return AnimatedOpacity(
      opacity: visible ? 1 : 0,
      duration: const Duration(milliseconds: 300),
      child: IgnorePointer(
        ignoring: !visible,
        child: Container(
          color: AppColors.deathOverlay,
          child: SafeArea(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Text(
                  'YOU DIED',
                  style: TextStyle(
                    color: AppColors.primaryAction,
                    fontSize: 44,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 2,
                  ),
                ),
                const SizedBox(height: 16),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 40),
                  child: Text(
                    subtitle,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 16,
                    ),
                  ),
                ),
                const SizedBox(height: 48),
                AnimatedScaleButton(
                  onPress: onContinue,
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 32),
                    padding: const EdgeInsets.symmetric(horizontal: 36, vertical: 16),
                    decoration: BoxDecoration(
                      color: AppColors.primaryAction,
                      borderRadius: BorderRadius.circular(30),
                    ),
                    child: Text(
                      continueLabel,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: AppColors.primaryActionText,
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                AnimatedScaleButton(
                  onPress: onReturnToMenu,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
                    decoration: BoxDecoration(
                      color: AppColors.glassSurface,
                      borderRadius: BorderRadius.circular(30),
                      border: Border.all(color: AppColors.glassBorder, width: 1),
                    ),
                    child: const Text(
                      'Return to Menu',
                      style: TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
