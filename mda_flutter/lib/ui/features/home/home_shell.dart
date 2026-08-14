/// HomeShell — the 3-layer home architecture (SPEC §14):
///   Layer A: feed layer (starts at +screenHeight, swipes up over content)
///   Layer B: main content — horizontal pager (Start | Library)
///   Layer C: LiquidGlassNav (floats, fades + slides down when feed opens)
///
/// Feed reveal gesture (parity with `useHomeGestures.ts`): upward-only pan,
/// activation ≥ 8 px, fail on |dx| > 20 px, finger 1:1 tracking; commit at
/// progress ≥ 0.40 or velocity < -3000 px/s; commit/close both animate with
/// `springSnappy` (never a hard jump).
///
/// IMPORTANT: the nav pill reflects the SESSION MODE (journal/circles/vlog/
/// checkin) and NEVER moves when the pager is swiped to the Library page.
library;

import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
  static const double _activationOffset = 8;
  static const double _failTolerance = 20;
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
  bool get _feedOpen => _feedController.value > 0.5;
  bool _dragArmed = false;
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

  bool get _isOnStartPage => _activeTab != HomeTab.circles;

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

  /// Springs the feed to the target (springSnappy — parity with RN).
  void _commitFeed(bool open) {
    final target = open ? 1.0 : 0.0;
    if (_feedController.value == target) return;
    _feedController.animateWith(
      SpringSimulation(
        const SpringDescription(damping: 35, stiffness: 250, mass: 0.8),
        _feedController.value,
        target,
        0,
      ),
    );
    setState(() {
      _dragArmed = false;
      _dragDy = 0;
    });
  }

  // -- Feed open gesture (on the start page only, upward-only) ---------------

  void _onOpenDragStart(DragStartDetails details) {
    _dragArmed = _isOnStartPage && !_feedOpen;
    _dragDy = 0;
  }

  void _onOpenDragUpdate(DragUpdateDetails details) {
    if (!_dragArmed || _feedOpen) return;
    if (details.delta.dx.abs() > _failTolerance) {
      _dragArmed = false;
      return;
    }
    if (details.delta.dy > 0 && _dragDy <= _activationOffset) {
      return; // only upward pulls arm the reveal
    }
    setState(() {
      _dragDy += details.delta.dy;
      _feedController.value = (_dragDy / -MediaQuery.sizeOf(context).height)
          .clamp(0.0, 1.0)
          .toDouble();
    });
  }

  void _onOpenDragEnd(DragEndDetails details) {
    if (!_dragArmed || _feedOpen) return;
    final velocity = details.primaryVelocity ?? 0;
    if (_feedProgress >= _commitProgress || velocity < _openVelocity) {
      _commitFeed(true);
    } else {
      _commitFeed(false);
    }
  }

  // -- Feed close gesture (on the feed layer) --------------------------------

  void _onCloseDragUpdate(DragUpdateDetails details) {
    if (!_feedOpen) return;
    setState(() {
      _dragDy += details.delta.dy;
      _feedController.value = (1 + _dragDy / MediaQuery.sizeOf(context).height)
          .clamp(0.0, 1.0)
          .toDouble();
    });
  }

  void _onCloseDragEnd(DragEndDetails details) {
    if (!_feedOpen) return;
    final velocity = details.primaryVelocity ?? 0;
    if (_feedProgress < _closeProgress || velocity > _closeVelocity) {
      _commitFeed(false);
    } else {
      _commitFeed(true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.sizeOf(context).height;
    final checkinUrgent = _isCheckinUrgent();
    final bottomInset = MediaQuery.paddingOf(context).bottom;

    return Stack(
      children: [
        // ---- Layer B: main content (pager Start | Library) ----------------
        AnimatedBuilder(
          animation: _feedController,
          builder: (context, _) {
            final progress = _feedProgress;
            return Transform.translate(
              offset: Offset(0, progress * -screenHeight),
              child: PageView(
                controller: _pager,
                physics: _feedOpen ? const NeverScrollableScrollPhysics() : null,
                // NOTE: swiping the pager NEVER changes the nav pill — the
                // pill reflects the session mode only.
                children: [
                  StartScreen(mode: _modeForTab),
                  const LibraryScreen(),
                ],
              ),
            );
          },
        ),

        // ---- Layer A: feed layer (starts below the viewport) --------------
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          height: screenHeight,
          // The close-gesture must not swallow page drags while the feed is
          // closed — hit-testing is disabled until it is revealed.
          child: IgnorePointer(
            ignoring: !_feedOpen,
            child: GestureDetector(
              onVerticalDragUpdate: _onCloseDragUpdate,
              onVerticalDragEnd: _onCloseDragEnd,
              child: AnimatedBuilder(
                animation: _feedController,
                builder: (context, _) {
                  return Transform.translate(
                    offset: Offset(0, (1 - _feedProgress) * screenHeight),
                    child: FeedScreen(
                      onClose: () => _commitFeed(false),
                    ),
                  );
                },
              ),
            ),
          ),
        ),

        // ---- Feed-open gesture (start page only; below the nav in z-order) -
        if (!_feedOpen)
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.translucent,
              onVerticalDragStart: _onOpenDragStart,
              onVerticalDragUpdate: _onOpenDragUpdate,
              onVerticalDragEnd: _onOpenDragEnd,
            ),
          ),

        // ---- Layer C: LiquidGlassNav --------------------------------------
        AnimatedBuilder(
          animation: _feedController,
          builder: (context, _) {
            return LiquidGlassNav(
              tabs: defaultNavTabs(checkinUrgent: checkinUrgent),
              activeId: _activeTab,
              onSelect: _onNavSelect,
              feedOpen: _feedOpen,
              feedProgress: _feedProgress,
              safeBottom: bottomInset + 14,
            );
          },
        ),
      ],
    );
  }

  /// Gold urgent dot when no check-in happened in the last 7 days (SPEC §14).
  bool _isCheckinUrgent() {
    final lastLog = ref.watch(appDataProvider).lastLogDate;
    if (lastLog == null) return true;
    return DateTime.now().difference(DateTime.fromMillisecondsSinceEpoch(lastLog)).inDays >= 7;
  }
}
