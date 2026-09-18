import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

/// A cached list child may be mounted without being visible. Media should run
/// only while it intersects the viewport, its route is current, and the app
/// is foregrounded. Checks happen after layout, without rebuilding the list.
class ViewportActivity extends StatefulWidget {
  const ViewportActivity({
    super.key,
    required this.builder,
    this.revealProgress,
  });

  final Widget Function(BuildContext context, bool active) builder;
  final ValueListenable<double>? revealProgress;

  @override
  State<ViewportActivity> createState() => _ViewportActivityState();
}

class _ViewportActivityState extends State<ViewportActivity>
    with WidgetsBindingObserver {
  static const _minimumReveal = 0.95;
  ScrollPosition? _position;
  bool _active = false;
  bool _currentRoute = true;
  bool _scheduled = false;
  bool _foreground = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _foreground =
        WidgetsBinding.instance.lifecycleState == null ||
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;
    widget.revealProgress?.addListener(_scheduleCheck);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _currentRoute = ModalRoute.isCurrentOf(context) ?? true;
    final position = Scrollable.maybeOf(context)?.position;
    if (position != _position) {
      _position?.removeListener(_scheduleCheck);
      _position = position;
      _position?.addListener(_scheduleCheck);
    }
    _scheduleCheck();
  }

  @override
  void didUpdateWidget(covariant ViewportActivity oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.revealProgress != widget.revealProgress) {
      oldWidget.revealProgress?.removeListener(_scheduleCheck);
      widget.revealProgress?.addListener(_scheduleCheck);
    }
    _scheduleCheck();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    // The background may not render another frame; pause immediately.
    if (!_foreground && _active) setState(() => _active = false);
    _scheduleCheck();
  }

  @override
  void didChangeMetrics() => _scheduleCheck();

  void _scheduleCheck() {
    if (_scheduled || !mounted) return;
    _scheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scheduled = false;
      if (!mounted) return;
      final box = context.findRenderObject();
      var visible = false;
      if (box is RenderBox && box.hasSize && box.attached) {
        final viewport = RenderAbstractViewport.maybeOf(box);
        final position = _position;
        if (viewport != null &&
            position != null &&
            position.hasContentDimensions) {
          final top = viewport.getOffsetToReveal(box, 0).offset;
          visible =
              top < position.pixels + position.viewportDimension &&
              top + box.size.height > position.pixels;
        } else {
          visible = box.size.height > 0;
        }
      }
      final active =
          visible &&
          _currentRoute &&
          _foreground &&
          (widget.revealProgress?.value ?? 1) >= _minimumReveal;
      if (active != _active) setState(() => _active = active);
    });
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _position?.removeListener(_scheduleCheck);
    widget.revealProgress?.removeListener(_scheduleCheck);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.builder(context, _active);
}
