# Domain Instruction: State Management

## Scope
Any file in `src/hooks/useStorage.tsx`, `src/lib/storage.ts`, or any code creating/modifying React Contexts.

## Split-Context Pattern (Mandatory)
- **DO NOT** use the legacy `useStorage()` hook. It subscribes to ALL 8 contexts and causes mass re-renders.
- **ALWAYS** use domain-specific hooks: `useNotes`, `usePersons`, `useStreak`, `usePreferences`, `useAiConfig`, `useFeedData`, `useVlogs`, `useStorageActions`.
- Each domain context has its own provider in `useStorage.tsx`.

## Fresh-Read Pattern (Mandatory)
Every state variable must have a corresponding ref to eliminate stale closures.

```typescript
// WRONG — stale closure risk
const [notes, setNotes] = useState<Note[]>([]);

// RIGHT — ref mirrors state
const [notes, setNotes] = useState<Note[]>([]);
const notesRef = useRef<Note[]>([]);
notesRef.current = notes; // set on every render

// When updating in an async handler:
setNotes(newNotes);
notesRef.current = newNotes; // BOTH must be updated
```

## Optimistic Updates with Rollback
All CRUD operations must snapshot state before writing, then restore on AsyncStorage failure.

```typescript
const previous = notesRef.current;
setNotes(updated);
try {
  await storage.setItem(KEY, JSON.stringify(updated));
} catch (err) {
  setNotes(previous); // Rollback on failure
}
```

## Adding a New Context Domain
1. Define context type in `useStorage.tsx`
2. Add state, refs, and operations in `StorageProvider`
3. Add provider to the provider tree
4. Create and export domain-specific hook
5. **Never** add state to the legacy `useStorage` monolith

## Compression Queue Provider
`CompressionQueueProvider` (`src/lib/hooks/useCompressionQueueProvider.tsx`) is a standalone context provider (not part of useStorage). It wraps `compressionQueue` singleton and auto-initializes with the latest `updateVlog` callback from `useVlogs()`. Use `useCompressionQueueContext()` to access state and actions.

## Data Integrity Rules
- **Shared single-source helpers in `src/lib/utils.ts`**: use `countWords(text)` and `isStreakEligible(note)` everywhere. Never hand-roll `text.trim().split(/\s+/)` or the streak-won predicate — they must stay identical across save-time and boot-recalc (they previously drifted).
- **`saveNote`**: the SQLite `insertNote` is the single source of truth for the UI. If the insert succeeds, NEVER roll back the note in state (a ghost-note desync); streak settings are best-effort secondary writes with their own try/catch.
- **`deleteVlog`**: delete the DB row FIRST, only then delete the video file — never the reverse (a failed DB delete would otherwise orphan the file).
- **`clearAllData`**: must also `storage.clearAll()` (AsyncStorage) and shut down the AI/compression queue singletons, so "clear all" is a real factory reset.
- **Destructive deletes** (pillar/mastery, advice card, notes) require a confirmation dialog, and deletes must never fire as side effects inside a `setState` updater (StrictMode double-invokes them in dev).
- **Single pending async operation per action**: guard buttons that persist data (e.g. `isSavingRef` in WritingScreen) against double-submit; a second tap must be a no-op.

## Crash-Proof Startup (Mandatory)
The app must **never crash on launch**, regardless of stored user data (legacy/corrupt SQLite rows, stale schema versions, malformed AsyncStorage JSON).

- **Migrations are idempotent + self-healing** (`src/lib/db.ts`): the schema version is tracked in BOTH the DB file (`PRAGMA user_version`) AND AsyncStorage; the effective version is `max(both)`. `ALTER TABLE ... ADD COLUMN` errors like "duplicate column name" are treated as already-applied (skipped), and a failed migration is logged and continued — it must never reject `getDb()`.
- **`getDb()` resets its cached promise on failure** so a later call can retry. A permanently-rejected promise would brick every future DB query for the session.
- **Domain loads degrade independently**: `loadAllData` uses `Promise.allSettled` + per-domain `try/catch` and defaults to empty fallbacks. One corrupt table or row can never abort the whole boot.
- **Shape-guard all `safeParse` results at the load boundary**: arrays must stay arrays, objects must stay objects (e.g. `BOOKMARKED_NOTE_IDS`, `FEED_COMMENTS`, `STREAK_HISTORY`) so UI consumers can rely on typed defaults instead of throwing (`new Set(nonIterable)`, `Object.keys(null)`).
- **Row converters (`rowToX`) must guard raw nullable columns**: a single malformed/legacy row must never reject the whole repository `.map()` (see `vlogsRepository.rowToVlog` guarding `file_path`).
- **Queue providers (AI / Compression) must `.catch()` their auto-init**: a corrupt persisted queue must never produce an unhandled rejection at startup.

## De-coupling Context Subscriptions
To avoid mass context re-renders:
- **DO NOT** subscribe to high-frequency or multi-domain storage hooks in root screen containers purely to forward props to modals.
- **ALWAYS** split modals into a lightweight wrapper (that does not subscribe to hooks) and a content component (that reads hooks directly). Keep the content component conditionally rendered or lazy.

## React 19 `<Activity>` Tab Caching
- **ALWAYS** cache navigation views and tabs that require heavy database fetching or layout calculations using React 19's `<Activity>` component.
- Wrap each tab in a standalone, memoized component and use `<Activity mode={visible ? 'visible' : 'hidden'}>` to freeze state and layout of hidden tabs, paired with `{ display: visible ? 'flex' : 'none' }` on the container view to hide layout.
