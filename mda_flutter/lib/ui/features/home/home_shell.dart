/// HomeShell — the 3-layer home architecture (SPEC §14):
///   Layer A: feed layer (starts at +screenHeight, swipes up over content)
///   Layer B: main content — horizontal pager (Start | Library)
///   Layer C: LiquidGlassNav (floats, fades + slides down when feed opens)
///
/// Feed reveal gesture (parity with `useHomeGestures.ts`): upward-only pan,
/// native vertical-drag recognition, finger 1:1 tracking; commit at
/// progress ≥ 0.40 or velocity < -3000 px/s; commit/close both animate with
/// `springSnappy` (never a hard jump).
///
/// IMPORTANT: the nav pill reflects the SESSION MODE (journal/circles/vlog/
/// checkin) and NEVER moves when the pager is swiped to the Library page.
library;

import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';
import '../../../data/providers.dart';
import '../../core/widgets/liquid_glass_nav.dart';
import '../feed/feed_screen.dart';
import '../library/library_screen.dart';
import '../start/start_screen.dart';
import 'home_shell_types.dart';

class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell>
    with SingleTickerProviderStateMixin {
  static const double _commitProgress = 0.40;
  static const double _closeProgress = 0.70;
  static const double _openVelocity = -3000;
  static const double _closeVelocity = 3000;

  late final PageController _pager = PageController();
  String _activeTab = HomeTab.journal;

  /// Feed reveal progress 0..1 — drives via drag and animates via spring.
  late final AnimationController _feedController = AnimationController(
    vsync: this,
    value: 0,
    duration: const Duration(milliseconds: 400),
  );

  double get _feedProgress => _feedController.value;
  // A gesture must keep ownership when progress crosses the halfway point.
  // Visibility is a committed state, never inferred from an animation frame.
  bool _feedOpen = false;
  bool _feedMounted = false;
  bool _dragArmed = false;
  double _dragStartProgress = 0;
  double _dragDy = 0;

  SessionMode get _modeForTab {
    switch (_activeTab) {
      case HomeTab.journal:
        return SessionMode.journal;
      case HomeTab.circles:
        return SessionMode.circles;
      case HomeTab.vlog:
        return SessionMode.vlog;
      case HomeTab.checkin:
        return SessionMode.checkin;
      default:
        return SessionMode.journal;
    }
  }

  @override
  void dispose() {
    _pager.dispose();
    _feedController.dispose();
    super.dispose();
  }

  void _onNavSelect(String id) {
    setState(() => _activeTab = id);
    // Nav tabs switch the session mode on the start page (parity with RN);
    // the library page is reached by swiping the pager.
    _pager.jumpToPage(0);
  }

  /// The spring updates only transforms. Expensive screens stay cached as
  /// AnimatedBuilder children, so pointer movement never rebuilds the pager.
  Future<void> _commitFeed(bool open) async {
    final changed = _feedOpen != open;
    setState(() {
      _feedOpen = open;
      _dragArmed = false;
      _dragDy = 0;
    });
    if (changed) vibrate(HapticPatterns.tick);
    if (MediaQuery.disableAnimationsOf(context)) {
      _feedController.value = open ? 1 : 0;
    } else {
      try {
        await _feedController
            .animateWith(
              SpringSimulation(
                AppSprings.springSnappy,
                _feedProgress,
                open ? 1 : 0,
                0,
              ),
            )
            .orCancel;
      } on TickerCanceled {
        return; // A new gesture took over, or the screen was disposed.
      }
    }
    if (mounted && !open && !_dragArmed) {
      // Release video controllers and stop hidden feed work after dismissal.
      setState(() => _feedMounted = false);
    }
  }

  void _onOpenDragStart(DragStartDetails details) {
    if (_feedOpen) return;
    _feedController.stop();
    _dragArmed = true;
    _dragStartProgress = _feedProgress;
    _dragDy = 0;
    if (!_feedMounted) setState(() => _feedMounted = true);
  }

  void _onOpenDragUpdate(DragUpdateDetails details) {
    if (!_dragArmed) return;
    _dragDy += details.delta.dy;
    _feedController.value =
        (_dragStartProgress - _dragDy / MediaQuery.sizeOf(context).height)
            .clamp(0.0, 1.0);
  }

  void _onOpenDragEnd(DragEndDetails details) {
    if (!_dragArmed) return;
    _commitFeed(
      _feedProgress >= _commitProgress ||
          (details.primaryVelocity ?? 0) < _openVelocity,
    );
  }

  // RN parity (`FeedScreen.tsx` close gesture): the close decision also
  // projects where the fling would land (progress − velocity·0.12/height).
  // A fast downward fling from 0.75 closes; without the projection Flutter
  // would snap back where RN lets go.
  //
  // Overscroll transfers carry real fling velocity (the ScrollEndNotification
  // velocity), so a top-edge flick closes exactly like a header drag.
  void _onCloseDragStart(DragStartDetails details) {
    if (!_feedOpen) return;
    _feedController.stop();
    _dragArmed = true;
    _dragStartProgress = _feedProgress;
    _dragDy = 0;
  }

  void _onCloseDragUpdate(DragUpdateDetails details) {
    if (!_dragArmed) return;
    _dragDy += details.delta.dy;
    _feedController.value =
        (_dragStartProgress - _dragDy / MediaQuery.sizeOf(context).height)
            .clamp(0.0, 1.0);
  }

  void _onCloseDragEnd(DragEndDetails details) {
    if (!_dragArmed) return;
    final velocity = details.primaryVelocity ?? 0;
    final height = MediaQuery.sizeOf(context).height;
    final projected = height <= 0
        ? _feedProgress
        : _feedProgress - velocity * 0.12 / height;
    _commitFeed(
      !(_feedProgress < _closeProgress ||
          velocity > _closeVelocity ||
          projected < 0.5),
    );
  }

  void _onDragCancel() {
    if (_dragArmed) _commitFeed(_feedOpen);
  }

  // The list owns vertical scrolling. Only downward overscroll at its top
  // transfers movement to the feed reveal; normal reading never closes it.
  // The overscroll end carries the real fling velocity for the RN projection.
  void _onFeedOverscroll(double delta) {
    if (!_feedOpen) return;
    if (!_dragArmed) _onCloseDragStart(DragStartDetails());
    _onCloseDragUpdate(
      DragUpdateDetails(globalPosition: Offset.zero, delta: Offset(0, delta)),
    );
  }

  void _onFeedOverscrollEnd(double velocity) {
    if (!_dragArmed) return;
    _onCloseDragEnd(
      DragEndDetails(
        primaryVelocity: velocity,
        globalPosition: Offset.zero,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.sizeOf(context).height;
    final checkinUrgent = _isCheckinUrgent();
    final bottomInset = MediaQuery.paddingOf(context).bottom;

    return PopScope(
      canPop: !_feedMounted,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop && _feedMounted) _commitFeed(false);
      },
      child: Stack(
        children: [
          AnimatedBuilder(
            animation: _feedController,
            builder: (context, child) => Transform.translate(
              offset: Offset(0, _feedProgress * -screenHeight),
              child: child,
            ),
            child: IgnorePointer(
              ignoring: _feedOpen,
              child: PageView(
                controller: _pager,
                children: [
                  GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onVerticalDragStart: _onOpenDragStart,
                    onVerticalDragUpdate: _onOpenDragUpdate,
                    onVerticalDragEnd: _onOpenDragEnd,
                    onVerticalDragCancel: _onDragCancel,
                    child: StartScreen(
                      mode: _modeForTab,
                      onFeedPull: (delta) {
                        if (!_dragArmed) _onOpenDragStart(DragStartDetails());
                        _onOpenDragUpdate(
                          DragUpdateDetails(
                            globalPosition: Offset.zero,
                            delta: Offset(0, delta),
                          ),
                        );
                      },
                      onFeedPullEnd: () => _onOpenDragEnd(DragEndDetails()),
                    ),
                  ),
                  const LibraryScreen(),
                ],
              ),
            ),
          ),
          if (_feedMounted)
            Positioned.fill(
              child: AnimatedBuilder(
                animation: _feedController,
                builder: (context, child) => Transform.translate(
                  offset: Offset(0, (1 - _feedProgress) * screenHeight),
                  child: child,
                ),
                child: IgnorePointer(
                  ignoring: !_feedOpen,
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onVerticalDragStart: _onCloseDragStart,
                    onVerticalDragUpdate: _onCloseDragUpdate,
                    onVerticalDragEnd: _onCloseDragEnd,
                    onVerticalDragCancel: _onDragCancel,
                    child: FeedScreen(
                      revealProgress: _feedController,
                      onClose: () => _commitFeed(false),
                      onOverscrollPull: _onFeedOverscroll,
                      onOverscrollEnd: () => _onCloseDragEnd(DragEndDetails()),
                      onOverscrollEndWithVelocity: _onFeedOverscrollEnd,
                    ),
                  ),
                ),
              ),
            ),
          // The navigation pill is independent of the sliding main content.
          // It must stop accepting touches as soon as the feed is committed.
          AnimatedBuilder(
            animation: _feedController,
            builder: (context, _) => LiquidGlassNav(
              tabs: defaultNavTabs(checkinUrgent: checkinUrgent),
              activeId: _activeTab,
              onSelect: _onNavSelect,
              feedOpen: _feedOpen,
              feedProgress: _feedProgress,
              safeBottom: bottomInset + 14,
            ),
          ),
        ],
      ),
    );
  }

  /// Gold urgent dot when no check-in happened in the last 7 days (SPEC §14).
  bool _isCheckinUrgent() {
    final lastReflection = ref.watch(preferencesProvider).lastReflectionDate;
    if (lastReflection == null) return true;
    return DateTime.now()
            .difference(DateTime.fromMillisecondsSinceEpoch(lastReflection))
            .inDays >=
        7;
  }
}
