# Domain Instruction: Security & Biometric Authentication

## Scope
`src/lib/hooks/useSecurity.ts`, `SecurityProvider` wrapping the app root, any lock/unlock screen, or sensitive data access.

## Architecture
- `SecurityProvider` (Context Provider): Manages the global biometric & PIN state, inactivity timers, and background grace period. Located at the root of the app.
- `useSecurity` (Hook): Context consumer hook used by screens (Start, Library, Feed, etc.) to share the unified unlock state.

## 3-Tier Biometric Lock
The app uses a graduated security model:

| Stage | Access Level | Unlock Method |
|---|---|---|
| 0 | Locked | No access |
| 1 | Circles visible | Biometric or passcode (circles list only) |
| 1.5 | Profile visible | Biometric or passcode (circle profiles) |
| 2 | Full access | Biometric or passcode (notes, feed, all data) |

## Auto-Lock Rules
- **Idle timeout**: 3 minutes of inactivity (configurable via `timeoutMins`, where 0 = lock on background only)
- **Background grace period**: 30 seconds — brief interruptions (messages, camera switch) don't require re-auth
- **Immediate lock**: On `inactive` state (Control Center, notification overlay, task switcher)

## Backup Security Policy (see `backup-system.md`)
- The security PIN, its attempt counter and lockout timer are **never exported** into a backup (plaintext ZIPs stay portable, incl. the future Flutter port).
- A restore **never overwrites** local PIN state — after `storage.clearAll()` the PIN keys are re-applied from the local snapshot, so the device keeps its own PIN ("PIN bleibt immer lokal"). On a fresh device the user simply sets a new PIN.
- The AI API keys (Ollama/Neuralwatt) are stripped from the `settings`-table dump on export; they are never restored from a backup.
- Backup integrity is verified before any data is touched: schema-version gate, manifest gate (entry sizes), free-space gate; rollback snapshots restore DB, dirs and AsyncStorage (incl. PIN) on failure.

## Implementation Notes
- Use `expo-local-authentication` for biometric checks
- Fallback to device passcode/PIN when biometrics unavailable
- Store no sensitive data in plain AsyncStorage — use the storage adapter layer
- When editing lock screen transitions, ensure `feedProgress` SharedValue properly drives the dismiss gesture (follow-finger, then snap to 0 or 1)
