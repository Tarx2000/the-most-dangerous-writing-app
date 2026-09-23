# The Most Dangerous Writing App — Monorepo Agent Context

Monorepo containing the journaling app where stopping typing destroys your text (social circles, vlog recording, growth masteries, alignment check-ins, and AI-powered title/summary generation):

| Folder | Implementation | Role | Status |
|---|---|---|---|
| `mda_flutter/` | Flutter (Dart 3.12, Flutter 3.44) | **The App & Single Source of Truth** | **Active** — built, tested, installed, and used |
| `mda_rn/` | React Native (Expo SDK 55) | Legacy Behavioral Reference (Read-Only) | **Retired** — never edit, never build, never install |

> [!IMPORTANT]
> **Flutter (`mda_flutter/`) is the single source of truth.** All active development, bug fixes, features, tests, and builds happen exclusively in `mda_flutter/`.
> The React Native codebase (`mda_rn/`) is retired and frozen; it is kept solely as an optional read-only reference for feature inspiration. **Never run commands inside `mda_rn/` and never edit files in `mda_rn/`.**

---

## Tech Stack (`mda_flutter/`)
- **Framework & Language**: Flutter 3.44 + Dart 3.12
- **State Management**: Riverpod 2 (`flutter_riverpod`) with domain-specific `Notifier` and `StateNotifierProvider` architecture
- **Navigation**: `go_router` (custom transitions, transparent modal routes, Hero animations)
- **Local Database**: `sqflite` (`mda_v2.db`, schema v6) with **dual-track versioning** (`PRAGMA user_version` + `SharedPreferences`)
- **Secure Storage**: `flutter_secure_storage` for PIN hashes and attempt counters (`android:allowBackup="false"`)
- **AI Streaming**: `http` (`StreamedResponse` + SSE line parsing) supporting Ollama Cloud, Neuralwatt, and OpenAI-compatible providers
- **Media & Vlogs**: `camera`, `video_player`, `video_thumbnail`, `video_compress`, `wakelock_plus`
- **Backup & Files**: `archive`, `gal`, `share_plus`, `file_picker`, `path_provider` (processed off the UI thread via Dart isolates)
- **Visuals & Motion**: `liquid_glass_easy: ^4.3.1` (GLSL fragment shaders) with solid token fallback, `material_design_icons_flutter` (MDI glyphs), 8 bundled Google fonts

---

## Architecture (`mda_flutter/lib/`)
```
lib/
├── main.dart / app.dart
├── core/          # theme (AppColors AMOLED tokens), haptics, logger, perf, utils
├── data/
│   ├── database/  # db.dart (sqflite wrapper), migrations, repositories
│   ├── models/    # immutable domain models (copyWith, serialization)
│   ├── services/  # ai_service, backup_service, compression, storage, settings
│   └── queues/    # ai_queue, compression_queue (singleton background managers)
├── domain/        # use_cases: session_engine, streak_calculator, security_controller, mastery_logic
└── ui/
    ├── core/widgets/   # LiquidGlassNav, BaseModal, PinPad, TickDial, SecurityBoundary, MorphIcon
    └── features/       # home, writing, post_writing, library, circles, feed,
                        # pillars (masteries), alignment, vlogs, settings, sandbox
```

---

## Core Product Invariants & Non-Negotiable Constraints

1. **Pure AMOLED Black (`#000000`)**:
   - Screen background is strictly pure black (`AppColors.background`).
   - Surfaces use elevation ladder tokens (`surfaceDark`, `surfaceRaised`, `surfaceCard`). Never substitute dark gray for the root canvas.
2. **Liquid Glass Standard with Solid Fallback**:
   - Liquid glass via `liquid_glass_easy` / custom GLSL shaders is standard for navigation bars (`LiquidGlassNav`), floating pills, and elevated dialogs.
   - **Mandatory Fallback**: Every liquid glass element must cleanly fall back to solid translucent tokens (`AppColors.overlayLockAndroid`, `glassBorder`) when disabled by the user or on unsupported devices.
   - Backgrounds behind glass remain pure black. Avoid stacking multiple real-time glass shaders over high-frequency scrolling feeds.
3. **Status Bar Permanently Hidden**:
   - Fullscreen immersive mode across all screens via `SystemChrome.setEnabledSystemUIMode(SystemUiMode.manual, overlays: [SystemUiOverlay.bottom])`.
   - The Android status bar (clock, battery, notifications) is permanently hidden. Nav bar is AMOLED black.
4. **Masteries Rebranding (UI vs. Schema)**:
   - All user-facing UI labels, headers, and domain logic are **Masteries** / **Mastery** (`mastery_logic.dart`, "New Mastery", "Edit Mastery").
   - Code-level database tables and repositories remain **`pillars`** (`pillars_repository.dart`, `CREATE TABLE pillars`) to preserve 100% backward compatibility with existing backup ZIP archives (`.zip`).
5. **3-Tier Biometrics & Security**:
   - Security tiers: `0` (Locked), `1` (Circles visible), `1.5` (Profile visible), `2` (Full access).
   - `SecurityBoundary` owns application lifecycle. Native biometric prompts pausing the app lifecycle must never invalidate authentication.
   - PIN material and attempt counters live exclusively in `flutter_secure_storage`.
6. **Backup Rules (Verifiable, Portable, Secret-Free)**:
   - Backups are standard plaintext ZIPs (`backup_metadata.json` + media files).
   - **Secrets are NEVER exported and NEVER restored**: PIN hashes and AI API keys are stripped.
   - Dual-track schema compatibility: Backups from newer schema versions are rejected; older backups are column-filtered.
7. **Crash-Proof Startup & Data Integrity**:
   - Dual-track schema migrations (`PRAGMA user_version` + `SharedPreferences` max). Migrations are idempotent and self-healing.
   - `loadAllData()` loads domains independently (`Future.wait` with per-domain try/catch); one corrupt row must never crash startup.
   - Deleting a vlog deletes the SQLite row first, then the video file from disk (never reverse).
   - Zero UI thread blocking: All archive compression, decompression, JSON parsing, and thumbnail processing run in Dart isolates (`compute`).

---

## Agent Self-Driving & Debug Harness (`marionette_flutter`)
- **Harness Entrypoint**: `lib/marionette_harness.dart` installs `MarionetteBinding` (debug-only, gated by `kDebugMode && !FLUTTER_TEST`). Zero impact on release builds.
- **Autonomous Test Extensions**:
  - `mdaTest.seedNote` — seeds test notes directly into state
  - `mdaTest.backupState` — returns live in-memory counts
  - `mdaTest.exportBackup` — runs the real `StorageNotifier` export pipeline
  - `mdaTest.importBackup` — verifies import and restores data autonomously
- **Driving the App**: Launch app with `flutter run`, retrieve the VM Service URI, and drive the interface using the `marionette` CLI or MCP tools.

---

## Canonical Commands & Workflows

| Action | Command | Rule |
|---|---|---|
| **Analyze** | `cd mda_flutter && flutter analyze` | Must exit with **0 issues** before committing |
| **Test Suite** | `cd mda_flutter && flutter test --concurrency=1` | Must pass **100% of tests** (widget tests must never do real DB I/O) |
| **Release Build** | `/flutter-build` | Registered workflow in `.agents/workflows/flutter-build.md` |
| **Manual Release Build** | `cd mda_flutter && flutter build apk --release --no-tree-shake-icons --split-per-abi` | Output: `mda_flutter/build/app/outputs/flutter-apk/app-arm64-v8a-release.apk` |

---

## Domain Instructions (`.agents/instructions/*.md`)
Detailed architectural guides live in `.agents/instructions/`:
- `state-management.md` — Riverpod 2 Notifiers, domain providers, optimistic updates, crash-proof boot
- `animations.md` — Liquid glass shaders, solid fallback, clean & professional motion, feed transitions
- `dart-rules.md` — Strict typing, `const` constructors, immutable domain models, zero-lint standards
- `backup-system.md` — V2 backup layout, isolate processing, secret stripping, restore sequence
- `security.md` — 3-tier biometrics, `SecurityBoundary`, `local_auth`, `flutter_secure_storage`
- `theme-system.md` — Pure AMOLED `#000000`, `AppColors` token ladder, Liquid Glass styling
- `ai-integration.md` — `AiQueue` & `CompressionQueue` singletons, SSE streaming, `AiError` classification

---

## Mandatory Agent Operating Rules

### 1. Code Must Be Well-Documented
Every chunk of code must have good, simple-to-understand documentation. Comments explain the **"why"**, not just the "what".

### 2. Documentation Must Stay Up to Date
Whenever documentation or comments no longer fit the code, **update or remove them immediately**. Outdated documentation is worse than no documentation.

### 3. Config Variables for Customization
Define important customizable values as config constants at the top of the file or in dedicated config files (`mda_flutter/lib/core/` or `lib/domain/`).

### 4. List Used Skills in Every Response
At the top of every answer, list which skills or instructions contributed to the response.
*Example:* `**Used skills:** \`flutter-expert\`, \`.agents/instructions/animations.md\``

### 5. Explain Difficult Tech Terms
When mentioning technical terms that a non-expert might not know, provide a **short, plain-English explanation** right there in the answer.

### 6. Parallelize Work with Sub-Agents
If a task can be broken into multiple independent pieces (e.g., researching different topics, editing several files, or running multiple commands), **launch parallel task agents** rather than doing everything sequentially.

### 7. Clean and Professional Animation Style
Animations must always look clean, elegant, and professional rather than hyperactive or overly bouncy. Use smooth easing curves (`Curves.easeOutCubic`) or well-damped springs with modest scaling factors.

### 8. Mandatory Verification Gate (Critical)
**Always run `flutter analyze` and `flutter test --concurrency=1` inside `mda_flutter/` before claiming a feature, bugfix, or task is complete.** Never declare success with broken tests or analyzer warnings.

---

## Project Documentation Maintenance

**AGENTS.md is the single source of truth.** Proactively maintain it and reference the correct skills when making changes:
- Scan `.agents/skills/` (`flutter-expert`, `flutter-apply-architecture-best-practices`, `flutter-build-responsive-layout`, `impeccable`, `ui-ux-pro-max`) for best-practice guidance.
- Whenever you make architectural or logic changes that affect rules, patterns, or conventions, update `AGENTS.md` and related instruction files immediately in the same step.
- Perform a final review check after any major task to ensure all instructions remain accurate and free of stale framework baggage.
