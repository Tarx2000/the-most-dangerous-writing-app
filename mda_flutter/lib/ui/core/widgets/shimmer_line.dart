/// Skeleton placeholder line — port of `ShimmerLine.tsx` (SPEC §15).
/// White rounded line pulsing 0.15→0.35 opacity, 1 s up / 1 s down.
library;

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';

class ShimmerLine extends StatefulWidget {
  const ShimmerLine({super.key, this.width, this.height = 16, this.radius = 8});

  final double? width;
  final double height;
  final double radius;

  @override
  State<ShimmerLine> createState() => _ShimmerLineState();
}

class _ShimmerLineState extends State<ShimmerLine>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 2),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: TweenSequence<double>([
        TweenSequenceItem(tween: Tween(begin: 0.15, end: 0.35), weight: 1),
        TweenSequenceItem(tween: Tween(begin: 0.35, end: 0.15), weight: 1),
      ]).animate(
        CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
      ),
      child: Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(
          color: AppColors.textPrimary,
          borderRadius: BorderRadius.circular(widget.radius),
        ),
      ),
    );
  }
}
