# Reusable glass controls

- **Source:** [liquid_glass_easy](https://pub.dev/packages/liquid_glass_easy),
  version 5.0.0; MIT, copyright Ahmed Gamil.
  [Upstream license](https://github.com/ahmeedgamil/liquid_glass_easy/blob/main/LICENSE).
  The dependency retains its license and Flutter includes package notices; no
  upstream widget implementation was copied into the project. No visible credit
  is required by this license.
- **Shared styling:** `widgets/app_glass.dart`. AMOLED black backdrop,
  low-opacity tints confined to glass controls, real lens optics, sub-pixel specular contours and
  reusable touch flex. No broad glow, exterior bevel or extra Gaussian blur pass.
  The three header lenses share one backdrop read; overlapping lenses stay separate.
- **Navigation:** `widgets/liquid_glass_nav.dart`. Native Impeller lift/drag/snap
  via the public `LiquidGlassTabBar` API. Full-screen placement and
  single safe-area inset; semantic actions; custom MDI glyphs and urgent dot.
  Skia keeps the package's frosted bar plus a local hold-selection fallback.
- **Proportions:** 84 px black glass navigation, 6 px item inset, standalone
  64 px start action (width up to 320 px, raised 18 px). No shared enclosing panel. Classic navigation stays 62 px.
- **Start controls:** `features/start/start_screen.dart` uses the public
  `LiquidGlassButton` and `LiquidGlassLens`. Difficulty uses the reusable
  `widgets/liquid_glass_options.dart`, composed from public `LiquidGlassMotionPill`
  and lens widgets. Local gesture/position state drives hold, continuous preview,
  release/cancel and spring snap; the package owns optical deformation and morph.
  All controls share Start Writing's thin rim and dark glass material. The moving
  pill rebuilds independently; track and option labels remain stable between
  preview boundaries. Feed frames update only the cached nav's transform/fade.
- **Verification:** Native iPhone 18 Pro/Impeller pointer tests cover holding,
  following the finger, release selection and reverse direction; GPU screenshots
  verify the raised lens. Widget tests cover Skia fallback hold/slide, end clamps,
  both rendering preferences, route/session state and feed/library gestures.
