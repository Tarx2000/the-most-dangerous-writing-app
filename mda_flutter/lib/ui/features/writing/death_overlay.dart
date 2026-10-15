/// Session failure and recovery. Glass belongs to the return action; the
/// surrounding surface stays black and quiet so the choices remain legible.
library;

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../core/widgets/animated_scale_button.dart';
import '../../core/widgets/glass_action.dart';

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
    this.onSaveWhatsLeft,
  });

  final bool visible;
  final String subtitle;
  final String primaryLabel;
  final String? secondaryLabel;
  final String continueLabel;
  final VoidCallback? onReturnToMenu;
  final VoidCallback? onContinue;
  final VoidCallback? onSaveWhatsLeft;

  @override
  Widget build(BuildContext context) => IgnorePointer(
    ignoring: !visible,
    child: BlockSemantics(
      blocking: visible,
      child: ExcludeSemantics(
        excluding: !visible,
        child: AnimatedOpacity(
          opacity: visible ? 1 : 0,
          duration: MediaQuery.disableAnimationsOf(context)
              ? Duration.zero
              : const Duration(milliseconds: 300),
          child: ColoredBox(
            color: AppColors.background,
            child: SafeArea(
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  28,
                  24,
                  28,
                  24 + MediaQuery.viewInsetsOf(context).bottom,
                ),
                child: LayoutBuilder(
                  builder: (context, bounds) => SingleChildScrollView(
                    child: ConstrainedBox(
                      constraints: BoxConstraints(minHeight: bounds.maxHeight),
                      child: Center(
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 340),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                Icons.edit_off_outlined,
                                color: AppColors.danger,
                                size: 32,
                              ),
                              const SizedBox(height: 24),
                              const Text(
                                'YOU DIED',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: AppColors.textPrimary,
                                  fontSize: 48,
                                  height: 1.05,
                                  fontWeight: FontWeight.w600,
                                  letterSpacing: -1.5,
                                ),
                              ),
                              const SizedBox(height: 16),
                              Text(
                                subtitle,
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  color: AppColors.textSecondary,
                                  fontSize: 16,
                                  height: 1.5,
                                ),
                              ),
                              const SizedBox(height: 40),
                              GlassAction(
                                label: primaryLabel,
                                icon: Icons.arrow_back_rounded,
                                onPressed: onReturnToMenu,
                              ),
                              if (onSaveWhatsLeft != null) ...[
                                const SizedBox(height: 12),
                                SizedBox(
                                  width: double.infinity,
                                  child: OutlinedButton.icon(
                                    onPressed: onSaveWhatsLeft,
                                    icon: const Icon(
                                      Icons.save_outlined,
                                      size: 18,
                                    ),
                                    label: const Text("Save What's Left"),
                                    style: OutlinedButton.styleFrom(
                                      minimumSize: const Size(0, 52),
                                      foregroundColor: AppColors.textBody,
                                      side: const BorderSide(
                                        color: AppColors.glassBorderMedium,
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                              const SizedBox(height: 12),
                              AnimatedScaleButton(
                                onPress: onContinue,
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 16,
                                  ),
                                  child: Text(
                                    secondaryLabel ?? continueLabel,
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      color: AppColors.textSecondary,
                                      fontSize: 14,
                                      height: 1.4,
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
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
