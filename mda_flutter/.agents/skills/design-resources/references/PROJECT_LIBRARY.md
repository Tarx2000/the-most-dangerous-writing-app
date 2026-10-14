# Integration, iteration and project-local reuse

Read when adding or adapting UI. Inspect existing project conventions first; extend the current library rather than creating competing folders.

## Local lookup

Search existing widgets, shared UI, theme and any component inventory. Reuse a matching local component or extend its variants. Keep feature-specific UI inside its feature. Create a shared library when the first genuinely reusable component emerges; do not create an empty framework in every project.

For a Flutter project without conventions, `lib/design_system/components/` is a possible shared location. Keep common tokens in the existing ThemeData/theme extensions; choose locations to match the project. Business logic remains outside reusable visual widgets.

## Selecting and importing

Read 1–3 candidate profiles. Pick by functionality, target platform, design fit, current free rights, adaptation effort, accessibility and dependency cost. The index lists provider scope; read concrete component source/demo before asserting its quality.

For Flutter, prefer compatible native widgets when suitable. Translate selected web layout/behavior intentionally; do not add React infrastructure. For web projects use supported registry/CLI access after reading selected files/dependencies. Keep third-party code isolated enough to update; expose project-appropriate properties and states. Use current theme colors, typography, spacing and radii.

Record the selected source before adapting. Retain complete required notices, not just a source URL. Validate rights at the selected component/asset scope. A private app-use widget folder is not automatically permitted to become a published template, commercial UI kit or cross-project redistributable package.

## Iteration loop

1. Implement a coherent first version in the actual target screen.
2. Inspect actual output using the project's available preview, simulator, screenshots or browser. Do not claim visual inspection when only source was reviewed.
3. Check task-relevant states: default, loading, empty, error, disabled, focus/selection. Check small screens, touch, large text, semantics/keyboard and light/dark modes when supported. Test reduced motion for animated UI; assess performance for expensive effects.
4. Compare to the requested behavior and project theme. Fix concrete gaps; repeat affected checks. Do not redesign unrelated screens or switch libraries for cosmetic differences alone.
5. Promote to shared use when stable. If validation is unavailable, describe what remains unverified. Add meaningful behavior tests where needed, without tests that merely mirror code or repeated broad checks after a passing change.

## Small local inventory

Use the project's existing inventory. Otherwise add `COMPONENTS.md` beside the shared UI or in its existing documentation. Record only downloaded/used candidates, not the full online catalog.

Each record contains:
- Name, local file, purpose and supported variants/states.
- Status: experimental, ready or deprecated, with any limitation.
- Original component URL/repository and package version or commit; retrieval date if no version exists.
- License link, local notice/license file and visible-credit requirement if any.
- Dependencies, important adaptations and integration/visual checks actually performed.

Keep abandoned downloads out of the approved inventory. Store original source only if needed for updates and license-compatible. On a later request, consult this inventory before downloading another equivalent component.
