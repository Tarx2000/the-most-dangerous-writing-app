/// Inline markdown-ish text — port of `RichText.tsx` (SPEC §15).
/// Splits on `**bold**`, `__bold__`, `*italic*`, `_italic_` and renders
/// nested spans with bold/italic styles.
library;

import 'package:flutter/material.dart';

class AppRichText extends StatelessWidget {
  const AppRichText(this.text, {super.key, this.style, this.textAlign, this.maxLines, this.overflow});

  final String text;
  final TextStyle? style;
  final TextAlign? textAlign;
  final int? maxLines;
  final TextOverflow? overflow;

  @override
  Widget build(BuildContext context) {
    return Text.rich(
      TextSpan(children: _parse(text, style ?? DefaultTextStyle.of(context).style)),
      textAlign: textAlign,
      maxLines: maxLines,
      overflow: overflow,
    );
  }

  /// Parses bold (`**`/`__`) and italic (`*`/`_`) segments into nested spans.
  static List<InlineSpan> _parse(String input, TextStyle base) {
    final spans = <InlineSpan>[];
    final tokens = RegExp(r'(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)');
    var lastEnd = 0;

    for (final match in tokens.allMatches(input)) {
      if (match.start > lastEnd) {
        spans.add(TextSpan(text: input.substring(lastEnd, match.start)));
      }
      final token = match.group(0)!;
      final isBold = token.startsWith('**') || token.startsWith('__');
      final content = token.substring(2, token.length - 2);
      spans.add(TextSpan(
        text: content,
        style: isBold
            ? TextStyle(fontWeight: FontWeight.bold, color: base.color)
            : TextStyle(fontStyle: FontStyle.italic, color: base.color),
      ));
      lastEnd = match.end;
    }
    if (lastEnd < input.length) {
      spans.add(TextSpan(text: input.substring(lastEnd)));
    }
    return spans;
  }
}
