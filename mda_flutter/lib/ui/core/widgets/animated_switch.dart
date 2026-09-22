/// Spectrum UI — AnimatedSwitch for Flutter
///
/// An iOS-quality toggle switch with:
/// - A press-to-stretch knob (stretches toward the far side, anchored to the side it sits on)
/// - Drag-to-toggle with real-time knob tracking
/// - Flick detection: committing in the flick direction when velocity exceeds 250 px/s
/// - Optional crossfading knob icons with rotation and scale transition
/// - 3 sizes: sm, md, lg
/// - Minimum 48x48 touch target for mobile accessibility
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';

/// Visual size of the switch.
enum AnimatedSwitchSize {
  sm(trackWidth: 32, trackHeight: 18, iconSize: 9),
  md(trackWidth: 44, trackHeight: 24, iconSize: 11),
  lg(trackWidth: 56, trackHeight: 30, iconSize: 13);

  const AnimatedSwitchSize({
    required this.trackWidth,
    required this.trackHeight,
    required this.iconSize,
  });

  final double trackWidth;
  final double trackHeight;
  final double iconSize;

  double get knobSize => trackHeight - 4.0; // 2px padding each side
  double get stretchedWidth => (knobSize * 1.35).roundToDouble();
}

/// An iOS-style animated toggle switch based on the Spectrum UI specification.
class AnimatedSwitch extends StatefulWidget {
  const AnimatedSwitch({
    super.key,
    required this.value,
    this.onChanged,
    this.size = AnimatedSwitchSize.md,
    this.onIcon,
    this.offIcon,
    this.disabled = false,
    this.activeTrackColor,
    this.inactiveTrackColor,
    this.knobColor,
    this.activeKnobColor,
    this.minTouchTarget = 48.0,
  });

  /// Current toggle state.
  final bool value;

  /// Called when the user toggles the switch.
  final ValueChanged<bool>? onChanged;

  /// Visual size: [AnimatedSwitchSize.sm], [AnimatedSwitchSize.md], or [AnimatedSwitchSize.lg].
  final AnimatedSwitchSize size;

  /// Optional icon displayed inside the knob when [value] is true.
  final Widget? onIcon;

  /// Optional icon displayed inside the knob when [value] is false.
  final Widget? offIcon;

  /// Whether the switch is interactive.
  final bool disabled;

  /// Color of the track when active (defaults to [AppColors.primaryAction]).
  final Color? activeTrackColor;

  /// Color of the track when inactive (defaults to [AppColors.border]).
  final Color? inactiveTrackColor;

  /// Color of the knob (defaults to [AppColors.textPrimary]).
  final Color? knobColor;

  /// Optional color of the knob when active.
  final Color? activeKnobColor;

  /// Minimum touch target dimension in points (default 48.0 for mobile ergonomics).
  final double minTouchTarget;

  @override
  State<AnimatedSwitch> createState() => _AnimatedSwitchState();
}

class _AnimatedSwitchState extends State<AnimatedSwitch>
    with TickerProviderStateMixin {
  /// Controls the knob position (0.0 = off / left, 1.0 = on / right).
  late final AnimationController _positionController;

  /// Controls the knob stretch amount (0.0 = round, 1.0 = stretched 1.35x).
  late final AnimationController _stretchController;

  /// Whether a drag gesture is currently active.
  bool _isDragging = false;

  /// Current drag displacement in pixels.
  double _dragOffset = 0.0;

  /// Track padding constant from Spectrum UI spec.
  static const double _trackPadding = 2.0;

  /// Flick velocity threshold in px/s.
  static const double _flickVelocityThreshold = 250.0;

  @override
  void initState() {
    super.initState();
    _positionController = AnimationController(
      vsync: this,
      value: widget.value ? 1.0 : 0.0,
      duration: const Duration(milliseconds: 220),
    );

    _stretchController = AnimationController(
      vsync: this,
      value: 0.0,
      duration: const Duration(milliseconds: 140),
    );
  }

  @override
  void didUpdateWidget(covariant AnimatedSwitch oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.value != oldWidget.value && !_isDragging) {
      final target = widget.value ? 1.0 : 0.0;
      _positionController.animateTo(
        target,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
      );
    }
  }

  @override
  void dispose() {
    _positionController.dispose();
    _stretchController.dispose();
    super.dispose();
  }

  void _handleTapDown(TapDownDetails details) {
    if (widget.disabled || widget.onChanged == null) return;
    _stretchController.animateTo(
      1.0,
      duration: const Duration(milliseconds: 120),
      curve: Curves.easeOut,
    );
  }

  void _handleTapUp(TapUpDetails details) {
    if (widget.disabled || widget.onChanged == null) return;
    _stretchController.animateTo(
      0.0,
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
    );
    _commitToggle(!widget.value);
  }

  void _handleTapCancel() {
    if (widget.disabled || widget.onChanged == null) return;
    _stretchController.animateTo(
      0.0,
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
    );
  }

  void _handleDragStart(DragStartDetails details) {
    if (widget.disabled || widget.onChanged == null) return;
    _isDragging = true;
    _dragOffset = 0.0;
    _stretchController.animateTo(
      1.0,
      duration: const Duration(milliseconds: 100),
      curve: Curves.easeOut,
    );
  }

  void _handleDragUpdate(DragUpdateDetails details) {
    if (!_isDragging || widget.disabled || widget.onChanged == null) return;
    setState(() {
      _dragOffset += details.primaryDelta ?? details.delta.dx;
    });
  }

  void _handleDragEnd(DragEndDetails details) {
    if (!_isDragging) return;

    final velocity = details.primaryVelocity ?? 0.0;
    final bool next;

    if (velocity.abs() >= _flickVelocityThreshold) {
      // Rapid flick commits in the flick direction
      next = velocity > 0;
    } else {
      // If dragged right, commit to true once at halfway or beyond.
      // If dragged left, commit to false once at halfway or beyond.
      final innerWidth = widget.size.trackWidth - _trackPadding * 2;
      final knobWidth = widget.size.knobSize;
      final currentX = _computeKnobX(innerWidth, knobWidth);
      final knobCenter = currentX + knobWidth / 2.0;
      final halfway = innerWidth / 2.0;

      if (_dragOffset > 0) {
        next = knobCenter >= halfway;
      } else if (_dragOffset < 0) {
        next = knobCenter > halfway;
      } else {
        next = widget.value;
      }
    }

    _isDragging = false;
    _stretchController.animateTo(
      0.0,
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
    );

    _commitToggle(next);
  }

  void _handleDragCancel() {
    if (!_isDragging) return;
    _isDragging = false;
    _stretchController.animateTo(
      0.0,
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
    );
    _positionController.animateTo(
      widget.value ? 1.0 : 0.0,
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOutCubic,
    );
  }

  void _commitToggle(bool next) {
    vibrate(HapticPatterns.optionSelect);
    if (next != widget.value) {
      widget.onChanged?.call(next);
    }
    _positionController.animateTo(
      next ? 1.0 : 0.0,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
    );
  }

  double _computeKnobX(double innerWidth, double knobWidth) {
    final maxX = innerWidth - knobWidth;
    if (_isDragging) {
      final baseProgress = widget.value ? 1.0 : 0.0;
      final baseX = baseProgress * maxX;
      return (baseX + _dragOffset).clamp(0.0, maxX);
    }
    return (_positionController.value * maxX).clamp(0.0, maxX);
  }

  @override
  Widget build(BuildContext context) {
    final trackWidth = widget.size.trackWidth;
    final trackHeight = widget.size.trackHeight;
    final knobHeight = widget.size.knobSize;
    final baseKnobWidth = widget.size.knobSize;
    final stretchedKnobWidth = widget.size.stretchedWidth;
    final innerWidth = trackWidth - _trackPadding * 2;

    final onTrackColor = widget.activeTrackColor ?? AppColors.primaryAction;
    final offTrackColor = widget.inactiveTrackColor ?? AppColors.border;
    final offKnobColor = widget.knobColor ?? AppColors.textPrimary;
    final onKnobColor = widget.activeKnobColor ?? offKnobColor;

    return Semantics(
      toggled: widget.value,
      enabled: !widget.disabled && widget.onChanged != null,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: _handleTapDown,
        onTapUp: _handleTapUp,
        onTapCancel: _handleTapCancel,
        onHorizontalDragStart: _handleDragStart,
        onHorizontalDragUpdate: _handleDragUpdate,
        onHorizontalDragEnd: _handleDragEnd,
        onHorizontalDragCancel: _handleDragCancel,
        child: SizedBox(
          width: math.max(trackWidth, widget.minTouchTarget),
          height: math.max(trackHeight, widget.minTouchTarget),
          child: Center(
            child: AnimatedBuilder(
              animation: Listenable.merge([
                _positionController,
                _stretchController,
              ]),
              builder: (context, _) {
                final pos = _positionController.value;
                final stretch = _stretchController.value;

                // Color crossfade
                final trackColor = Color.lerp(offTrackColor, onTrackColor, pos)!;
                final knobColor = Color.lerp(offKnobColor, onKnobColor, pos)!;

                // Dynamic knob width based on press stretch
                final currentKnobWidth =
                    baseKnobWidth + (stretchedKnobWidth - baseKnobWidth) * stretch;
                final currentMaxX = innerWidth - currentKnobWidth;

                // Calculate knob X position
                final double knobX;
                if (_isDragging) {
                  final baseX = (widget.value ? 1.0 : 0.0) * currentMaxX;
                  knobX = (baseX + _dragOffset).clamp(0.0, currentMaxX);
                } else {
                  // Anchored stretch: when pos == 0, left edge is 0 (stretches right).
                  // When pos == 1, right edge is innerWidth (stretches left).
                  knobX = (pos * currentMaxX).clamp(0.0, currentMaxX);
                }

                final hasIcons = widget.onIcon != null || widget.offIcon != null;

                return Opacity(
                  opacity: widget.disabled ? 0.45 : 1.0,
                  child: Container(
                    width: trackWidth,
                    height: trackHeight,
                    decoration: BoxDecoration(
                      color: trackColor,
                      borderRadius: BorderRadius.circular(trackHeight / 2),
                    ),
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        Positioned(
                          top: _trackPadding,
                          left: _trackPadding + knobX,
                          child: Container(
                            width: currentKnobWidth,
                            height: knobHeight,
                            decoration: BoxDecoration(
                              color: knobColor,
                              borderRadius: BorderRadius.circular(knobHeight / 2),
                              boxShadow: const [
                                BoxShadow(
                                  color: Color(0x33000000),
                                  blurRadius: 3,
                                  offset: Offset(0, 1),
                                ),
                              ],
                            ),
                            alignment: Alignment.center,
                            child: hasIcons
                                ? _KnobIcon(
                                    checked: widget.value,
                                    onIcon: widget.onIcon,
                                    offIcon: widget.offIcon,
                                    size: widget.size.iconSize,
                                  )
                                : null,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

/// Animated knob icon crossfader with rotation and scaling (Spectrum UI spec).
class _KnobIcon extends StatelessWidget {
  const _KnobIcon({
    required this.checked,
    this.onIcon,
    this.offIcon,
    required this.size,
  });

  final bool checked;
  final Widget? onIcon;
  final Widget? offIcon;
  final double size;

  static const double _rotationAngle = 45.0 * (math.pi / 180.0);

  @override
  Widget build(BuildContext context) {
    final activeIcon = checked ? onIcon : offIcon;
    if (activeIcon == null) return const SizedBox.shrink();

    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 200),
      transitionBuilder: (child, animation) {
        final isIncoming = (child.key as ValueKey<bool>?)?.value == checked;
        final rotateTween = isIncoming
            ? Tween<double>(begin: -_rotationAngle, end: 0.0)
            : Tween<double>(begin: 0.0, end: _rotationAngle);

        return FadeTransition(
          opacity: animation,
          child: ScaleTransition(
            scale: Tween<double>(begin: 0.5, end: 1.0).animate(animation),
            child: RotationTransition(
              turns: rotateTween.animate(animation).drive(
                    Tween<double>(begin: 0.0, end: 1.0 / (2 * math.pi)),
                  ),
              child: child,
            ),
          ),
        );
      },
      child: KeyedSubtree(
        key: ValueKey<bool>(checked),
        child: SizedBox(
          width: size,
          height: size,
          child: FittedBox(
            fit: BoxFit.contain,
            child: activeIcon,
          ),
        ),
      ),
    );
  }
}
