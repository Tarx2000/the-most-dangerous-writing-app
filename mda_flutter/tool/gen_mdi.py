#!/usr/bin/env python3
"""Generates lib/core/theme/mdi.dart from the MaterialCommunityIcons glyphmap.

Usage: python3 tool/gen_mdi.py <glyphmap.json> <output.dart>
"""
import json
import sys


def main() -> None:
    glyphmap_path, out_path = sys.argv[1], sys.argv[2]
    with open(glyphmap_path) as f:
        glyphs = json.load(f)

    lines = [
        "/// Generated icon map for the bundled MaterialCommunityIcons font.",
        "/// Source: MaterialCommunityIcons.json glyphmap (same font the RN app ships).",
        "/// Regenerate with: python3 tool/gen_mdi.py <glyphmap.json> lib/core/theme/mdi.dart",
        "library;",
        "",
        "import 'package:flutter/widgets.dart';",
        "",
        "/// MaterialCommunityIcons icon accessor — mirrors MDI glyph names 1:1.",
        "abstract final class Mdi {",
        "  Mdi._();",
        "",
        "  static const String fontFamily = 'MaterialCommunityIcons';",
        "",
        "  static final Map<String, int> _glyphs = <String, int>{",
    ]
    for name in sorted(glyphs):
        lines.append(f"    '{name}': {glyphs[name]},")
    lines += [
        "  };",
        "",
        "  /// Cache so repeated lookups don't allocate IconData instances.",
        "  static final Map<String, IconData> _cache = <String, IconData>{};",
        "",
        "  static IconData get(String name) {",
        "    final cached = _cache[name];",
        "    if (cached != null) return cached;",
        "    final glyph = _glyphs[name] ?? _glyphs['help'] ?? 0xF004;",
        "    final icon = IconData(glyph, fontFamily: fontFamily);",
        "    _cache[name] = icon;",
        "    return icon;",
        "  }",
        "}",
    ]

    with open(out_path, "w") as f:
        f.write("\n".join(lines) + "\n")

    print(f"wrote {len(glyphs)} glyphs to {out_path}")


if __name__ == "__main__":
    main()
