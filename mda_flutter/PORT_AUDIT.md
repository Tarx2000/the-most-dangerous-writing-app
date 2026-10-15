# Port verification

## Confirmed redesign — 15 October 2026

- Implemented the approved Q1–Q46 brief in `design/REDESIGN_BRIEF.md`.
  Kept four-mode navigation, writing thresholds/durations, existing font
  preferences, security, media and Classic rendering. Icon A is packaged for
  all existing Android densities and iOS sizes (1024 px store asset, no alpha)
  and reused as the quiet writing emblem.
- Start uses a bounded responsive layout, matching duration text/ruler labels,
  restrained shortcuts and finite header lenses. Regression coverage includes
  320×640, 1.6× text, every mode and both rendering preferences. Home no longer
  shrinks beneath a writing route when its keyboard appears.
- Writing now shows time and words without a mode heading. Preserved engine
  behavior and black fog. The initial red ellipse was replaced by the follow-up
  side-front treatment documented below.
  Its paint listens directly to idle/heartbeat, without rebuilding the editor.
- Schema v7 adds independent `wellbeing_checkins` and daily
  `checkin_selections`, plus mastery day keys/reactivation anchors. Records use
  local 03:00–02:59 calendar days, with past-day mutation rejected at repository
  level. Unanswered values remain missing. No legacy fallback fives are migrated.
- Life ratings save independently of notes. Optional partial eight-domain
  wheels, weekly completion reminder, optional Mastery prompts and reflections
  are wired into the flow. Existing saved ratings and personal goals respect
  notes authentication, including re-locking while their UI is open.
- Library includes selectable global/domain histories, real-point markers,
  gray linear gap connections, date scrubbing and previous wheel selection.
  Interpolation is drawing-only. Reserved scrub-label height prevents the graph
  moving beneath a finger; series computation is cached across scrub updates.
  Score-only check-ins do not generate feed cards or fabricated feed scores.
- Masteries use due-only weighted draws without replacement, persisted daily
  selections, same-day updates, half-hour time input, manual ratings and actual
  adaptive weekly scheduling. Reopening/skipping does not reset due dates;
  reactivation clears the paused overdue bonus and retains progress/history.
- Glass controls compose public `liquid_glass_easy` 5.0.0 building blocks.
  Slider position updates stay local; moving thumbs retire to opaque rest faces.
  App haptics, tap/drag/cancel, adjustable semantics, reduced motion and Classic
  fallback remain functional. Header/start deformation is restrained, without
  extra Gaussian blur over AMOLED. New-install glass is on; saved choices win.
- New tables are registered in backup scopes with shape/range validation.
  FFI tests cover real ZIP export/import of ratings, selections, reactivation
  anchors and day keys; malformed rating payloads preserve existing data.
- Final full suite: **252 passed, 1 skipped**. Additional final UI checks:
  **28 passed**, plus **36 passed** after exact-boundary timer wiring.
  Static analysis clean. Split-ABI Android release builds succeed.
- Maestro inspected real iPhone 18 Pro / iOS 27 rendering, navigation, check-in
  expansion, slider gestures and writing danger. Filled history/manual-save
  checks used `tool/redesign_preview.dart`, an isolated in-memory fixture;
  production app data was not seeded. Restored `lib/main.dart` afterward.
- Four native glass-slider sweeps recorded 686 frames on that debug simulator:
  build median/p95 **1.213/4.015 ms**, raster median/p95 **2.403/3.033 ms**.
  Raw data and screenshots are in `output/review/`. These are simulator timings;
  physical-device release profiling remains outstanding.
- Relative wellbeing comparisons are a backlog note only in
  `design/FUTURE_IDEAS.md`; concrete Mastery targets remain deferred. No further
  interview or implementation of either deferred feature was performed.
- The original full behavioral specification is still absent from this checkout.
  This records the redesign's verification, not complete RN port certification.

## Optional Liquid Glass repair

- Reproduced the black start page in a widget regression: touch-flex lenses add
  LayoutBuilder beneath IntrinsicHeight, causing layout and semantics failures.
- Removed the intrinsic pass and the inactive inner scrollable; bounded the
  start page, header lenses and start button. Preserved HomeShell's drag owner.
- Corrected start-button padding so the fixed-height glass capsule can display
  its label/icon. Enabled optical rims on the button, difficulty and nav lenses.
- Verified the repaired page visually on the running iPhone 18 Pro simulator
  (402 × 874 logical pixels), with Liquid Glass enabled.
- Targeted regression coverage: both rendering preferences, all session modes,
  phone safe areas, difficulty/session routing, preference switching, tab
  selection, library navigation and feed open/close/cancellation.
- All 26 targeted tests pass; `flutter analyze` reports no issues.
- Final `flutter test --concurrency=1`: 214 passed, 1 skipped, no failures.
- Outstanding: the original full SPEC_1TO1.md and prior PORT_AUDIT.md were absent
  from this checkout. These repair notes do not certify complete RN parity.

## Native glass interaction follow-up

- Replaced the plain sliding nav tier with the public
  `LiquidGlassTabBar.withImpeller` full-screen overlay. The native package owns
  100 ms hold, raised glass, finger tracking, snap and release selection.
- Updated only `liquid_glass_easy` to compatible patch 4.3.4. Its capsule batching
  fix is needed for the bodyless native overlay; 4.3.1 could lose the capsule.
  Kept the existing 4.x API rather than migrating unrelated surfaces to 5.x.
- Added a functional Skia hold/preview/release fallback without attempting to
  refract an empty page. Classic navigation remains unchanged.
- Replaced the simple internal segmented-control showcase with the actual
  morphing `LiquidGlassSegmented` component. Centralized material/flex tuning in
  AppGlass, removed duplicate header borders and redundant outer press layers,
  and reduced the moving pill's dispersion/receding magnifier on black.
- Exposed one accessible action per native tab. Preserved urgent dots, safe-area
  position, committed mode/session values and feed slide/fade/input gating.
- Live iPhone 18 Pro tests used real pointer events on Impeller, not callbacks:
  Journal → Check-in and Check-in → Journal both committed on release. At the
  midpoint, the native package reported target index 1.5 and actual position
  1.4999999, with the source mode still active. Simulator GPU screenshots confirm
  the lifted/refracting lens follows the finger between tabs.
- Also exercised press/flex on the start button and streak header, cancelling
  release to avoid opening a writing session/calendar, and opened the feed via
  a real swipe through the full-screen glass overlay.
- The Skia widget regressions cover held selection in both directions, preview
  versus commit and end clamps, alongside classic/glass modes and navigation.
- Glass headers bypass the outer scale/opacity render layers. Button controllers
  initialize in initState so teardown cannot create a ticker on a deactivated
  element. All 30 affected UI/interaction tests pass; static analysis is clean.
- Final full suite after the wrapper lifecycle fix: 216 passed, 1 skipped,
  zero failures. Native UI changes are hot-reloaded into the running simulator.

## Reference material and AMOLED correction

- Migrated liquid_glass_easy to 5.0.0 to control specular band thickness directly.
  Migrated every project style to the flat API, including the confirmation dialog;
  the native tab bar now uses the normal public constructor.
- Replaced broad optical borders with a 0.9 px specular band, no glow, restrained
  refraction and smoke tints confined to controls. The rest highlight is the
  package's translucent fill; its native renderer intentionally omits a rest rim.
- Matched the reference's taller capsule (84 px), quieter labels, compact 44 px
  action above the navigation and faint shared dock contour. Kept classic sizes.
- The user's correction is explicit: the entire page must remain AMOLED black.
  Removed the temporary charcoal backdrop and green ambient light completely.
  HomeShell has no background override; HomeScreen retains AppColors.background.
- Rebuilt the iPhone 18 Pro simulator with the v5 shaders and inspected actual
  GPU captures. After the final palette update, hot restarted to reinitialize
  static styles and cached paint layers. The page is visibly black again.
- Native pointer test on AMOLED: source remained Journal while holding between
  tabs; target 1.488564894 and actual 1.488564881 at full lift. Release committed
  Check-in. The Skia fallback and both rendering preferences retain regression
  coverage. Final static analysis is clean. Full suite after the AMOLED correction:
  216 passed, 1 skipped, zero failures.

## Black controls, held difficulty and larger start action

- Nav base is black with no grey/white base fill. Removed the shared outer dock
  and its contour completely. Start Writing's thin-rim material remains the
  shared style for the other controls; page/background stay AMOLED black.
- Replaced the internal package segmented showcase with local LiquidGlassOptions,
  composed from public LiquidGlassLens and LiquidGlassMotionPill. Added 100 ms
  hold, continuous finger preview, release snap/commit, cancellation and clamps.
- Native simulator pointer tests verified MID→HARD, HARD→EASY and cancellation:
  at fractional position 1.4981 the committed difficulty stayed MID; release
  committed HARD, while cancellation retained MID. Four behavioral widget tests
  cover both directions, cancellation, bounds, taps and disposal during travel.
- Enlarged Start Writing from 190×44 to up to 320×64, raised its bottom by 18 px
  (centre by 28 px), enlarged label/icon to 19/24 px, and kept its flex/material.
  Updated shorter-view hero constraints to preserve a bounded layout.
- Difficulty animation now rebuilds only the moving lens; its track is stable,
  with labels/semantics updating only at option boundaries. Feed navigation keeps
  the package bar as AnimatedBuilder.child; only transform/opacity change per
  frame. The three non-overlapping header lenses share a backdrop read. Removed
  the extra Gaussian blur pass over flat black, preserving real refraction.
- Visual simulator verification confirms the bigger raised action, black nav,
  separate controls and retained glass. All 34 affected UI tests pass; static
  analysis is clean. Final full suite: 220 passed, 1 skipped, zero failures.
- Comparative warm runs on the same iPhone 18 Pro debug simulator used real
  pointer input, FrameTiming and temporary framework rebuild counters (removed
  after each measurement, no production profiling code). During feed reveal /
  cancel the package bar rebuilt 72→3 times. Difficulty round-trip text rebuilds
  dropped 186→33. Raster median/p95 were 5.316/6.908→2.021/2.640 ms for difficulty
  and 4.769/6.939→1.596/2.372 ms for feed. The final feed gesture starts in clear
  space above the enlarged button so it excludes button touch flex. These are
  debug-simulator comparisons, not physical-device release FPS measurements.
- Final native press/drag/cancel on the larger Start Writing button retained
  its glass deformation and returned to Journal without starting a session.

## Persistent difficulty selection rim

- Root cause: MotionPill disables its moving shader at the end of contraction,
  but our cover was only a translucent fill, without the moving lens's rim.
  The still-visible shader contour disappeared abruptly at that final handoff.
- Replaced that cover with public LiquidGlassLite: same fine specular rim,
  zero blur, and an opaque #101010 face matching the previous tint over black.
  The package crossfade covers the outgoing shader before it switches off.
  The selected capsule stays outlined without an idle backdrop read or ticker.
- Pixel regression checks the selected rim before interaction, after release,
  and after five seconds of idle; contrast remains present and identical after
  idle, with no scheduled animation frame. All five options regressions pass.
- Native Impeller hold/drag MID→HARD still previews without committing until
  release. Inspected the settled selection's GPU screenshot with its rim intact.
- Native idle inspection confirms morph=0 and ticker inactive while the rest
  face remains LiquidGlassLite. Rechecked the idle GPU capture and restored the
  original MID selection. Final analysis is clean; 221 tests passed, 1 skipped.

## Follow-up UI polish — 15 October 2026

- Removed setup `:00`; actual writing countdown unchanged. Difficulty travels
  over the same 180 ms easeOutCubic window as navigation and contracts with a
  faster package spring. Hold/preview/release, cancellation, clamping and the
  permanent resting rim are preserved.
- New Tweet and every Feed filter now use the existing package, shared finite
  GlassPill controls and Classic fallback. Active filters tint material and
  specular reflection red; scope/type rows wrap instead of hiding categories.
- Removed the RN-specific split-letter Library Lock/Unlock morph, retaining
  full text at system text scale and the actual security callbacks. The locked
  content card can scroll on short screens with large text.
- YOU DIED has black rather than brown backing, a glass return action, responsive
  scrollable recovery choices and blocked background semantics. Warning effects
  are removed while it is visible. Save, continue and wipe mechanics unchanged.
- Warning uses straight feathered side fronts plus one clipped Gaussian capped
  at 4 px. Frozen native screenshots cover ratios .45/.75/.98, keyboard open.
  Late warning covers the centre without an oval; typing removes blur at once.
  The isolated review harness uses the real editor, package controls and engine.

- Verification: 259 tests passed, one pre-existing skip; another eight affected
  tests passed after enforcing a 44 px minimum width. Analyze and diff whitespace
  checks clean. Three Android release ABIs built. Maestro verified individual
  filter states, readable Unlock → real PIN challenge → cancel, difficulty taps,
  death/continue and ordinary Start → idle death → return navigation. Screenshots
  and raw frame data are indexed in `output/review/README.md`.
- Late-warning debug simulator probe: 1005 frames, build p95 1.024 ms and raster
  p95 2.265 ms. This covers the isolated static editor/heartbeat scene, not a
  physical-device release performance claim. Normal production entrypoint is
  restored after review; no sample records were written into personal storage.

## Warning revision after screenshot feedback — 15 October 2026

- Replaced the rejected moving fronts: they left a visibly black vertical band
  at intermediate ratios. Red now covers the centre from onset; cosine edge
  emphasis has low contrast and becomes uniform by .75. A smooth low-amplitude
  pulse changes tint only. There is no oval or moving boundary.
- Smoothed the engine's 100 ms samples locally over 100 ms. Only the warning
  leaf rebuilds per visual frame; session/death/haptic thresholds are unchanged.
  Blur has a smooth onset after .20 and a single 6 px maximum Gaussian pass.
  Reset on typing is immediate, with no lingering animation at rest.
- Both writing and reflection warning stacks fill the entire Flutter window.
  Removed writing's keyboard-height crop; reflection safe/keyboard insets pad
  content inside the stack. Native keyboard remains OS-owned. Pixel regressions
  verify centre coverage at early/middle stages, uniform late coverage, visual
  interpolation and both screen bounds with a simulated keyboard.
- Eleven targeted tests passed; static analysis clean. Maestro recorded an
  ordinary MID session through the complete warning to death and menu return.
  Native stills at .45/.75/.98 are in `output/review/README.md`.
- Full-transition debug probe: 521 frames, build p95 1.673 ms / raster p95
  3.469 ms. Simulator values while recording; not physical release profiling.
- Final full suite: 261 passed, one existing skip. Normal `lib/main.dart` is
  restored after preview, preserving personal data. The complete transition
  recording and all three current stills supersede the previous warning proof.
- Canonical Android release build passed for ARMv7, ARM64 and x86_64.
