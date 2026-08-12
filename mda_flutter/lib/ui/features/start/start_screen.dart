/// StartScreen — the session setup dashboard (SPEC §15, §17).
/// Sections top→bottom: TopBar (streak / Vision lock / settings) · Hero
/// (morph icon + mode content) · TickDial · difficulty pills · massive
/// start button · bottom spacer.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/config/app_config.dart';
import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../data/models/person.dart';
import '../../../data/providers.dart';
import '../../../data/security_providers.dart';
import '../../core/widgets/animated_scale_button.dart';
import '../../core/widgets/calendar_view.dart';
import '../../core/widgets/base_modal.dart';
import '../../core/widgets/morph_icon.dart';
import '../../core/widgets/tick_dial.dart';
import '../circles/circle_picker_sheet.dart';

/// Which setup flow the start screen currently offers.
enum SessionMode { journal, circles, checkin, vlog }

class StartScreen extends ConsumerStatefulWidget {
  const StartScreen({super.key, this.mode = SessionMode.journal, this.onModeChanged});

  final SessionMode mode;

  /// Called when the mode changes (the home shell owns the nav state).
  final ValueChanged<SessionMode>? onModeChanged;

  @override
  ConsumerState<StartScreen> createState() => _StartScreenState();
}

class _StartScreenState extends ConsumerState<StartScreen> {
  int _timeIndex = defaultSessionIndex; // 5 min
  int _diffIndex = defaultDifficultyIndex; // MID
  final int _checkinScore = 5; // slider lands in Phase 5 (alignment check-in)
  String? _selectedPersonId;

  void _handleStart() {
    final timeIndex = _timeIndex;
    final diffIndex = _diffIndex;
    final mode = widget.mode;
    vibrate(HapticPatterns.tick);

    switch (mode) {
      case SessionMode.vlog:
        context.push('/vlog', extra: {
          'timeIndex': timeIndex,
        });
      case SessionMode.checkin:
        context.push('/checkin', extra: {
          'alignmentScore': _checkinScore,
          'timeIndex': timeIndex,
        });
      case SessionMode.journal:
      case SessionMode.circles:
        context.push('/writing', extra: {
          'timeIndex': timeIndex,
          'diffIndex': diffIndex,
          'mode': mode == SessionMode.circles ? 'circles' : 'journal',
          'personId': mode == SessionMode.circles ? _selectedPersonId : null,
        });
    }
  }

  void _startTweet() {
    vibrate(HapticPatterns.dialPress);
    context.push('/writing', extra: {
      'timeIndex': 0,
      'diffIndex': _diffIndex,
      'mode': widget.mode == SessionMode.circles ? 'circles' : 'journal',
      'personId': widget.mode == SessionMode.circles ? _selectedPersonId : null,
      'isTweet': true,
    });
  }

  /// Opens the streak calendar (fire pill in the top bar).
  void _openCalendar() {
    final streak = ref.read(streakProvider);
    showBaseModal(
      context,
      title: null,
      heightFactor: 0.9,
      builder: (close) => SingleChildScrollView(
        child: CalendarView(
          currentStreak: streak.currentStreak,
          streakHistory: streak.streakHistory,
        ),
      ),
    );
  }

  /// Opens the circle picker for circles mode.
  Future<void> _openCirclePicker() async {
    final selected = await showCirclePicker(context, selectedId: _selectedPersonId);
    if (selected != null) {
      setState(() => _selectedPersonId = selected);
    }
  }

  void _startQuickVideo() {
    vibrate(HapticPatterns.dialPress);
    context.push('/vlog', extra: {
      'timeIndex': 0,
      'isQuickVideo': true,
    });
  }

  @override
  Widget build(BuildContext context) {
    final streak = ref.watch(streakProvider).currentStreak;
    final persons = ref.watch(personsProvider);
    final isCheckin = widget.mode == SessionMode.checkin;
    final isVlog = widget.mode == SessionMode.vlog;
    final tierColor = isCheckin
        ? AppColors.alignmentTierColor(_checkinScore)
        : AppColors.primaryAction;
    final tierLabel = AppColors.alignmentTierLabel(_checkinScore).toUpperCase();

    return SafeArea(
      child: LayoutBuilder(
        builder: (context, constraints) {
          // Scroll-safe column: fills the viewport when there is room,
          // scrolls when the window is short (responsive-layout rule).
          return SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: IntrinsicHeight(
                child: Column(
                  children: [
                    _TopBar(streak: streak, onCalendarPress: _openCalendar),
                    const SizedBox(height: 8),
                    // Hero widget (fixed height 200)
                    SizedBox(
                      height: 200,
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          // Glow ring (only checkin mode, per SPEC).
                          AnimatedContainer(
                            duration: const Duration(milliseconds: 400),
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              boxShadow: isCheckin
                                  ? [
                                      BoxShadow(
                                        color: AppColors.alignmentTierGlow(_checkinScore),
                                        blurRadius: 60,
                                        spreadRadius: 8,
                                      ),
                                    ]
                                  : null,
                            ),
                          ),
                          LiquidMorphIcon(
                            icon: _iconForMode(widget.mode),
                            color: tierColor,
                            size: 44,
                          ),
                          // Mode content (absolutely positioned below the icon).
                          Positioned(
                            top: 104,
                            left: 0,
                            right: 0,
                            child: Column(
                              children: [
                                Text(
                                  isVlog
                                      ? 'VIDEO JOURNAL'
                                      : isCheckin
                                          ? tierLabel
                                          : widget.mode == SessionMode.circles
                                              ? 'RELATIONSHIP JOURNAL'
                                              : 'FREE WRITING',
                                  style: TextStyle(
                                    color: isCheckin ? tierColor : AppColors.textSecondary,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 1.5,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                if (isVlog)
                                  _QuickVideoPill(onPress: _startQuickVideo)
                                else if (widget.mode == SessionMode.circles)
                                  _PersonPickerPill(
                                    persons: persons,
                                    selectedId: _selectedPersonId,
                                    onSelect: (id) => setState(() => _selectedPersonId = id),
                                    onPress: _openCirclePicker,
                                  )
                                else if (widget.mode == SessionMode.journal)
                                  _TweetPill(onPress: _startTweet, isCircles: false),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    // TickDial (session duration)
                    TickDial(
                      count: isVlog ? vlogSessionOptionsMins.length : sessionOptionsMins.length,
                      valueLabel: 'min',
                      initialValue: isVlog ? 0 : _timeIndex,
                      onChanged: (i) => setState(() => _timeIndex = i),
                    ),
                    // Difficulty pills (hidden for checkin/vlog)
                    if (!isCheckin && !isVlog)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            for (var i = 0; i < difficultyLimitsMs.length; i++)
                              _DifficultyPill(
                                label: _difficultyLabel(i),
                                active: _diffIndex == i,
                                onTap: () => setState(() => _diffIndex = i),
                              ),
                          ],
                        ),
                      ),
                    const Spacer(),
                    // Massive start button (white pill, SPEC §15)
                    AnimatedScaleButton(
                      onPress: _handleStart,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 56, vertical: 18),
                        decoration: BoxDecoration(
                          color: AppColors.textPrimary,
                          borderRadius: BorderRadius.circular(30),
                          boxShadow: const [
                            BoxShadow(
                              color: Color(0x4DFFFFFF),
                              blurRadius: 15,
                              offset: Offset(0, 4),
                            ),
                          ],
                        ),
                        child: Text(
                          isVlog ? 'START RECORDING' : 'START WRITING',
                          style: const TextStyle(
                            color: Colors.black,
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 115), // nav clearance
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  static String _difficultyLabel(int index) {
    const names = ['EASY', 'MID', 'HARD'];
    return '${names[index]} ${(difficultyLimitsMs[index] / 1000).round()}s';
  }

  static String _iconForMode(SessionMode mode) {
    switch (mode) {
      case SessionMode.journal:
        return 'notebookEdit';
      case SessionMode.circles:
        return 'accountGroup';
      case SessionMode.vlog:
        return 'videoOutline';
      case SessionMode.checkin:
        return 'starFourPoints';
    }
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.streak, this.onCalendarPress});

  final int streak;
  final VoidCallback? onCalendarPress;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Streak button → streak calendar
          AnimatedScaleButton(
            onPress: onCalendarPress,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: AppColors.glassBackground,
                borderRadius: BorderRadius.circular(30),
                border: Border.all(color: AppColors.glassBorder, width: 1),
              ),
              child: Row(
                children: [
                  Icon(Mdi.get('fire'), color: AppColors.primaryAction, size: 20),
                  const SizedBox(width: 6),
                  Text(
                    '$streak',
                    style: const TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ),
          ),
          Row(
            children: [
              // Vision lock button → Masteries (unlock gate, SPEC §12).
              const _VisionLockButton(),
              const SizedBox(width: 8),
              // Settings cog (long-press 4 s = dev mode, Phase 8)
              AnimatedScaleButton(
                onPress: () {},
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.glassBackground,
                    borderRadius: BorderRadius.circular(30),
                    border: Border.all(color: AppColors.glassBorder, width: 1),
                  ),
                  child: Icon(Mdi.get('cog'), color: AppColors.textSecondary, size: 20),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DifficultyPill extends StatelessWidget {
  const _DifficultyPill({required this.label, required this.active, required this.onTap});

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 5),
      child: AnimatedScaleButton(
        onPress: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            color: active ? AppColors.glassHighlight : AppColors.glassBackground,
            borderRadius: BorderRadius.circular(30),
            border: Border.all(
              color: active ? AppColors.textDim : AppColors.glassBorderSubtle,
              width: 1,
            ),
          ),
          child: Text(
            label,
            style: const TextStyle(
              color: AppColors.textPrimary,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}

class _TweetPill extends StatelessWidget {
  const _TweetPill({required this.onPress, required this.isCircles});

  final VoidCallback onPress;
  final bool isCircles;

  @override
  Widget build(BuildContext context) {
    return AnimatedScaleButton(
      onPress: onPress,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: AppColors.glassSurfaceSubtle,
          borderRadius: BorderRadius.circular(30),
          border: Border.all(color: AppColors.dangerBorder, width: 1),
        ),
        child: const Text(
          '🐦 New Tweet',
          style: TextStyle(color: AppColors.textSecondary, fontSize: 13, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}

class _QuickVideoPill extends StatelessWidget {
  const _QuickVideoPill({required this.onPress});

  final VoidCallback onPress;

  @override
  Widget build(BuildContext context) {
    return AnimatedScaleButton(
      onPress: onPress,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: AppColors.glassSurfaceSubtle,
          borderRadius: BorderRadius.circular(30),
          border: Border.all(color: AppColors.dangerBorder, width: 1),
        ),
        child: Text(
          'Quick Video',
          style: TextStyle(
            color: AppColors.orange,
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

class _PersonPickerPill extends StatelessWidget {
  const _PersonPickerPill({
    required this.persons,
    required this.selectedId,
    required this.onSelect,
    this.onPress,
  });

  final List<Person> persons;
  final String? selectedId;
  final ValueChanged<String> onSelect;
  final VoidCallback? onPress;

  @override
  Widget build(BuildContext context) {
    Person? selected;
    for (final person in persons) {
      if (person.id == selectedId) {
        selected = person;
        break;
      }
    }
    return AnimatedScaleButton(
      onPress: onPress,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: AppColors.glassSurfaceSubtle,
          borderRadius: BorderRadius.circular(30),
          border: Border.all(color: AppColors.glassBorder, width: 1),
        ),
        child: Text(
          selected != null ? '👤 ${selected.name}' : '👤 Choose a person',
          style: const TextStyle(color: AppColors.textSecondary, fontSize: 13, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}

/// VisionLockButton — lock ↔ Masteries morphing header button (SPEC §15).
/// Locked: lock icon + "Locked" (dangerIconOverlay); unlocked: gold star +
/// "Masteries". Tap unlocks (biometrics → PIN) and opens the dashboard.
class _VisionLockButton extends ConsumerWidget {
  const _VisionLockButton();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Re-evaluate on every tier change.
    ref.watch(securityControllerProvider.select((c) => c.tierVersion.value));
    final security = ref.read(securityControllerProvider);
    final prefs = ref.read(preferencesProvider);
    final unlocked = security.isNotesUnlocked;

    return AnimatedScaleButton(
      onPress: () async {
        if (unlocked) {
          vibrate(HapticPatterns.lockAll);
          security.lockAll();
          return;
        }
        final ok = await security.unlockNotes(
          preferPinAuth: prefs.preferPinAuth,
          useBiometrics: prefs.useBiometrics,
        );
        if (ok && context.mounted) {
          vibrate(HapticPatterns.unlockSuccess);
          context.push('/masteries');
        }
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: unlocked ? AppColors.glassBackground : AppColors.dangerTint,
          borderRadius: BorderRadius.circular(30),
          border: Border.all(
            color: unlocked ? AppColors.glassBorder : AppColors.dangerBorder,
            width: 1,
          ),
        ),
        child: Row(
          children: [
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 250),
              child: Icon(
                unlocked ? Mdi.get('starOutline') : Mdi.get('lockOutline'),
                key: ValueKey(unlocked),
                color: unlocked ? AppColors.gold : AppColors.dangerIconOverlay,
                size: 18,
              ),
            ),
            const SizedBox(width: 6),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 250),
              child: Text(
                unlocked ? 'Masteries' : 'Locked',
                key: ValueKey(unlocked),
                style: TextStyle(
                  color: unlocked ? AppColors.textPrimary : AppColors.dangerIconOverlay,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
