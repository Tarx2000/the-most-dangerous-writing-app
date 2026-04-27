# The Most Dangerous Writing App — Agent Context

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

## KiloCode Capabilities

### Skills (from `.agents/skills/`)
- `vercel-react-best-practices` — React/Next.js performance optimization (69 rules across 8 categories)
- `expo-liquid-glass` — Liquid Glass UI design and implementation for Expo
- `copywriting` — Conversion copywriting for marketing pages
- `git-commit` — Conventional commit workflow with diff analysis
- `find-skills` — Discover and install skills from the open ecosystem

### Slash Commands (from `.kilo/workflows/`)
- `/expo-build` — Local Android release build
- `/react-native-performance` — Performance checklist for React Native
- `/ux-polish` — UX/micro-interactions best practices
- `/react-native-design` — Design system for React Native
- `/create-component` — Standardized component creation workflow
- `/app-audit` — Full mobile app audit checklist

### Domain Instructions (from `.kilo/instructions/`)
- `state-management.md` — Split-context pattern, fresh-read, optimistic updates
- `animations.md` — SharedValue rules, feed transitions, haptics
- `ai-integration.md` — Singleton queue, streaming, retry logic
- `theme-system.md` — Color mappings, naming conventions, liquid glass
- `security.md` — 3-tier biometric, auto-lock rules
- `typescript-rules.md` — Strict mode, version pinning, code quality

## Architecture Quick Reference

Each domain has a dedicated instruction file with full detail. Below are the critical rules you must know without looking them up.

### State Management → `.kilo/instructions/state-management.md`
8 domain-specific React Contexts in `useStorage.tsx`. **Always use domain-specific hooks** (`useNotes`, `usePersons`, etc.) — the legacy `useStorage()` hook is **deprecated**. Optimistic updates with rollback. `safeParse<T>()` for runtime validation.

### Animation → `.kilo/instructions/animations.md`
**Never write `.value` during render.** Always update SharedValues inside `useEffect`, `useCallback`, or gesture handlers. `LiquidGlassNav` must be **OUTSIDE** the `mainContent` Animated.View.

### AI Queue → `.kilo/instructions/ai-integration.md`
`aiQueue.ts` is a singleton. Access via `useAiQueueContext()`. Do NOT use old `useAiQueue` hook. Streaming uses `XMLHttpRequest` (not fetch).

### Security → `.kilo/instructions/security.md`
3-tier biometric: Locked → Circles → Profile → Full. Auto-lock after 3 min. 30s background grace period. Immediate lock on `inactive` state.

### Theme System → `.kilo/instructions/theme-system.md`
**CRITICAL: No hardcoded hex/rgba values anywhere.** Every color from `theme.colors`. See instruction file for full mapping table (19 entries) + naming conventions.

### TypeScript → `.kilo/instructions/typescript-rules.md`
No `any` types. Use type guards. Fresh-read pattern: update BOTH setter AND ref. React.memo for expensive components.

## Video Auto-Play (Viewport-Driven)
`FeedVideoCard`: `autoPlay` prop (viewport-driven) → `userPausedRef` (manual override) → `playingChange` listener (force-resume). **CRITICAL: `VideoView` has `pointerEvents: 'none'`**, use `Pressable` overlay with `zIndex` for taps.

## Code Rules
- **No `any` types** — use proper interfaces. Complex prop types: `ReturnType<typeof useHook>`
- **Type guards**: `isAlignmentReflection(note)` not `(note as any).isAlignmentReflection`
- **Fresh-read pattern**: Update BOTH setter AND ref: `setter(newVal); ref.current = newVal;`
- **React.memo** for expensive components (SVG, animations, video) and `React.FC` exports with gesture handlers
- **StyleSheet.create()** over inline styles. Only dynamic values inline
- **useWindowDimensions()** hook, never module-level `Dimensions.get('window')` (freezes at module load)
- **Error handling**: Never bare `catch (_) {}` — always log with context
- **Alignment scores**: Always use `getAlignmentScoreDetails()` / `getAlignmentScoreColor()` / `getAlignmentScoreFeed()` from `@/lib/alignmentScores`. Never duplicate inline.
- **Shared components**: `DeathOverlay`, `SettingsCard`, `DangerOverlay`, `SwipeableModal`, `ErrorBoundary`

## Key Constraints
- **Path alias**: `@/` maps to `src/` (tsconfig + babel)
- **React Compiler**: Enabled via `babel-plugin-react-compiler` (target 19). Don't add `useMemo`/`useCallback` where compiler handles it — existing explicit memoization kept for ref pattern clarity.
- **Expo managed workflow**: **Expo Go only** — packages requiring custom native builds (MMKV, Nitro Modules) will crash.
- **Ollama Cloud API**: Streaming via `XMLHttpRequest` (not fetch). Base URL and model user-configurable.
- **Storage adapter**: `src/lib/storage.ts` wraps AsyncStorage. Swappable to MMKV in dev builds.

## Version Pinning (Do NOT Upgrade)
| Package | Version | Why |
|---------|---------|-----|
| react-native-reanimated | **4.2.1** | v4.3.0+ TurboModule mismatch with Expo Go |
| react-native-worklets | **0.7.2** | v0.8.1+ incompatible with Reanimated 4.2.1 |
| jest | **~29.7.0** | Expo SDK 55 expects Jest 29; Jest 30 has peer dep conflicts |
| @types/jest | **29.5.14** | Must match Jest 29 |
| react-native-mmkv | **NOT COMPATIBLE** | Requires dev build; crashes in Expo Go |
| react-native-nitro-modules | **NOT COMPATIBLE** | Required by MMKV v4; not in Expo Go |

**Before upgrading any dependency**, run `npx expo-doctor` and ensure all 17 checks pass.

## Common Tasks
- **Add screen**: Component in `src/screens/` → type in `src/types/navigation.types.ts` → register in `App.tsx`
- **Add context domain**: Define type in `useStorage.tsx` → state, refs, operations in `StorageProvider` → add provider to tree → export domain-specific hook
- **Modify AI**: Prompts in `src/config/ai.ts` (`DEFAULT_AI_PROMPTS`), models in `AI_AVAILABLE_MODELS`, queue logic in `src/lib/aiQueue.ts`
- **Run the app**: `npx expo start` | `npx expo run:android` | `npx expo run:ios`
- **Local AI dev proxy**: `proxy-ollama.js` spoofs model availability

## Agent Operating Rules (Mandatory — Remember Forever)

### 1. Code Must Be Well-Documented
Every chunk of code must have good, simple-to-understand documentation. Comments explain the **"why"**, not just the **"what"**.

### 2. Documentation Must Stay Up to Date
Whenever documentation or comments no longer fit the code, **update or remove them immediately**. Do not defer. Outdated documentation is worse than no documentation.

### 3. Config Variables for Customization
Define important customizable values as **config variables at the top of the file** or in a dedicated config file (e.g., `src/config/`). Makes the most important parts easy to tweak without hunting through logic.

### 4. List Used Skills in Every Response
At the top of every answer, list which skills or instructions contributed to the response.

*Example:* `**Used skills:** \`vercel-react-best-practices\`, \`.kilo/instructions/animations.md\``

### 5. Explain Difficult Tech Terms
When mentioning technical terms that a non-expert might not know, provide a **short, plain-English explanation** right there in the answer.

*Example:* `XHR (XMLHttpRequest): A browser API for fetching data from servers. Unlike the modern fetch() API, it allows reading a response piece-by-piece as it arrives.`

## Project Documentation Maintenance (Critical)

**AGENTS.md is the single source of truth.** Whenever you make architectural or logic changes that affect rules, patterns, or conventions described here, update AGENTS.md and related instruction files immediately as part of the same task cycle. Do not defer.

- **Deprecate a pattern** → remove or mark **DEPRECATED** in AGENTS.md + `.kilo/instructions/*.md`
- **Introduce a pattern** → add to AGENTS.md or the correct domain instruction file
- **Change a package version** → update the Version Pinning table
- **Change AI integration** → update AGENTS.md + `.kilo/instructions/ai-integration.md`
- **Change state management** → update AGENTS.md + `.kilo/instructions/state-management.md`

**Verification before finishing any task:**
- Scan AGENTS.md for any mention of the area you just changed
- Check `.kilo/instructions/*.md` for related rules
- Fix stale, misleading, or contradictory instructions before declaring the task complete