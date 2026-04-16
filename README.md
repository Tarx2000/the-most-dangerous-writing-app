# The Most Dangerous Writing App

A React Native journaling app where if you stop typing, your text is destroyed. Built with Expo SDK 55, React 19, and Reanimated 4.

## Features

- **Timed Writing Sessions** — Write for 3–60 minutes; stop typing and your text fades away
- **Difficulty Modes** — Easy (12s), Mid (8s), Hard (5s) idle limits
- **Quick Notes** — No timer, no death — just write
- **AI Titles & Summaries** — Auto-generated via Ollama Cloud (Kimi K2.5, Qwen 3.5, etc.)
- **Circles** — Link journal entries to people in your life
- **Vlog Recording** — Front-camera video journals with calendar gallery
- **Vision Board** — Four life areas (Health, Career, Relationships, Mindset)
- **Alignment Check-ins** — Weekly reflection with 1–10 score slider
- **Biometric Security** — 3-tier unlock (locked → circles → full access)
- **Streak Tracking** — Calendar-based streak visualization
- **Social Feed** — Timeline of all entries with bookmarks and comments

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- Android Studio or Xcode for device/simulator

### Install & Run

```bash
npm install
npm start           # Start Expo dev server
npm run android     # Run on Android
npm run ios         # Run on iOS
```

### Run Tests

```bash
npm test
```

> **Note:** The test suite uses a custom Jest config that bypasses the Expo SDK 55 `import.meta` issue. Tests currently cover `utils`, `aiService`, and `aiQueue` modules. See [expo/expo#35219](https://github.com/expo/expo/issues/35219) for the upstream Jest compatibility issue.

## Architecture

```
src/
  config/          — App constants, AI config, prompts
  types/           — TypeScript interfaces (SavedNote, Person, SavedVlog, etc.)
  lib/
    aiService.ts   — XHR streaming client for Ollama Cloud
    aiQueue.ts     — Singleton AI job queue with retry & persistence
    aiLogger.ts    — Structured AI operation log
    storageManager.ts — Vlog storage tracking & orphan cleanup
    utils.ts       — generateId() helper
    hooks/
      useStorage.tsx    — 8 domain contexts (Notes, Persons, Streak, Preferences, AiConfig, Feed, Vlogs, StorageActions)
      useSession.ts     — Writing session timer + idle-death logic
      useSecurity.ts    — 3-tier biometric security
      useAiQueueProvider.tsx — Single-instance AI queue context
      useThumbnails.ts  — Lazy video thumbnail extraction
  screens/         — 8 screens (Home, Start, Writing, PostWriting, Library, Feed, VisionBoard, AlignmentWriting, VlogRecording)
  components/
    ui/             — Reusable UI components (ErrorBoundary, LiquidGlassNav, TickDial, etc.)
    features/       — Domain components (writing, library, feed, alignment, settings)
  styles/          — Theme tokens & shared styles
```

### State Management

State is split into 8 domain-specific React Contexts to minimize re-renders:

| Context | Hook | Purpose |
|---------|------|---------|
| NotesContext | `useNotes()` | Note CRUD + AI metadata |
| PersonsContext | `usePersons()` | Circle people CRUD |
| StreakContext | `useStreak()` | Streak tracking |
| PreferencesContext | `usePreferences()` | Font, size, biometrics, dev mode |
| AiConfigContext | `useAiConfig()` | AI API key, model, prompts |
| FeedContext | `useFeedData()` | Bookmarks, comments, auto-play |
| VlogContext | `useVlogs()` | Vlog CRUD + storage tracking |
| StorageActionsContext | `useStorageActions()` | clearAllData, saveAlignmentReflection |

**Always use the specific hook** (e.g., `useNotes()`) instead of `useStorage()` which subscribes to all 8 contexts and causes unnecessary re-renders.

### AI Pipeline

1. User saves a note → AI Queue enqueues it
2. Queue processes sequentially with rate limiting (500ms between jobs)
3. Failed jobs retry up to 2 times with exponential backoff
4. Results (title, summary) are written back to the note
5. Health checks run in the background; processing pauses when offline

### Error Handling

Each screen is wrapped with `ErrorBoundary` (via `withErrorBoundary` HOC) so one screen crashing doesn't take down the entire app. A root `ErrorBoundary` wraps the navigation tree as a last resort.

## Configuration

### AI Models

Default: `kimi-k2.5:cloud` on Ollama Cloud. Available models are defined in `src/config/ai.ts` and can be changed at runtime in Settings.

### Writing Session

Session durations, difficulty limits, and font options are in `src/config/index.ts`.

## License

Private — not yet licensed for public distribution.