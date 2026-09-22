/// Spectrum UI — LikeButton for Flutter
///
/// A heart like-button micro-interaction based on the Spectrum UI specification.
/// Features:
/// - Three calibrated size tiers: sm (32px), md (40px), lg (48px)
/// - Squash-and-stretch pop animation on like with keyframes [1.0, 0.6, 1.3, 1.0]
/// - Expanding ring pulse (scale 0.3 → 2.0, opacity 0.9 → 0.0)
/// - 8 radial burst particles with alternating scatter distances and cycling colors
/// - Rolling odometer digit counter with compact formatting (e.g. 321, 4.2k, 98.7k)
/// - Press-scale feedback (0.94x) and haptic response
/// - Controlled and uncontrolled modes
library;

import 'dart:math' as math;
import 'package:flutter/material.dart';

import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';

/// Predefined size variants for [LikeButton] following Spectrum UI specifications.
enum LikeButtonSize {
  sm(
    height: 32.0,
    gap: 6.0,
    horizontalPadding: 12.0,
    fontSize: 12.0,
    iconSize: 14.0,
  ),
  md(
    height: 40.0,
    gap: 8.0,
    horizontalPadding: 16.0,
    fontSize: 14.0,
    iconSize: 17.0,
  ),
  lg(
    height: 48.0,
    gap: 10.0,
    horizontalPadding: 20.0,
    fontSize: 16.0,
    iconSize: 20.0,
  );

  const LikeButtonSize({
    required this.height,
    required this.gap,
    required this.horizontalPadding,
    required this.fontSize,
    required this.iconSize,
  });

  final double height;
  final double gap;
  final double horizontalPadding;
  final double fontSize;
  final double iconSize;
}

/// Spectrum UI LikeButton component.
class LikeButton extends StatefulWidget {
  const LikeButton({
    super.key,
    this.liked,
    this.defaultLiked = false,
    this.onLikedChange,
    this.count,
    this.showCount = true,
    this.size = LikeButtonSize.md,
    this.particleColors,
    this.disabled = false,
    this.label,
    this.minTouchTarget = 44.0,
  });

  /// Controlled liked state. When null, the button manages its own state.
  final bool? liked;

  /// Initial liked state when uncontrolled.
  final bool defaultLiked;

  /// Callback invoked whenever the liked state changes.
  final ValueChanged<bool>? onLikedChange;

  /// Base like count excluding current user's like (+1 shown while liked).
  final int? count;

  /// Whether to show the rolling count when [count] is provided.
  final bool showCount;

  /// Visual size tier: [LikeButtonSize.sm], [LikeButtonSize.md], or [LikeButtonSize.lg].
  final LikeButtonSize size;

  /// Colors cycled across the burst particles.
  final List<Color>? particleColors;

  /// Disables pointer interactions.
  final bool disabled;

  /// Accessible action label.
  final String? label;

  /// Minimum interactive touch target dimension.
  final double minTouchTarget;

  static const List<Color> defaultParticleColors = [
    Color(0xFFF43F5E), // rose-500
    Color(0xFFFB923C), // orange-400
    Color(0xFFFACC15), // yellow-400
    Color(0xFF4ADE80), // green-400
    Color(0xFF38BDF8), // sky-400
    Color(0xFFA78BFA), // violet-400
  ];

  /// Compact number formatter following Spectrum UI specifications.
  static String formatCount(int value) {
    if (value < 1000) return value.toString();
    if (value < 1000000) {
      final k = value / 1000.0;
      if (k >= 100) return '${k.round()}k';
      final formatted = k.toStringAsFixed(1);
      return formatted.endsWith('.0')
          ? '${formatted.substring(0, formatted.length - 2)}k'
          : '${formatted}k';
    }
    final m = value / 1000000.0;
    if (m >= 100) return '${m.round()}M';
    final formatted = m.toStringAsFixed(1);
    return formatted.endsWith('.0')
        ? '${formatted.substring(0, formatted.length - 2)}M'
        : '${formatted}M';
  }

  @override
  State<LikeButton> createState() => _LikeButtonState();
}

class _LikeButtonState extends State<LikeButton>
    with TickerProviderStateMixin {
  late bool _internalLiked;

  // Animation controllers
  late final AnimationController _pressController;
  late final AnimationController _popController;
  late final AnimationController _fillController;
  late final AnimationController _burstController;

  late final Animation<double> _popAnimation;
  late final Animation<double> _pressScaleAnimation;

  int _rollDirection = 1; // 1 for roll-up (liked), -1 for roll-down (unliked)

  bool get _isLiked => widget.liked ?? _internalLiked;

  @override
  void initState() {
    super.initState();
    _internalLiked = widget.defaultLiked;

    _pressController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 100),
    );
    _pressScaleAnimation = Tween<double>(begin: 1.0, end: 0.94).animate(
      CurvedAnimation(parent: _pressController, curve: Curves.easeOut),
    );

    _popController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 450),
    );
    _popAnimation = TweenSequence<double>([
      TweenSequenceItem(
        tween: Tween<double>(begin: 1.0, end: 0.6).chain(
          CurveTween(curve: Curves.easeOut),
        ),
        weight: 25,
      ),
      TweenSequenceItem(
        tween: Tween<double>(begin: 0.6, end: 1.3).chain(
          CurveTween(curve: Curves.easeOut),
        ),
        weight: 35,
      ),
      TweenSequenceItem(
        tween: Tween<double>(begin: 1.3, end: 1.0).chain(
          CurveTween(curve: Curves.easeOut),
        ),
        weight: 40,
      ),
    ]).animate(_popController);

    _fillController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 220),
      value: _isLiked ? 1.0 : 0.0,
    );

    _burstController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 550),
    );
  }

  @override
  void didUpdateWidget(covariant LikeButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.liked != null && widget.liked != oldWidget.liked) {
      if (widget.liked!) {
        _triggerLikeAnimation();
      } else {
        _triggerUnlikeAnimation();
      }
    }
  }

  @override
  void dispose() {
    _pressController.dispose();
    _popController.dispose();
    _fillController.dispose();
    _burstController.dispose();
    super.dispose();
  }

  void _triggerLikeAnimation() {
    _rollDirection = 1;
    _fillController.animateTo(1.0, duration: const Duration(milliseconds: 220), curve: Curves.easeOutBack);
    _popController.forward(from: 0.0);
    _burstController.forward(from: 0.0);
  }

  void _triggerUnlikeAnimation() {
    _rollDirection = -1;
    _fillController.animateTo(0.0, duration: const Duration(milliseconds: 150), curve: Curves.easeOut);
  }

  void _handleTap() {
    if (widget.disabled) return;

    final next = !_isLiked;
    vibrate(HapticPatterns.optionSelect);

    if (next) {
      _triggerLikeAnimation();
    } else {
      _triggerUnlikeAnimation();
    }

    if (widget.liked == null) {
      setState(() {
        _internalLiked = next;
      });
    }

    widget.onLikedChange?.call(next);
  }

  @override
  Widget build(BuildContext context) {
    final isLiked = _isLiked;
    final size = widget.size;
    final displayCount = widget.count != null ? widget.count! + (isLiked ? 1 : 0) : null;
    final showCount = widget.showCount && displayCount != null;

    final baseLabel = widget.label ?? (isLiked ? 'Unlike' : 'Like');
    final semanticLabel = showCount ? '$baseLabel ($displayCount)' : baseLabel;

    // AMOLED / Dark mode colors matching Spectrum UI specification
    final activeBorderColor = const Color(0x4DF43F5E); // rose-500 with 30% alpha
    final activeBgColor = const Color(0x1AF43F5E);     // rose-500 with 10% alpha
    const activeTextColor = Color(0xFFFB7185);         // rose-400

    final inactiveBorderColor = AppColors.glassBorder;
    final inactiveBgColor = AppColors.glassSurfaceMinimal;
    const inactiveTextColor = AppColors.textSecondary;

    final borderColor = isLiked ? activeBorderColor : inactiveBorderColor;
    final bgColor = isLiked ? activeBgColor : inactiveBgColor;
    final textColor = isLiked ? activeTextColor : inactiveTextColor;

    final particleColors = widget.particleColors ?? LikeButton.defaultParticleColors;

    return Semantics(
      label: semanticLabel,
      button: true,
      enabled: !widget.disabled,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (_) => _pressController.forward(),
        onTapUp: (_) {
          _pressController.reverse();
          _handleTap();
        },
        onTapCancel: () => _pressController.reverse(),
        child: AnimatedBuilder(
          animation: _pressScaleAnimation,
          builder: (context, child) => Transform.scale(
            scale: _pressScaleAnimation.value,
            child: child,
          ),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight: math.max(size.height, widget.minTouchTarget),
              minWidth: showCount
                  ? math.max(size.height, widget.minTouchTarget)
                  : math.max(size.height, widget.minTouchTarget),
            ),
            child: Center(
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeOut,
                height: size.height,
                padding: EdgeInsets.symmetric(
                  horizontal: showCount ? size.horizontalPadding : (size.height - size.iconSize) / 2,
                ),
                decoration: BoxDecoration(
                  color: bgColor,
                  borderRadius: BorderRadius.circular(size.height / 2),
                  border: Border.all(color: borderColor, width: 1.0),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    // Animated Heart Icon with Pop and Burst
                    SizedBox(
                      width: size.iconSize,
                      height: size.iconSize,
                      child: Stack(
                        clipBehavior: Clip.none,
                        alignment: Alignment.center,
                        children: [
                          // Radial burst ring and particles
                          AnimatedBuilder(
                            animation: _burstController,
                            builder: (context, _) {
                              if (_burstController.value <= 0 || _burstController.value >= 1.0) {
                                return const SizedBox.shrink();
                              }
                              return CustomPaint(
                                size: Size(size.iconSize, size.iconSize),
                                painter: _BurstPainter(
                                  progress: _burstController.value,
                                  iconSize: size.iconSize,
                                  colors: particleColors,
                                ),
                              );
                            },
                          ),
                          // Heart Icon with squash-and-stretch pop
                          AnimatedBuilder(
                            animation: Listenable.merge([_popAnimation, _fillController]),
                            builder: (context, _) {
                              return Transform.scale(
                                scale: _popAnimation.value,
                                alignment: const Alignment(0.0, 0.2), // 50% 60% origin
                                child: CustomPaint(
                                  size: Size(size.iconSize, size.iconSize),
                                  painter: _HeartPainter(
                                    fillProgress: _fillController.value,
                                    outlineColor: textColor,
                                    fillColor: activeTextColor,
                                  ),
                                ),
                              );
                            },
                          ),
                        ],
                      ),
                    ),

                    // Rolling Odometer Counter
                    if (showCount) ...[
                      SizedBox(width: size.gap),
                      AnimatedSwitcher(
                        duration: const Duration(milliseconds: 280),
                        transitionBuilder: (child, animation) {
                          final inAnimation = Tween<Offset>(
                            begin: Offset(0, 0.6 * _rollDirection),
                            end: Offset.zero,
                          ).animate(CurvedAnimation(parent: animation, curve: Curves.easeOutCubic));

                          return ClipRect(
                            child: SlideTransition(
                              position: inAnimation,
                              child: FadeTransition(
                                opacity: animation,
                                child: child,
                              ),
                            ),
                          );
                        },
                        child: Text(
                          LikeButton.formatCount(displayCount),
                          key: ValueKey<int>(displayCount),
                          style: TextStyle(
                            color: textColor,
                            fontSize: size.fontSize,
                            fontWeight: FontWeight.w600,
                            letterSpacing: -0.2,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Paints the Spectrum UI SVG heart path with precise bezier outline and fill transitions.
class _HeartPainter extends CustomPainter {
  const _HeartPainter({
    required this.fillProgress,
    required this.outlineColor,
    required this.fillColor,
  });

  final double fillProgress;
  final Color outlineColor;
  final Color fillColor;

  static final Path _basePath = _createHeartPath();

  static Path _createHeartPath() {
    final path = Path();
    // Path translated from Spectrum UI SVG (viewBox 0 0 24 24):
    // M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z
    path.moveTo(19, 14);
    path.cubicTo(20.49, 12.54, 22, 10.79, 22, 8.5);
    path.arcToPoint(
      const Offset(16.5, 3),
      radius: const Radius.circular(5.5),
      clockwise: false,
    );
    path.cubicTo(14.74, 3, 13.5, 3.5, 12, 5);
    path.cubicTo(10.5, 3.5, 9.26, 3, 7.5, 3);
    path.arcToPoint(
      const Offset(2, 8.5),
      radius: const Radius.circular(5.5),
      clockwise: false,
    );
    path.cubicTo(2, 10.8, 3.5, 12.55, 5, 14);
    path.lineTo(12, 21);
    path.close();
    return path;
  }

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 24.0;
    canvas.save();
    canvas.scale(scale, scale);

    // 1. Base outline path
    final outlinePaint = Paint()
      ..color = outlineColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    canvas.drawPath(_basePath, outlinePaint);

    // 2. Animated filled path
    if (fillProgress > 0) {
      canvas.save();
      // Center of 24x24 is 12, 12. 50% 60% origin is (12, 14.4)
      canvas.translate(12, 14.4);
      canvas.scale(fillProgress, fillProgress);
      canvas.translate(-12, -14.4);

      final fillPaint = Paint()
        ..color = fillColor.withValues(alpha: fillProgress.clamp(0.0, 1.0))
        ..style = PaintingStyle.fill;

      canvas.drawPath(_basePath, fillPaint);
      canvas.drawPath(_basePath, outlinePaint..color = fillColor.withValues(alpha: fillProgress.clamp(0.0, 1.0)));
      canvas.restore();
    }

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _HeartPainter oldDelegate) =>
      oldDelegate.fillProgress != fillProgress ||
      oldDelegate.outlineColor != outlineColor ||
      oldDelegate.fillColor != fillColor;
}

/// Paints the celebratory expanding ring pulse and 8 radial burst particles.
class _BurstPainter extends CustomPainter {
  const _BurstPainter({
    required this.progress,
    required this.iconSize,
    required this.colors,
  });

  final double progress;
  final double iconSize;
  final List<Color> colors;

  static const int _particleCount = 8;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);

    // 1. Expanding ring pulse
    final ringScale = 0.3 + (2.0 - 0.3) * progress;
    final ringOpacity = (0.9 * (1.0 - progress)).clamp(0.0, 1.0);
    final ringRadius = (iconSize * 1.6 / 2.0) * ringScale;

    if (ringOpacity > 0.01) {
      final ringPaint = Paint()
        ..color = const Color(0xFFFB7185).withValues(alpha: ringOpacity)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.0;

      canvas.drawCircle(center, ringRadius, ringPaint);
    }

    // 2. Radial burst particles (8 dots)
    final dotSize = math.max(3.0, (iconSize * 0.26).roundToDouble());

    // Scale profile: [0 -> 1 -> 0.4]
    double particleScale;
    if (progress < 0.3) {
      particleScale = progress / 0.3;
    } else {
      particleScale = 1.0 - 0.6 * ((progress - 0.3) / 0.7);
    }

    // Opacity profile: [1 -> 1 -> 0]
    double particleOpacity = progress <= 0.4 ? 1.0 : (1.0 - (progress - 0.4) / 0.6);
    particleOpacity = particleOpacity.clamp(0.0, 1.0);

    if (particleOpacity > 0.01 && particleScale > 0.01) {
      for (int i = 0; i < _particleCount; i++) {
        final angle = (i / _particleCount) * math.pi * 2 - math.pi / 2;
        final maxDistance = iconSize * (i % 2 == 0 ? 1.9 : 1.5);
        final currentDistance = maxDistance * progress;

        final particleCenter = Offset(
          center.dx + math.cos(angle) * currentDistance,
          center.dy + math.sin(angle) * currentDistance,
        );

        final particlePaint = Paint()
          ..color = colors[i % colors.length].withValues(alpha: particleOpacity)
          ..style = PaintingStyle.fill;

        canvas.drawCircle(particleCenter, (dotSize / 2.0) * particleScale, particlePaint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _BurstPainter oldDelegate) =>
      oldDelegate.progress != progress || oldDelegate.iconSize != iconSize;
}
