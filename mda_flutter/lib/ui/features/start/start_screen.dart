/// StartScreen — the session setup dashboard (SPEC §15, §17).
/// Sections top→bottom: TopBar (streak / Vision lock / settings) · Hero
/// (morph icon + mode content) · TickDial · difficulty pills · massive
/// start button · bottom spacer.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:liquid_glass_easy/liquid_glass_easy.dart';

import '../../../core/config/app_config.dart';
import '../../../core/haptics.dart';
import '../../../core/rating_day.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../data/models/person.dart';
import '../../../data/providers.dart';
import '../../../data/security_providers.dart';
import '../../core/widgets/animated_scale_button.dart';
import '../../core/widgets/app_glass.dart';
import '../../core/widgets/liquid_glass_options.dart';
import '../../core/widgets/base_modal.dart';
import '../settings/settings_modal.dart';
import '../../core/widgets/calendar_view.dart';
import '../../core/widgets/custom_slider.dart';
import '../../core/widgets/glass_action.dart';
import '../../core/widgets/glass_pill.dart';
import '../../core/widgets/tick_dial.dart';
import '../circles/circle_picker_sheet.dart';

/// Which setup flow the start screen currently offers.
enum SessionMode { journal, circles, checkin, vlog }

class StartScreen extends ConsumerStatefulWidget {
  const StartScreen({
    super.key,
    this.mode = SessionMode.journal,
    this.onModeChanged,
    this.onFeedPull,
    this.onFeedPullEnd,
  });

  final SessionMode mode;
  final ValueChanged<double>? onFeedPull;
  final VoidCallback? onFeedPullEnd;

  /// Called when the mode changes (the home shell owns the nav state).
  final ValueChanged<SessionMode>? onModeChanged;

  @override
  ConsumerState<StartScreen> createState() => _StartScreenState();
}

class _StartScreenState extends ConsumerState<StartScreen> {
  int _timeIndex = defaultSessionIndex; // 5 min
  int _vlogTimeIndex = 0;
  int _diffIndex = defaultDifficultyIndex; // MID
  int? _checkinScore;
  String? _scoreDay;
  int? get _currentScore {
    final day = RatingDay.at(DateTime.now()).key;
    if (_scoreDay == day) return _checkinScore;
    if (!ref.read(isNotesUnlockedProvider)) return null;
    return ref
        .read(wellbeingProvider)
        .where((e) => e.dayKey == day)
        .firstOrNull
        ?.overall;
  }

  String? _selectedPersonId;

  void _handleStart() {
    if (widget.mode == SessionMode.circles && _selectedPersonId == null) {
      _openCirclePicker();
      return;
    }
    final timeIndex = widget.mode == SessionMode.vlog
        ? _vlogTimeIndex
        : _timeIndex;
    final diffIndex = _diffIndex;
    final mode = widget.mode;
    vibrate(HapticPatterns.tick);

    switch (mode) {
      case SessionMode.vlog:
        context.push('/vlog', extra: {'timeIndex': timeIndex});
      case SessionMode.checkin:
        context.push('/checkin', extra: {'alignmentScore': _currentScore});
      case SessionMode.journal:
      case SessionMode.circles:
        context.push(
          '/writing',
          extra: {
            'timeIndex': timeIndex,
            'diffIndex': diffIndex,
            'mode': mode == SessionMode.circles ? 'circles' : 'journal',
            'personId': mode == SessionMode.circles ? _selectedPersonId : null,
          },
        );
    }
  }

  void _startTweet() {
    vibrate(HapticPatterns.dialPress);
    context.push(
      '/writing',
      extra: {
        'timeIndex': 0,
        'diffIndex': _diffIndex,
        'mode': widget.mode == SessionMode.circles ? 'circles' : 'journal',
        'personId': widget.mode == SessionMode.circles
            ? _selectedPersonId
            : null,
        'isTweet': true,
      },
    );
  }

  /// Opens the streak calendar (fire pill in the top bar).
  void _openCalendar() {
    final streak = ref.read(streakProvider);
    showBaseModal(
      context,
      title: null,
      heightFactor: 0.9,
      builder: (close) => SingleChildScrollView(
        padding: EdgeInsets.only(
          bottom: MediaQuery.paddingOf(context).bottom + 24,
        ),
        child: CalendarView(
          currentStreak: streak.currentStreak,
          streakHistory: streak.streakHistory,
        ),
      ),
    );
  }

  /// Opens the circle picker for circles mode.
  Future<void> _openCirclePicker() async {
    final selected = await showCirclePicker(
      context,
      selectedId: _selectedPersonId,
    );
    if (selected != null) {
      setState(() => _selectedPersonId = selected);
    }
  }

  void _startQuickVideo() {
    vibrate(HapticPatterns.dialPress);
    context.push('/vlog', extra: {'timeIndex': 0, 'isQuickVideo': true});
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(isNotesUnlockedProvider);
    final streak = ref.watch(streakProvider).currentStreak;
    final enableLiquidGlass = ref.watch(
      preferencesProvider.select((p) => p.enableLiquidGlass),
    );
    final persons = ref.watch(personsProvider);
    final isCheckin = widget.mode == SessionMode.checkin;
    final isVlog = widget.mode == SessionMode.vlog;

    return SafeArea(
      child: LayoutBuilder(
        builder: (context, constraints) {
          // Keep the page bounded and leave vertical drags to HomeShell.
          // Glass touch uses LayoutBuilder and cannot take part in an
          // IntrinsicHeight pass. Compact only the hero on shorter screens.
          if (isCheckin) {
            ref.watch(wellbeingProvider);
            ref.watch(ratingClockProvider);
            final score = _currentScore;
            return Column(
              children: [
                _TopBar(streak: streak, onCalendarPress: _openCalendar),
                const Spacer(),
                Flexible(
                  flex: 6,
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: SizedBox(
                      width: constraints.maxWidth,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.track_changes_rounded,
                            size: 48,
                            color: AppColors.textPrimary,
                          ),
                          const SizedBox(height: 20),
                          const Text(
                            'Check-in',
                            style: TextStyle(
                              fontSize: 32,
                              fontWeight: FontWeight.w700,
                              letterSpacing: -0.8,
                            ),
                          ),
                          const SizedBox(height: 14),
                          const Padding(
                            padding: EdgeInsets.symmetric(horizontal: 32),
                            child: Text(
                              'How satisfied are you with your life right now?',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: AppColors.textBodyDim,
                                fontSize: 16,
                                height: 1.4,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 26),
                Text(
                  score == null ? '—' : '$score / 10',
                  style: const TextStyle(
                    fontSize: 36,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: CustomSlider(
                    value: score,
                    min: 0,
                    max: 10,
                    label: 'Overall satisfaction',
                    enableGlass: enableLiquidGlass,
                    onChanged: (v) => setState(() {
                      _checkinScore = v;
                      _scoreDay = RatingDay.at(DateTime.now()).key;
                    }),
                    onCancelled: (v) => setState(() {
                      _checkinScore = v;
                      _scoreDay = RatingDay.at(DateTime.now()).key;
                    }),
                  ),
                ),
                const Spacer(),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 40),
                  child: GlassAction(
                    label: 'Continue check-in',
                    icon: Icons.arrow_forward_rounded,
                    onPressed: _handleStart,
                    height: 64,
                  ),
                ),
                TextButton(
                  onPressed: () => context.push('/checkin/history'),
                  child: const Text(
                    'View history',
                    style: TextStyle(color: AppColors.textBodyDim),
                  ),
                ),
                const SizedBox(height: 110),
              ],
            );
          }
          return Column(
            children: [
              _TopBar(streak: streak, onCalendarPress: _openCalendar),
              const SizedBox(height: 8),
              Expanded(
                flex: 6,
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: SizedBox(
                    width: constraints.maxWidth,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SizedBox.square(
                          dimension: 96,
                          child: widget.mode == SessionMode.journal
                              ? Image.asset(
                                  'assets/branding/app_icon.png',
                                  cacheWidth: 288,
                                  cacheHeight: 288,
                                )
                              : Icon(
                                  isVlog
                                      ? Icons.videocam_outlined
                                      : Icons.people_outline_rounded,
                                  color: AppColors.textPrimary,
                                  size: 54,
                                ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          isVlog
                              ? 'Video Journal'
                              : widget.mode == SessionMode.circles
                              ? 'Relationship Journal'
                              : 'Free Writing',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: AppColors.textPrimary,
                            fontSize: 28,
                            fontWeight: FontWeight.w600,
                            letterSpacing: -0.8,
                          ),
                        ),
                        const SizedBox(height: 18),
                        if (isVlog)
                          _QuickVideoPill(onPress: _startQuickVideo)
                        else if (widget.mode == SessionMode.circles) ...[
                          _PersonPickerPill(
                            persons: persons,
                            selectedId: _selectedPersonId,
                            onSelect: (id) =>
                                setState(() => _selectedPersonId = id),
                            onPress: _openCirclePicker,
                          ),
                          if (_selectedPersonId != null) ...[
                            const SizedBox(height: 10),
                            _TweetPill(onPress: _startTweet, isCircles: true),
                          ],
                        ] else
                          _TweetPill(onPress: _startTweet, isCircles: false),
                      ],
                    ),
                  ),
                ),
              ),
              const Spacer(),
              // TickDial (session duration) — shows the actual minutes.
              TickDial(
                data: isVlog ? vlogSessionOptionsMins : sessionOptionsMins,
                selectedIndex: isVlog ? _vlogTimeIndex : _timeIndex,
                onSelect: (i) => setState(() {
                  if (isVlog) {
                    _vlogTimeIndex = i;
                  } else {
                    _timeIndex = i;
                  }
                }),
              ),
              // Difficulty pills (hidden for checkin/vlog) — RN parity:
              // In Liquid Glass mode, supports tapping and hold/slide selection.
              // In classic mode, falls back to the 3 discrete pills.
              Visibility(
                visible: !isCheckin && !isVlog,
                maintainSize: true,
                maintainAnimation: true,
                maintainState: true,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: enableLiquidGlass
                      ? LiquidGlassOptions(
                          width: 270,
                          height: 44,
                          options: const ['EASY', 'MID', 'HARD'],
                          selectedIndex: _diffIndex,
                          onChanged: (i) {
                            if (i == _diffIndex) return;
                            vibrate(HapticPatterns.tick);
                            setState(() => _diffIndex = i);
                          },
                        )
                      : Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            for (var i = 0; i < difficultyLimitsMs.length; i++)
                              Flexible(
                                child: _DifficultyPill(
                                  label: _difficultyLabel(i),
                                  active: _diffIndex == i,
                                  onTap: () => setState(() => _diffIndex = i),
                                ),
                              ),
                          ],
                        ),
                ),
              ),
              const Spacer(),
              // Large standalone glass action. Keep the classic
              // action's original size and styling when glass is disabled.
              enableLiquidGlass
                  ? LiquidGlassButton(
                      onPressed: _handleStart,
                      height: 64,
                      width: (constraints.maxWidth - 40).clamp(0.0, 320.0),
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      touch: MediaQuery.disableAnimationsOf(context)
                          ? const LiquidGlassTouch()
                          : AppGlass.buttonTouch,
                      style: AppGlass.surface(
                        32,
                        tint: const Color(0x10FFFFFF),
                      ),
                      foregroundColor: AppColors.textPrimary,
                      fontSize: 19,
                      fontWeight: FontWeight.w600,
                      iconSize: 24,
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              isVlog
                                  ? Icons.videocam_rounded
                                  : Icons.edit_note_rounded,
                            ),
                            const SizedBox(width: 8),
                            Text(isVlog ? 'Start Recording' : 'Start Writing'),
                          ],
                        ),
                      ),
                    )
                  : AnimatedScaleButton(
                      onPress: _handleStart,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 40,
                          vertical: 18,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.textPrimary,
                          borderRadius: BorderRadius.circular(30),
                          boxShadow: const [
                            BoxShadow(
                              color: AppColors.textMuted,
                              blurRadius: 15,
                              offset: Offset(0, 4),
                            ),
                          ],
                        ),
                        child: Text(
                          isVlog ? 'Start Recording' : 'Start Writing',
                          style: const TextStyle(
                            color: AppColors.background,
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),
                    ),
              SizedBox(height: enableLiquidGlass ? 130 : 115), // nav clearance
            ],
          );
        },
      ),
    );
  }

  static String _difficultyLabel(int index) {
    const names = ['EASY', 'MID', 'HARD'];
    return names[index];
  }
}

class _TopBar extends ConsumerWidget {
  const _TopBar({required this.streak, this.onCalendarPress});
  final int streak;
  final VoidCallback? onCalendarPress;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final glass = ref.watch(
      preferencesProvider.select((p) => p.enableLiquidGlass),
    );
    final content = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Mdi.get('fire'), color: AppColors.primaryAction, size: 20),
        const SizedBox(width: 6),
        Text(
          '$streak',
          style: const TextStyle(
            color: AppColors.textPrimary,
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
    return LiquidGlassBatch(
      enabled: glass,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
        child: Row(
          children: [
            AnimatedScaleButton(
              onPress: onCalendarPress,
              semanticLabel: 'Streak: $streak days. Open calendar',
              activeScale: glass ? 1 : 0.95,
              activeOpacity: glass ? 1 : 0.8,
              child: glass
                  ? _HeaderGlassPill(
                      label: '$streak',
                      labelStyle: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                      iconSize: 20,
                      touch: AppGlass.headerTouch,
                      style: AppGlass.surface(30),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 10,
                        ),
                        child: content,
                      ),
                    )
                  : Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.glassBackground,
                        borderRadius: BorderRadius.circular(30),
                        border: Border.all(color: AppColors.glassBorder),
                      ),
                      child: content,
                    ),
            ),
            const Spacer(),
            const Expanded(
              flex: 10,
              child: Align(
                alignment: Alignment.centerRight,
                child: _VisionLockButton(),
              ),
            ),
            const SizedBox(width: 8),
            _SettingsCogButton(),
          ],
        ),
      ),
    );
  }
}

/// Give touch-flex lenses finite bounds even inside the header's Rows.
/// Measure the label with the same text scaling used by the visible content.
class _HeaderGlassPill extends StatelessWidget {
  const _HeaderGlassPill({
    required this.touch,
    required this.style,
    required this.child,
    this.label,
    this.labelStyle,
    this.iconSize = 20,
  });

  final LiquidGlassTouch touch;
  final LiquidGlassStyle style;
  final Widget child;
  final String? label;
  final TextStyle? labelStyle;
  final double iconSize;

  @override
  Widget build(BuildContext context) {
    final painter = TextPainter(
      text: TextSpan(
        text: label ?? '',
        style: DefaultTextStyle.of(context).style.merge(labelStyle),
      ),
      textDirection: Directionality.of(context),
      textScaler: MediaQuery.textScalerOf(context),
    )..layout();
    final size = Size(
      label == null ? 44 : painter.width.ceilToDouble() + iconSize + 36,
      (painter.height + 22).clamp(44.0, double.infinity),
    );
    painter.dispose();
    return SizedBox.fromSize(
      size: size,
      child: LiquidGlassLens(
        touch: MediaQuery.disableAnimationsOf(context)
            ? const LiquidGlassTouch()
            : touch,
        style: style,
        child: FittedBox(fit: BoxFit.scaleDown, child: child),
      ),
    );
  }
}

class _DifficultyPill extends StatelessWidget {
  const _DifficultyPill({
    required this.label,
    required this.active,
    required this.onTap,
  });

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
            color: active
                ? AppColors.glassHighlight
                : AppColors.glassBackground,
            borderRadius: BorderRadius.circular(30),
            border: Border.all(
              color: active ? AppColors.textDim : AppColors.glassBorderSubtle,
              width: 1,
            ),
          ),
          child: FittedBox(
            fit: BoxFit.scaleDown,
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
      ),
    );
  }
}

class _TweetPill extends StatelessWidget {
  const _TweetPill({required this.onPress, required this.isCircles});

  final VoidCallback onPress;
  final bool isCircles;

  @override
  Widget build(BuildContext context) => GlassPill(
    label: isCircles ? 'Tweet' : 'New Tweet',
    icon: Icons.edit_outlined,
    onPressed: onPress,
  );
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
          color: AppColors.glassSurface,
          borderRadius: BorderRadius.circular(30),
          border: Border.all(color: AppColors.glassBorder, width: 1),
        ),
        child: Text(
          'Quick Video',
          style: TextStyle(
            color: AppColors.textBody,
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
          selected != null ? selected.name : 'Choose a person',
          style: const TextStyle(
            color: AppColors.textSecondary,
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

/// VisionLockButton — lock ↔ Masteries morphing header button (SPEC §15, RN parity).
/// Locked: lock icon + "Locked" (danger red). Tap triggers unlock in place.
/// Unlocked: pillar icon + "Masteries" (gold). Short tap navigates to /masteries;
/// long press locks all tiers immediately.
class _VisionLockButton extends ConsumerWidget {
  const _VisionLockButton();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Re-evaluate on every tier change reactively.
    final unlocked = ref.watch(isNotesUnlockedProvider);
    final security = ref.read(securityControllerProvider);
    final prefs = ref.watch(preferencesProvider);
    final enableLiquidGlass = prefs.enableLiquidGlass;

    return AnimatedScaleButton(
      semanticLabel: unlocked ? 'Masteries. Hold to lock' : 'Unlock Masteries',
      activeScale: enableLiquidGlass ? 1 : 0.95,
      activeOpacity: enableLiquidGlass ? 1 : 0.8,
      onPress: () async {
        if (unlocked) {
          // Unlocked: short tap navigates to Masteries (SPEC §12 & RN parity)
          vibrate(HapticPatterns.tick);
          context.push('/masteries');
        } else {
          // Locked: short tap unlocks in place
          final ok = await security.unlockNotes(
            preferPinAuth: prefs.preferPinAuth,
            useBiometrics: prefs.useBiometrics,
          );
          if (ok && context.mounted) {
            vibrate(HapticPatterns.unlockSuccess);
          }
        }
      },
      onLongPress: () {
        if (unlocked) {
          // Unlocked: long press locks all tiers (RN parity)
          vibrate(HapticPatterns.lockAll);
          security.lockAll();
        }
      },
      child: enableLiquidGlass
          ? _HeaderGlassPill(
              label: unlocked ? 'Masteries' : 'Locked',
              labelStyle: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
              ),
              iconSize: 18,
              touch: AppGlass.headerTouch,
              style: AppGlass.surface(
                30,
                tint: unlocked ? null : const Color(0x0AFF2A2A),
              ),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 10,
                ),
                child: _buildLockContent(unlocked),
              ),
            )
          : AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: unlocked
                    ? AppColors.glassBackground
                    : AppColors.dangerTint,
                borderRadius: BorderRadius.circular(30),
                border: Border.all(
                  color: unlocked
                      ? AppColors.glassBorder
                      : AppColors.dangerBorder,
                  width: 1,
                ),
              ),
              child: _buildLockContent(unlocked),
            ),
    );
  }

  static Widget _buildLockContent(bool unlocked) {
    return FittedBox(
      fit: BoxFit.scaleDown,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 250),
            child: Icon(
              unlocked ? Mdi.get('pillar') : Mdi.get('lockOutline'),
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
                color: unlocked
                    ? AppColors.textPrimary
                    : AppColors.dangerIconOverlay,
                fontSize: 14,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Settings cog: tap opens the settings sheet; 4 s long-press toggles dev mode
/// (SPEC §2: dev-mode long-press 4000 ms, toast 2000 ms).
class _SettingsCogButton extends ConsumerStatefulWidget {
  @override
  ConsumerState<_SettingsCogButton> createState() => _SettingsCogButtonState();
}

class _SettingsCogButtonState extends ConsumerState<_SettingsCogButton> {
  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(preferencesProvider);
    final devMode = prefs.devMode;
    final enableLiquidGlass = prefs.enableLiquidGlass;

    return AnimatedScaleButton(
      semanticLabel: 'Settings',
      activeScale: enableLiquidGlass ? 1 : 0.95,
      activeOpacity: enableLiquidGlass ? 1 : 0.8,
      onPress: () {
        vibrate(HapticPatterns.optionSelect);
        showBaseModal(
          context,
          title: 'Settings',
          heightFactor: 0.92,
          builder: (close) => SettingsModal(onClose: close),
        );
      },
      longPressDuration: const Duration(milliseconds: devModeLongPressMs),
      onLongPress: () {
        // The gesture recognizer cancels on release; a short hold can never
        // toggle developer mode several seconds after the finger is gone.
        final next = !devMode;
        ref.read(appDataProvider.notifier).setPreference(devMode: next);
        vibrate(next ? HapticPatterns.devOn : HapticPatterns.devOff);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(next ? 'Developer mode ON' : 'Developer mode OFF'),
            duration: const Duration(milliseconds: devModeToastMs),
            backgroundColor: AppColors.surfaceRaised,
          ),
        );
      },
      child: enableLiquidGlass
          ? _HeaderGlassPill(
              touch: AppGlass.headerTouch,
              style: AppGlass.surface(30),
              child: Container(
                padding: const EdgeInsets.all(10),
                child: Icon(
                  Mdi.get('cog'),
                  color: devMode ? AppColors.gold : AppColors.textSecondary,
                  size: 20,
                ),
              ),
            )
          : Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.glassBackground,
                borderRadius: BorderRadius.circular(30),
                border: Border.all(
                  color: devMode ? AppColors.gold : AppColors.glassBorder,
                  width: devMode ? 2 : 1,
                ),
              ),
              child: Icon(
                Mdi.get('cog'),
                color: devMode ? AppColors.gold : AppColors.textSecondary,
                size: 20,
              ),
            ),
    );
  }
}
