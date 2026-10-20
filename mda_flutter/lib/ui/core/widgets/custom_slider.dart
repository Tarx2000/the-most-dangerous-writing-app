import 'package:flutter/material.dart';
import 'package:liquid_glass_easy/liquid_glass_easy.dart';

import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';
import 'app_glass.dart';

/// A discrete rating with continuous finger tracking. The package owns the
/// moving glass optics; an opaque rest thumb needs no idle backdrop read.
/// Null is deliberately unanswered, even though the thumb starts in the middle.
class CustomSlider extends StatefulWidget {
  const CustomSlider({
    super.key,
    required this.value,
    required this.onChanged,
    this.onCancelled,
    this.color = AppColors.textPrimary,
    this.min = 1,
    this.max = 10,
    this.enableGlass = false,
    this.label = 'Rating',
    this.valueFormatter,
  }) : assert(max > min);

  final int? value;
  final ValueChanged<int> onChanged;
  final ValueChanged<int?>? onCancelled;
  final Color color;
  final int min;
  final int max;
  final bool enableGlass;
  final String label;
  final String Function(int)? valueFormatter;

  @override
  State<CustomSlider> createState() => _CustomSliderState();
}

class _CustomSliderState extends State<CustomSlider> {
  late final ValueNotifier<double> _position = ValueNotifier(_displayValue);
  bool _dragging = false;
  int? _beforeDrag;
  int? _lastSent;
  double get _displayValue => (widget.value ?? (widget.min + widget.max) / 2)
      .toDouble()
      .clamp(widget.min.toDouble(), widget.max.toDouble());

  @override
  void didUpdateWidget(CustomSlider oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_dragging) _position.value = _displayValue;
  }

  @override
  void dispose() {
    _position.dispose();
    super.dispose();
  }

  void _send(int value) {
    if (_lastSent != value) {
      _lastSent = value;
      vibrate(HapticPatterns.tick);
      widget.onChanged(value);
    }
  }

  void _follow(double dx, double width) {
    final fraction = ((dx - 24) / (width - 48)).clamp(0.0, 1.0);
    _position.value = widget.min + fraction * (widget.max - widget.min);
    _send(_position.value.round());
  }

  void _cancelDrag() {
    if (!_dragging) return;
    setState(() => _dragging = false);
    _position.value = (_beforeDrag ?? (widget.min + widget.max) / 2).toDouble();
    widget.onCancelled?.call(_beforeDrag);
  }

  String _format(int value) =>
      widget.valueFormatter?.call(value) ?? '$value of ${widget.max}';

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final width = constraints.maxWidth;
      if (width <= 48) return const SizedBox(height: 56);
      return Semantics(
        container: true,
        label: widget.label,
        value: widget.value == null ? 'Not rated' : _format(widget.value!),
        increasedValue: _format(
          (_displayValue.round() + 1).clamp(widget.min, widget.max),
        ),
        decreasedValue: _format(
          (_displayValue.round() - 1).clamp(widget.min, widget.max),
        ),
        onIncrease: () =>
            _send((_displayValue.round() + 1).clamp(widget.min, widget.max)),
        onDecrease: () =>
            _send((_displayValue.round() - 1).clamp(widget.min, widget.max)),
        child: Listener(
          onPointerDown: (_) => _beforeDrag = widget.value,
          onPointerCancel: (_) => _cancelDrag(),
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            excludeFromSemantics: true,
            onTapUp: (d) {
              _lastSent = null;
              _follow(d.localPosition.dx, width);
            },
            onHorizontalDragStart: (d) {
              _lastSent = null;
              setState(() => _dragging = true);
              _follow(d.localPosition.dx, width);
            },
            onHorizontalDragUpdate: (d) => _follow(d.localPosition.dx, width),
            onHorizontalDragEnd: (_) {
              setState(() => _dragging = false);
              _position.value = _position.value.roundToDouble();
            },
            onHorizontalDragCancel: _cancelDrag,
            child: SizedBox(
              height: 56,
              child: Stack(
                children: [
                  Positioned(
                    left: 24,
                    right: 24,
                    top: 25,
                    child: Container(
                      height: 6,
                      decoration: BoxDecoration(
                        color: AppColors.sliderTrack,
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                  ),
                  Positioned.fill(
                    child: IgnorePointer(
                      child: ValueListenableBuilder<double>(
                        valueListenable: _position,
                        builder: (context, value, _) {
                          final x =
                              24 +
                              (value - widget.min) /
                                  (widget.max - widget.min) *
                                  (width - 48);
                          return Stack(
                            clipBehavior: Clip.none,
                            children: [
                              if (widget.value != null || _dragging)
                                Positioned(
                                  left: 24,
                                  top: 25,
                                  width: x - 24,
                                  child: Container(
                                    height: 6,
                                    decoration: BoxDecoration(
                                      color: widget.color,
                                      borderRadius: BorderRadius.circular(3),
                                    ),
                                  ),
                                ),
                              if (widget.enableGlass)
                                Positioned.fill(
                                  child: LiquidGlassMotionPill(
                                    center: Offset(x, 28),
                                    active:
                                        _dragging &&
                                        !MediaQuery.disableAnimationsOf(
                                          context,
                                        ),
                                    restSize: const Size(38, 26),
                                    activeSize: const Size(46, 32),
                                    expandDamping: 28,
                                    contractDamping: 30,
                                    motion: const LiquidGlassLensMotionSpec(
                                      maxDeformation: 0.04,
                                    ),
                                    style: AppGlass.movingSelection,
                                    cover: DecoratedBox(
                                      decoration: BoxDecoration(
                                        color:
                                            widget.value == null && !_dragging
                                            ? AppColors.sliderThumbUnset
                                            : AppColors.sliderThumbActive,
                                        borderRadius: BorderRadius.circular(20),
                                      ),
                                    ),
                                  ),
                                )
                              else
                                Positioned(
                                  left: x - 14,
                                  top: 14,
                                  child: Container(
                                    width: 28,
                                    height: 28,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: widget.value == null && !_dragging
                                          ? AppColors.sliderThumbUnset
                                          : AppColors.textPrimary,
                                    ),
                                  ),
                                ),
                            ],
                          );
                        },
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    },
  );
}
