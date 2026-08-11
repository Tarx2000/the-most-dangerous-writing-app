/// StreakPopup — full-screen celebration overlay (SPEC §15).
/// "Well done!" + streak count + week dots; staggered entry:
/// overlay 400 ms, icon spring 200 ms, text 500 ms, week 800 ms, button 1000 ms.
library;

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import 'animated_scale_button.dart';

class StreakPopup extends StatefulWidget {
  const StreakPopup({
    super.key,
    required this.streak,
    required this.streakHistory,
    this.onClose,
  });

  final int streak;
  final List<String> streakHistory;

  /// Called when the user dismisses the popup.
  final VoidCallback? onClose;

  @override
  State<StreakPopup> createState() => _StreakPopupState();
}

class _StreakPopupState extends State<StreakPopup> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  )..forward();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: Material(
        color: AppColors.overlayPopup,
        child: SafeArea(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              FadeTransition(
                opacity: CurvedAnimation(
                  parent: _controller,
                  curve: const Interval(0.15, 0.45, curve: Curves.easeOut),
                ),
                child: Transform.scale(
                  scale: TweenSequence<double>([
                    TweenSequenceItem(tween: Tween(begin: 0.5, end: 1.08), weight: 1),
                    TweenSequenceItem(tween: Tween(begin: 1.08, end: 1.0), weight: 1),
                  ]).animate(CurvedAnimation(
                    parent: _controller,
                    curve: Curves.easeOutBack,
                  )).value,
                  child: Container(
                    width: 88,
                    height: 88,
                    decoration: BoxDecoration(
                      color: AppColors.dangerTint,
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.dangerBorder, width: 1),
                    ),
                    child: const Icon(
                      Icons.local_fire_department,
                      color: AppColors.primaryAction,
                      size: 44,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 28),
              FadeTransition(
                opacity: CurvedAnimation(
                  parent: _controller,
                  curve: const Interval(0.35, 0.7, curve: Curves.easeOut),
                ),
                child: Text(
                  'Well done!',
                  style: TextStyle(
                    color: AppColors.textPrimary,
                    fontSize: 28,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.5,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              FadeTransition(
                opacity: CurvedAnimation(
                  parent: _controller,
                  curve: const Interval(0.4, 0.75, curve: Curves.easeOut),
                ),
                child: Text(
                  widget.streak == 1
                      ? 'Streak started — keep going!'
                      : 'Streak completed today (${widget.streak} days)',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 15),
                ),
              ),
              const SizedBox(height: 32),
              FadeTransition(
                opacity: CurvedAnimation(
                  parent: _controller,
                  curve: const Interval(0.55, 0.85, curve: Curves.easeOut),
                ),
                child: _WeekDots(streak: widget.streak),
              ),
              const SizedBox(height: 48),
              FadeTransition(
                opacity: CurvedAnimation(
                  parent: _controller,
                  curve: const Interval(0.7, 1.0, curve: Curves.easeOut),
                ),
                child: AnimatedScaleButton(
                  onPress: widget.onClose,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 48, vertical: 14),
                    decoration: BoxDecoration(
                      color: AppColors.primaryAction,
                      borderRadius: BorderRadius.circular(30),
                    ),
                    child: const Text(
                      'LET\'S GO',
                      style: TextStyle(
                        color: AppColors.primaryActionText,
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Seven dots — filled for each active day of the current week.
class _WeekDots extends StatelessWidget {
  const _WeekDots({required this.streak});

  final int streak;

  @override
  Widget build(BuildContext context) {
    final filled = (streak % 7 == 0) ? 7 : streak % 7;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < 7; i++)
          Container(
            width: 12,
            height: 12,
            margin: const EdgeInsets.symmetric(horizontal: 5),
            decoration: BoxDecoration(
              color: i < filled ? AppColors.primaryAction : AppColors.glassSurface,
              shape: BoxShape.circle,
              border: i < filled
                  ? null
                  : Border.all(color: AppColors.glassBorder, width: 1),
            ),
          ),
      ],
    );
  }
}
