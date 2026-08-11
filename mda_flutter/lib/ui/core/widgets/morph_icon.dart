/// LiquidMorphIcon — the hero mode switcher (SPEC §15).
///
/// The RN app morphs the four MDI glyph paths with Flubber. Flutter-side we
/// interpolate between the glyphs with a timed cross-fade + scale bounce
/// (same cadence: ~200 ms playback, max scale 1.04) rendered inside a
/// RepaintBoundary so the animation never repaints the whole screen.
/// A true path-morph (Path.interpolate) is a Phase 9 polish candidate.
library;

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';

class MorphIconEntry {
  const MorphIconEntry({required this.icon, this.color});

  final String icon;
  final Color? color;
}

class LiquidMorphIcon extends StatefulWidget {
  const LiquidMorphIcon({
    super.key,
    required this.icon,
    this.color = AppColors.primaryAction,
    this.size = 42,
  });

  final String icon;
  final Color color;
  final double size;

  @override
  State<LiquidMorphIcon> createState() => _LiquidMorphIconState();
}

class _LiquidMorphIconState extends State<LiquidMorphIcon>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 200),
  );

  late String _displayIcon = widget.icon;
  late Color _displayColor = widget.color;

  @override
  void didUpdateWidget(covariant LiquidMorphIcon oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.icon != widget.icon || oldWidget.color != widget.color) {
      _controller.stop();
      _displayIcon = oldWidget.icon;
      _displayColor = oldWidget.color;
      _controller.forward(from: 0).whenComplete(() {
        if (mounted) {
          setState(() {
            _displayIcon = widget.icon;
            _displayColor = widget.color;
          });
        }
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          final t = _controller.value;
          // Scale bounce capped at 1.04 during the last 60% (SPEC).
          final scale = t < 0.4 ? 1.0 : 1.0 + 0.04 * (t - 0.4) / 0.6;
          // Cross-fade both ways.
          final outgoing = Icon(Mdi.get(_displayIcon), color: _displayColor, size: widget.size);
          final incoming = Icon(Mdi.get(widget.icon), color: widget.color, size: widget.size);
          return SizedBox(
            width: widget.size + 12,
            height: widget.size + 12,
            child: Transform.scale(
              scale: scale,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Opacity(opacity: 1 - t, child: outgoing),
                  Opacity(opacity: t, child: incoming),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
