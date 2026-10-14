# Domain Instruction: State Management (Flutter / Riverpod)

## Scope
Any file in `mda_flutter/lib/data/providers.dart`, `mda_flutter/lib/data/database/`, `mda_flutter/lib/data/services/`, or code interacting with Riverpod providers.

## Riverpod Architecture (Mandatory)
- Use **Riverpod 2** (`flutter_riverpod`) for all application state.
- **DO NOT** use monolithic state updates or trigger full tree rebuilds.
- **ALWAYS** use domain-specific providers/notifiers:
  - `storageProvider` / `appDataProvider` for central state snapshot.
  - Dedicated domain selectors / providers: `notesProvider`, `personsProvider`, `streakProvider`, `preferencesProvider`, `aiConfigProvider`, `feedProvider`, `vlogsProvider`, `pillarsProvider`.
- Use `ConsumerWidget` or `Consumer` with fine-grained `ref.watch(provider.select(...))` to rebuild only the widgets that actually depend on changed fields.
- Never use `setState` for global or shared application state. Keep `StatefulWidget` strictly for local UI-only animations or text controllers.

## Fresh-Read & Async Handling
- In asynchronous callbacks or handlers, avoid reading stale provider snapshots.
- Read live state directly via `ref.read(...)` or verify state before committing mutations:
```dart
// RIGHT — live read inside async handler
final currentNotes = ref.read(appDataProvider).notes;
await ref.read(appDataProvider.notifier).saveNote(newNote);
```

## Optimistic Updates & Failure Rollback
- CRUD operations in repositories and notifiers should update in-memory state promptly, but gracefully roll back if SQLite/disk persistence fails:
```dart
final previousNotes = state.notes;
state = state.copyWith(notes: [newNote, ...state.notes]);
try {
  await notesRepository.insertNote(newNote);
} catch (e) {
  state = state.copyWith(notes: previousNotes); // Rollback
  rethrow;
}
```

## Data Integrity Rules
- **Shared Helpers**: Use canonical helpers in `mda_flutter/lib/domain/use_cases/` for calculations (e.g. `countWords(text)`, `isStreakEligible(note)`, `mastery_logic.dart`). Never hand-roll word counting (`split(RegExp(r'\s+'))`) or streak calculation in ad-hoc widgets.
- **`saveNote`**: The database insert is the single source of truth. If the note insert succeeds, never roll back the note in state; streak calculations are secondary writes with their own error guards.
- **`deleteVlog`**: Always delete the database row FIRST, only then delete the video file from disk (never reverse; an unexpected DB crash would otherwise orphan the file).
- **`clearAllData`**: Must reset SQLite databases, clear `SharedPreferences`, reset `flutter_secure_storage`, and shut down AI & video compression queues to ensure a clean factory reset.
- **Destructive Deletes**: Deletions (notes, masteries, circles, reflections) must always prompt the user with a confirmation dialog before executing.
- **Double-Tap Guards**: Guard persistence triggers (e.g. `isSaving` flags) against double submissions; subsequent taps while saving must be no-ops.

## Crash-Proof Startup (Mandatory)
The app must **never crash on launch**, regardless of corrupted stored data, legacy database rows, or missing preferences.

1. **Dual-Track Idempotent Migrations** (`mda_flutter/lib/data/database/db.dart`):
   - Schema version is tracked in BOTH the SQLite database (`PRAGMA user_version`) AND `SharedPreferences`.
   - The effective schema version is `max(both)`.
   - Migration statements are idempotent (e.g. `ALTER TABLE ... ADD COLUMN` errors such as "duplicate column name" are caught and safely ignored).
2. **Auto-Recovery on Database Failure**:
   - If database initialization encounters unrecoverable corruption, log the event, attempt database reset/recreation, and fallback to safe defaults.
3. **Independent Domain Load Degradation**:
   - `loadAllData()` loads domains independently. A failure in one repository (e.g. corrupt vlog thumbnail path) must never prevent notes or preferences from loading.
4. **Shape-Guarded Parsing**:
   - All JSON and SQLite row deserializations must be null-safe and type-guarded with defaults (`row['col'] as String? ?? ''`). A single malformed row must never crash the entire list reader.
5. **Background Queues Safety**:
   - `AiQueue` and `CompressionQueue` singletons must catch initialization errors gracefully so a corrupted queue payload never bricks startup.
