# UI contract: optional Liquid Glass

## Confirmed redesign (15 October 2026, Q1–Q46)

`design/REDESIGN_BRIEF.md` records the authorized scope and overrides conflicting
mockup labels/numbers. Preserve EASY/MID/HARD 12/8/5 s, durations
3/5/10/15/30/60 min, Tweet 45 words and the four-mode navigation. Keep AMOLED,
hidden status bar, portrait, personal editor fonts, security and existing media.

- Schema v7 adds independent `wellbeing_checkins`, persisted
  `checkin_selections`, `pillars.reactivated_at` and `pillar_logs.day_key`.
  Both schema trackers advance together. New tables belong to notes/masteries
  backup scopes respectively. Never migrate fallback note scores to observations.
- A rating day is 03:00–02:59 local, including DST. Same-day saves update one
  current record; past ratings cannot be individually edited/deleted. Bulk data
  management remains available. No backdating through the rating UI.
  Day-dependent UI schedules the exact next boundary and refreshes on resume;
  repository checks use the actual save time. Existing saved ratings and
  personal Masteries require the notes authentication tier before display.
- Wellbeing: optional global life satisfaction and eight fixed Wheel of Life
  domains, integer 0–10, unanswered remains null. A wheel can be partial and
  saved without writing or Masteries. Global is independent of domain mean.
- Weekly gold dot: seven rating days after a deliberately completed wheel
  with at least one domain. Quick global saves do not delay it.
- Library Check-ins contains score history plus reflections. Real points get
  markers; internal gaps are linear gray drawing-only connections. No generated
  values enter storage or statistics. Score-only entries do not create feed cards.
- Masteries: existing rating/time/boolean/text types; optional prompt switch on
  by default. Daily due next rating day, weekly after seven rating days; new
  goals immediately due, paused excluded. Weight `(1 + overdueDays)^2`, without
  replacement; max two daily/adaptive or three weekly/adaptive. Persist each
  day's selection. Only saved responses reset due; repeated same-day ratings
  update one log. Adaptive switches to weekly after N distinct rated days
  (default 14); reactivation is due today without paused overdue accumulation.
- Optional overall, Mastery and weekly advice reflections retain the one-minute
  EASY SessionEngine flow. Wellbeing is never blocked by the old log cooldown.
- Icon A (folded metal pen) is selected. New installs default to glass enabled;
  existing true/false preferences survive. Reduced motion disables touch flex.
- Relative wellbeing comparisons are deferred in `design/FUTURE_IDEAS.md`.
  Concrete Mastery targets are also out of scope.

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
  Position travel is 180 ms easeOutCubic, matching navigation timing.
  Package lift uses stiffness 1200/damping 60; contract 1600/72. These are
  native package morph springs (the documented damping exception). Taps must
  finish position travel in 180 ms and retire the moving glass within 600 ms.
  Preview never changes the session's difficulty. Tick haptics occur only on
  committed changes, and the committed index is passed to the writing session.
  Preserve selection when toggling glass and respect reduced motion.
  Keep the selected pill's thin rim visible permanently. Use a shader-free
  LiquidGlassLite rest face (opaque #101010, same specular rim, zero blur) in
  MotionPill.cover. Its built-in crossfade covers the moving shader before that
  shader retires, avoiding a sudden border disappearance. No idle ticker or
  extra backdrop read for the resting face.

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

## Follow-up polish (15 October 2026)

- Setup duration is a minute value such as `15 min`, without zero-padding or
  `:00`. The writing countdown still displays minutes and seconds.
- `GlassPill` supplies actual package glass for New Tweet, the Library lock
  action and all Feed filters, with finite measured labels and 44 px minimum
  targets. Selected filters change both the red tint/specular material and
  foreground; expose selection to accessibility. Scope and types occupy
  separate wrapping rows, so categories remain discoverable on small displays.
  Classic mode keeps solid translucent controls.
- Library Lock/Unlock is one complete text label, never clipped individual
  letters. Preserve the existing authentication and lock-all callbacks.
- YOU DIED uses AMOLED black, restrained typography and a package glass Return
  to Menu action. Preserve save-remainder and continue semantics. Recovery
  actions scroll above the keyboard at large text sizes; exclude the covered
  editor from accessibility. Retire warning effects while death is visible.
- Writing danger is a continuous red veil over the entire Flutter window,
  including safe insets and the area behind the system keyboard. The centre is
  tinted from the first visible warning, never a cut-out or black stripe.
  A low-contrast cosine edge emphasis broadens into a uniform field by ratio
  0.75; there are no moving front boundaries, radial masks or closed rings.
  Keep black fog after ratio 0.5 and red onset 0.15. One clipped full-area
  Gaussian eases from ratio 0.20 to at most 6 logical pixels. Interpolate the
  engine's 10 Hz ratios over 100 ms in the warning leaf only; do not alter death
  timing, typing, haptics or session state. A subtle smooth heartbeat after
  ratio 0.75 repaints only tint. Reduced motion skips interpolation/pulsing.
  Typing clears both visual tickers and blur immediately. No blur at rest/death.
  This content treatment is independent of the glass preference. Reflection
  content keeps safe/keyboard padding inside the full-window overlay stack;
  the native system keyboard itself stays owned by the OS.
