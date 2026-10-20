/// VaporizingEditableText — an `EditableText` (plus reusable
/// `VaporizingTextEditingController`) whose text span renders the simultaneous
/// vaporize preview inline: all visible words' alpha decays smoothly together
/// with the idle ratio. Replaces the RN overlay approach with zero alignment
/// risk and O(1) span construction.
///
/// IME composition is preserved: while a composing range is active the
/// default span logic takes over (underline etc.).
library;

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../domain/use_cases/session_engine.dart';

/// Shared opacity curve for simultaneous word vaporization.
/// Starts fading at `ratio = 0.30` and reaches [vaporizeMinOpacity] at `0.95`.
double vaporizeOpacityForRatio(double ratio) {
  if (ratio <= 0.30) return 1.0;
  if (ratio >= 0.95) return vaporizeMinOpacity;
  final progress = ((ratio - 0.30) / 0.65).clamp(0.0, 1.0);
  // Smooth cubic ease for natural simultaneous fade-out across all words.
  final eased = progress * progress * (3.0 - 2.0 * progress);
  return 1.0 - eased * (1.0 - vaporizeMinOpacity);
}

/// Shared O(1) [TextSpan] builder that fades all displayed words simultaneously.
TextSpan buildVaporizingTextSpan({
  required String text,
  required double ratio,
  TextStyle? style,
}) {
  final base = style ?? const TextStyle();
  if (text.isEmpty || ratio <= 0.30) {
    return TextSpan(style: base, text: text);
  }
  final opacity = vaporizeOpacityForRatio(ratio);
  final baseColor = base.color ?? AppColors.textInput;
  return TextSpan(
    style: base.copyWith(color: baseColor.withValues(alpha: opacity)),
    text: text,
  );
}

/// Reusable [TextEditingController] that brings simultaneous word vaporization
/// to any standard [TextField] (e.g. Check-in Reflections).
class VaporizingTextEditingController extends TextEditingController {
  VaporizingTextEditingController({
    super.text,
    ValueNotifier<double>? idleRatioListenable,
  }) {
    this.idleRatioListenable = idleRatioListenable;
  }

  ValueNotifier<double>? _idleRatioListenable;
  double _lastRatio = 0.0;

  set idleRatioListenable(ValueNotifier<double>? listenable) {
    if (_idleRatioListenable == listenable) return;
    _idleRatioListenable?.removeListener(_onIdleTick);
    _idleRatioListenable = listenable;
    _lastRatio = _idleRatioListenable?.value ?? 0.0;
    _idleRatioListenable?.addListener(_onIdleTick);
  }

  void _onIdleTick() {
    final current = _idleRatioListenable?.value ?? 0.0;
    final wasActive = _lastRatio > 0.30;
    final isActive = current > 0.30;
    _lastRatio = current;
    if (wasActive || isActive) {
      notifyListeners();
    }
  }

  @override
  TextSpan buildTextSpan({
    required BuildContext context,
    TextStyle? style,
    required bool withComposing,
  }) {
    if (value.isComposingRangeValid && withComposing) {
      return super.buildTextSpan(
        context: context,
        style: style,
        withComposing: withComposing,
      );
    }
    final ratio = _idleRatioListenable?.value ?? 0.0;
    return buildVaporizingTextSpan(
      text: value.text,
      ratio: ratio,
      style: style,
    );
  }

  @override
  void dispose() {
    _idleRatioListenable?.removeListener(_onIdleTick);
    super.dispose();
  }
}

class VaporizingEditableText extends EditableText {
  VaporizingEditableText({
    super.key,
    required super.controller,
    required super.focusNode,
    this.idleRatio = 0.0,
    this.idleRatioListenable,
    required this.difficultyLimit,
    required super.style,
    required super.cursorColor,
    required super.backgroundCursorColor,
    super.maxLines,
    super.expands,
    super.keyboardType,
    super.autocorrect,
    super.enableSuggestions,
    super.selectionColor,
    super.onChanged,
  });

  /// 0→1 idle ratio (drives the decay window, used when listenable not provided).
  final double idleRatio;

  /// Optional ValueListenable to repaint leaf text span without parent rebuild storms.
  final ValueNotifier<double>? idleRatioListenable;

  final int difficultyLimit;

  @override
  EditableTextState createState() => _VaporizingEditableTextState();
}

class _VaporizingEditableTextState extends EditableTextState {
  VaporizingEditableText get _vWidget => widget as VaporizingEditableText;
  double _lastRatio = 0.0;

  @override
  void initState() {
    super.initState();
    _lastRatio = _vWidget.idleRatioListenable?.value ?? _vWidget.idleRatio;
    _vWidget.idleRatioListenable?.addListener(_onIdleTick);
  }

  @override
  void didUpdateWidget(covariant EditableText oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget is VaporizingEditableText &&
        oldWidget.idleRatioListenable != _vWidget.idleRatioListenable) {
      oldWidget.idleRatioListenable?.removeListener(_onIdleTick);
      _lastRatio = _vWidget.idleRatioListenable?.value ?? _vWidget.idleRatio;
      _vWidget.idleRatioListenable?.addListener(_onIdleTick);
    }
  }

  @override
  void dispose() {
    _vWidget.idleRatioListenable?.removeListener(_onIdleTick);
    super.dispose();
  }

  void _onIdleTick() {
    final current = _vWidget.idleRatioListenable?.value ?? _vWidget.idleRatio;
    final wasActive = _lastRatio > 0.30;
    final isActive = current > 0.30;
    _lastRatio = current;
    // Skip rebuilds while below the 0.30 vaporization threshold.
    if ((wasActive || isActive) && mounted) {
      setState(() {});
    }
  }

  @override
  TextSpan buildTextSpan() {
    final value = widget.controller.value;
    // Keep the default composing behavior during IME composition.
    if (value.isComposingRangeValid) {
      return super.buildTextSpan();
    }
    final ratio = _vWidget.idleRatioListenable?.value ?? _vWidget.idleRatio;
    return buildVaporizingTextSpan(
      text: value.text,
      ratio: ratio,
      style: widget.style,
    );
  }
}
