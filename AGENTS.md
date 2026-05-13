# The Most Dangerous Writing App — Agent Context

React Native (Expo SDK 55) journaling app where stopping typing destroys your text. Extends the core mechanic with social circles, vlog recording, vision boards, alignment check-ins, and AI-powered title/summary generation via Ollama Cloud.

## Tech Stack
- **Runtime**: React 19.2 + React Native 0.83.4 (Expo managed workflow)
- **Navigation**: React Navigation v7 (Native Stack)
- **Animation**: React Native Reanimated v4 + React Native Gesture Handler + Flubber (SVG path morphing)
- **Storage**: SQLite (expo-sqlite v15) for structured data, AsyncStorage for legacy migration flags, expo-file-system (vlog video files)
- **AI**: Ollama Cloud API (XHR streaming) with singleton queue manager (`aiQueue.ts`)
- **Compression**: Singleton video compression queue (`compressionQueue.ts`) with real-time progress, retries, and UI troubleshooting panel
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
      compressionQueue.ts    — Singleton compression job queue (progress, retry, cancel, dev UI)
      aiLogger.ts            — Structured AI operation logging (FIFO 200 entries)
      utils.ts               — generateId() utility
      hooks/
        useStorage.tsx       — 8 domain contexts + providers
        useSession.ts        — Writing session idle timer + death logic
        useSecurity.ts       — 3-tier biometric security
        useAiQueueProvider.tsx — Single-instance AI queue context provider
        useCompressionQueueProvider.tsx — Single-instance compression queue context provider
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
Critical per-domain rules live in `.agents/instructions/*.md`. Read the relevant file before editing that area.
- `state-management.md` — Split-context pattern, fresh-read, optimistic updates
- `animations.md` — SharedValue rules, feed transitions, haptics
- `ai-integration.md` — Singleton queue, streaming, retry logic
- `theme-system.md` — Color mappings, naming conventions, liquid glass
- `security.md` — 3-tier biometric, auto-lock rules
- `typescript-rules.md` — Strict mode, version pinning, code quality

## Agent Operating Rules (Mandatory)

### 1. Code Must Be Well-Documented
Every chunk of code must have good, simple-to-understand documentation. Comments explain the **"why"**, not just the **"what"**.

### 2. Documentation Must Stay Up to Date
Whenever documentation or comments no longer fit the code, **update or remove them immediately**. Do not defer. Outdated documentation is worse than no documentation.

### 3. Config Variables for Customization
Define important customizable values as **config variables at the top of the file** or in a dedicated config file (e.g., `src/config/`).

### 4. List Used Skills in Every Response
At the top of every answer, list which skills or instructions contributed to the response.

*Example:* `**Used skills:** \`vercel-react-best-practices\`, \`.agents/instructions/animations.md\``

### 5. Explain Difficult Tech Terms
When mentioning technical terms that a non-expert might not know, provide a **short, plain-English explanation** right there in the answer.

*Example:* `XHR (XMLHttpRequest): A browser API for fetching data from servers. Unlike the modern fetch() API, it allows reading a response piece-by-piece as it arrives.`

### 6. Parallelize Work with Sub-Agents
If a task can be broken into multiple independent pieces (e.g., researching different topics, editing several files, or running multiple commands), **launch parallel task agents** rather than doing everything sequentially. Do not avoid delegating because it feels like more work — parallel agents finish faster and produce better results.

*Guidelines:*
- Use the `task` tool for focused subtasks.
- Split by domain or file when there's no cross-dependency.
- Always give sub-agents complete context (they don't see your conversation history by default).

## Project Documentation Maintenance (Critical)

**AGENTS.md is the single source of truth.** Whenever you make architectural or logic changes that affect rules, patterns, or conventions described there, update AGENTS.md and related instruction files immediately as part of the same task cycle. Do not defer.

- **Deprecate a pattern** → remove or mark **DEPRECATED** in AGENTS.md + `.agents/instructions/*.md`
- **Introduce a pattern** → add to AGENTS.md or the correct domain instruction file
- **Change a package version** → update the Version Pinning table
- **Change AI integration** → update AGENTS.md + `.agents/instructions/ai-integration.md`
- **Change state management** → update AGENTS.md + `.agents/instructions/state-management.md`

**Verification before finishing any task:**
- Scan AGENTS.md for any mention of the area you just changed
- Check `.agents/instructions/*.md` for related rules
- Fix stale, misleading, or contradictory instructions before declaring the task complete
