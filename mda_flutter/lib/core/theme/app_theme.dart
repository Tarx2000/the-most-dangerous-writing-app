/// Theme factory — dark AMOLED theme, status-bar-hidden-friendly.
/// Fonts: the 8 bundled Google fonts are registered here (SPEC §4).
library;

import 'package:flutter/material.dart';

import 'app_colors.dart';

/// Registers the bundled font families as static asset fonts.
/// Returns a map of family name → registered (only the 8 Google fonts).
Map<String, String> bundledFontFamilies() {
  return {
    'PlayfairDisplay': 'assets/fonts/PlayfairDisplay_400Regular.ttf',
    'SpaceMono': 'assets/fonts/SpaceMono_400Regular.ttf',
    'Caveat': 'assets/fonts/Caveat_400Regular.ttf',
    'Lora': 'assets/fonts/Lora_400Regular.ttf',
    'ZillaSlab': 'assets/fonts/ZillaSlab_400Regular.ttf',
    'CrimsonPro': 'assets/fonts/CrimsonPro_400Regular.ttf',
    'DMSans': 'assets/fonts/DMSans_400Regular.ttf',
    'EagleLake': 'assets/fonts/EagleLake_400Regular.ttf',
  };
}

/// Platform font names for the first three "system" font choices (SPEC §4).
String systemFontName(int index) {
  switch (index) {
    case 0:
      return 'System';
    case 1:
      return 'Serif';
    case 2:
      return 'Casual';
    default:
      return 'System';
  }
}

/// Dark ThemeData built on the AMOLED tokens.
ThemeData buildAppTheme({String? fontFamily}) {
  final base = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: AppColors.background,
    canvasColor: AppColors.background,
    colorScheme: const ColorScheme.dark(
      primary: AppColors.primaryAction,
      onPrimary: AppColors.primaryActionText,
      secondary: AppColors.primaryAction,
      onSecondary: AppColors.primaryActionText,
      surface: AppColors.surfaceDark,
      onSurface: AppColors.textPrimary,
      error: AppColors.primaryAction,
      onError: Colors.white,
    ),
    splashFactory: NoSplash.splashFactory,
    highlightColor: Colors.transparent,
    splashColor: Colors.transparent,
    fontFamily: fontFamily,
    textSelectionTheme: const TextSelectionThemeData(
      cursorColor: AppColors.primaryAction,
      selectionColor: AppColors.dangerTint,
      selectionHandleColor: AppColors.primaryAction,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: AppColors.surfaceRaised,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
        side: const BorderSide(color: AppColors.glassBorderMedium),
      ),
    ),
  );
  return base.copyWith(
    textTheme: base.textTheme.apply(
      bodyColor: AppColors.textPrimary,
      displayColor: AppColors.textPrimary,
    ),
  );
}
