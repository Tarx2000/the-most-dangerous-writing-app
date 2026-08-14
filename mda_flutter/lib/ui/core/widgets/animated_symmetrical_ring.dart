/// AnimatedSymmetricalRing — 1:1 port of AnimatedSymmetricalRing.tsx (SPEC §15).
/// Dual arcs that draw around the check-in star from bottom to top symmetrically.
library;

import 'dart:math' as math;
import 'package:flutter/material.dart';

class AnimatedSymmetricalRing extends StatefulWidget {
  const AnimatedSymmetricalRing({
    super.key,
    required this.size,
    required this.strokeWidth,
    required this.color,
    this.backgroundColor = Colors.transparent,
    this.isActive = true,
  });

  final double size;
  final double strokeWidth;
  final Color color;
  final Color backgroundColor;
  final bool isActive;

  @override
  State<AnimatedSymmetricalRing> createState() => _AnimatedSymmetricalRingState();
}

class _AnimatedSymmetricalRingState extends State<AnimatedSymmetricalRing>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 600),
  );

  @override
  void initState() {
    super.initState();
    if (widget.isActive) {
      _controller.forward();
    }
  }

  @override
  void didUpdateWidget(covariant AnimatedSymmetricalRing oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isActive != oldWidget.isActive) {
      if (widget.isActive) {
        _controller.forward();
      } else {
        _controller.reverse();
      }
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return CustomPaint(
          size: Size(widget.size, widget.size),
          painter: _SymmetricalRingPainter(
            progress: CurvedAnimation(
              parent: _controller,
              curve: widget.isActive ? Curves.easeOutCubic : Curves.easeInOutQuad,
            ).value,
            strokeWidth: widget.strokeWidth,
            color: widget.color,
            backgroundColor: widget.backgroundColor,
          ),
        );
      },
    );
  }
}

class _SymmetricalRingPainter extends CustomPainter {
  const _SymmetricalRingPainter({
    required this.progress,
    required this.strokeWidth,
    required this.color,
    required this.backgroundColor,
  });

  final double progress;
  final double strokeWidth;
  final Color color;
  final Color backgroundColor;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.width - strokeWidth) / 2;

    if (backgroundColor != Colors.transparent) {
      canvas.drawCircle(center, size.width / 2, Paint()..color = backgroundColor);
    }

    if (progress <= 0) return;

    final sweepAngle = math.pi * progress;
    final rect = Rect.fromCircle(center: center, radius: radius);

    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    // Left arc (starts at bottom pi/2 and sweeps counter-clockwise towards -pi/2)
    canvas.drawArc(rect, math.pi / 2, -sweepAngle, false, paint);

    // Right arc (starts at bottom pi/2 and sweeps clockwise towards 3*pi/2)
    canvas.drawArc(rect, math.pi / 2, sweepAngle, false, paint);
  }

  @override
  bool shouldRepaint(covariant _SymmetricalRingPainter oldDelegate) =>
      oldDelegate.progress != progress ||
      oldDelegate.color != color ||
      oldDelegate.backgroundColor != backgroundColor;
}
