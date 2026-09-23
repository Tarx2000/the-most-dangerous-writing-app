# Domain Instruction: Security & Biometric Authentication (Flutter)

## Scope
`mda_flutter/lib/domain/use_cases/security_controller.dart`, `mda_flutter/lib/ui/core/widgets/security_boundary.dart`, `mda_flutter/lib/ui/core/widgets/pin_pad.dart`, and biometric authentication via `local_auth`.

## Architecture & Boundaries
- **`SecurityBoundary`**: High-level widget wrapping the navigator. Owns lifecycle events (app pause/resume), inactivity timers, and background grace periods.
- **Global PIN Layer**: Rendered above the router so unauthenticated navigation is strictly prohibited. The back dispatcher cancels pending authentication before delegating to underlying routes.
- **Secure Key Storage**: PIN hashes, attempt counters, and lockout timestamps are stored exclusively in `flutter_secure_storage` (with `android:allowBackup="false"` in `AndroidManifest.xml`). They are NEVER saved to `SharedPreferences` or SQLite.

## 3-Tier Security Model
| Tier | Access Level | Description |
|---|---|---|
| **0** | Locked | Complete lockout; PIN / Biometric prompt required |
| **1** | Circles Visible | Circles list accessible |
| **1.5** | Profile Visible | Circle profiles accessible |
| **2** | Full Access | All notes, journal feed, vlogs, and masteries unlocked |

## Invariants & Edge Cases
1. **Lifecycle Immunity during Biometrics**: When the native Android biometric prompt opens, it pauses the Flutter app lifecycle. `SecurityBoundary` must recognize that this lifecycle pause was triggered by authentication and must NOT invalidate or re-lock the session.
2. **Manual Lock Precedence**: Manual lock immediately wipes current unlock tokens and invalidates any in-flight biometric or PIN verification.
3. **Lockout Protection**: 3 incorrect PIN entries trigger a 30-second lockout (`PIN_LOCKOUT_DURATION_MS = 30_000`).
4. **Backup Exclusion**: PIN material and attempt counters are strictly excluded from backups. A restore never overwrites or restores PIN state.
