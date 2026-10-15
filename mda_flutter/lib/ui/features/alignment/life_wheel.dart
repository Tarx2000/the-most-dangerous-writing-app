import 'dart:math' as math;
import 'package:flutter/material.dart';

import '../../../data/models/wellbeing_checkin.dart';

/// Overview only: unanswered sectors stay empty. Values are entered by sliders.
class LifeWheel extends StatelessWidget {
  const LifeWheel({
    super.key,
    required this.values,
    this.selected,
    this.onSelected,
    this.size = 190,
  });
  final Map<LifeDomain, int> values;
  final LifeDomain? selected;
  final ValueChanged<LifeDomain>? onSelected;
  final double size;

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Life wheel. ${values.length} of 8 areas rated.',
    child: SizedBox.square(
      dimension: size,
      child: GestureDetector(
        onTapDown: onSelected == null
            ? null
            : (d) {
                final offset = d.localPosition - Offset(size / 2, size / 2);
                final angle =
                    (math.atan2(offset.dy, offset.dx) +
                        math.pi / 2 +
                        math.pi * 2) %
                    (math.pi * 2);
                onSelected!(
                  LifeDomain.values[(angle / (math.pi / 4)).floor().clamp(
                    0,
                    7,
                  )],
                );
              },
        child: RepaintBoundary(
          child: CustomPaint(painter: _WheelPainter(values, selected)),
        ),
      ),
    ),
  );
}

class _WheelPainter extends CustomPainter {
  _WheelPainter(this.values, this.selected);
  final Map<LifeDomain, int> values;
  final LifeDomain? selected;
  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = size.shortestSide / 2 - 8;
    final grid = Paint()
      ..color = const Color(0xFF333333)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.7;
    for (var i = 1; i <= 5; i++) {
      canvas.drawCircle(center, radius * i / 5, grid);
    }
    for (var i = 0; i < 8; i++) {
      final start = -math.pi / 2 + i * math.pi / 4;
      final end = center + Offset(math.cos(start), math.sin(start)) * radius;
      canvas.drawLine(center, end, grid);
      final domain = LifeDomain.values[i];
      final value = values[domain];
      if (value == null) continue;
      final r = radius * value / 10;
      final fill = Paint()
        ..color = domain == selected
            ? const Color(0x99FF453A)
            : const Color(0x48FFFFFF);
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: r),
        start + 0.018,
        math.pi / 4 - 0.036,
        true,
        fill,
      );
      final angle = start + math.pi / 8;
      canvas.drawCircle(
        center + Offset(math.cos(angle), math.sin(angle)) * r,
        2.2,
        Paint()
          ..color = domain == selected ? const Color(0xFFFF453A) : Colors.white,
      );
    }
  }

  @override
  bool shouldRepaint(_WheelPainter old) =>
      old.values != values || old.selected != selected;
}
