# Domain Instruction: Backup System

## Scope
`src/lib/backupService.ts`, `src/lib/db.ts` (schema-version helpers), queue pause/resume hooks in `src/lib/aiQueue.ts` + `src/lib/compressionQueue.ts`, and the Backup & Import UI in `src/components/features/settings/SettingsModal.tsx`.

## Mission
A backup must be **verifiable, complete and portable**:

1. **No silent failures** — "Erfolgreich" is only shown after a post-zip integrity check passed. Every file that could not be included is listed in the result report with a reason.
2. **Perfect restore** — restoring a backup on another device must reproduce the exact same app state (notes, circles, Masteries, feed, settings, streak, vlogs). Media paths are rewritten to the target device during import (never reused from the source device).
3. **Security by omission** — backups are plaintext ZIPs (deliberate, for maximum portability incl. the future Flutter port). Therefore **no secrets ever enter a backup**: the security PIN, PIN attempt counters and AI API keys are always excluded.
4. **Forward compatibility** — backups created by a NEWER app version (higher `schemaVersion`) are rejected before any data is touched. Backups from OLDER versions are restored with column filtering against the current schema.

## Backup Format (backupVersion 2)

ZIP container layout:

```
backup_metadata.json   — JSON, single source of truth
vlogs/{basename}.mp4   — video files (kollisionsfrei, dedupe-prefix `${vlogId}_` bei Namensgleichheit)
thumbnails/{basename}  — thumbnail images (gleiche Dedupe-Regel)
```

`backup_metadata.json` schema:

```jsonc
{
  "backupVersion": 2,              // 1 = legacy format (no manifests, flat basenames)
  "schemaVersion": 6,              // db.ts migration level at export time
  "appVersion": "1.5.8",
  "createdAt": 1234567890,
  "scopes": ["settings", "notes", "masteries", "vlogs"],
  "sqlite": { "<table>": [ { row }, ... ] },        // only tables of selected scopes + system tables
  "asyncStorage": { "<key>": value },               // ONLY allowlist keys, never secrets
  "tableManifest": {
    "<table>": { "columns": ["id", "text", ...], "rowCount": 12 }
  },
  "fileManifest": {
    "vlogs": [ { "vlogId": "…", "entryPath": "vlogs/x.mp4", "kind": "video",
                 "sizeBytes": 123, "included": true, "reason": null } ],
    "thumbnails": [ { "vlogId": "…", "entryPath": "thumbnails/x.jpg", "kind": "thumbnail", ... } ]
  }
}
```

### Scope → table mapping

| Scope | Tables |
|---|---|
| `settings` | `settings` |
| `notes` | `notes`, `persons`, `feed_bookmarks`, `feed_comments` |
| `masteries` | `pillars`, `advice_cards`, `pillar_logs`, `pillar_versions` |
| `vlogs` | `vlogs` (+ video + thumbnail files) |
| *always* (system) | `ai_jobs`, `ai_logs` |

### Secrets (never exported, never restored)
- `settings` rows with keys `AI_OLLAMA_API_KEY`, `AI_NEURALWATT_API_KEY` (AI_STORAGE_KEYS)
- AsyncStorage keys: `@mda_security_pin`, `@mda_pin_attempt_count`, `@mda_pin_lockout_until`
- Queue runtime state (`AI_JOB_QUEUE`, `COMPRESSION_JOBS_QUEUE`, `PENDING_COMPRESSIONS`) and legacy `SAVED_*` keys

### AsyncStorage allowlist (everything else is excluded)
- `__DB_SCHEMA_VERSION__` (restore still forces the LOCAL current version afterwards)
- `FEATURE_FLAGS`

### Integrity model
- **Media files**: verified by entry SIZE (metadata JSON + re-open of the ZIP; SHA-256 would double the I/O of every video for negligible gain and is intentionally omitted).
- **Metadata**: verified by strict JSON parsing + shape guards + the manifest itself.
- **Post-export check**: ZIP is re-opened, every `included` entry must exist with a matching size, otherwise `verification: 'warn'` (still shared, but the report lists the defect).

## Restore pipeline (strict order)

1. Pick + `.zip` validation
2. Extract to temp (native unzip or single JSZip in-memory load — never re-read the file)
3. Parse + normalize metadata (v1 or v2), shape-guarded
4. **Schema gate**: `metadata.schemaVersion > current` → reject with clear message (BEFORE snapshot)
5. **Manifest gate**: every `included` entry must exist with matching size → else reject
6. **Free-space gate**: `getFreeDiskStorageAsync()` vs. manifest total (+10% margin)
7. `aiQueue.pause()` + `compressionQueue.pause()`
8. Snapshot for rollback (DB file via `closeDb()`, vlog + thumbnail dirs, full AsyncStorage pairs incl. PIN keys)
9. DB transaction: DELETE all current user tables, INSERT backup rows **column-filtered** against `PRAGMA table_info`
10. Rewrite `vlogs.file_path` / `thumbnail_path` to the target device paths (`documentDirectory/vlogs/<entryBasename>`, `documentDirectory/vlog_thumbnails/<entryBasename>`)
11. AsyncStorage: `clearAll()` → write backup allowlist → **re-apply local PIN keys from snapshot** (PIN never travels) → force local `__DB_SCHEMA_VERSION__`
12. Restore media files (per-file error → warning list, never abort)
13. On any error: full rollback (DB file, dirs, AsyncStorage incl. PIN)
14. `finally`: `aiQueue.resume()` + `compressionQueue.resume()`

## Rules
- **Never call `db.*Async` directly in backupService** — use the `db.ts` wrappers (`getAll`, `run`, `exec`, `getFirst`, `getCurrentSchemaVersion`, `closeDb`).
- Every new table added in `db.ts` migrations must be registered in `SCOPE_TABLES` (or the `system` set) or it will be silently missing from backups.
- Every new secret stored in AsyncStorage or the `settings` table must be added to the exclusion lists at the top of `backupService.ts`.
- `backupVersion` bumps only when the on-disk ZIP layout or the metadata schema changes in a breaking way. Additive fields are fine within a major version.
