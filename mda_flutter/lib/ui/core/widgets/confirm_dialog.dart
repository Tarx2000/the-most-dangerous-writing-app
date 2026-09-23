/// ConfirmDialog — Reusable animated confirmation dialog.
/// Port of `src/components/ui/ConfirmDialog.tsx`.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:liquid_glass_easy/liquid_glass_easy.dart';

import '../../../core/theme/app_colors.dart';
import '../../../data/providers.dart';
import 'animated_scale_button.dart';

class ConfirmDialog extends ConsumerStatefulWidget {
  const ConfirmDialog({
    super.key,
    required this.title,
    required this.message,
    this.confirmLabel = 'Confirm',
    this.cancelLabel = 'Cancel',
    this.destructive = false,
    this.confirmIcon,
    required this.onConfirm,
    required this.onCancel,
  });

  final String title;
  final String message;
  final String confirmLabel;
  final String cancelLabel;
  final bool destructive;
  final IconData? confirmIcon;
  final VoidCallback onConfirm;
  final VoidCallback onCancel;

  @override
  ConsumerState<ConfirmDialog> createState() => _ConfirmDialogState();
}

class _ConfirmDialogState extends ConsumerState<ConfirmDialog>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 250),
  );
  // RN parity (`ConfirmDialog.tsx`): the card springs 0.9→1.0 instead of
  // growing from a point (0→1), which re-rasters the whole card every frame.
  late final Animation<double> _scale = Tween<double>(begin: 0.9, end: 1.0)
      .animate(
        CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic),
      );
  late final Animation<double> _opacity = CurvedAnimation(
    parent: _controller,
    curve: Curves.easeOut,
  );

  @override
  void initState() {
    super.initState();
    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _dismiss(VoidCallback then) {
    _controller.reverse().whenComplete(then);
  }

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.sizeOf(context).width;
    final cardWidth = (screenWidth - 48).clamp(280.0, 380.0);
    final enableLiquidGlass = ref.watch(
      preferencesProvider.select((p) => p.enableLiquidGlass),
    );

    return Material(
      color: Colors.transparent,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Scrim
          Positioned.fill(
            child: GestureDetector(
              onTap: () => _dismiss(widget.onCancel),
              child: FadeTransition(
                opacity: _opacity,
                child: const ColoredBox(color: AppColors.modalBackground),
              ),
            ),
          ),
          // Dialog card
          ScaleTransition(
            scale: _scale,
            child: FadeTransition(
              opacity: _opacity,
              child: enableLiquidGlass
                  ? LiquidGlassLens(
                      style: LiquidGlassStyle(
                        shape: const LiquidGlassShape.continuousRoundedRectangle(
                          cornerRadius: 20,
                          borderWidth: 1.0,
                          borderType: OpticalBorder(
                            ambientIntensity: 0.9,
                            borderSaturation: 1.15,
                            borderSolidity: 0.15,
                          ),
                          lightColor: AppColors.glassBorderMedium,
                        ),
                        refraction: const LiquidGlassRefraction(
                          distortion: 0.08,
                          distortionWidth: 20,
                        ),
                        appearance: LiquidGlassAppearance(
                          color: AppColors.surfaceRaised.withValues(alpha: 0.72),
                          shadow: const LiquidGlassShadow(
                            blur: 24,
                            opacity: 0.6,
                          ),
                        ),
                      ),
                      child: Container(
                        width: cardWidth,
                        padding: const EdgeInsets.all(28),
                        child: _buildDialogContent(),
                      ),
                    )
                  : Container(
                      width: cardWidth,
                      padding: const EdgeInsets.all(28),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceRaised,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: AppColors.glassBorderMedium),
                        boxShadow: const [
                          BoxShadow(
                            color: AppColors.shadowDark,
                            blurRadius: 30,
                            offset: Offset(0, 12),
                          ),
                        ],
                      ),
                      child: _buildDialogContent(),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDialogContent() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          widget.title,
          style: const TextStyle(
            color: AppColors.textPrimary,
            fontSize: 22,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.3,
          ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 10),
        Text(
          widget.message,
          style: const TextStyle(
            color: AppColors.textSecondary,
            fontSize: 15,
            height: 1.45,
          ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 24),
        Row(
          children: [
            // Cancel button
            Expanded(
              child: AnimatedScaleButton(
                onPress: () => _dismiss(widget.onCancel),
                activeScale: 0.97,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    vertical: 14,
                    horizontal: 16,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.glassHighlight,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    widget.cancelLabel,
                    style: const TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),
            // Confirm button
            Expanded(
              child: AnimatedScaleButton(
                onPress: () => _dismiss(widget.onConfirm),
                activeScale: 0.97,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    vertical: 14,
                    horizontal: 16,
                  ),
                  decoration: BoxDecoration(
                    color: widget.destructive
                        ? AppColors.primaryAction
                        : AppColors.gold,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  alignment: Alignment.center,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (widget.confirmIcon != null) ...[
                        Icon(
                          widget.confirmIcon,
                          color: AppColors.background,
                          size: 18,
                        ),
                        const SizedBox(width: 6),
                      ],
                      Text(
                        widget.confirmLabel,
                        style: const TextStyle(
                          color: AppColors.background,
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Helper to show a ConfirmDialog.
Future<bool> showConfirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'Confirm',
  String cancelLabel = 'Cancel',
  bool destructive = false,
  IconData? confirmIcon,
}) async {
  final result = await showDialog<bool>(
    context: context,
    barrierColor: Colors.transparent,
    builder: (context) => ConfirmDialog(
      title: title,
      message: message,
      confirmLabel: confirmLabel,
      cancelLabel: cancelLabel,
      destructive: destructive,
      confirmIcon: confirmIcon,
      onConfirm: () => Navigator.of(context).pop(true),
      onCancel: () => Navigator.of(context).pop(false),
    ),
  );
  return result ?? false;
}
