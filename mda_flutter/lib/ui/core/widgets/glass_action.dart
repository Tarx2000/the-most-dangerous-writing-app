import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:liquid_glass_easy/liquid_glass_easy.dart';

import '../../../core/theme/app_colors.dart';
import '../../../data/providers.dart';
import 'app_glass.dart';

/// Shared finite control; content surfaces intentionally remain quiet and solid.
class GlassAction extends ConsumerWidget {
  const GlassAction({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.height = 56,
  });
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final double height;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final enabled = ref.watch(
      preferencesProvider.select((p) => p.enableLiquidGlass),
    );
    final content = FittedBox(
      fit: BoxFit.scaleDown,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
          if (icon != null) ...[
            const SizedBox(width: 10),
            Icon(icon, size: 19),
          ],
        ],
      ),
    );
    if (!enabled || onPressed == null) {
      return SizedBox(
        height: height,
        width: double.infinity,
        child: FilledButton(
          onPressed: onPressed,
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.textPrimary,
            foregroundColor: Colors.black,
          ),
          child: content,
        ),
      );
    }
    return LayoutBuilder(
      builder: (context, bounds) => LiquidGlassButton(
        width: bounds.maxWidth,
        height: height,
        padding: const EdgeInsets.symmetric(horizontal: 22),
        style: AppGlass.surface(height / 2),
        touch: MediaQuery.disableAnimationsOf(context)
            ? const LiquidGlassTouch()
            : AppGlass.buttonTouch,
        foregroundColor: AppColors.textPrimary,
        onPressed: onPressed!,
        child: content,
      ),
    );
  }
}
