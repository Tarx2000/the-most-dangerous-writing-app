# The Most Dangerous Writing App — Agent Context

React Native (Expo SDK 55) journaling app where stopping typing destroys your text. Extends the core mechanic with social circles, vlog recording, self-tracking growth masteries, alignment check-ins, and AI-powered title/summary generation via Ollama Cloud.

## Tech Stack
- React 19.2 + React Native 0.83.6 (Expo managed, custom native builds)
- React Navigation v7 (Native Stack)
- Reanimated v4 + `react-native-worklets` + Gesture Handler + Flubber
- SQLite (expo-sqlite v15) + AsyncStorage + expo-file-system
- AI Providers: Ollama Cloud & Neuralwatt (OpenAI-compatible) APIs via XHR streaming. Failures are classified into an `AiError` (kind: network/timeout/server/rateLimit/auth/config/cancelled/parse) with an actionable `userMessage`; the queue retries only retryable kinds and surfaces `AiFailureNotification`s (with `errorKind`) to the UI. See `.agents/instructions/ai-integration.md`.
- Babel (`babel-plugin-react-compiler` target 19, `react-native-worklets/plugin` LAST entry), TypeScript 5.9 strict

> **Reanimated v4 Babel Requirement**: The worklet compiler plugin must be imported from `react-native-worklets/plugin` (NOT `react-native-reanimated/plugin`, which is the legacy v3 path) and must be the **last** entry in `babel.config.js` `plugins`. Otherwise worklets fall back to JS-thread shims and animations jank on throttled devices.

## Project Structure
```
App.tsx                    — Entry point (providers and Root Stack Navigator)
src/
  config/                  — App configurations (timers, difficulties, fonts, AI config)
  types/                   — TypeScript type definitions and interfaces
  lib/                     — Core utilities, hooks, SQLite database access (db.ts), and AI logic
  screens/                 — Navigation screens (HomeScreen, StartScreen, WritingScreen, LibraryScreen, FeedScreen, VlogRecordingScreen, PillarsDashboardScreen, PillarDetailScreen, AlignmentWritingScreen, SandboxScreen, etc.)
  components/ui/           — Reusable visual components (LiquidGlassNav, BaseModal, TickDial, PinPadModal, etc.)
  components/features/     — Domain-specific components (writing/, library/, feed/, circles/, settings/, alignment/)
  styles/                  — theme.ts (AMOLED tokens and styling utilities)
```

## Key Constraints
- **Path alias**: `@/` maps to `src/` (tsconfig + babel)
- **Build Setup**: Expo Go is used for rapid iterative testing. However, the app is built as a custom native build (e.g., local Android release APK) for distribution/production. Standard Expo Go compatibility must be maintained during testing, but custom native code/builds are supported for the final export.
- **No Liquid Glass / BlurView**: Liquid-glass blur was deliberately removed app-wide (CPU blur on Android, no benefit on AMOLED). Use solid translucent tokens (`overlayLockAndroid`, `glassSurface*`). See `.agents/instructions/animations.md`.
- **Status bar hidden everywhere**: `App.tsx` keeps `<StatusBar hidden translucent />`; never re-show it in screens. Android forces dark + hidden bar via `app.json` `androidStatusBar.hidden` and the native theme (see `android/app/src/main/res/values/styles.xml` + `MainActivity.kt` — prebuild-generated, so persist config in `app.json`).
- **Android signing keys**: Signing keys for debug and release builds are stored in `credentials/` (tracked in Git) and are automatically copied to native `android/app/` during prebuild via the local config plugin `./plugins/withAndroidSigning.js`. This ensures identical signatures across all dev environments (Windows & macOS) so local updates do not trigger Android signature mismatch errors.
- **Ollama API**: Streaming via `XMLHttpRequest` (not fetch). Base URL and model user-configurable.
- **SQLite bridge bug**: Always use `db.ts` wrappers (`run`/`getAll`/`getFirst`). Never call `db.runAsync()` directly. This also applies to `src/lib/backupService.ts` (`exec` wrapper exists for parameter-less statements like PRAGMAs).
- **Backup rules**: Never export secrets (security PIN, PIN counters, AI API keys); the PIN is never restored. Every new DB table must be registered in `SCOPE_TABLES` in `backupService.ts`. Backups are plaintext ZIPs (portability, incl. the future Flutter port). Details: `.agents/instructions/backup-system.md`.
- **Crash-proof startup**: The app must never crash on launch regardless of stored user data. DB migrations are idempotent/self-healing (schema version via `PRAGMA user_version` + AsyncStorage `max`), `getDb()` resets on failure, `loadAllData()` degrades gracefully (`Promise.allSettled`), and row converters / `safeParse` results are shape-guarded. Details: `.agents/instructions/state-management.md`.
- **React Compiler active**: Don't add `useMemo`/`useCallback` where compiler handles it.
- **Masteries Rebranding**: All user-facing references (headers, modals, lists, settings) are rebranded as **Masteries** (or **Mastery**), whereas code-level imports, hooks (`usePillars`), repositories, and database schemas remain `pillar` and `pillars` to guarantee data integrity and bypass migration corruption.

## Domain Instructions
Critical per-domain rules live in `.agents/instructions/*.md`. Read the relevant file before editing that area.
- `state-management.md` — Split-context pattern, fresh-read, optimistic updates, crash-proof startup
- `animations.md` — SharedValue rules, feed transitions, haptics
- `ai-integration.md` — Singleton queue, streaming, retry logic
- `backup-system.md` — Backup format v2, scope mapping, verification gates, restore pipeline, secrets policy
- `theme-system.md` — Color mappings, naming conventions, liquid glass
- `security.md` — 3-tier biometric, auto-lock rules
- `typescript-rules.md` — Strict mode, version pinning, code quality

## Workflows

- `.agents/workflows/expo-build.md` — canonical Local Android Release Build (lint → test → commit/push → gradle APK). Registered in opencode as `/expo-build` (`.opencode/command/expo-build.md`). **Always run this workflow when the user asks for a build, "expo build", or an APK** — do not improvise a build.

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

### 7. Clean and Professional Animation Style (Mandatory)
Animations must always look clean, elegant, and professional rather than hyperactive or overly bouncy. Prefer timing-based transitions or highly-damped springs (using high damping-to-stiffness ratios) with modest scaling factors (e.g. 1.03x to 1.05x max). Avoid excessive playfulness or overshooting.

## Project Documentation Maintenance (Critical)

**AGENTS.md is the single source of truth.** You must proactively maintain it and reference the correct skill instructions when making changes:

- **Look for Fitting Skills First:** Before starting any task or writing code, scan the `.agents/skills/` directory or run skill searches to check if there is an existing skill that guides that implementation. Always follow the guidelines defined in active skills.
- **Incremental Updates:** Whenever you make architectural or logic changes that affect rules, patterns, or conventions, update `AGENTS.md` and related instruction files immediately in the same step. Do not defer documentation updates.
- **Common Triggers:**
  - Deprecate a pattern → remove or mark **DEPRECATED** in `AGENTS.md` + `.agents/instructions/*.md`
  - Introduce a pattern → add to `AGENTS.md` or the correct domain instruction file
  - Change a package version → update the Version Pinning table (if applicable)
  - Change AI integration → update `AGENTS.md` + `.agents/instructions/ai-integration.md`
  - Change state management → update `AGENTS.md` + `.agents/instructions/state-management.md`

**Verification before finishing any task:**
- **Final Documentation Check:** After all changes are completed, perform a final review check to verify if any of the modifications necessitate updates to `AGENTS.md` or `.agents/instructions/*.md`. Fix any stale, misleading, or contradictory instructions before declaring the task complete.
