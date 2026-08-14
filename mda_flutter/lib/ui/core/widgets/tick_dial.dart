/// TickDial — Tide-style duration ruler (1:1 port of `TickDial.tsx`, SPEC §15).
/// SNAP 80 px per data point · 4 minor ticks between (GAP 16) · center
/// indicator · live value = `data[selectedIndex]` with a scale that grows
/// across the range (0.95 → 1.10) and a pulse (1.03/90 ms → spring) on
/// change · smooth animated snap on release · haptic per crossing.
library;

import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';

class TickDial extends StatefulWidget {
  const TickDial({
    super.key,
    required this.data,
    required this.selectedIndex,
    required this.onSelect,
    this.unit = 'min',
  });

  /// The actual selectable values (e.g. `[3, 5, 10, 15, 30, 60]`).
  final List<int> data;

  final int selectedIndex;
  final ValueChanged<int> onSelect;
  final String unit;

  @override
  State<TickDial> createState() => _TickDialState();
}

class _TickDialState extends State<TickDial> {
  static const double _snap = 80;
  static const int _minors = 4;
  static const double _gap = _snap / (_minors + 1); // 16

  late final ScrollController _controller = ScrollController();
  bool _dragging = false;
  bool _snapping = false;
  bool _justSnapped = false;
  double _currentOffset = 0;
  double _scalePulse = 1;
  Timer? _pulseTimer;

  double get _pad => MediaQuery.sizeOf(context).width / 2 - _gap / 2;

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (!_dragging && !_justSnapped) {
        _controller.jumpTo(widget.selectedIndex * _snap);
      }
      _justSnapped = false;
    });
  }

  @override
  void didUpdateWidget(covariant TickDial oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.selectedIndex != widget.selectedIndex) {
      if (!_dragging && !_justSnapped && !_snapping) {
        if (_controller.hasClients) {
          _controller.jumpTo(widget.selectedIndex * _snap);
        }
      }
      _justSnapped = false;
      _pulse();
    }
  }

  @override
  void dispose() {
    _pulseTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _pulse() {
    vibrate(HapticPatterns.tick);
    setState(() => _scalePulse = 1.03);
    _pulseTimer?.cancel();
    _pulseTimer = Timer(const Duration(milliseconds: 90), () {
      if (mounted) setState(() => _scalePulse = 1.0);
    });
  }

  int _indexFromOffset(double x) =>
      (x / _snap).round().clamp(0, widget.data.length - 1);

  void _onScroll() {
    _currentOffset = _controller.offset;
    final index = _indexFromOffset(_currentOffset);
    if (index != widget.selectedIndex) {
      widget.onSelect(index);
    }
  }

  void _snapToNearest() {
    if (_snapping || !_controller.hasClients) return;
    final index = _indexFromOffset(_currentOffset);
    final targetOffset = index * _snap;
    if ((_controller.offset - targetOffset).abs() < 0.5) {
      if (index != widget.selectedIndex) {
        widget.onSelect(index);
      }
      return;
    }
    _snapping = true;
    _controller.animateTo(
      targetOffset,
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeOutCubic,
    ).whenComplete(() {
      _snapping = false;
      if (mounted) {
        _justSnapped = true;
        if (index != widget.selectedIndex) {
          widget.onSelect(index);
        }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final screenW = MediaQuery.sizeOf(context).width;
    final scaleBase =
        0.95 + (widget.data.length > 1 ? widget.selectedIndex / (widget.data.length - 1) * 0.15 : 0);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Big value (TextSpan children only — `text` + `children` would
        // double-render and look like an underline).
        AnimatedScale(
          scale: scaleBase * _scalePulse,
          duration: const Duration(milliseconds: 90),
          child: Text.rich(
            TextSpan(
              style: const TextStyle(
                color: AppColors.textPrimary,
                fontSize: 44,
                fontWeight: FontWeight.w200,
                height: 1.0,
                decoration: TextDecoration.none,
              ),
              children: [
                TextSpan(text: '${widget.data[widget.selectedIndex]}'),
                TextSpan(
                  text: ' ${widget.unit}',
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 20,
                    fontWeight: FontWeight.w300,
                    decoration: TextDecoration.none,
                  ),
                ),
              ],
            ),
          ),
        ),
        // Ruler
        SizedBox(
          height: 62,
          child: Stack(
            alignment: Alignment.center,
            children: [
              // Center indicator (exact screen center)
              Positioned(
                left: screenW / 2 - 1.5,
                top: 10,
                child: Container(
                  width: 3,
                  height: 42,
                  decoration: BoxDecoration(
                    color: AppColors.primaryAction,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              // Tick strip
              NotificationListener<ScrollNotification>(
                onNotification: (notification) {
                  if (notification is ScrollStartNotification) {
                    _dragging = true;
                    _snapping = false;
                  } else if (notification is ScrollEndNotification) {
                    _dragging = false;
                    _snapToNearest();
                  }
                  return false;
                },
                child: Listener(
                  onPointerDown: (_) {
                    _dragging = true;
                    _snapping = false;
                  },
                  onPointerUp: (_) {
                    _dragging = false;
                    _snapToNearest();
                  },
                  onPointerCancel: (_) {
                    _dragging = false;
                    _snapToNearest();
                  },
                  child: SingleChildScrollView(
                    controller: _controller,
                    scrollDirection: Axis.horizontal,
                    physics: const BouncingScrollPhysics(),
                    child: SizedBox(
                      width: _pad * 2 + (widget.data.length - 1) * _snap,
                      height: 62,
                      child: CustomPaint(
                        painter: _TickPainter(
                          count: widget.data.length,
                          pad: _pad,
                          snap: _snap,
                          gap: _gap,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 4),
      ],
    );
  }
}

/// Paints major ticks (28 px) and minor ticks (12 px) per the RN geometry.
class _TickPainter extends CustomPainter {
  const _TickPainter({
    required this.count,
    required this.pad,
    required this.snap,
    required this.gap,
  });

  final int count;
  final double pad;
  final double snap;
  final double gap;

  @override
  void paint(Canvas canvas, Size size) {
    final centerY = size.height / 2;
    for (var i = 0; i < count; i++) {
      final majorX = pad + i * snap;
      _drawTick(canvas, majorX, centerY, major: true);
      if (i < count - 1) {
        for (var j = 1; j <= 4; j++) {
          _drawTick(canvas, majorX + j * gap, centerY, major: false);
        }
      }
    }
  }

  void _drawTick(Canvas canvas, double x, double centerY, {required bool major}) {
    final w = major ? 2.5 : 1.5;
    final h = major ? 28.0 : 12.0;
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset(x, centerY), width: w, height: h),
        const Radius.circular(1.5),
      ),
      Paint()..color = major ? AppColors.lightGrey : AppColors.glassBorderMedium,
    );
  }

  @override
  bool shouldRepaint(covariant _TickPainter oldDelegate) =>
      oldDelegate.count != count || oldDelegate.pad != pad;
}
