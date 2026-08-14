/// BaseModal — the bottom-sheet shell used by ALL app sheets (SPEC §15).
/// Port of `BaseModal.tsx`:
///  - scrim `overlayDark`, tap-to-dismiss
///  - sheet `surfaceDark`, top radius 24, full `glassBorderMedium` border
///    (sides hidden off-screen), drag handle, swipe-dismiss
///    (80 px drag / 600 px/s velocity, 20 px activation gate)
///  - entry: spring + scrim 300 ms; exit: 300 ms timing
library;

import 'dart:async';

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

class BaseModalState extends State<BaseModal>
    with TickerProviderStateMixin {
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

  bool _closing = false;
  double _dragDy = 0;

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
    if (details.delta.dy > 0 || _dragDy > 0) {
      setState(() => _dragDy = (_dragDy + details.delta.dy).clamp(0.0, 500.0));
    }
  }

  void _onPanEnd(DragEndDetails details) {
    final velocity = details.velocity.pixelsPerSecond.dy;
    if (_dragDy > 80 || velocity > 600) {
      dismiss();
    } else {
      setState(() => _dragDy = 0);
    }
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.sizeOf(context).height;
    final sheetHeight = screenHeight * widget.heightFactor;
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return Stack(
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
          bottom: 0,
          height: sheetHeight,
          child: AnimatedBuilder(
            animation: _slide,
            builder: (context, child) {
              return Transform.translate(
                offset: Offset(0, _dragDy + (1 - _slide.value) * sheetHeight),
                child: child,
              );
            },
            child: Container(
              decoration: const BoxDecoration(
                color: AppColors.surfaceDark,
                borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                border: Border(
                  top: BorderSide(color: AppColors.glassBorderMedium),
                  left: BorderSide(color: AppColors.glassBorderMedium),
                  right: BorderSide(color: AppColors.glassBorderMedium),
                ),
              ),
              child: ClipRRect(
                borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
                child: Column(
                  children: [
                    // Handle zone with pan gesture
                    GestureDetector(
                      onVerticalDragUpdate: _onPanUpdate,
                      onVerticalDragEnd: _onPanEnd,
                      behavior: HitTestBehavior.opaque,
                      child: Column(
                        children: [
                          if (widget.showHandle) ...[
                            const SizedBox(height: 10),
                            Container(
                              width: 40,
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
                              ),
                            ),
                          ],
                          const SizedBox(height: 12),
                        ],
                      ),
                    ),
                    Expanded(
                      child: Padding(
                        padding: EdgeInsets.only(bottom: bottomInset + 20),
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
  final completer = Completer<void>();
  final overlay = Overlay.of(context);
  final modalKey = GlobalKey<BaseModalState>();
  late final OverlayEntry entry;

  entry = OverlayEntry(
    builder: (context) => BaseModal(
      key: modalKey,
      title: title,
      heightFactor: heightFactor,
      onClose: () {
        entry.remove();
        if (!completer.isCompleted) completer.complete();
      },
      child: builder(() {
        if (modalKey.currentState != null) {
          modalKey.currentState!.dismiss();
        } else {
          entry.remove();
          if (!completer.isCompleted) completer.complete();
        }
      }),
    ),
  );
  overlay.insert(entry);
  return completer.future;
}
