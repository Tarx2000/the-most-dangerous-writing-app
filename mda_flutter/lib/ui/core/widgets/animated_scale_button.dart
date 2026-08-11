/// Premium press button — port of `AnimatedScaleButton.tsx` (SPEC §15).
/// Replaces TouchableOpacity everywhere: spring scale on press-in/out.
library;

import 'package:flutter/material.dart';

class AnimatedScaleButton extends StatefulWidget {
  const AnimatedScaleButton({
    super.key,
    required this.onPress,
    this.onLongPress,
    this.activeScale = 0.95,
    this.activeOpacity = 0.8,
    this.disabled = false,
    this.child,
  });

  final VoidCallback? onPress;
  final VoidCallback? onLongPress;
  final double activeScale;
  final double activeOpacity;
  final bool disabled;
  final Widget? child;

  @override
  State<AnimatedScaleButton> createState() => _AnimatedScaleButtonState();
}

class _AnimatedScaleButtonState extends State<AnimatedScaleButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 150),
  );
  late final Animation<double> _scale = TweenSequence<double>([
    TweenSequenceItem(tween: Tween(begin: 1.0, end: widget.activeScale), weight: 1),
  ]).animate(
    CurvedAnimation(parent: _controller, curve: Curves.easeOut),
  );

  bool _pressed = false;

  void _onTapDown(_) {
    if (widget.disabled) return;
    setState(() => _pressed = true);
    _controller.forward();
  }

  void _onTapUp(_) {
    if (widget.disabled) return;
    setState(() => _pressed = false);
    _controller.reverse();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: _onTapDown,
      onTapUp: _onTapUp,
      onTapCancel: _onTapCancel,
      onTap: widget.disabled ? null : widget.onPress,
      onLongPress: widget.disabled ? null : widget.onLongPress,
      behavior: HitTestBehavior.opaque,
      child: AnimatedBuilder(
        animation: _scale,
        builder: (context, child) {
          return Opacity(
            opacity: _pressed ? widget.activeOpacity : 1.0,
            child: Transform.scale(scale: _scale.value, child: child),
          );
        },
        child: widget.child,
      ),
    );
  }

  void _onTapCancel() {
    if (widget.disabled) return;
    setState(() => _pressed = false);
    _controller.reverse();
  }
}
