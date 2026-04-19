# The Most Dangerous Writing App

React Native (Expo SDK 55) journaling app where stopping typing destroys your text. Extends the core mechanic with social circles, vlog recording, vision boards, alignment check-ins, and AI-powered title/summary generation via Ollama Cloud.

## Tech Stack

- **Runtime**: React 19.2 + React Native 0.83.4 (Expo managed workflow)
- **Navigation**: React Navigation v7 (Native Stack)
- **Animation**: React Native Reanimated v4 + React Native Gesture Handler + Flubber (SVG path morphing)
- **Storage**: AsyncStorage (all persistent state), expo-file-system (vlog video files)
- **AI**: Ollama Cloud API (XHR streaming) with singleton queue manager (`aiQueue.ts`)
- **Security**: expo-local-authentication (3-tier biometric unlock)
- **Build**: Babel with react-compiler plugin (target 19), TypeScript 5.9 strict mode

## Project Structure

```
App.tsx                    — Entry point (StorageProvider → AiQueueProvider → NavigationContainer)
src/
  config/
    index.ts               — App config (difficulties, timers, fonts, vlog settings)
    ai.ts                  — AI service config (models, prompts, rate limits, storage keys)
  types/
    index.ts               — All TypeScript interfaces (SavedNote, Person, SavedVlog, AiJob, etc.)
    navigation.types.ts    — RootStackParamList
    flubber.d.ts           — Flubber type declarations
  lib/
    aiService.ts           — XHR streaming client for Ollama Cloud
    aiQueue.ts             — Singleton AI job queue (persistence, retry, health checks)
    aiLogger.ts            — Structured AI operation logging (FIFO 200 entries)
    utils.ts               — generateId() utility
    hooks/
      useStorage.tsx       — 8 domain contexts + providers (NOTES, PERSONS, STREAK, PREFERENCES, AI_CONFIG, FEED, VLOGS, STORAGE_ACTIONS)
      useSession.ts        — Writing session idle timer + death logic (SharedValue-based, no re-renders on tick)
      useSecurity.ts       — 3-tier biometric security (locked → circles → profile → full)
      useAiQueueProvider.tsx — Single-instance AI queue context provider
      useThumbnails.ts     — Lazy video thumbnail extraction with in-flight dedup
  screens/
    HomeScreen.tsx         — Root container (horizontal swipe: Start/Library, vertical: Feed)
    StartScreen.tsx        — Mode selection + settings + AI config
    WritingScreen.tsx      — Core timed writing interface
    PostWritingScreen.tsx  — AI review + grammar check
    LibraryScreen.tsx      — Tabs: Journal/Circles/Vlog Calendar
    FeedScreen.tsx         — Chronological social-style timeline
    VisionBoardScreen.tsx  — 4-tab vision board
    AlignmentWritingScreen.tsx — Weekly reflection writing
    VlogRecordingScreen.tsx — Front camera video recording
  components/
    ui/                    — Reusable UI primitives (LiquidGlassNav, LiquidMorphIcon, SwipeableModal, TickDial, etc.)
    features/writing/      — DangerOverlay, StreakPopup
    features/library/      — CalendarView, NoteCard, NoteViewerModal, ExpandablePersonCard, PersonProfileModal, VlogCalendarGallery, VlogViewerModal
    features/feed/         — FeedCard, FeedVideoCard
    features/circles/      — CirclePickerSheet (extracted from StartScreen)
    features/settings/     — AiSettingsPanel, DeveloperToolsPanel
    features/alignment/    — CustomSlider
  styles/
    theme.ts              — AMOLED dark theme tokens
    commonStyles.ts        — Shared StyleSheet
```

## Architecture Patterns

### State Management (Split-Context Pattern)
8 domain-specific React Contexts in `useStorage.tsx`. Each has its own provider, ref-based state (fresh-read pattern to eliminate stale closures), and AsyncStorage persistence. **Always use the domain-specific hooks** (`useNotes`, `usePersons`, `useStreak`, `usePreferences`, `useAiConfig`, `useFeedData`, `useVlogs`, `useStorageActions`) — the legacy `useStorage()` hook is **deprecated** and subscribes to ALL contexts causing mass re-renders.

**Optimistic updates with rollback**: All CRUD operations snapshot state before writing, then restore on AsyncStorage failure. This prevents data loss from partial writes.

**Runtime validation**: `safeParse<T>()` wraps `JSON.parse` with per-key error isolation. One corrupt key won't block the others from loading — it falls back to defaults and logs a warning.

### Animation (Reanimated SharedValue Pattern)
Timer ticks and danger overlay animations use `SharedValue` on the UI thread — zero React re-renders during countdown. Flubber SVG morphing pre-computes all frames before playback for 60fps.

**CRITICAL: Never write to `.value` during render.** Always update SharedValues inside `useEffect`, `useCallback`, or gesture handlers. Writing during render causes Reanimated strict-mode warnings and can cause stale value reads. Pattern:
```tsx
// WRONG — causes "Writing to value during component render" warning
const sv = useSharedValue(screenHeight);
sv.value = screenHeight; // ❌ render-time write

// RIGHT — update in useEffect
const sv = useSharedValue(screenHeight);
useEffect(() => { sv.value = screenHeight; }, [screenHeight, sv]); // ✅
```

### AI Queue (Singleton + Context)
`aiQueue.ts` is a singleton. `AiQueueProvider` wraps the app once and exposes queue state via context. Access via `useAiQueueContext()`. Do NOT use the old `useAiQueue` hook (creates per-component subscriptions).

### Security (3-Tier Biometric)
- Stage 0: Locked (no access)
- Stage 1: Circles visible
- Stage 1.5: Profile visible
- Stage 2: Full access (notes, feed)
- Auto-lock after 3 minutes of inactivity (configurable via `timeoutMins`, 0 = lock on background only)
- 30-second grace period when app goes to background — brief interruptions (messages, camera) don't require re-auth
- Immediate lock on `inactive` state (control center, notification overlay)

### Theme System
**CRITICAL: Never use hardcoded hex/rgba color values anywhere in components, screens, or features.** Every color must come from `theme.colors` in `src/styles/theme.ts`. This includes `#FFF`, `#000`, `#fff`, `rgba(...)` values — ALL of them must be theme tokens. If a color doesn't exist in the theme, add it to `theme.ts` with a semantic name BEFORE using it.

The ONLY exceptions are: (1) transparent (`'transparent'`), (2) dynamically-constructed colors in animation code (e.g., `rgba(r, g, b, blend)` in DangerOverlay which uses CONFIG values), and (3) color values inside `alignmentScores.ts` which is the single source of truth for alignment score visuals.

**Common mappings (use these, NOT hardcoded values):**
- `#FFF` / `#fff` / `#FFFFFF` → `theme.colors.textPrimary` (or `primaryActionText` for button text on danger bg)
- `#000` / `#000000` → `theme.colors.background`
- `rgba(255,255,255,0.6)` → `theme.colors.textSecondary`
- `rgba(255,255,255,0.4)` → `theme.colors.textDim`
- `rgba(255,255,255,0.3)` → `theme.colors.textMuted`
- `rgba(255,255,255,0.5)` → `theme.colors.lightGrey`
- `rgba(255,255,255,0.2)` → `theme.colors.grey`
- `rgba(255,255,255,0.1)` → `theme.colors.glassBorder`
- `rgba(255,255,255,0.05)` → `theme.colors.glassBackground`
- `rgba(255,255,255,0.06)` → `theme.colors.glassSurface`
- `rgba(255,255,255,0.08)` → `theme.colors.glassSurfaceMedium`
- `rgba(255,255,255,0.12)` → `theme.colors.glassBorderMedium`
- `rgba(255,255,255,0.15)` → `theme.colors.glassHighlight`
- `rgba(0,0,0,0.6)` → `theme.colors.modalBackground`
- `rgba(0,0,0,0.85)` → `theme.colors.overlayMedium`
- `#FF2A2A` → `theme.colors.danger`
- `#4ADE80` / `#4ade80` → `theme.colors.green`
- `#FF6B35` → `theme.colors.orange`
- `#FFD700` → `theme.colors.gold`

**Naming convention for new tokens:**
- **Danger scale**: `dangerSubtle` (0.06) → `dangerLight` (0.08) → `dangerTint` (0.1) → `dangerFill` (0.15) → `dangerBorderStrong` (0.3) → `dangerFillStrong` (0.3) → `dangerOverlayLight` (0.45)
- **Glass scale**: `glassBackground` → `glassSurface` → `glassSurfaceMedium` → `glassBorder` → `glassBorderSubtle` → `glassBorderMedium` → `glassHighlight`
- **Surface scale**: `background` (#000) → `surfaceDark` (#0A0A0A) → `surfaceRaised` (#1A1A1A) → `surfaceMedium` (#111) → `surfaceLight` (#222)
- **Animation springs**: Use `theme.animation.springDefault/springSnappy/springGentle/springLight`

### TypeScript Rules
- **No `any` types** — always use proper interfaces. If a prop type is complex, use `ReturnType<typeof useHook>` to derive it from the hook. See `SettingsModal.tsx` for the pattern.
- **Type guards**: Use `isAlignmentReflection(note)` to check note types. Never use `(note as any).isAlignmentReflection`.
- **Fresh-read pattern**: Every state variable in `useStorage.tsx` must have a corresponding ref. When updating state in `storageOps.ts`, always update BOTH the setter AND the ref on the success path: `setter(newVal); ref.current = newVal;`
- **React.memo**: Wrap components with expensive renders (SVG, animations, video) in `React.memo`. Always wrap `React.FC` exports that use gesture handlers or complex props.

### Code Organization
- **Alignment score logic**: Always use `getAlignmentScoreDetails()`, `getAlignmentScoreColor()`, or `getAlignmentScoreFeed()` from `@/lib/alignmentScores`. Never duplicate score-tier logic inline.
- **Inline styles**: Prefer `StyleSheet.create()` over inline `style={{}}`. Only keep dynamic values (e.g., `width: progress + '%'`) inline.
- **Dimensions**: Always use `useWindowDimensions()` hook, never module-level `Dimensions.get('window')`.
- **Error handling**: Never use bare `catch (_) {}` or `.catch(() => {})` in production code. Always log the error with `console.error` or `console.warn` with context.

### Component Patterns
- **Shared components**: `DeathOverlay` (writing death screen), `SettingsCard` (settings panel wrapper), `DangerOverlay` (idle danger progress), `SwipeableModal` (bottom sheet), `ErrorBoundary` (retry wrapper)
- **Type guard**: Use `isAlignmentReflection(note)` to check if a note is a check-in. Never use `(note as any).isAlignmentReflection`.
- **Memoization**: Components with gesture handlers (`CalendarView`, `CustomSlider`, `TickDial`) use `React.memo` + `useMemo` for gestures to prevent recreation on parent re-renders.
- **Inline styles**: Prefer `StyleSheet.create()` over inline `style={{}}`. Only keep dynamic values (e.g., `width: progress + '%'`) inline.
- **Dimensions**: Always use `useWindowDimensions()` hook, never module-level `Dimensions.get('window')`. The latter freezes values at module load and doesn't update on rotation.

### Video Auto-Play (Viewport-Driven)
`FeedVideoCard` uses a single-source playback control pattern:

1. **`autoPlay` prop** (viewport-driven): Computed by `FeedScreen` as `autoPlayFeedVideos && isVisible`, where `isVisible = visibleItemIds.has(id) && isFeedVisible`. When the feed is hidden or the video scrolls off-screen, `autoPlay` becomes `false` and the video pauses immediately.
2. **`userPausedRef`** (manual override): Tracks whether the user manually paused. Prevents `playingChange` force-resume after manual pause. Reset on every `autoPlay` change so viewport changes always win.
3. **`playingChange` listener**: Only force-resumes when `autoPlay && !userPausedRef.current && !event.isPlaying`. Handles modal close and system pauses.
4. **Tap-to-mute**: The entire video area is a `Pressable` with `zIndex: 5` over the `VideoView` (which has `pointerEvents: 'none'`). This ensures taps always reach the `Pressable`, never the native video player.

**CRITICAL: VideoView intercepts touches.** Always set `pointerEvents: 'none'` on `VideoView` and use a separate `Pressable` overlay with `zIndex` for tap handling. The native video player captures touches even with `nativeControls={false}`.

### Feed Transition Architecture
The feed reveal/dismiss uses `feedProgress` SharedValue (0→1) driving three animated layers:
- **Main content**: `translateY: feedProgress * -screenHeight` (slides up)
- **Feed layer**: `translateY: (1 - feedProgress) * screenHeight` (slides in from below)
- **Nav bar**: `opacity: 1 - feedProgress`, `translateY: feedProgress * 80` (fades out and slides down)

The `LiquidGlassNav` must be OUTSIDE the `mainContent` Animated.View with its own `navAnimStyle`. If placed inside `mainContent`, it gets pushed off-screen when the feed opens and bleeds into the feed during the transition animation.

**Lock screen dismiss**: The lock screen pan gesture updates `feedProgress` in real-time (follow-finger), then snaps to 0 (close) or 1 (open) on release. This provides a smooth drag-to-dismiss experience.

### Progressive Haptic Feedback
`useSession` implements a 4-level escalating haptic pattern during idle danger. Thresholds are defined by `HAPTIC_CAUTION/WARNING/URGENT/CRITICAL_THRESHOLD` constants at the top of the file — adjust values there, not in comments. Each level fires exactly once per idle period (tracked via `lastHapticLevelRef`). Resets to `'none'` on text input or new session start. Pattern: single short pulse → double-tap → triple rapid pulse → escalating rapid buzz.

## ⚠️ Version Pinning (CRITICAL — do NOT upgrade these)

These packages are pinned to specific versions that match Expo SDK 55's bundled native code. Upgrading them causes `installTurboModule` crashes in Expo Go:

| Package | Pinned Version | Why |
|---------|---------------|-----|
| `react-native-reanimated` | **4.2.1** | v4.3.0+ has TurboModule signature mismatch with Expo Go |
| `react-native-worklets` | **0.7.2** | v0.8.1+ incompatible with Reanimated 4.2.1 |
| `jest` | **~29.7.0** | Expo SDK 55 expects Jest 29; Jest 30 has peer dep conflicts |
| `@types/jest` | **29.5.14** | Must match Jest 29 |
| `react-native-mmkv` | **NOT COMPATIBLE** | Requires development build; cannot run in Expo Go |
| `react-native-nitro-modules` | **NOT COMPATIBLE** | Required by MMKV v4; not available in Expo Go |

**Before upgrading any dependency**, run `npx expo-doctor` and ensure all 17 checks pass.

## Key Constraints

- **Path alias**: `@/` maps to `src/` (configured in tsconfig + babel)
- **React Compiler**: Enabled via `babel-plugin-react-compiler` (target 19). Do not add `useMemo`/`useCallback` where the compiler handles it — but existing explicit memoization is kept for clarity with the ref pattern.
- **Expo managed workflow**: No native module customization without ejecting or config plugins. **Expo Go only** — packages requiring custom native builds (MMKV, Nitro Modules) will crash.
- **Ollama Cloud API**: Streaming via `XMLHttpRequest` (not fetch — needed for progressive response reading). Base URL and model are user-configable in settings.
- **Storage adapter**: `src/lib/storage.ts` wraps `@react-native-async-storage/async-storage` with an AsyncStorage-compatible API. If switching to a development build in the future, this single file can be swapped to MMKV for synchronous reads.

## Common Tasks

### Adding a new screen
1. Add the screen component in `src/screens/`
2. Add the route params type to `src/types/navigation.types.ts`
3. Register the screen in `App.tsx` Stack.Navigator

### Adding a new context domain
1. Define the context type and create the context in `useStorage.tsx`
2. Add state, refs, operations, and memoized value in `StorageProvider`
3. Add the provider to the provider tree
4. Create and export a domain-specific hook

### Modifying AI behavior
- **Prompts**: Edit `DEFAULT_AI_PROMPTS` in `src/config/ai.ts` (overridable at runtime in Dev Settings)
- **Models**: Add to `AI_AVAILABLE_MODELS` in `src/config/ai.ts`
- **Queue logic**: Edit `src/lib/aiQueue.ts` (singleton, persists jobs to AsyncStorage)

### Running the app
```bash
npx expo start          # Start dev server
npx expo run:android    # Build and run on Android
npx expo run:ios        # Build and run on iOS
```

### Proxy for local AI dev
`proxy-ollama.js` runs a local HTTP proxy that spoofs model availability for development.