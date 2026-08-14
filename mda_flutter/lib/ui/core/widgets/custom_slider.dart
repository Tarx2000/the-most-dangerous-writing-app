/// CustomSlider — 10-step alignment slider (port of `CustomSlider.tsx`, SPEC §15).
/// Discrete steps with spring snap on release, haptic tick per step.
/// `thumbSize 36`, `stepSize = (width − 60 − 36) / 9` (parity).
library;

import 'package:flutter/material.dart';

import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';

class CustomSlider extends StatefulWidget {
  const CustomSlider({
    super.key,
    required this.value,
    required this.onChanged,
    this.color = AppColors.primaryAction,
  });

  /// 1–10.
  final int value;
  final ValueChanged<int> onChanged;
  final Color color;

  @override
  State<CustomSlider> createState() => _CustomSliderState();
}

class _CustomSliderState extends State<CustomSlider> {
  static const double _thumbSize = 36;
  static const double _sidePadding = 30;

  double _dragValue = 5;

  @override
  void initState() {
    super.initState();
    _dragValue = widget.value.toDouble();
  }

  @override
  void didUpdateWidget(covariant CustomSlider oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value != widget.value) {
      _dragValue = widget.value.toDouble();
    }
  }

  double _thumbLeft(double width, double value) {
    final step = (width - _sidePadding * 2 - _thumbSize) / 9;
    return _sidePadding + (value - 1) * step;
  }

  int _valueAt(double width, double dx) {
    final step = (width - _sidePadding * 2 - _thumbSize) / 9;
    final clamped = dx.clamp(_sidePadding.toDouble(), _sidePadding + step * 9);
    return (((clamped - _sidePadding) / step).round() + 1).clamp(1, 10);
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        return SizedBox(
          height: 48,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              // Track
              Positioned(
                left: _sidePadding,
                right: _sidePadding,
                top: 22,
                child: Container(
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.glassSurfaceMedium,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              // Filled track (animates smoothly to the current step)
              Positioned(
                left: _sidePadding,
                top: 22,
                width: width <= _sidePadding * 2
                    ? 0.0
                    : (_thumbLeft(width, _dragValue) - _sidePadding + _thumbSize / 2)
                        .clamp(0.0, width - _sidePadding * 2),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 100),
                  height: 4,
                  decoration: BoxDecoration(
                    color: widget.color,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              // Tick marks
              Positioned(
                left: _sidePadding,
                right: _sidePadding,
                top: 18,
                child: Row(
                  children: [
                    for (var i = 1; i <= 10; i++)
                      Expanded(
                        child: Align(
                          alignment: Alignment.center,
                          child: Container(
                            width: 1.5,
                            height: 12,
                            color: i <= _dragValue.round()
                                ? widget.color
                                : AppColors.glassBorderMedium,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              // Thumb (direct Stack child, positioned by the current value)
              Positioned(
                left: _thumbLeft(width, _dragValue),
                top: 6,
                child: Container(
                  width: _thumbSize,
                  height: _thumbSize,
                  decoration: BoxDecoration(
                    color: AppColors.textPrimary,
                    shape: BoxShape.circle,
                    border: Border.all(color: widget.color, width: 2),
                    boxShadow: [
                      BoxShadow(
                        color: widget.color.withValues(alpha: 0.4),
                        blurRadius: 12,
                        spreadRadius: 1,
                      ),
                    ],
                  ),
                ),
              ),
              // Drag layer (full width; localPosition maps to the track space)
              Positioned.fill(
                child: GestureDetector(
                  behavior: HitTestBehavior.translucent,
                  onHorizontalDragStart: (details) {
                    final newValue = _valueAt(width, details.localPosition.dx);
                    if (newValue != _dragValue.round()) {
                      vibrate(HapticPatterns.tick);
                    }
                    setState(() {
                      _dragValue = newValue.toDouble();
                    });
                  },
                  onHorizontalDragUpdate: (details) {
                    final newValue = _valueAt(width, details.localPosition.dx);
                    if (newValue != _dragValue.round()) {
                      vibrate(HapticPatterns.tick);
                    }
                    setState(() {
                      _dragValue = newValue.toDouble();
                    });
                  },
                  onHorizontalDragEnd: (details) {
                    final value = _dragValue.round().clamp(1, 10);
                    vibrate(HapticPatterns.tick);
                    widget.onChanged(value);
                    setState(() => _dragValue = value.toDouble());
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
