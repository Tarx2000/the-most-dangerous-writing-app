# mda_flutter — Flutter Rewrite of The Most Dangerous Writing App

Flutter (Dart 3.12, Flutter 3.44) rewrite of the Expo/React Native app. **The behavioral contract is
`SPEC_1TO1.md`** — every number, color, threshold, prompt and flow must match it. When in doubt, the
RN codebase at `mda_rn/` wins; update `SPEC_1TO1.md` and port the behavior.

## Tech Stack
- Riverpod 2 (`flutter_riverpod`) for state — Notifier/Provider per domain (maps 1:1 to the old split-contexts)
- go_router for navigation (custom transitions for transparent-modal screens, Hero for button morphs)
- sqflite for SQLite (`mda_v2.db`, schema v6, **dual-track versioning** via `PRAGMA user_version` + SharedPreferences marker)
- flutter_secure_storage for PIN/attempt counters (never in backups; `allowBackup=false` in AndroidManifest)
- http (StreamedResponse + SSE line parser) for AI streaming (XHR-equivalent)
- camera / video_player / video_thumbnail / video_compress / wakelock_plus for vlogs
- gal / share_plus / file_picker / archive for backup + media
- local_auth for biometrics, vibration for patterns, material_design_icons_flutter for MDI icons
- 8 Google fonts bundled as TTFs in `assets/fonts/`

## Architecture (per flutter-apply-architecture-best-practices + flutter-expert skills)
```
lib/
├── main.dart / app.dart
├── core/          # theme (AppColors 1:1 tokens), haptics, logger, perf, utils
├── data/
│   ├── database/  # db.dart (sqflite wrapper), migrations, repositories
│   ├── models/    # immutable domain models
│   ├── services/  # ai_service, backup_service, compression, storage, settings
│   └── queues/    # ai_queue, compression_queue (singleton managers)
├── domain/        # use_cases: session_engine, streak, alignment_scores, smart_advice
└── ui/
    ├── core/widgets/   # LiquidGlassNav, BaseModal, PinPad, TickDial, MorphIcon…
    └── features/       # home, writing, post_writing, library, circles, feed,
                        # pillars, alignment, vlogs, settings, sandbox
```

## Rules
- **Read the skills first**: `flutter-expert`, `flutter-apply-architecture-best-practices`,
  `flutter-build-responsive-layout` (in repo root `.agents/skills/`) guide all Flutter work.
- `const` constructors everywhere possible; `ConsumerWidget`/`Consumer` for state, not `setState` for app state.
- Never block the UI thread (isolates/`compute` for ZIP, JSON, thumbnails).
- Animations: damping 26–35 springs only, max 3 visual layers, scales ≤ 1.05, timing-based micro-interactions (see SPEC §5).
- No blur/liquid glass anywhere — solid translucent tokens only.
- Status bar hidden everywhere (`SystemChrome` + Android styles.xml); portrait only; AMOLED black.
- Every DB table registered in backup scopes; secrets never exported; PIN never restored.
- Schema/behavior changes → update `SPEC_1TO1.md` + this file in the same step.

## Commands
- `flutter analyze` — must be clean before committing
- `flutter test --concurrency=1` — run after each feature; keep the suite green
  (testWidgets must NEVER do real DB I/O — FakeAsync blocks on sqlite
  isolates; override `appDataProvider` with a fake `StorageNotifier` instead)
- `flutter build apk --release --no-tree-shake-icons --split-per-abi` —
  canonical release build (runtime `Mdi.get()` IconData prevents tree-shaking
  — parity with the RN app which bundles the full MDI font)
- `flutter run` / `flutter run --profile` (DevTools profiling)

## Android Emulator (Android Studio)
- **Open `mda_flutter/` itself in Android Studio** (NOT the monorepo root — the root
  `.idea/` belongs to the RN app and shows no Flutter run configs).
- Run config `main.dart` already exists (`.idea/runConfigurations/main_dart.xml`);
  pick the AVD "Samsung_Galaxy_S24_Ultra" and press Run.
- **If the emulator shows "device offline" / hangs**: the AVD snapshot is corrupt
  (created under a different GPU renderer). Fix: kill the emulator, delete
  `~/.android/avd/Samsung_Galaxy_S24_Ultra.avd/snapshots/`, keep `hw.gpu.mode=host`
  in `config.ini` (already set), restart the AVD (cold boot).
- Verified: debug build installs + runs on the AVD (API 36, arm64) without crashes.

## Agent Self-Driving (Marionette MCP + official Flutter MCP)
- **Debug harness**: `lib/marionette_harness.dart` installs `MarionetteBinding`
  (debug-only, `kDebugMode && !FLUTTER_TEST` gate in `main.dart` — zero release
  impact) plus four test extensions: `mdaTest.backupState`, `mdaTest.seedNote`,
  `mdaTest.exportBackup`, `mdaTest.importBackup`. They run the REAL
  `StorageNotifier` export/import pipeline and skip only the native file
  picker + PIN/biometric prompt (agents cannot operate those).
- **Loop (no human needed)**: `flutter run` → copy the VM service URI →
  `marionette --uri <ws-uri> get-interactive-elements` / `tap` /
  `take-screenshots` / `get-logs` (CLI: `~/.pub-cache/bin/marionette`), or
  the same tools via the `marionette` MCP server. The backup round-trip
  (`seedNote → exportBackup → importBackup → backupState`) verifies import
  restores data autonomously — asserts counts, never asks the user.
- **Logs**: app logger mirrors into `get_logs` via `debugLogSink`
  (`lib/core/logger.dart`). `get_logs` is empty until a hot restart if the
  harness was attached earlier in the session.
- **opencode MCP config** (`~/.config/opencode/opencode.jsonc`): `dart_flutter`
  (`dart mcp-server`, dev-time tools) + `marionette` (`marionette_mcp`,
  runtime driving). The Reddit `flutterdevagents` project is not a findable
  repo/package — this is the maintained equivalent.
- **Rules**: `main.dart` is the only production entrypoint that initializes
  the binding (single-binding rule — tests use their own test binding).
  Never gate behavior on Marionette in release code; never read/write PIN
  material in extensions (PIN is never exported/restored, SPEC §13).

## Port Repair Invariants
- Track verification and outstanding parity work in `PORT_AUDIT.md`; do not label
  the port complete based only on compilation or widget tests.
- Home feed visibility is committed gesture state, separate from animation
  progress. Cache expensive screen children; drag frames update transforms only.
- Feed video playback requires viewport intersection, foreground/current route,
  autoplay preference, and reveal progress >= 0.95. Cached list children are not
  evidence of visibility. Compare controller identity after async initialization.
- Present dismissible sheets/readers as Navigator routes, not bare OverlayEntry
  objects. The global PIN remains above the router; its Back dispatcher cancels
  authentication before delegating to the underlying route.
- SecurityBoundary owns app lifecycle/activity. All unlock tiers authenticate;
  manual lock invalidates pending authentication results. Native biometric UI
  lifecycle events must not invalidate the authentication that opened it.
- Before restore, await both queues' `pauseAndDrain()` (active jobs and pending
  persistence). Then restore/reload, reinitialize queues, and resume in `finally`.
- Validate backup metadata/table shapes before replacement. Stage media separately,
  preserve rollback copies until successful commit, and strip secrets on import
  as well as export. ZIP/media work belongs off the UI isolate.
- Check-in logging and optional reflections are separate phases. Capture the
  entry rate-limit decision before saving this check-in's own logs. Reflections
  use SessionEngine typing/idle/wipe callbacks, and stop timers on save/exit.
- Native short haptics use HapticFeedback, throttled to avoid pointer-event bursts;
  longer warning patterns use vibration. Disabling haptics cancels active patterns.
- A compression timeout marks failure but must not start overlapping native jobs.
  Ignore late progress, discard late output, and drain watchdog writes before restore.
- AI stream chunks refresh stall detection. Cancelled requests must not overwrite
  newer watchdog state. Queue UI observes state changes (including an initial
  buffered snapshot); saved-entry readers observe the current note, not a stale
  constructor snapshot. Generate/retry actions must enqueue real work.
- Completed check-ins persist LAST_REFLECTION_DATE, independently of pillar-log
  rate limiting; weekly advice-only sessions also count for the reminder dot.
