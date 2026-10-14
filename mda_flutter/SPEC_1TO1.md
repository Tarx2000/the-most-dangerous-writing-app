# UI contract: optional Liquid Glass

This checkout did not contain the full specification referenced by AGENTS.md.
This document records the scope of the Liquid Glass repair; it does not replace
all remaining RN parity requirements.

## Rendering and shared material

- Use `liquid_glass_easy` 5.0.0. `AppGlass` owns the shared surface, flat v5
  lighting/optics configuration and touch tuning.
- Classic mode retains its solid surfaces, separate difficulty pills, original
  white start button and original navigation. Switching rendering preferences
  preserves the selected session duration and difficulty.
- The page stays AMOLED black in both rendering modes. Apply the reference's
  smoked glass treatment only to controls: low-opacity white tints, no extra Gaussian blur,
  0.9 px specular band and no broad glow. Do not add a page tint or ambient
  background light. Start Writing and navigation are separate elements with no
  shared enclosing contour. Header/button flex damping is 28–30. Native package
  lift/morph physics remain package-owned.
- On Impeller, lenses read the live backdrop. On Skia without a captured page,
  surfaces use the package's frosted fallback; hold-and-slide navigation still
  works. Do not capture an empty page as a substitute for the real backdrop.

## Start page

- Keep finite page constraints, no intrinsic size pass around glass touch, and
  no inner vertical scrollable; HomeShell owns feed drags. Short viewports compact
  the hero. Header lens bounds follow the label's style and system text scaler.
- The glass start button is `LiquidGlassButton`, height 64, width capped at 320
  with at least 20 px page clearance per side. Its icon/label scales down if needed.
  Use a 32 px radius, 19 px label, 24 px icon and 130 px bottom clearance;
  the action sits 18 px higher at its bottom than the compact version. Compact
  the hero on smaller viewports. Its package soft-body flex remains active.
- Streak, Vision Lock and settings use subtle package flex with finite dimensions.
  Their outer tap/long-press handlers keep the original actions; in glass mode the
  additional whole-pill shrink/fade is disabled to let the glass respond itself.
- Difficulty uses local `LiquidGlassOptions` composed from the public package
  `LiquidGlassLens` and `LiquidGlassMotionPill` (no internal package imports).
  Width 270, height 44, EASY/MID/HARD. Tap selects directly; a 100 ms hold lifts
  the glass and horizontal movement previews continuously. Release commits the
  nearest option, cancel restores the committed option, and both ends clamp.
  Travel spring stiffness 320/damping 31.4; package lift/contract damping 28.
  Preview never changes the session's difficulty. Tick haptics occur only on
  committed changes, and the committed index is passed to the writing session.
  Preserve selection when toggling glass and respect reduced motion.

## Navigation

- On Impeller use the public `LiquidGlassTabBar` in a full-screen transparent
  overlay. The glass capsule is 84 px tall and 90% of the viewport width, with
  6 px padding. Its surface is black (no white/grey base tint); only the active
  highlight receives the same very low white tint as Start Writing. Never bound the full overlay to the capsule height; that clips
  its raised lens. Classic navigation retains its original 62 px geometry.
- Use the native package's tap and 100 ms hold recognition. Hold lifts the glass;
  moving horizontally previews along the bar; release snaps to and commits the
  nearest tab. Native positional spring damping is 31.4 and lifted growth is 4 px.
- Disable the extra receding-bar magnifier and chromatic dispersion. Moving
  selection uses refraction index 1.025 over 10 px; the rest selection has a
  translucent white tint (the native package intentionally paints no rest rim). Labels/icons stay legible in
  white with restrained 400/500 weights and 6 px icon/label separation.
- Without shader filters, use the package's single-lens bar plus a 100 ms hold
  recognizer: preview locally, clamp at both ends, commit on release, and reset
  preview on cancellation. Its highlight slides over 180 ms with easeOutCubic.
- Preserve the original four tabs, gold urgent dot, route/mode mapping and haptic
  on committed changes. Expose one accessible button action per native tab rather
  than the package's duplicated visual icon/label layers.
- `safeBottom` already includes system bottom padding: apply it once. Feed reveal
  still translates navigation by `80 * progress`, fades to `1 - progress`, and
  disables interaction when the feed is committed open. Full-screen glass chrome
  must let touches outside the navigation reach the page.

## Glass performance

- Keep the black material free of an extra Gaussian backdrop pass; preserve live
  refraction, thin highlights, touch flex and moving lenses.
- Batch only the three non-overlapping header lenses. Do not batch an overlapping
  selection pill with its track: it must see the glass beneath it.
- Difficulty position frames rebuild only the moving pill. Keep its track out of
  that builder; update labels/semantics only when the preview crosses an option.
- Feed reveal passes its animation into navigation. Cache the package bar as an
  AnimatedBuilder child, updating only translation and opacity on drag frames.
