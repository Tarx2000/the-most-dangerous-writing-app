import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../../domain/use_cases/session_engine.dart';

/// A continuous full-window veil: the centre is never cut out. Only this leaf
/// interpolates the engine's 10 Hz samples; the editor is not rebuilt per frame.
class DangerOverlay extends StatefulWidget {
  const DangerOverlay({super.key, required this.engine});
  final SessionEngine engine;
  @override
  State<DangerOverlay> createState() => _DangerOverlayState();
}

class _DangerOverlayState extends State<DangerOverlay>
    with TickerProviderStateMixin {
  late final AnimationController _visualRatio = AnimationController(
    vsync: this,
    value: widget.engine.idleRatio.value.clamp(0.0, 1.0),
  );
  late final AnimationController _heartbeat = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 820),
  );
  bool _reduceMotion = false;
  @override
  void initState() {
    super.initState();
    widget.engine.idleRatio.addListener(_onRatio);
    _visualRatio.addListener(_syncHeartbeat);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduceMotion = MediaQuery.disableAnimationsOf(context);
    _onRatio();
  }

  @override
  void didUpdateWidget(covariant DangerOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.engine != widget.engine) {
      oldWidget.engine.idleRatio.removeListener(_onRatio);
      widget.engine.idleRatio.addListener(_onRatio);
      _onRatio();
    }
  }

  void _onRatio() {
    final target = widget.engine.idleRatio.value.clamp(0.0, 1.0);
    if (target == 0 || _reduceMotion) {
      // A keystroke clears the treatment immediately, including both tickers.
      _visualRatio.value = target;
    } else if (target != _visualRatio.value) {
      _visualRatio.animateTo(
        target,
        duration: const Duration(milliseconds: 100),
        curve: Curves.linear,
      );
    }
    _syncHeartbeat();
  }

  void _syncHeartbeat() {
    if (!_reduceMotion && _visualRatio.value >= 0.75) {
      if (!_heartbeat.isAnimating) _heartbeat.repeat();
    } else if (_heartbeat.isAnimating || _heartbeat.value != 0) {
      _heartbeat.stop();
      _heartbeat.value = 0;
    }
  }

  @override
  void dispose() {
    widget.engine.idleRatio.removeListener(_onRatio);
    _visualRatio.dispose();
    _heartbeat.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: ClipRect(
      child: ValueListenableBuilder<double>(
        valueListenable: _visualRatio,
        child: RepaintBoundary(
          child: CustomPaint(
            size: Size.infinite,
            painter: DangerPainter(_visualRatio, _heartbeat),
          ),
        ),
        builder: (context, ratio, child) {
          // One full-area Gaussian, with a smooth onset and no masked seam.
          // The idle engine remains unchanged; only its presentation is eased.
          final progress = ((ratio - 0.20) / 0.80).clamp(0.0, 1.0);
          final sigma = progress * progress * (3 - 2 * progress) * 6;
          return sigma == 0
              ? child!
              : BackdropFilter(
                  filter: ui.ImageFilter.blur(sigmaX: sigma, sigmaY: sigma),
                  child: child,
                );
        },
      ),
    ),
  );
}

class DangerPainter extends CustomPainter {
  DangerPainter(this.idleRatio, this.heartbeat)
    : super(repaint: Listenable.merge([idleRatio, heartbeat]));
  final ValueListenable<double> idleRatio;
  final Animation<double> heartbeat;

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) return;
    final ratio = idleRatio.value.clamp(0.0, 1.0);
    final bounds = Offset.zero & size;
    // Preserve the user's preferred black fog and its original thresholds.
    if (ratio > 0.5) {
      canvas.drawRect(
        bounds,
        Paint()
          ..color = Colors.black.withValues(alpha: (ratio - 0.5) / 0.5 * 0.85),
      );
    }
    if (ratio <= 0.15) return;
    final progress = (ratio - 0.15) / 0.85;
    final intensity = progress * progress * (3 - 2 * progress);
    // A low-amplitude cosine pulse has no abrupt joins or spatial movement.
    final pulse = (1 - math.cos(heartbeat.value * 2 * math.pi)) / 2;
    final opacity = intensity * (0.30 + pulse * 0.008);
    final spread = (progress / 0.70).clamp(0.0, 1.0);
    final edgeEmphasis = 0.36 * (1 - spread * spread * (3 - 2 * spread));
    Color colorAt(double x) {
      final edge = (1 + math.cos(x * 2 * math.pi)) / 2;
      // Even the first warning has a continuous centre. By the middle/late
      // warning the field is uniform, rather than two approaching curtains.
      return const Color(
        0xFFBA2833,
      ).withValues(alpha: opacity * (1 - edgeEmphasis + edgeEmphasis * edge));
    }

    const stops = [
      0.0,
      0.0625,
      0.125,
      0.1875,
      0.25,
      0.3125,
      0.375,
      0.4375,
      0.5,
      0.5625,
      0.625,
      0.6875,
      0.75,
      0.8125,
      0.875,
      0.9375,
      1.0,
    ];
    canvas.drawRect(
      bounds,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset.zero,
          Offset(size.width, 0),
          stops.map(colorAt).toList(growable: false),
          stops,
        ),
    );
  }

  @override
  bool shouldRepaint(DangerPainter old) =>
      old.idleRatio != idleRatio || old.heartbeat != heartbeat;
}
