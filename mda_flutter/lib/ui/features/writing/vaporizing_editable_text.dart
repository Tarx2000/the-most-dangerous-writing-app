/// VaporizingEditableText — an `EditableText` whose text span renders the
/// vaporize preview inline: the last [wordsToVaporize] words' alpha decays
/// with the idle ratio (SPEC §8). Replaces the RN overlay approach with zero
/// alignment risk — the effect lives in the real text span.
///
/// IME composition is preserved: while a composing range is active the
/// default span logic takes over (underline etc.).
library;

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../domain/use_cases/session_engine.dart';

class VaporizingEditableText extends EditableText {
  VaporizingEditableText({
    super.key,
    required super.controller,
    required super.focusNode,
    required this.idleRatio,
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

  /// 0→1 idle ratio (drives the decay window).
  final double idleRatio;

  final int difficultyLimit;

  @override
  EditableTextState createState() => _VaporizingEditableTextState();
}

class _VaporizingEditableTextState extends EditableTextState {
  VaporizingEditableText get _vWidget => widget as VaporizingEditableText;

  @override
  TextSpan buildTextSpan() {
    final value = widget.controller.value;
    // Keep the default composing behavior during IME composition.
    if (value.isComposingRangeValid) {
      return super.buildTextSpan();
    }
    final base = widget.style;
    return _vaporizedSpan(
      value.text,
      _vWidget.idleRatio,
      _vWidget.difficultyLimit,
      base,
    );
  }

  /// Last 8 words decay per SPEC §8: word *i* from the end starts fading at
  /// `min(0.85, 0.3 + i*0.05)` and is fully faded at `min(0.95, 0.5 + i*0.05)`
  /// down to opacity 0.3.
  static TextSpan _vaporizedSpan(
    String text,
    double ratio,
    int difficultyLimit,
    TextStyle base,
  ) {
    if (text.isEmpty) return TextSpan(style: base, text: '');
    final tokens = text.split(RegExp(r'(\s+)'));
    final wordCount = tokens.where((t) => RegExp(r'\S').hasMatch(t)).length;
    var indexFromEnd = wordCount - 1;

    final spans = <TextSpan>[];
    for (final token in tokens) {
      final isWord = RegExp(r'\S').hasMatch(token);
      if (isWord && indexFromEnd < wordsToVaporize) {
        final i = indexFromEnd;
        indexFromEnd -= 1;
        final startR = (0.3 + i * 0.05).clamp(0.0, 0.85);
        final endR = (0.5 + i * 0.05).clamp(0.0, 0.95);
        double opacity = 1.0;
        if (ratio > startR) {
          if (ratio >= endR) {
            opacity = vaporizeMinOpacity;
          } else {
            final progress = (ratio - startR) / (endR - startR);
            opacity = 1.0 - progress * (1.0 - vaporizeMinOpacity);
          }
        }
        spans.add(TextSpan(
          text: token,
          style: base.copyWith(color: AppColors.textInput.withValues(alpha: opacity)),
        ));
      } else {
        if (isWord) indexFromEnd -= 1;
        spans.add(TextSpan(text: token, style: base));
      }
    }
    return TextSpan(style: base, children: spans);
  }
}
