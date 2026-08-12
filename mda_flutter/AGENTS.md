# mda_flutter — Flutter Rewrite of The Most Dangerous Writing App

Flutter (Dart 3.12, Flutter 3.44) rewrite of the Expo/React Native app. **The behavioral contract is
`SPEC_1TO1.md`** — every number, color, threshold, prompt and flow must match it. When in doubt, the
RN codebase at the repo root wins; update `SPEC_1TO1.md` and port the behavior.

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
