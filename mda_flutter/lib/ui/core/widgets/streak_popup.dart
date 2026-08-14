/// StreakPopup — Full-screen motivational overlay shown when a streak increases.
/// 1:1 Port of `src/components/features/writing/StreakPopup.tsx`.
library;

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/utils.dart';
import 'animated_scale_button.dart';

const double _iconSize = 64.0;
const double _dotSize = 10.0;
const List<String> _weekLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

class StreakPopup extends StatefulWidget {
  const StreakPopup({
    super.key,
    required this.streak,
    this.streakHistory = const [],
    this.onClose,
  });

  final int streak;
  final List<String> streakHistory;
  final VoidCallback? onClose;

  @override
  State<StreakPopup> createState() => _StreakPopupState();
}

class _StreakPopupState extends State<StreakPopup>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  )..forward();

  List<bool> _computeWeekDots() {
    final histSet = widget.streakHistory.toSet();
    final today = DateTime.now();
    final dayOfWeek = today.weekday % 7; // 0=Sun, 1=Mon...
    final dots = <bool>[];

    for (var i = 0; i < 7; i++) {
      final d = today.subtract(Duration(days: dayOfWeek - i));
      final key = toLocalDateString(d);
      dots.add(histSet.contains(key));
    }
    return dots;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final todayIndex = DateTime.now().weekday % 7;
    final weekDots = _computeWeekDots();

    return Positioned.fill(
      child: Material(
        color: AppColors.overlayPopup,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 30),
            child: Column(
              children: [
                const Spacer(),
                // ── Checkmark Icon Ring ──
                FadeTransition(
                  opacity: CurvedAnimation(
                    parent: _controller,
                    curve: const Interval(0.15, 0.45, curve: Curves.easeOut),
                  ),
                  child: ScaleTransition(
                    scale: CurvedAnimation(
                      parent: _controller,
                      curve: const Interval(0.15, 0.45, curve: Curves.easeOutBack),
                    ),
                    child: Container(
                      width: _iconSize,
                      height: _iconSize,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.textPrimary, width: 2.5),
                      ),
                      child: const Center(
                        child: Text(
                          '✓',
                          style: TextStyle(
                            color: AppColors.textPrimary,
                            fontSize: 30,
                            fontWeight: FontWeight.bold,
                            height: 1.1,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 30),

                // ── Title & Subtitle ──
                FadeTransition(
                  opacity: CurvedAnimation(
                    parent: _controller,
                    curve: const Interval(0.35, 0.65, curve: Curves.easeOut),
                  ),
                  child: SlideTransition(
                    position: Tween<Offset>(
                      begin: const Offset(0, 0.2),
                      end: Offset.zero,
                    ).animate(CurvedAnimation(
                      parent: _controller,
                      curve: const Interval(0.35, 0.65, curve: Curves.easeOut),
                    )),
                    child: Column(
                      children: [
                        const Text(
                          'Well done!',
                          style: TextStyle(
                            color: AppColors.textPrimary,
                            fontSize: 32,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.5,
                          ),
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Streak completed today',
                          style: TextStyle(
                            color: AppColors.textMuted,
                            fontSize: 16,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 35),

                // ── Week Day Labels & Dots ──
                FadeTransition(
                  opacity: CurvedAnimation(
                    parent: _controller,
                    curve: const Interval(0.55, 0.85, curve: Curves.easeOut),
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          for (var i = 0; i < 7; i++)
                            Container(
                              width: 32,
                              alignment: Alignment.center,
                              child: Text(
                                _weekLabels[i],
                                style: TextStyle(
                                  color: i == todayIndex
                                      ? AppColors.textPrimary
                                      : AppColors.textMuted,
                                  fontSize: 13,
                                  fontWeight: i == todayIndex
                                      ? FontWeight.bold
                                      : FontWeight.w500,
                                ),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          for (var i = 0; i < 7; i++)
                            Container(
                              width: 32,
                              alignment: Alignment.center,
                              child: Container(
                                width: _dotSize,
                                height: _dotSize,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: weekDots[i]
                                      ? AppColors.textPrimary
                                      : Colors.transparent,
                                  border: weekDots[i]
                                      ? null
                                      : Border.all(
                                          color: AppColors.glassBorderSubtle,
                                          width: 1.5,
                                        ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                const Spacer(),

                // ── Ok Button ──
                FadeTransition(
                  opacity: CurvedAnimation(
                    parent: _controller,
                    curve: const Interval(0.7, 1.0, curve: Curves.easeOut),
                  ),
                  child: SlideTransition(
                    position: Tween<Offset>(
                      begin: const Offset(0, 0.2),
                      end: Offset.zero,
                    ).animate(CurvedAnimation(
                      parent: _controller,
                      curve: const Interval(0.7, 1.0, curve: Curves.easeOut),
                    )),
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: 20),
                      child: AnimatedScaleButton(
                        onPress: widget.onClose,
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(vertical: 18),
                          decoration: BoxDecoration(
                            color: AppColors.primaryAction,
                            borderRadius: BorderRadius.circular(AppRadius.round),
                          ),
                          child: const Text(
                            'Ok',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: AppColors.primaryActionText,
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                            ),
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
    );
  }
}
