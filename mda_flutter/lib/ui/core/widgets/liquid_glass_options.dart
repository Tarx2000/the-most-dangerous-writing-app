import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:liquid_glass_easy/liquid_glass_easy.dart';

import 'app_glass.dart';

/// Inline glass selection with the same hold/preview/release contract as the nav.
/// The package owns the lens morph and acceleration-based deformation.
class LiquidGlassOptions extends StatefulWidget {
  const LiquidGlassOptions({
    super.key,
    required this.options,
    required this.selectedIndex,
    required this.onChanged,
    this.width = 270,
    this.height = 44,
  }) : assert(options.length > 1),
       assert(selectedIndex >= 0 && selectedIndex < options.length);

  final List<String> options;
  final int selectedIndex;
  final ValueChanged<int> onChanged;
  final double width;
  final double height;

  @override
  State<LiquidGlassOptions> createState() => _LiquidGlassOptionsState();
}

class _LiquidGlassOptionsState extends State<LiquidGlassOptions>
    with SingleTickerProviderStateMixin {
  static const _inset = 4.0;
  late final AnimationController _position;
  late final ValueNotifier<int> _preview;
  late int _target;
  bool _dragging = false;
  bool _travelling = false;

  @override
  void initState() {
    super.initState();
    _target = widget.selectedIndex;
    _preview = ValueNotifier(_target);
    _position = AnimationController.unbounded(
      vsync: this,
      value: _target.toDouble(),
    );
  }

  @override
  void didUpdateWidget(LiquidGlassOptions oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_dragging && widget.selectedIndex != _target) {
      _settle(widget.selectedIndex);
    }
  }

  @override
  void dispose() {
    _position.dispose();
    _preview.dispose();
    super.dispose();
  }

  double _fractionAt(double x, double width) {
    final cellWidth = (width - 2 * _inset) / widget.options.length;
    return ((x - _inset) / cellWidth - 0.5).clamp(
      0.0,
      widget.options.length - 1.0,
    );
  }

  void _followFinger(double x, double width) {
    final fraction = _fractionAt(x, width);
    _position.value = fraction;
    // Label/semantics updates happen only at option boundaries, not per frame.
    _preview.value = fraction.round();
  }

  Future<void> _settle(int index) async {
    _target = index;
    _preview.value = index;
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    setState(() {
      _dragging = false;
      _travelling = !reduceMotion && (_position.value - index).abs() > 0.001;
    });
    if (!_travelling) {
      _position.value = index.toDouble();
      return;
    }
    try {
      await _position
          .animateWith(
            SpringSimulation(
              const SpringDescription(mass: 1, stiffness: 320, damping: 31.4),
              _position.value,
              index.toDouble(),
              0,
            ),
          )
          .orCancel;
    } on TickerCanceled {
      return;
    }
    if (mounted) setState(() => _travelling = false);
  }

  void _commit(int index) {
    if (index != widget.selectedIndex) widget.onChanged(index);
    _settle(index);
  }

  @override
  Widget build(BuildContext context) => SizedBox(
    width: widget.width,
    height: widget.height,
    child: LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final cellWidth = (width - 2 * _inset) / widget.options.length;
        return RawGestureDetector(
          behavior: HitTestBehavior.opaque,
          excludeFromSemantics: true,
          gestures: {
            LongPressGestureRecognizer:
                GestureRecognizerFactoryWithHandlers<
                  LongPressGestureRecognizer
                >(
                  () => LongPressGestureRecognizer(
                    duration: const Duration(milliseconds: 100),
                  ),
                  (gesture) {
                    gesture.onLongPressStart = (details) {
                      _position.stop();
                      setState(() {
                        _dragging = true;
                        _travelling = false;
                        _followFinger(details.localPosition.dx, width);
                      });
                    };
                    gesture.onLongPressMoveUpdate = (details) {
                      _followFinger(details.localPosition.dx, width);
                    };
                    gesture.onLongPressEnd = (_) =>
                        _commit(_position.value.round());
                    gesture.onLongPressCancel = () {
                      if (_dragging) _settle(widget.selectedIndex);
                    };
                  },
                ),
          },
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            excludeFromSemantics: true,
            onTapUp: (details) =>
                _commit(_fractionAt(details.localPosition.dx, width).round()),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                // Stable material is kept out of the position animation.
                Positioned.fill(
                  child: IgnorePointer(
                    child: LiquidGlassLens(
                      style: AppGlass.surface(
                        widget.height / 2,
                        tint: Colors.transparent,
                      ),
                    ),
                  ),
                ),
                Positioned.fill(
                  child: IgnorePointer(
                    child: AnimatedBuilder(
                      animation: _position,
                      builder: (context, _) => LiquidGlassMotionPill(
                        center: Offset(
                          _inset + cellWidth * (_position.value + 0.5),
                          widget.height / 2,
                        ),
                        active:
                            !MediaQuery.disableAnimationsOf(context) &&
                            (_dragging || _travelling),
                        restSize: Size(cellWidth, widget.height - 2 * _inset),
                        activeSize: Size(cellWidth + 4, widget.height - 2),
                        style: AppGlass.movingSelection,
                        expandDamping: 28,
                        contractDamping: 28,
                        motion: const LiquidGlassLensMotionSpec(
                          maxDeformation: 0.05,
                        ),
                        // MotionPill retires its shader after contraction. Its
                        // opaque rest face keeps the same rim and covers that
                        // handoff smoothly, without an idle backdrop read.
                        cover: const LiquidGlassLite(
                          shape: LiquidGlassShape.roundedRectangle(
                            cornerRadius: 999,
                          ),
                          specular: AppGlass.rim,
                          glow: AppGlass.noGlow,
                          color: Color(0xFF101010),
                          blur: 0,
                        ),
                      ),
                    ),
                  ),
                ),
                Positioned.fill(
                  child: ValueListenableBuilder<int>(
                    valueListenable: _preview,
                    builder: (context, preview, _) => Padding(
                      padding: const EdgeInsets.all(_inset),
                      child: Row(
                        children: [
                          for (var i = 0; i < widget.options.length; i++)
                            Expanded(
                              child: Semantics(
                                button: true,
                                selected: i == widget.selectedIndex,
                                label: widget.options[i],
                                onTap: () => _commit(i),
                                excludeSemantics: true,
                                child: Center(
                                  child: FittedBox(
                                    fit: BoxFit.scaleDown,
                                    child: Text(
                                      widget.options[i],
                                      style: TextStyle(
                                        color: i == preview
                                            ? Colors.white
                                            : const Color(0xB3FFFFFF),
                                        fontSize: 12,
                                        fontWeight: i == preview
                                            ? FontWeight.w500
                                            : FontWeight.w400,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    ),
  );
}
