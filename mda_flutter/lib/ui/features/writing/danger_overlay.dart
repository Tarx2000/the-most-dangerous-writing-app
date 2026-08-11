/// Danger overlay — blood vignette + fog + heartbeat (SPEC §8).
/// Painted with CustomPainter, driven by the idle ratio ValueListenable —
/// repaints only this layer (RepaintBoundary), never the whole screen.
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../domain/use_cases/session_engine.dart';

class DangerOverlay extends StatefulWidget {
  const DangerOverlay({super.key, required this.engine});

  final SessionEngine engine;

  @override
  State<DangerOverlay> createState() => _DangerOverlayState();
}

class _DangerOverlayState extends State<DangerOverlay>
    with SingleTickerProviderStateMixin {
  late final AnimationController _heartbeat = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 820),
  );

  double _ratio = 0;

  @override
  void initState() {
    super.initState();
    widget.engine.idleRatio.addListener(_onRatio);
    _heartbeat.addStatusListener(_onHeartbeatStatus);
  }

  @override
  void dispose() {
    widget.engine.idleRatio.removeListener(_onRatio);
    _heartbeat.dispose();
    super.dispose();
  }

  void _onRatio() {
    final ratio = widget.engine.idleRatio.value;
    if ((ratio - _ratio).abs() < 0.001) return;
    setState(() => _ratio = ratio);
    // Heartbeat sequence: lub 120 → gap → dub 100 → gap → pause 600 (SPEC).
    if (ratio >= 0.75 && !_heartbeat.isAnimating) {
      _heartbeat.forward(from: 0);
    }
  }

  void _onHeartbeatStatus(AnimationStatus status) {
    if (status == AnimationStatus.completed && _ratio >= 0.75 && mounted) {
      _heartbeat.forward(from: 0); // loop while danger persists
    }
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: RepaintBoundary(
        child: AnimatedBuilder(
          animation: _heartbeat,
          builder: (context, _) {
            return CustomPaint(
              size: Size.infinite,
              painter: _DangerPainter(ratio: _ratio, heartbeat: _heartbeat.value),
            );
          },
        ),
      ),
    );
  }
}

class _DangerPainter extends CustomPainter {
  const _DangerPainter({required this.ratio, required this.heartbeat});

  final double ratio;
  final double heartbeat;

  static const _vignetteFadeStart = 0.15;
  static const _fogStart = 0.50;
  static const _heartbeatStart = 0.75;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final maxRadius = math.sqrt(size.width * size.width + size.height * size.height) / 2;

    // -- Blood vignette (fades in from 0.15, seeps inward 1.12→1.0) ---------
    if (ratio > _vignetteFadeStart) {
      final vignetteOpacity = ((ratio - _vignetteFadeStart) / (1 - _vignetteFadeStart)) * 0.95;
      final scale = 1.12 - (ratio.clamp(0.0, 1.0)) * 0.12;
      final rect = Rect.fromCircle(center: center, radius: maxRadius * scale);
      final gradient = RadialGradient(
        colors: [
          AppColors.bloodDark.withValues(alpha: 0), // transparent core
          AppColors.bloodDark.withValues(alpha: 0.7 * vignetteOpacity),
          AppColors.bloodMedium.withValues(alpha: 0.85 * vignetteOpacity),
          AppColors.bloodMedium.withValues(alpha: vignetteOpacity),
        ],
        stops: const [0.45, 0.55, 0.85, 1.0],
        radius: 1.0,
      );
      canvas.drawRect(
        Rect.fromCenter(center: center, width: size.width, height: size.height),
        Paint()
          ..shader = gradient.createShader(rect)
          ..blendMode = BlendMode.plus,
      );
    }

    // -- Dark fog (obscures text above 0.50) --------------------------------
    if (ratio > _fogStart) {
      final fogOpacity = ((ratio - _fogStart) / (1 - _fogStart)) * 0.85;
      canvas.drawRect(
        Rect.fromCenter(center: center, width: size.width, height: size.height),
        Paint()..color = Colors.black.withValues(alpha: fogOpacity),
      );
    }

    // -- Heartbeat pulse (6% contraction above 0.75) ------------------------
    if (ratio >= _heartbeatStart && heartbeat > 0) {
      // Double-thump envelope: first beat ends ~0.15, second ~0.27 of the loop.
      final t = heartbeat;
      final double thump;
      if (t < 0.15) {
        thump = t / 0.15;
      } else if (t < 0.27) {
        thump = (t - 0.15) / 0.12;
      } else {
        thump = 0;
      }
      final pulseStrength = thump.clamp(0.0, 1.0) * 0.06;
      final rect = Rect.fromCircle(
        center: center,
        radius: maxRadius * (1 - pulseStrength),
      );
      canvas.drawRect(
        Rect.fromCenter(center: center, width: size.width, height: size.height),
        Paint()
          ..shader = RadialGradient(
            colors: [
              AppColors.bloodGlow.withValues(alpha: 0.5 * pulseStrength),
              Colors.transparent,
            ],
            stops: const [0.0, 0.6],
          ).createShader(rect),
      );
    }
  }

  @override
  bool shouldRepaint(covariant _DangerPainter oldDelegate) =>
      oldDelegate.ratio != ratio || oldDelegate.heartbeat != heartbeat;
}
