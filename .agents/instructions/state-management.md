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
## De-coupling Context Subscriptions
To avoid mass context re-renders:
- **DO NOT** subscribe to high-frequency or multi-domain storage hooks in root screen containers purely to forward props to modals.
- **ALWAYS** split modals into a lightweight wrapper (that does not subscribe to hooks) and a content component (that reads hooks directly). Keep the content component conditionally rendered or lazy.

## React 19 `<Activity>` Tab Caching
- **ALWAYS** cache navigation views and tabs that require heavy database fetching or layout calculations using React 19's `<Activity>` component.
- Wrap each tab in a standalone, memoized component and use `<Activity mode={visible ? 'visible' : 'hidden'}>` to freeze state and layout of hidden tabs, paired with `{ display: visible ? 'flex' : 'none' }` on the container view to hide layout.
