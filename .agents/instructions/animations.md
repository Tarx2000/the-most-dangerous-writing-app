# Domain Instruction: Animations

## Scope
Any file using `react-native-reanimated`, `react-native-gesture-handler`, `flubber`, or custom SVG animations.

## CRITICAL: Never Write .value During Render
SharedValues run on the UI thread. Writing `.value` during React render causes strict-mode warnings and stale reads.

```tsx
// WRONG — causes "Writing to value during component render" warning
const sv = useSharedValue(screenHeight);
sv.value = screenHeight; // ❌ render-time write

// RIGHT — update in useEffect
const sv = useSharedValue(screenHeight);
useEffect(() => { sv.value = screenHeight; }, [screenHeight, sv]); // ✅
```

## Allowed Update Locations
- `useEffect` callbacks
- `useCallback` handlers
- Gesture handler callbacks (`onStart`, `onActive`, `onEnd`)
- `requestAnimationFrame` loops

## React.memo for Expensive Components
Always wrap components that use Reanimated or SVG in `React.memo`:
- `DangerOverlay`
- `TickDial`
- `LiquidMorphIcon`
- `DeathOverlay`
- Any component with `GestureDetector`

## Flubber SVG Morphing
- Pre-compute all interpolation frames before playback
- Target 60fps by limiting frame count
- Use `useSharedValue` for the path morph progress, not React state
- **Cache pre-computed frame arrays** dynamically for clean transitions (e.g. `journal_to_circles`) to reduce flubber runtime overhead to 0ms on subsequent morphs.

## Reanimated Thread Safety & runOnUI
- **Avoid wrapping simple shared value writes in `runOnUI`**: Direct setting of `sharedValue.value = withSpring(...)` or `sharedValue.value = withTiming(...)` is automatically optimized by Reanimated to run on the UI thread. Using `runOnUI` adds unnecessary bridge crossing latency and queues updates behind busy JS cycles. Only use `runOnUI` when executing custom worklet functions that must run strictly on the UI thread.

## Gesture Handler Patterns
- Extract gesture handlers into `useMemo` to prevent recreation on parent re-renders
- Memoize animated styles with `useAnimatedStyle`, not `useMemo`
- Always clean up gesture handlers in `useEffect` cleanup

## Feed Transition Architecture
The feed reveal/dismiss uses `feedProgress` SharedValue (0→1) driving three animated layers:
- **Main content**: `translateY: feedProgress * -screenHeight` (slides up)
- **Feed layer**: `translateY: (1 - feedProgress) * screenHeight` (slides in from below)
- **Nav bar**: `opacity: 1 - feedProgress`, `translateY: feedProgress * 80` (fades out and slides down)

`LiquidGlassNav` must be **OUTSIDE** the `mainContent` `Animated.View` with its own `navAnimStyle`. Inside `mainContent` it gets pushed off-screen and bleeds into the feed during transition.

## Haptic Feedback
`useSession` implements a 4-level escalating haptic pattern during idle danger. Thresholds are constants at the top of the file — adjust values there, not in comments. Each level fires exactly once per idle period (tracked via `lastHapticLevelRef`).

## Video Auto-Play (Viewport-Driven)
`FeedVideoCard`: `autoPlay` prop (viewport-driven) → `userPausedRef` (manual override) → `playingChange` listener (force-resume). **CRITICAL: `VideoView` has `pointerEvents: 'none'`**, use `Pressable` overlay with `zIndex` for taps.

## Performance & Layout Sizing Rules
- **Conditional Mounting**: Defer mounting expensive children inside expandable elements (like accordions or slide-outs) using a local React state (e.g., `shouldRenderContent`). Only mount when expanding, and unmount when collapsing completes via Reanimated's animation finished callback (using `runOnJS`).
- **Android Software Blur Avoidance**: Never use `<BlurView>` inside lists or animating elements on Android, as Android runs software-based blurs on the CPU which causes layout lag. Use a translucent solid background color instead (e.g., `theme.colors.overlayLockAndroid`). Conditionally render: `{Platform.OS === 'ios' ? <BlurView .../> : null}` and set a solid `backgroundColor` on the container style for Android.
- **FlashList Dynamic Heights**: For lists with expanding/collapsing items, do NOT provide a fixed `getItemLayout` prop to `FlashList` or `FlatList`. A fixed `getItemLayout` causes layout conflicts and thrashing when items resize.
- **Max 3 Visible Stacked Layers**: When building composite UI elements (e.g. floating pills, nav bars, glass cards), collapse visual layers into at most 3 stacked compositor layers: (1) background layer, (2) animating/moving layer, (3) interactive layer. Extra absolute-fill gradients and tint overlays add a per-frame compositor cost that becomes visible jank on throttled GPUs.
- **No `pointerEvents` Inside `useAnimatedStyle`**: `pointerEvents` is a layout-level property, not a transform. Toggling it inside a worklet forces an extra native commit on every frame the threshold is crossed. Drive `pointerEvents` from React state (`visible` / `feedVisible`) on the consuming `Animated.View` instead, so it flips exactly once per transition rather than being re-evaluated every animation frame.

## Aesthetics & Spring Parameters (Decent, Clean, Professional)
- **Avoid Excessive/Playful Bounciness**: Animations must look clean, elegant, and professional rather than bouncy or hyperactive.
- **Damping Over Stiffness**: When configuring spring presets, use higher damping values (e.g., `damping: 26` to `35`) to prevent overshooting, oscillation, or excessive bounce.
- **Always Use `theme.animation.*` Presets — No Inline Spring Configs**: Inline `{ damping: ..., stiffness: ..., mass: ... }` objects passed to `withSpring` are **DEPRECATED**. Always reference a preset from `theme.animation` in `src/styles/theme.ts`:
  - `springDefault` — modal entries, sheet slides, card expands (damping 30)
  - `springSnappy` — quick press scales, snap-backs, tick snaps (damping 35)
  - `springGentle` — visible-but-tamed motion like celebratory popups (damping 26)
  - `springLight` — lighter-feeling springs (damping 28, mass 0.5)
  - `springFeed` — the feed reveal gesture (damping 32)
  If a new use case doesn't fit a preset, add a new preset to `theme.animation` rather than writing an inline config at the call site.
- **Timing Transitions**: For micro-interactions (like tab switching, input fade-ins, and button presses), prefer clean timing transitions (`withTiming`) or highly-damped, non-oscillating springs (`withSpring` with high damping).
- **Scale Factor**: Keep scaling factors subtle (e.g. `1.03` to `1.05` instead of `1.15`). Let the size shift remain modest.
