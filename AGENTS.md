# The Most Dangerous Writing App — Agent Context

React Native (Expo SDK 55) journaling app where stopping typing destroys your text. Extends the core mechanic with social circles, vlog recording, vision boards, alignment check-ins, and AI-powered title/summary generation via Ollama Cloud.

## Tech Stack
- **Runtime**: React 19.2 + React Native 0.83.4 (Expo managed workflow)
- **Navigation**: React Navigation v7 (Native Stack)
- **Animation**: React Native Reanimated v4 + React Native Gesture Handler + Flubber (SVG path morphing)
- **Storage**: SQLite (expo-sqlite v15) for structured data, AsyncStorage for legacy migration flags, expo-file-system (vlog video files)
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
      useStorage.tsx       — 8 domain contexts + providers
      useSession.ts        — Writing session idle timer + death logic
      useSecurity.ts       — 3-tier biometric security
      useAiQueueProvider.tsx — Single-instance AI queue context provider
      useThumbnails.ts     — Lazy video thumbnail extraction
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
    features/circles/      — CirclePickerSheet
    features/settings/     — AiSettingsPanel, DeveloperToolsPanel
    features/alignment/    — CustomSlider
  styles/
    theme.ts              — AMOLED dark theme tokens
    commonStyles.ts        — Shared StyleSheet
```

## Key Constraints
- **Path alias**: `@/` maps to `src/` (tsconfig + babel)
- **React Compiler**: Enabled via `babel-plugin-react-compiler` (target 19). Don't add `useMemo`/`useCallback` where compiler handles it.
- **Expo managed workflow**: **Expo Go only** — packages requiring custom native builds (MMKV, Nitro Modules) will crash.
- **Ollama Cloud API**: Streaming via `XMLHttpRequest` (not fetch). Base URL and model user-configurable.
- **Storage adapter**: `src/lib/storage.ts` wraps AsyncStorage. Swappable to MMKV in dev builds.
- **expo-sqlite null/undefined bridge bug**: Always use `db.ts` wrappers (`run`/`getAll`/`getFirst`). Never call `db.runAsync()` directly.

## Video Auto-Play (Viewport-Driven)
`FeedVideoCard`: `autoPlay` prop (viewport-driven) → `userPausedRef` (manual override) → `playingChange` listener (force-resume). **CRITICAL: `VideoView` has `pointerEvents: 'none'`**, use `Pressable` overlay with `zIndex` for taps.

## Domain Instructions
Critical per-domain rules live in `.kilo/instructions/*.md`. Read the relevant file before editing that area.
- `state-management.md` — Split-context pattern, fresh-read, optimistic updates
- `animations.md` — SharedValue rules, feed transitions, haptics
- `ai-integration.md` — Singleton queue, streaming, retry logic
- `theme-system.md` — Color mappings, naming conventions, liquid glass
- `security.md` — 3-tier biometric, auto-lock rules
- `typescript-rules.md` — Strict mode, version pinning, code quality

## Agent Operating Rules
See `.kilo/agent/global.md` for mandatory behavioral rules (documentation standards, sub-agent usage, etc.).
