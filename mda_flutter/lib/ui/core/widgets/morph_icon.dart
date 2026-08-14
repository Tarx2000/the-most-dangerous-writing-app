/// LiquidMorphIcon — Smoothly morphs between SVG icon shapes (SPEC §15, 1:1 port of LiquidMorphIcon.tsx).
/// Uses equidistant path metric sampling and vertex interpolation to morph
/// between journal (quill), circles (bust), vlog (camera), and checkin (4-point star).
library;

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';

class LiquidMorphIcon extends StatefulWidget {
  const LiquidMorphIcon({
    super.key,
    required this.icon,
    this.color = AppColors.primaryAction,
    this.size = 42,
    this.glowColor,
    this.animated = true,
  });

  /// Mode / shape name: 'journal' | 'circles' | 'vlog' | 'checkin'
  final String icon;
  final Color color;
  final double size;
  final Color? glowColor;
  final bool animated;

  @override
  State<LiquidMorphIcon> createState() => _LiquidMorphIconState();
}

class _LiquidMorphIconState extends State<LiquidMorphIcon>
    with SingleTickerProviderStateMixin {
  static const int _sampleCount = 72;

  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 200),
  );

  late String _fromIcon = widget.icon;
  late String _toIcon = widget.icon;
  late Color _fromColor = widget.color;
  late Color _toColor = widget.color;

  static final Map<String, List<Offset>> _cachedPoints = _precomputePoints();

  static Map<String, List<Offset>> _precomputePoints() {
    final paths = <String, Path>{
      'journal': _buildJournalPath(),
      'circles': _buildCirclesPath(),
      'vlog': _buildVlogPath(),
      'checkin': _buildCheckinPath(),
      // Fallback aliases
      'notebookEdit': _buildJournalPath(),
      'accountGroup': _buildCirclesPath(),
      'videoOutline': _buildVlogPath(),
      'pillar': _buildCheckinPath(),
    };

    final result = <String, List<Offset>>{};
    for (final entry in paths.entries) {
      final metrics = entry.value.computeMetrics().toList();
      if (metrics.isNotEmpty) {
        final metric = metrics.first;
        final length = metric.length;
        result[entry.key] = List.generate(_sampleCount, (i) {
          final dist = (i / _sampleCount) * length;
          final tangent = metric.getTangentForOffset(dist);
          return tangent?.position ?? Offset.zero;
        });
      }
    }
    return result;
  }

  static Path _buildJournalPath() {
    final p = Path();
    p.moveTo(22, 2);
    p.cubicTo(14.36, 1.63, 8.34, 9.88, 3.72, 16.21);
    p.lineTo(2, 22);
    p.lineTo(3.94, 21);
    p.cubicTo(5.38, 18.5, 6.13, 17.47, 7.54, 16);
    p.cubicTo(10.07, 16.74, 12.71, 16.65, 15, 14);
    p.cubicTo(13, 13.44, 11.4, 13.57, 9.04, 13.81);
    p.cubicTo(11.69, 12, 13.5, 11.6, 16, 12);
    p.lineTo(17, 10);
    p.cubicTo(15.2, 9.66, 14, 9.63, 12.22, 10.04);
    p.cubicTo(14.19, 8.65, 15.56, 7.87, 18, 8);
    p.lineTo(19.21, 6.07);
    p.cubicTo(17.65, 5.96, 16.71, 6.13, 14.92, 6.57);
    p.cubicTo(16.53, 5.11, 18, 4.45, 20.14, 4.32);
    p.close();
    return p;
  }

  static Path _buildCirclesPath() {
    final p = Path();
    p.moveTo(12, 2);
    p.cubicTo(14.76, 2, 17, 4.24, 17, 7);
    p.cubicTo(17, 8.93, 15.84, 10.56, 14.18, 11.4);
    p.cubicTo(17.32, 12.44, 20, 14.5, 20, 17.5);
    p.lineTo(20, 22);
    p.lineTo(4, 22);
    p.lineTo(4, 17.5);
    p.cubicTo(4, 14.5, 6.68, 12.44, 9.82, 11.4);
    p.cubicTo(8.16, 10.56, 7, 8.93, 7, 7);
    p.cubicTo(7, 4.24, 9.24, 2, 12, 2);
    p.close();
    return p;
  }

  static Path _buildVlogPath() {
    final p = Path();
    p.moveTo(16, 6);
    p.lineTo(4, 6);
    p.cubicTo(3.45, 6, 3, 6.45, 3, 7);
    p.lineTo(3, 17);
    p.cubicTo(3, 17.55, 3.45, 18, 4, 18);
    p.lineTo(16, 18);
    p.cubicTo(16.55, 18, 17, 17.55, 17, 17);
    p.lineTo(17, 13.5);
    p.lineTo(21, 17.5);
    p.lineTo(21, 6.5);
    p.lineTo(17, 10.5);
    p.lineTo(17, 7);
    p.cubicTo(17, 6.45, 16.55, 6, 16, 6);
    p.close();
    return p;
  }

  static Path _buildCheckinPath() {
    final p = Path();
    p.moveTo(12, 1);
    p.lineTo(9, 9);
    p.lineTo(1, 12);
    p.lineTo(9, 15);
    p.lineTo(12, 23);
    p.lineTo(15, 15);
    p.lineTo(23, 12);
    p.lineTo(15, 9);
    p.close();
    return p;
  }

  @override
  void didUpdateWidget(covariant LiquidMorphIcon oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.icon != widget.icon || oldWidget.color != widget.color) {
      if (widget.animated) {
        _fromIcon = oldWidget.icon;
        _toIcon = widget.icon;
        _fromColor = oldWidget.color;
        _toColor = widget.color;
        _controller.forward(from: 0);
      } else {
        _fromIcon = widget.icon;
        _toIcon = widget.icon;
        _fromColor = widget.color;
        _toColor = widget.color;
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
    return RepaintBoundary(
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          final t = _controller.value;
          // Scale bounce factor max 1.04 matching RN BOUNCE_SCALES
          final scale = t < 0.4 ? 1.0 : 1.0 + 0.04 * ((t - 0.4) / 0.6);

          final fromPts = _cachedPoints[_fromIcon] ?? _cachedPoints['journal']!;
          final toPts = _cachedPoints[_toIcon] ?? _cachedPoints['journal']!;
          final currentColor = Color.lerp(_fromColor, _toColor, t) ?? widget.color;

          return Container(
            width: widget.size + 16,
            height: widget.size + 16,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              boxShadow: widget.glowColor != null
                  ? [
                      BoxShadow(
                        color: widget.glowColor!,
                        blurRadius: 28,
                        spreadRadius: 2,
                      ),
                    ]
                  : null,
            ),
            child: Transform.scale(
              scale: scale,
              child: Center(
                child: CustomPaint(
                  size: Size(widget.size, widget.size),
                  painter: _MorphPainter(
                    fromPoints: fromPts,
                    toPoints: toPts,
                    progress: t,
                    color: currentColor,
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _MorphPainter extends CustomPainter {
  const _MorphPainter({
    required this.fromPoints,
    required this.toPoints,
    required this.progress,
    required this.color,
  });

  final List<Offset> fromPoints;
  final List<Offset> toPoints;
  final double progress;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    if (fromPoints.isEmpty || toPoints.isEmpty) return;

    final scaleX = size.width / 24.0;
    final scaleY = size.height / 24.0;

    final path = Path();
    final count = fromPoints.length;

    for (var i = 0; i < count; i++) {
      final p1 = fromPoints[i];
      final p2 = toPoints[i];
      final x = (p1.dx + (p2.dx - p1.dx) * progress) * scaleX;
      final y = (p1.dy + (p2.dy - p1.dy) * progress) * scaleY;

      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    path.close();

    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _MorphPainter oldDelegate) =>
      oldDelegate.progress != progress ||
      oldDelegate.color != color ||
      oldDelegate.fromPoints != fromPoints ||
      oldDelegate.toPoints != toPoints;
}
