/// LiquidGlassNav — floating pill tab bar (SPEC §15).
/// Port of `LiquidGlassNav.tsx`:
///  - solid pill `overlayLockAndroid` fill, `specularBorderStart` 1 px border,
///    radius = height/2, shadow 0/10/24 @0.7, overflow hidden (max 3 layers)
///  - sliding indicator bubble (inset 7 px, `navIndicatorBackground`)
///  - icon 22 px + label 10 px per tab; active `navIconActive`
///  - indicator slides with `withTiming` 180 ms cubic-out (zero overshoot)
library;

import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:liquid_glass_easy/liquid_glass_easy.dart';

import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../data/providers.dart';
import '../../features/home/home_shell_types.dart';
import 'animated_scale_button.dart';
import 'app_glass.dart';

class NavTabConfig {
  const NavTabConfig({
    required this.id,
    required this.icon,
    required this.label,
    this.urgent = false,
  });

  final String id;
  final String icon;
  IconData get iconData =>
      id == HomeTab.checkin ? Icons.donut_large_rounded : Mdi.get(icon);
  final String label;

  /// Gold urgent dot (e.g. check-in overdue).
  final bool urgent;
}

class LiquidGlassNav extends ConsumerStatefulWidget {
  const LiquidGlassNav({
    super.key,
    required this.tabs,
    required this.activeId,
    required this.onSelect,
    this.onFeedToggle,
    this.feedOpen = false,
    this.feedProgress = const AlwaysStoppedAnimation(0),
    this.safeBottom = 14,
  });

  final List<NavTabConfig> tabs;
  final String activeId;
  final ValueChanged<String> onSelect;
  final VoidCallback? onFeedToggle;
  final bool feedOpen;

  /// 0..1 feed reveal progress (drives the fade/slide).
  final Animation<double> feedProgress;
  final double safeBottom;

  @override
  ConsumerState<LiquidGlassNav> createState() => _LiquidGlassNavState();
}

class _LiquidGlassNavState extends ConsumerState<LiquidGlassNav> {
  static const double _height = 62;
  static const double _pillInset = 7;
  int? _previewIndex;

  @override
  void didUpdateWidget(covariant LiquidGlassNav oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.feedOpen) _previewIndex = null;
  }

  void _select(int index) {
    if (widget.feedOpen || index < 0 || index >= widget.tabs.length) return;
    final tab = widget.tabs[index];
    if (tab.id == widget.activeId) return;
    vibrate(HapticPatterns.tick);
    widget.onSelect(tab.id);
    widget.onFeedToggle?.call();
  }

  int _indexAt(double localX, double width) =>
      ((localX - AppGlass.navInset) /
              ((width - 2 * AppGlass.navInset) / widget.tabs.length))
          .floor()
          .clamp(0, widget.tabs.length - 1);

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.sizeOf(context).width;
    final enableLiquidGlass = ref.watch(
      preferencesProvider.select((p) => p.enableLiquidGlass),
    );
    final pillWidth = screenWidth * (enableLiquidGlass ? 0.90 : 0.88);
    final tabWidth = pillWidth / widget.tabs.length;
    final nativeGlass =
        enableLiquidGlass && ui.ImageFilter.isShaderFilterSupported;
    final bar = enableLiquidGlass
        ? _buildLiquidGlassNavBar(pillWidth, native: nativeGlass)
        : _buildClassicNavBar(tabWidth);
    final animatedBar = IgnorePointer(
      ignoring: widget.feedOpen,
      child: AnimatedBuilder(
        animation: widget.feedProgress,
        child: bar,
        builder: (context, child) => Transform.translate(
          offset: Offset(0, widget.feedProgress.value * 80),
          child: Opacity(
            opacity: (1 - widget.feedProgress.value).clamp(0.0, 1.0),
            child: child,
          ),
        ),
      ),
    );

    // The native morph pill is a full-width overlay, not a 62 px lens.
    // Its raised pill needs room outside the bar and uses global X positions.
    // Remove system padding here: safeBottom already includes that inset.
    if (nativeGlass) {
      return Positioned.fill(
        child: MediaQuery.removePadding(
          context: context,
          removeTop: true,
          removeBottom: true,
          child: animatedBar,
        ),
      );
    }
    return Positioned(
      left: (screenWidth - pillWidth) / 2,
      bottom: widget.safeBottom,
      width: pillWidth,
      height: enableLiquidGlass ? AppGlass.navHeight : _height,
      child: animatedBar,
    );
  }

  /// Classic rendering mode (SPEC §15 original):
  /// Solid pill `overlayLockAndroid` fill, `specularBorderStart` 1 px border,
  /// standard BoxShadow. Zero shader passes, zero backdrop reading.
  Widget _buildClassicNavBar(double tabWidth) {
    return Container(
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
        child: _buildClassicTabStack(tabWidth),
      ),
    );
  }

  /// Impeller uses the package's native hold/lift/drag/snap pipeline.
  /// Skia keeps a frosted package bar with the same hold-to-select gesture.
  Widget _buildLiquidGlassNavBar(double pillWidth, {required bool native}) {
    final rawIndex = widget.tabs.indexWhere((t) => t.id == widget.activeId);
    final activeIndex = _previewIndex ?? (rawIndex >= 0 ? rawIndex : 0);
    final items = [
      for (final tab in widget.tabs)
        LiquidGlassTabBarItem(
          label: tab.label,
          iconBuilder: (context, glyph) => Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.center,
            children: [
              Icon(tab.iconData, size: glyph.size, color: glyph.color),
              if (tab.urgent)
                Positioned(
                  top: -2,
                  right: -6,
                  child: Container(
                    width: 7,
                    height: 7,
                    decoration: const BoxDecoration(
                      color: AppColors.gold,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
            ],
          ),
        ),
    ];
    final style = AppGlass.navigation;
    const pill = LiquidGlassTabPillStyle(
      mode: LiquidGlassPillMode.both,
      animated: true,
      growHeight: 4,
      travelDamping: 31.4,
      magnifierPill: LiquidGlassTabMagnifierPillStyle(enabled: false),
      glassStyle: AppGlass.movingSelection,
      rest: AppGlass.selection,
      animationDuration: Duration(milliseconds: 180),
      animationCurve: Curves.easeOutCubic,
    );
    const itemStyle = LiquidGlassTabItemStyle(
      selectedColor: AppColors.navIconActive,
      unselectedColor: Color(0xB3FFFFFF),
      iconSize: 22,
      underGlassIconSize: 23,
      labelFontSize: 12,
      iconLabelGap: 6,
      selectedFontWeight: FontWeight.w500,
      unselectedFontWeight: FontWeight.w400,
    );
    if (native) {
      return Stack(
        children: [
          ExcludeSemantics(
            child: LiquidGlassTabBar(
              width: pillWidth,
              height: AppGlass.navHeight,
              margin: EdgeInsets.only(bottom: widget.safeBottom),
              itemPadding: AppGlass.navInset,
              selectedIndex: activeIndex,
              onChanged: _select,
              style: style,
              pillStyle: pill,
              itemStyle: itemStyle,
              items: items,
            ),
          ),
          // The package paints several clipped icon/label layers and owns
          // one gesture surface. Expose one accessible action per real tab.
          Positioned(
            left: (MediaQuery.sizeOf(context).width - pillWidth) / 2,
            bottom: widget.safeBottom,
            width: pillWidth,
            height: AppGlass.navHeight,
            child: Row(
              children: [
                for (var i = 0; i < widget.tabs.length; i++)
                  Expanded(
                    child: Semantics(
                      label: widget.tabs[i].urgent
                          ? '${widget.tabs[i].label}, overdue'
                          : widget.tabs[i].label,
                      button: true,
                      selected: widget.tabs[i].id == widget.activeId,
                      onTap: () => _select(i),
                      child: const SizedBox.expand(),
                    ),
                  ),
              ],
            ),
          ),
        ],
      );
    }

    return RawGestureDetector(
      behavior: HitTestBehavior.opaque,
      gestures: {
        LongPressGestureRecognizer:
            GestureRecognizerFactoryWithHandlers<LongPressGestureRecognizer>(
              () => LongPressGestureRecognizer(
                duration: const Duration(milliseconds: 100),
              ),
              (gesture) {
                gesture.onLongPressStart = (details) {
                  setState(
                    () => _previewIndex = _indexAt(
                      details.localPosition.dx,
                      pillWidth,
                    ),
                  );
                };
                gesture.onLongPressMoveUpdate = (details) {
                  setState(
                    () => _previewIndex = _indexAt(
                      details.localPosition.dx,
                      pillWidth,
                    ),
                  );
                };
                gesture.onLongPressEnd = (_) {
                  final selected = _previewIndex;
                  setState(() => _previewIndex = null);
                  if (selected != null) _select(selected);
                };
                gesture.onLongPressCancel = () =>
                    setState(() => _previewIndex = null);
              },
            ),
      },
      child: LiquidGlassTabBar(
        width: pillWidth,
        height: AppGlass.navHeight,
        margin: EdgeInsets.zero,
        itemPadding: AppGlass.navInset,
        selectedIndex: activeIndex,
        onChanged: _select,
        style: style,
        pillStyle: pill.copyWith(mode: LiquidGlassPillMode.none),
        itemStyle: itemStyle,
        items: items,
      ),
    );
  }

  /// Classic tab stack: indicator bubble + interactive icon/label tab rows.
  Widget _buildClassicTabStack(double tabWidth) {
    return Stack(
      children: [
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
              borderRadius: BorderRadius.circular(
                (_height - _pillInset * 2) / 2,
              ),
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
                  tab.iconData,
                  size: 22,
                  color: active
                      ? AppColors.navIconActive
                      : AppColors.navIconInactive,
                ),
                const SizedBox(height: 3),
                Text(
                  tab.label,
                  style: TextStyle(
                    color: active
                        ? AppColors.navIconActive
                        : AppColors.navIconInactive,
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
  const NavTabConfig(
    id: HomeTab.journal,
    icon: 'notebookEdit',
    label: 'Journal',
  ),
  const NavTabConfig(
    id: HomeTab.circles,
    icon: 'accountGroup',
    label: 'Circles',
  ),
  const NavTabConfig(id: HomeTab.vlog, icon: 'videoOutline', label: 'Vlog'),
  NavTabConfig(
    id: HomeTab.checkin,
    icon: 'chartDonut',
    label: 'Check-in',
    urgent: checkinUrgent,
  ),
];
