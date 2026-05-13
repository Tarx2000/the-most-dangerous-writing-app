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
