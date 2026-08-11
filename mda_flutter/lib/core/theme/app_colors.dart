/// Theme color tokens — verbatim port of `src/styles/theme.ts` (SPEC_1TO1 §3).
/// AMOLED-only: no light theme, no blur anywhere (solid translucent tokens only).
library;

import 'package:flutter/material.dart';

/// All named colors as `Color` constants so widgets can reference tokens by name.
abstract final class AppColors {
  // Backgrounds & surfaces
  static const background = Color(0xFF000000);
  static const surfaceDark = Color(0xFF0A0A0A);
  static const surfaceRaised = Color(0xFF1A1A1A);
  static const surfaceMedium = Color(0xFF111111);
  static const surfaceLight = Color(0xFF222222);
  static const surfaceCard = Color(0xFF161616);
  static const surfaceOverlay = Color(0xD8121212); // rgba(18,18,18,0.85)
  static const surfaceOverlayLight = Color(0x33000000); // rgba(0,0,0,0.2)
  static const cardBackground = Color(0x0FFFFFFF); // rgba(255,255,255,0.06)
  static const modalBackground = Color(0x99000000); // rgba(0,0,0,0.6)
  static const overlayLockAndroid = Color(0xE00A0A0A); // rgba(10,10,10,0.88)

  // Text (white ladder)
  static const textPrimary = Colors.white;
  static const textBody = Color(0xD9FFFFFF); // rgba(255,255,255,0.85)
  static const textInput = Color(0xE6FFFFFF); // rgba(255,255,255,0.9)
  static const textTweet = Color(0xE0FFFFFF); // rgba(255,255,255,0.88)
  static const textBodyDim = Color(0xB3FFFFFF); // rgba(255,255,255,0.7)
  static const textSecondary = Color(0x99FFFFFF); // rgba(255,255,255,0.6)
  static const textDim = Color(0x66FFFFFF); // rgba(255,255,255,0.4)
  static const textMuted = Color(0x4DFFFFFF); // rgba(255,255,255,0.3)
  static const lightGrey = Color(0x80FFFFFF); // rgba(255,255,255,0.5)
  static const grey = Color(0x33FFFFFF); // rgba(255,255,255,0.2)
  static const darkGrey = Color(0x4D000000); // rgba(0,0,0,0.3)
  static const placeholder = Color(0xFF555555);

  // Danger / primary action (True Red)
  static const primaryAction = Color(0xFFFF2A2A);
  static const primaryActionText = Colors.white;
  static const dangerSubtle = Color(0x0FFF2A2A); // rgba(255,42,42,0.06)
  static const dangerLight = Color(0x14FF2A2A); // 0.08
  static const dangerTint = Color(0x1AFF2A2A); // 0.10
  static const dangerMedium = Color(0x1AFF2A2A); // 0.10
  static const dangerBorderLight = Color(0x1FFF2A2A); // 0.12
  static const dangerAccent = Color(0x26FF2A2A); // 0.15
  static const dangerBorder = Color(0x33FF2A2A); // 0.20
  static const dangerBorderMedium = Color(0x40FF2A2A); // 0.25
  static const dangerBorderStrong = Color(0x4DFF2A2A); // 0.30
  static const dangerFill = Color(0x26FF2A2A); // 0.15
  static const dangerFillStrong = Color(0x4DFF2A2A); // 0.30
  static const dangerOverlayLight = Color(0x73FF2A2A); // 0.45
  static const dangerGradientEnd = Color(0x73FF2A2A); // 0.45
  static const dangerPressed = Color(0xB3FF2A2A); // 0.70
  static const dangerOverlayStrong = Color(0xCCFF6464); // rgba(255,100,100,0.8)
  static const dangerIconOverlay = Color(0xCCFF6464); // 0.8
  static const dangerFillLight = Color(0x33FF6464); // rgba(255,100,100,0.2)

  // Glass scale (solid translucency — no blur)
  static const glassBackground = Color(0x0DFFFFFF); // 0.05
  static const glassSurface = Color(0x0FFFFFFF); // 0.06
  static const glassSurfaceMedium = Color(0x14FFFFFF); // 0.08
  static const glassSurfaceMinimal = Color(0x08FFFFFF); // 0.03
  static const glassSurfaceSubtle = Color(0x05FFFFFF); // 0.02
  static const glassSurfaceLow = Color(0x0AFFFFFF); // 0.04
  static const glassBorder = Color(0x1AFFFFFF); // 0.10
  static const glassBorderSubtle = Color(0x0FFFFFFF); // 0.06
  static const glassBorderFaint = Color(0x0DFFFFFF); // 0.05
  static const glassBorderMedium = Color(0x1FFFFFFF); // 0.12
  static const glassHighlight = Color(0x26FFFFFF); // 0.15

  // Overlays (black ladder)
  static const overlayDark = Color(0x66000000); // 0.4
  static const overlayMedium = Color(0xD9000000); // 0.85
  static const overlayStrong = Color(0xE6000000); // 0.9
  static const overlaySubtle = Color(0x1A000000); // 0.1
  static const overlayLight = Color(0x33000000); // 0.2
  static const overlaySoft = Color(0x80000000); // 0.5
  static const overlayVideoMuted = Color(0x99000000); // 0.6
  static const overlayVideoStrong = Color(0xB3000000); // 0.7
  static const overlayPopup = Color(0xEB000000); // 0.92
  static const deathOverlay = Color(0xF2282320); // rgba(40,35,32,0.95)
  static const shadowDark = Colors.black;

  // Nav bar + specular
  static const navIconActive = Color(0xFFFFFFFF);
  static const navIconInactive = Color(0x59FFFFFF); // 0.35
  static const navPillShadow = Color(0xE6000000); // rgba(0,0,0,0.9)
  static const navIndicatorBackground = Color(0x1FFFFFFF); // 0.12
  static const navIndicatorBorder = Color(0x14FFFFFF); // 0.08
  static const navSpecularHighlightStart = Color(0x47FFFFFF); // 0.28
  static const navSpecularHighlightMid = Color(0x0AFFFFFF); // 0.04
  static const specularBorderStart = Color(0x4DFFFFFF); // 0.30
  static const specularBorderEnd = Color(0x08FFFFFF); // 0.03
  static const specularBorderCardStart = Color(0x40FFFFFF); // 0.25

  // Semantic / accents
  static const gold = Color(0xFFFFD700);
  static const green = Color(0xFF4ADE80);
  static const orange = Color(0xFFFF6B35);
  static const suggestionError = Color(0xFFFF6B6B);
  static const suggestionBackground = Color(0x0FFFD700); // rgba(255,215,0,0.06)
  static const suggestionBorder = Color(0x1FFFC832); // rgba(255,200,50,0.12)
  static const devBlue = Color(0xFF3296FF);
  static const devPurple = Color(0xFF6464FF);
  static const devOrange = Color(0xFFFFA500);
  static const border = Color(0x1AFFFFFF); // rgba(255,255,255,0.1)
  static const safeBorderColor = Color(0xFF323232); // rgba(50,50,50,1)

  // Blood vignette (danger ambience)
  static const bloodDark = Color(0xFF4A0000);
  static const bloodMedium = Color(0xFF7A0000);
  static const bloodGlow = Color(0x994A0000); // rgba(74,0,0,0.6)

  // Writing-screen timer border red (separate from primaryAction!)
  static const dangerColorRgb = Color(0xFFFF4D4D);

  /// Alignment score tier colors (score → color), SPEC §3.
  static Color alignmentTierColor(int score) {
    if (score <= 2) return const Color(0xFFFF4D4D);
    if (score <= 4) return const Color(0xFFFF9933);
    if (score == 5) return const Color(0xFFFFCC00);
    if (score <= 7) return const Color(0xFFA2FF66);
    if (score <= 9) return const Color(0xFF66FFCC);
    return const Color(0xFF00CCFF);
  }

  /// Alignment score tier glow color.
  static Color alignmentTierGlow(int score) {
    if (score <= 2) return const Color(0x4DFF4D4D); // rgba(255,77,77,0.3)
    if (score <= 4) return const Color(0x4DFF9933);
    if (score == 5) return const Color(0x4DFFCC00);
    if (score <= 7) return const Color(0x4DA2FF66);
    if (score <= 9) return const Color(0x4D66FFCC);
    return const Color(0x4D00CCFF);
  }

  /// Tier emoji per score (SPEC §3).
  static String alignmentTierEmoji(int score) {
    if (score <= 2) return '😵';
    if (score <= 4) return '😕';
    if (score == 5) return '😐';
    if (score <= 7) return '😊';
    if (score <= 9) return '😄';
    return '😎';
  }

  /// Tier label per score (SPEC §3).
  static String alignmentTierLabel(int score) {
    if (score <= 2) return 'Struggling';
    if (score <= 4) return 'Drifting';
    if (score == 5) return 'Okay';
    if (score <= 7) return 'Good';
    if (score <= 9) return 'Great';
    return 'Aligned';
  }
}

/// Spacing scale (SPEC §4).
abstract final class AppSpacing {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 16.0;
  static const lg = 20.0;
  static const xl = 32.0;
  static const xxl = 48.0;
}

/// Radius scale (SPEC §4).
abstract final class AppRadius {
  static const sm = 12.0;
  static const md = 20.0;
  static const lg = 32.0;
  static const round = 100.0;
}

/// Animation presets (SPEC §5) — damping 26–35, no overshoot.
/// Mapped to Flutter `SpringDescription`s for `withSpring`.
abstract final class AppSprings {
  /// Modal entries, sheet slides, card expands.
  static const springDefault = SpringDescription(damping: 30, stiffness: 200, mass: 0.8);

  /// Press scales, tick snaps, feed commit.
  static const springSnappy = SpringDescription(damping: 35, stiffness: 250, mass: 0.8);

  /// Celebratory popups.
  static const springGentle = SpringDescription(damping: 26, stiffness: 120, mass: 0.8);

  /// Lighter feel.
  static const springLight = SpringDescription(damping: 28, stiffness: 150, mass: 0.5);

  /// Feed reveal.
  static const springFeed = SpringDescription(damping: 32, stiffness: 160, mass: 0.9);
}
