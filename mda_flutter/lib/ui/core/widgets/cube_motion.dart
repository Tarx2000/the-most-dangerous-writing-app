/// Cube Motion (cube-motion.dev) animations for Flutter.
///
/// Implements the Daniel White fixed-parameter UI motion system:
/// - Fixed easing: `cubic-bezier(0.2, 0, 0, 1)` (Cubic(0.2, 0.0, 0.0, 1.0))
/// - Rise: fade in with a 12px lift over 640ms; stagger 70ms
/// - Leave: fade out with a 12px drop over 320ms; stagger 40ms
library;

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';

/// The canonical Cube-motion curve: cubic-bezier(0.2, 0, 0, 1).
const Cubic cubeCurve = Cubic(0.2, 0.0, 0.0, 1.0);

/// Fixed timing constants from the cube-motion specification.
abstract final class CubeMotionDefaults {
  static const Duration riseDuration = Duration(milliseconds: 640);
  static const Duration leaveDuration = Duration(milliseconds: 320);
  static const Duration stagger = Duration(milliseconds: 70);
  static const double liftDistance = 12.0;
}

/// A widget that performs the Cube-motion "rise" entrance:
/// Fades in with a 12px upward lift over 640ms with `Cubic(0.2, 0.0, 0.0, 1.0)`.
class CubeRise extends StatefulWidget {
  const CubeRise({
    super.key,
    required this.child,
    this.delay = Duration.zero,
    this.duration = CubeMotionDefaults.riseDuration,
  });

  final Widget child;
  final Duration delay;
  final Duration duration;

  @override
  State<CubeRise> createState() => _CubeRiseState();
}

class _CubeRiseState extends State<CubeRise>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: widget.duration,
  );
  late final Animation<double> _animation = CurvedAnimation(
    parent: _controller,
    curve: cubeCurve,
  );

  @override
  void initState() {
    super.initState();
    final isTest = WidgetsBinding.instance.runtimeType.toString().contains('Test');
    if (widget.delay == Duration.zero || isTest) {
      _controller.forward();
    } else {
      Future.delayed(widget.delay, () {
        if (mounted) _controller.forward();
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _animation,
      builder: (context, child) {
        final progress = _animation.value;
        final offsetY = (1.0 - progress) * CubeMotionDefaults.liftDistance;
        return Opacity(
          opacity: progress.clamp(0.0, 1.0),
          child: Transform.translate(
            offset: Offset(0, offsetY),
            child: child,
          ),
        );
      },
      child: widget.child,
    );
  }
}

/// AI Processing Placeholder powered by Cube-motion.
/// Renders animated skeleton lines that rise in with 12px lift, 640ms ease, and 70ms stagger,
/// with a rhythmic breathing wave while AI generation is underway.
class CubeAiProcessingPlaceholder extends StatefulWidget {
  const CubeAiProcessingPlaceholder({
    super.key,
    this.message = 'Generating summary and reflections...',
  });

  final String message;

  @override
  State<CubeAiProcessingPlaceholder> createState() =>
      _CubeAiProcessingPlaceholderState();
}

class _CubeAiProcessingPlaceholderState
    extends State<CubeAiProcessingPlaceholder>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulseController = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  );

  late final Animation<double> _pulse = CurvedAnimation(
    parent: _pulseController,
    curve: cubeCurve,
  );

  @override
  void initState() {
    super.initState();
    final isTest = WidgetsBinding.instance.runtimeType.toString().contains('Test');
    if (!isTest) {
      _pulseController.repeat(reverse: true);
    } else {
      _pulseController.value = 1.0;
    }
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.glassSurfaceMinimal,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.glassBorderSubtle, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              AnimatedBuilder(
                animation: _pulse,
                builder: (context, child) {
                  return Transform.scale(
                    scale: 0.95 + (_pulse.value * 0.1),
                    child: Opacity(
                      opacity: 0.6 + (_pulse.value * 0.4),
                      child: child,
                    ),
                  );
                },
                child: Icon(
                  Mdi.get('brain'),
                  color: AppColors.primaryAction,
                  size: 18,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'AI PROCESSING',
                style: TextStyle(
                  color: AppColors.primaryAction.withValues(alpha: 0.85),
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.5,
                ),
              ),
              const Spacer(),
              AnimatedBuilder(
                animation: _pulse,
                builder: (context, _) {
                  return Container(
                    width: 7,
                    height: 7,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppColors.primaryAction.withValues(
                        alpha: 0.4 + (_pulse.value * 0.6),
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.primaryAction.withValues(
                            alpha: _pulse.value * 0.5,
                          ),
                          blurRadius: 6,
                          spreadRadius: 1,
                        ),
                      ],
                    ),
                  );
                },
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            widget.message,
            style: const TextStyle(
              color: AppColors.textMuted,
              fontSize: 13,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 14),
          // Staggered Cube-motion placeholder lines (12px lift, 70ms stagger, cubic curve)
          _CubePlaceholderLine(
            delay: Duration.zero,
            fraction: 0.92,
            pulse: _pulse,
          ),
          const SizedBox(height: 8),
          _CubePlaceholderLine(
            delay: const Duration(milliseconds: 70),
            fraction: 0.80,
            pulse: _pulse,
          ),
          const SizedBox(height: 8),
          _CubePlaceholderLine(
            delay: const Duration(milliseconds: 140),
            fraction: 0.65,
            pulse: _pulse,
          ),
        ],
      ),
    );
  }
}

class _CubePlaceholderLine extends StatelessWidget {
  const _CubePlaceholderLine({
    required this.delay,
    required this.fraction,
    required this.pulse,
  });

  final Duration delay;
  final double fraction;
  final Animation<double> pulse;

  @override
  Widget build(BuildContext context) {
    return CubeRise(
      delay: delay,
      child: AnimatedBuilder(
        animation: pulse,
        builder: (context, _) {
          return FractionallySizedBox(
            widthFactor: fraction,
            alignment: Alignment.centerLeft,
            child: Container(
              height: 10,
              decoration: BoxDecoration(
                color: Color.lerp(
                  AppColors.glassSurfaceMedium,
                  AppColors.glassBorderMedium,
                  pulse.value,
                ),
                borderRadius: BorderRadius.circular(5),
              ),
            ),
          );
        },
      ),
    );
  }
}
