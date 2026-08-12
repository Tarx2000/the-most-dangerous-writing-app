/// LiquidGlassNav — floating pill tab bar (SPEC §15).
/// Port of `LiquidGlassNav.tsx`:
///  - solid pill `overlayLockAndroid` fill, `specularBorderStart` 1 px border,
///    radius = height/2, shadow 0/10/24 @0.7, overflow hidden (max 3 layers)
///  - sliding indicator bubble (inset 7 px, `navIndicatorBackground`)
///  - icon 22 px + label 10 px per tab; active `navIconActive`
///  - indicator slides with `withTiming` 180 ms cubic-out (zero overshoot)
library;

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../features/home/home_shell_types.dart';
import 'animated_scale_button.dart';

class NavTabConfig {
  const NavTabConfig({
    required this.id,
    required this.icon,
    required this.label,
    this.urgent = false,
  });

  final String id;
  final String icon;
  final String label;

  /// Gold urgent dot (e.g. check-in overdue).
  final bool urgent;
}

class LiquidGlassNav extends StatefulWidget {
  const LiquidGlassNav({
    super.key,
    required this.tabs,
    required this.activeId,
    required this.onSelect,
    this.onFeedToggle,
    this.feedOpen = false,
    this.feedProgress = 0,
    this.safeBottom = 14,
  });

  final List<NavTabConfig> tabs;
  final String activeId;
  final ValueChanged<String> onSelect;
  final VoidCallback? onFeedToggle;
  final bool feedOpen;

  /// 0..1 feed reveal progress (drives the fade/slide).
  final double feedProgress;
  final double safeBottom;

  @override
  State<LiquidGlassNav> createState() => _LiquidGlassNavState();
}

class _LiquidGlassNavState extends State<LiquidGlassNav> {
  static const double _height = 62;
  static const double _pillInset = 7;

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.sizeOf(context).width;
    final pillWidth = screenWidth * 0.88;
    final tabWidth = pillWidth / widget.tabs.length;

    return Positioned(
      left: (screenWidth - pillWidth) / 2,
      bottom: widget.safeBottom,
      width: pillWidth,
      height: _height,
      child: Transform.translate(
        // The pill slides DOWN 80 px and fades as the feed opens (SPEC §14).
        offset: Offset(0, widget.feedProgress * 80),
        child: Opacity(
          opacity: (1 - widget.feedProgress).clamp(0.0, 1.0),
          child: Container(
            decoration: BoxDecoration(
              color: AppColors.overlayLockAndroid,
              borderRadius: BorderRadius.circular(_height / 2),
              border: Border.all(color: AppColors.specularBorderStart, width: 1),
              boxShadow: const [
                BoxShadow(
                  color: AppColors.navPillShadow,
                  blurRadius: 24,
                  offset: Offset(0, 10),
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(_height / 2),
              child: Stack(
                children: [
                  // Layer 1: pill background (already the container)
                  // Layer 2: sliding indicator bubble — RN parity:
                  // `left: 0; top: 6; translateX = index*tabWidth + PADDING`,
                  // height PILL_HEIGHT−12, width tabWidth − 2×PADDING.
                  AnimatedPositioned(
                    left: _indicatorLeft(widget.tabs, widget.activeId, tabWidth),
                    top: _pillInset,
                    height: _height - _pillInset * 2,
                    width: tabWidth - _pillInset * 2,
                    duration: const Duration(milliseconds: 180),
                    curve: Curves.easeOutCubic,
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppColors.navIndicatorBackground,
                        borderRadius: BorderRadius.circular((_height - _pillInset * 2) / 2),
                        border: Border.all(color: AppColors.navIndicatorBorder, width: 1),
                      ),
                    ),
                  ),
                  // Layer 3: tabs
                  Row(
                    children: [
                      for (final tab in widget.tabs)
                        Expanded(
                          child: _NavTab(
                            tab: tab,
                            tabWidth: tabWidth,
                            active: tab.id == widget.activeId,
                            onTap: () {
                              widget.onSelect(tab.id);
                              widget.onFeedToggle?.call();
                            },
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Indicator left offset (RN parity): index × tabWidth + PADDING.
  static double _indicatorLeft(
    List<NavTabConfig> tabs,
    String activeId,
    double tabWidth,
  ) {
    final index = tabs.indexWhere((t) => t.id == activeId);
    if (index < 0) return _pillInset;
    return index * tabWidth + _pillInset;
  }
}

class _NavTab extends StatelessWidget {
  const _NavTab({
    required this.tab,
    required this.tabWidth,
    required this.active,
    required this.onTap,
  });

  final NavTabConfig tab;
  final double tabWidth;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AnimatedScaleButton(
      onPress: onTap,
      activeScale: 0.96,
      child: SizedBox(
        height: 62,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Mdi.get(tab.icon),
                  size: 22,
                  color: active ? AppColors.navIconActive : AppColors.navIconInactive,
                ),
                const SizedBox(height: 3),
                Text(
                  tab.label,
                  style: TextStyle(
                    color: active ? AppColors.navIconActive : AppColors.navIconInactive,
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            if (tab.urgent)
              Positioned(
                top: 9,
                right: tabWidth / 2 - 14,
                child: Container(
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(
                    color: AppColors.gold,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Default nav tabs (SPEC §15).
List<NavTabConfig> defaultNavTabs({required bool checkinUrgent}) => [
      const NavTabConfig(id: HomeTab.journal, icon: 'notebookEdit', label: 'Journal'),
      const NavTabConfig(id: HomeTab.circles, icon: 'accountGroup', label: 'Circles'),
      const NavTabConfig(id: HomeTab.vlog, icon: 'videoOutline', label: 'Vlog'),
      NavTabConfig(id: HomeTab.checkin, icon: 'pillar', label: 'Check-in', urgent: checkinUrgent),
    ];
