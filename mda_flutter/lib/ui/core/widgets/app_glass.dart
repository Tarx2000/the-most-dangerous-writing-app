import 'package:flutter/material.dart';
import 'package:liquid_glass_easy/liquid_glass_easy.dart';

/// The reference material: smoked charcoal, a hairline reflection and no
/// broad luminous bevel. Version 5 expresses light thickness in logical pixels.
abstract final class AppGlass {
  static const navHeight = 84.0;
  static const navInset = 6.0;

  static const rim = LiquidGlassLight.specular(
    thickness: 0.9,
    sharpness: 0.8,
    angle: 135,
    spread: 0.75,
    intensity: 0.65,
    oppositeIntensity: 0.45,
    color: Color(0xB3FFFFFF),
  );
  static const noGlow = LiquidGlassLight.glow(thickness: 0, intensity: 0);

  static LiquidGlassStyle surface(double radius, {Color? tint}) =>
      LiquidGlassStyle(
        shape: LiquidGlassShape.continuousRoundedRectangle(
          cornerRadius: radius,
        ),
        specular: rim,
        glow: noGlow,
        color: tint ?? const Color(0x10FFFFFF),
        // Flat AMOLED has no texture to soften. Keep refraction and the rim
        // without paying for a second Gaussian backdrop pass.
        blur: 0,
        refractionIndex: 1.02,
        refractionWidth: 8,
        dispersion: 0,
      );

  static LiquidGlassStyle get navigation =>
      surface(navHeight / 2, tint: Colors.transparent);

  static LiquidGlassStyle control(double radius, {bool active = false}) =>
      surface(radius, tint: active ? const Color(0x38C3242C) : null).copyWith(
        specular: active
            ? const LiquidGlassLight.specular(
                thickness: 0.9,
                sharpness: 0.8,
                angle: 135,
                spread: 0.75,
                intensity: 0.75,
                oppositeIntensity: 0.45,
                color: Color(0xD9FFB1AC),
              )
            : rim,
      );
  // The package paints its resting highlight as a plain translucent fill.
  // Lights/refraction belong to the lifted moving selection.
  static const selection = LiquidGlassStyle(
    color: Color(0x10FFFFFF),
    glow: noGlow,
    refractionIndex: 1,
    refractionWidth: 0,
  );
  static const movingSelection = LiquidGlassStyle(
    specular: rim,
    glow: noGlow,
    color: Color(0x08FFFFFF),
    refractionIndex: 1.025,
    refractionWidth: 10,
    dispersion: 0,
  );

  static final buttonTouch = LiquidGlassTouch(
    flex: const LiquidGlassFlex.pronounced().copyWith(
      stretch: 12,
      holdScale: 0.02,
      tapScale: 0.012,
      maxPull: 28,
      advanced: const LiquidGlassFlexAdvanced(
        stiffness: 300,
        damping: 28,
        releaseDamping: 28,
        refractionBoost: 0.22,
      ),
    ),
  );

  static final headerTouch = LiquidGlassTouch(
    flex: const LiquidGlassFlex.subtle().copyWith(
      advanced: const LiquidGlassFlexAdvanced(
        stiffness: 340,
        damping: 30,
        releaseDamping: 28,
        refractionBoost: 0.1,
      ),
    ),
  );
}
