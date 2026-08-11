/// TickDial — Tide-style duration ruler (SPEC §15).
/// Major tick every 80 px, 4 minor ticks between (16 px), center indicator,
/// smooth scrollTo snapping, value 44/200 with a scale bounce + haptic on change.
///
/// Geometry: the ruler content is `viewport + (count-1) * 80` wide, with tick *i*
/// drawn at `x = viewport/2 + i * 80`. When scrolled to offset `o`, the tick
/// under the center indicator is `o / 80`, so each value aligns exactly.
library;

import 'package:flutter/material.dart';

import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';

class TickDial extends StatefulWidget {
  const TickDial({
    super.key,
    required this.count,
    required this.valueLabel,
    this.onChanged,
    this.initialValue = 0,
  });

  /// Number of selectable positions (e.g. 6 session options).
  final int count;

  /// Label rendered under the big value (e.g. "min").
  final String valueLabel;

  final ValueChanged<int>? onChanged;

  final int initialValue;

  @override
  State<TickDial> createState() => _TickDialState();
}

class _TickDialState extends State<TickDial> {
  static const double _perStep = 80.0;

  late final ScrollController _controller = ScrollController();
  int _value = 0;
  bool _dragging = false;
  bool _didInit = false;

  double get _maxOffset => (widget.count - 1) * _perStep;

  @override
  void initState() {
    super.initState();
    _value = widget.initialValue;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_didInit) {
      _didInit = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _controller.jumpTo(_value * _perStep);
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  int _valueAtOffset(double offset) =>
      ((offset / _perStep).round()).clamp(0, widget.count - 1);

  void _updateValue(int value, {bool withHaptics = true}) {
    if (value == _value) return;
    setState(() => _value = value);
    if (withHaptics) vibrate(HapticPatterns.tick);
    widget.onChanged?.call(value);
  }

  void _snapToNearest() {
    final target = (_controller.offset / _perStep).round() * _perStep;
    _controller.animateTo(
      target.clamp(0.0, _maxOffset),
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    final viewportWidth = MediaQuery.sizeOf(context).width;

    return SizedBox(
      height: 128,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Tick ruler (scrolls; ticks painted relative to the viewport center).
          NotificationListener<ScrollNotification>(
            onNotification: (notification) {
              if (notification is ScrollStartNotification) {
                _dragging = true;
              } else if (notification is ScrollEndNotification) {
                if (_dragging) {
                  _dragging = false;
                  _snapToNearest();
                }
              } else if (notification is ScrollUpdateNotification) {
                _updateValue(_valueAtOffset(_controller.offset));
              }
              return false;
            },
            child: Listener(
              onPointerDown: (_) => _dragging = true,
              child: SingleChildScrollView(
                controller: _controller,
                scrollDirection: Axis.horizontal,
                physics: const BouncingScrollPhysics(),
                child: SizedBox(
                  width: viewportWidth + _maxOffset,
                  height: 128,
                  child: CustomPaint(
                    painter: _TickPainter(
                      count: widget.count,
                      centerX: viewportWidth / 2,
                      perStep: _perStep,
                    ),
                  ),
                ),
              ),
            ),
          ),
          // Center indicator (exact screen center, red)
          IgnorePointer(
            child: Container(
              width: 3,
              height: 42,
              decoration: BoxDecoration(
                color: AppColors.primaryAction,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          // Value readout (44 / weight 200) + label
          Positioned(
            bottom: 4,
            child: AnimatedBuilder(
              animation: _controller,
              builder: (context, _) {
                return Row(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Text(
                      '$_value',
                      style: const TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 44,
                        fontWeight: FontWeight.w200,
                        height: 1.0,
                      ),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      widget.valueLabel,
                      style: const TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 20,
                        fontWeight: FontWeight.w300,
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _TickPainter extends CustomPainter {
  const _TickPainter({
    required this.count,
    required this.centerX,
    required this.perStep,
  });

  final int count;
  final double centerX;
  final double perStep;

  @override
  void paint(Canvas canvas, Size size) {
    final centerY = size.height / 2;
    for (var i = 0; i < count; i++) {
      final x = centerX + i * perStep;
      final paint = Paint()..color = AppColors.lightGrey;
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(center: Offset(x, centerY), width: 2.5, height: 28),
          const Radius.circular(1.5),
        ),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _TickPainter oldDelegate) =>
      oldDelegate.count != count || oldDelegate.centerX != centerX;
}
