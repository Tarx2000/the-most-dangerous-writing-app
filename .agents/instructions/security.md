# Domain Instruction: Security & Biometric Authentication

## Scope
`src/hooks/useSecurity.ts`, any lock/unlock screen, or sensitive data access.

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

## Implementation Notes
- Use `expo-local-authentication` for biometric checks
- Fallback to device passcode/PIN when biometrics unavailable
- Store no sensitive data in plain AsyncStorage — use the storage adapter layer
- When editing lock screen transitions, ensure `feedProgress` SharedValue properly drives the dismiss gesture (follow-finger, then snap to 0 or 1)
