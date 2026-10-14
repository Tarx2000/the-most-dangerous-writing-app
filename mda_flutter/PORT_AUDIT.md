# Port verification

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
