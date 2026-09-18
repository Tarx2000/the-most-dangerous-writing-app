/// BaseModal — the bottom-sheet shell used by ALL app sheets (SPEC §15).
/// Port of `BaseModal.tsx`:
///  - scrim `overlayDark`, tap-to-dismiss
///  - sheet `surfaceDark`, top radius 24, full `glassBorderMedium` border
///    (sides hidden off-screen), drag handle, swipe-dismiss
///    (80 px drag / 600 px/s velocity, 20 px activation gate)
///  - entry: spring + scrim 300 ms; exit: 300 ms timing
library;

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';

class BaseModal extends StatefulWidget {
  const BaseModal({
    super.key,
    required this.child,
    this.title,
    this.heightFactor = 0.88,
    this.onClose,
    this.borderRadius = 24,
    this.showHandle = true,
  });

  final Widget child;
  final String? title;
  final double heightFactor;
  final VoidCallback? onClose;
  final double borderRadius;
  final bool showHandle;

  @override
  State<BaseModal> createState() => BaseModalState();
}

class BaseModalState extends State<BaseModal> with TickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 300),
  );
  late final Animation<double> _slide = CurvedAnimation(
    parent: _controller,
    curve: Curves.easeOutCubic,
  );

  late final AnimationController _scrimController = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 300),
  );

  // A dedicated transform controller avoids rebuilding the sheet and its
  // live text fields on every drag frame. It also owns exactly one listener.
  late final AnimationController _dragController =
      AnimationController.unbounded(vsync: this);
  bool _closing = false;

  @override
  void initState() {
    super.initState();
    _controller.forward();
    _scrimController.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    _scrimController.dispose();
    _dragController.dispose();
    super.dispose();
  }

  void dismiss() {
    if (_closing) return;
    _closing = true;
    _scrimController.reverse();
    _controller.reverse().whenComplete(() {
      if (mounted) widget.onClose?.call();
    });
  }

  void _onPanUpdate(DragUpdateDetails details) {
    _dragController.stop();
    _dragController.value = (_dragController.value + details.delta.dy).clamp(
      0.0,
      500.0,
    );
  }

  void _onPanEnd(DragEndDetails details) {
    if (_dragController.value > 80 ||
        details.velocity.pixelsPerSecond.dy > 600) {
      dismiss();
    } else {
      _snapBack();
    }
  }

  void _snapBack() {
    // SPEC §5: scrim/cancel snap-back is 150 ms (the old 200 ms felt laggy).
    _dragController.animateTo(
      0,
      duration: const Duration(milliseconds: 150),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.sizeOf(context).height;
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    // Move above the keyboard instead of subtracting keyboard height from an
    // already short content column (which hid SAVE and overflowed editors).
    final availableHeight =
        (screenHeight - bottomInset - MediaQuery.paddingOf(context).top).clamp(
          0.0,
          screenHeight,
        );
    final sheetHeight = (screenHeight * widget.heightFactor).clamp(
      0.0,
      availableHeight,
    );

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) dismiss();
      },
      child: Material(
        type: MaterialType.transparency,
        child: DefaultTextStyle(
          style: const TextStyle(
            color: AppColors.textPrimary,
            decoration: TextDecoration.none,
            fontSize: 15,
          ),
          child: Stack(
            children: [
              // Scrim
              Positioned.fill(
                child: GestureDetector(
                  onTap: dismiss,
                  child: FadeTransition(
                    opacity: _scrimController,
                    child: const ColoredBox(color: AppColors.overlayDark),
                  ),
                ),
              ),
              // Sheet
              Positioned(
                left: 0,
                right: 0,
                bottom: bottomInset,
                height: sheetHeight,
                child: AnimatedBuilder(
                  animation: Listenable.merge([_slide, _dragController]),
                  builder: (context, child) {
                    return Transform.translate(
                      offset: Offset(
                        0,
                        _dragController.value +
                            (1 - _slide.value) * sheetHeight,
                      ),
                      child: child,
                    );
                  },
                  child: Container(
                    decoration: BoxDecoration(
                      color: AppColors.surfaceDark,
                      borderRadius: BorderRadius.vertical(
                        top: Radius.circular(widget.borderRadius),
                      ),
                      border: Border(
                        top: BorderSide(color: AppColors.glassBorderMedium),
                        left: BorderSide(color: AppColors.glassBorderMedium),
                        right: BorderSide(color: AppColors.glassBorderMedium),
                      ),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.vertical(
                        top: Radius.circular(widget.borderRadius),
                      ),
                      child: Column(
                        children: [
                          // Handle zone with pan gesture
                          GestureDetector(
                            onVerticalDragUpdate: _onPanUpdate,
                            onVerticalDragEnd: _onPanEnd,
                            onVerticalDragCancel: _snapBack,
                            behavior: HitTestBehavior.opaque,
                            child: Column(
                              children: [
                                if (widget.showHandle) ...[
                                  const SizedBox(height: 12),
                                  Container(
                                    width: 44,
                                    height: 5,
                                    decoration: BoxDecoration(
                                      color: AppColors.grey,
                                      borderRadius: BorderRadius.circular(3),
                                    ),
                                  ),
                                ],
                                if (widget.title != null) ...[
                                  const SizedBox(height: 16),
                                  Text(
                                    widget.title!,
                                    style: const TextStyle(
                                      color: AppColors.textPrimary,
                                      fontSize: 20,
                                      fontWeight: FontWeight.w600,
                                      decoration: TextDecoration.none,
                                    ),
                                  ),
                                ],
                                const SizedBox(height: 14),
                              ],
                            ),
                          ),
                          Expanded(
                            child: Padding(
                              padding: EdgeInsets.fromLTRB(
                                20,
                                8,
                                20,
                                bottomInset > 0
                                    ? 20
                                    : MediaQuery.paddingOf(context).bottom + 20,
                              ),
                              child: widget.child,
                            ),
                          ),
                        ],
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

/// Helper to show a BaseModal over the current route.
Future<void> showBaseModal(
  BuildContext context, {
  required Widget Function(VoidCallback close) builder,
  String? title,
  double heightFactor = 0.88,
}) {
  final modalKey = GlobalKey<BaseModalState>();
  // A real modal route participates in Android Back handling and inherits
  // keyboard insets correctly. An OverlayEntry alone cannot consume Back.
  return showGeneralDialog<void>(
    context: context,
    barrierColor: Colors.transparent,
    transitionDuration: Duration.zero,
    pageBuilder: (modalContext, animation, secondaryAnimation) => BaseModal(
      key: modalKey,
      title: title,
      heightFactor: heightFactor,
      onClose: () => Navigator.of(modalContext).pop(),
      child: builder(() => modalKey.currentState?.dismiss()),
    ),
  );
}
