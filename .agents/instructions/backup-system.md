# Domain Instruction: Backup System (Flutter)

## Scope
`mda_flutter/lib/data/services/backup_service.dart`, `mda_flutter/lib/data/database/db.dart`, `mda_flutter/lib/data/queues/`, and the Backup/Restore UI in Settings.

## Mission
Backups must be **verifiable, complete, and portable**:
1. **Zero UI Blocking**: All ZIP operations, archive decoding, JSON encoding/decoding, and thumbnail processing MUST run off the UI thread inside Dart isolates (`compute`).
2. **Deterministic Restore**: Restoring an archive on any device must reproduce the complete app state (notes, circles, masteries, feed, settings, streak, vlogs). All file paths (`file_path`, `thumbnail_path`) are dynamically rewritten to the target device's sandbox directories.
3. **Security by Omission**: Backups are standard plaintext ZIPs for maximum platform portability. **No secrets ever enter a backup**:
   - `flutter_secure_storage` keys (PIN, PIN attempt counters, lockouts) are completely excluded.
   - AI API keys (`AI_OLLAMA_API_KEY`, `AI_NEURALWATT_API_KEY`) are stripped from exported settings.
   - The security PIN is NEVER restored or overwritten by an import.
4. **Backward & Forward Compatibility**:
   - Backups created by a newer app version (`metadata.schemaVersion > current`) are rejected before any data is modified.
   - Backups from older versions are restored with column filtering against the active table schema (`PRAGMA table_info`).

## Backup Container Layout (backupVersion 2)
```
backup_metadata.json   — Single source of truth metadata
vlogs/{basename}.mp4   — Video journal recordings
thumbnails/{basename}  — Generated thumbnail images
```

### Table Scope Mapping
- **Settings**: `settings` (excluding secret keys)
- **Notes**: `notes`, `persons`, `feed_bookmarks`, `feed_comments`
- **Masteries**: `pillars`, `advice_cards`, `pillar_logs`, `pillar_versions` (the SQLite table remains `pillars` for backward compatibility)
- **Vlogs**: `vlogs` (+ video files and thumbnail images)
- **System**: `ai_jobs`, `ai_logs`

## Restore Pipeline (Strict Sequence)
1. **Pick & Validate**: Validate file extension `.zip` and basic ZIP magic header.
2. **Isolate Extraction**: Extract and parse `backup_metadata.json` off the UI thread.
3. **Schema Gate**: Check `schemaVersion <= currentSchemaVersion`; reject with user-friendly error if newer.
4. **Manifest & Space Gate**: Verify media file counts and available disk space.
5. **Drain Queues**: Await `aiQueue.pauseAndDrain()` and `compressionQueue.pauseAndDrain()`.
6. **Snapshot / Staging**: Stage incoming files and hold current state for atomic rollback if an error occurs.
7. **Database Transaction**: Clear scoped tables, insert backup rows with column filtering.
8. **Path Rewriting**: Rewrite all local media paths in `vlogs` to the current device's application documents directory.
9. **Settings & Preferences**: Restore allowed preferences, re-apply local security PIN from snapshot (PIN never travels).
10. **Resume**: Reinitialize and resume AI and compression queues in `finally`.
