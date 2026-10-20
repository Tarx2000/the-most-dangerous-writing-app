import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:liquid_glass_easy/liquid_glass_easy.dart';

import '../../../core/theme/app_colors.dart';
import '../../../data/providers.dart';
import 'animated_scale_button.dart';
import 'app_glass.dart';

/// Compact package glass with a finite lens and a complete, scalable label.
class GlassPill extends ConsumerWidget {
  const GlassPill({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.selected,
    this.semanticLabel,
    this.compact = false,
  });

  final String label;
  final VoidCallback onPressed;
  final IconData? icon;
  final bool? selected;
  final String? semanticLabel;
  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final glass = ref.watch(
      preferencesProvider.select((p) => p.enableLiquidGlass),
    );
    final active = selected ?? false;
    final foreground = active ? AppColors.dangerCoral : AppColors.textBody;
    final padding = compact ? 11.0 : 15.0;
    final textStyle = DefaultTextStyle.of(context).style.merge(
      TextStyle(fontSize: compact ? 12 : 13, fontWeight: FontWeight.w600),
    );
    final measure = TextPainter(
      text: TextSpan(text: label, style: textStyle),
      textDirection: Directionality.of(context),
      textScaler: MediaQuery.textScalerOf(context),
    )..layout();
    final width =
        (measure.width.ceilToDouble() + 2 * padding + (icon == null ? 0 : 24))
            .clamp(44.0, double.infinity);
    final height = (measure.height + 20).clamp(44.0, double.infinity);
    measure.dispose();
    final content = FittedBox(
      fit: BoxFit.scaleDown,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 17, color: foreground),
            const SizedBox(width: 7),
          ],
          Text(label, style: textStyle.copyWith(color: foreground)),
        ],
      ),
    );
    return Semantics(
      label: semanticLabel ?? label,
      button: true,
      selected: selected,
      onTap: onPressed,
      excludeSemantics: true,
      child: glass
          ? LiquidGlassButton(
              width: width,
              height: height,
              padding: EdgeInsets.symmetric(horizontal: padding),
              style: AppGlass.control(height / 2, active: active),
              touch: MediaQuery.disableAnimationsOf(context)
                  ? const LiquidGlassTouch()
                  : AppGlass.headerTouch,
              foregroundColor: foreground,
              onPressed: onPressed,
              child: content,
            )
          : AnimatedScaleButton(
              onPress: onPressed,
              child: Container(
                width: width,
                height: height,
                padding: EdgeInsets.symmetric(horizontal: padding),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: active ? AppColors.dangerTint : AppColors.glassSurface,
                  borderRadius: BorderRadius.circular(height / 2),
                  border: Border.all(
                    color: active
                        ? AppColors.dangerBorder
                        : AppColors.glassBorder,
                  ),
                ),
                child: content,
              ),
            ),
    );
  }
}
