# Migration Plan — Expo → Flutter (`mda_flutter`)

Companion to `SPEC_1TO1.md` (the behavioral contract). Process: phase → `flutter analyze` clean → `flutter test` pass → commit → next phase.

## Phase 0 — Setup (done)
- [x] Flutter skills installed: `flutter-expert`, `flutter-apply-architecture-best-practices`, `flutter-build-responsive-layout`
- [x] `flutter create mda_flutter` (Android + iOS, org com.anonymous, portrait)
- [x] All dependencies added (Riverpod, go_router, sqflite, secure_storage, camera/video stack, archive, …)
- [x] Android: black splash + hidden status bar (`styles.xml`), `adjustPan`, `allowBackup=false`, camera/audio permissions, app label, icons
- [x] iOS: display name, launch images, app icons
- [x] `SPEC_1TO1.md` — full behavioral contract extracted from the RN codebase

## Phase 1 — Foundation
Theme tokens 1:1, fonts (bundled TTFs), haptics wrapper, utils, logger/perf, SQLite (schema v6, dual-track versioning, self-healing migrations), 8 repositories, settings service, secure storage (PIN), Riverpod domain providers, crash-proof startup (allSettled-equivalent). Tests: migrations, repositories, utils.

## Phase 2 — Core Writing Loop
Session engine (100 ms tick, death, haptic escalation, word count), StartScreen (hero, TickDial, difficulty pills, morph button), WritingScreen (vaporize, danger, death overlays, keyboard pan), streak + save, StreakPopup, PostWritingScreen (AI gate, shimmer, edit, grammar, fly-away). Tests: session state machine, streak, tweet limit.

## Phase 3 — Home Shell, Library & Circles
3-layer Home (pager + feed overlay + glass nav), Library (4 tabs, sorting, grouping, calendar), NoteViewerModal, Circles CRUD + person cards + profile modal. Tests: sort/filter/group logic.

## Phase 4 — AI Pipeline
SSE streaming client (both providers), AiError classification, singleton AiQueue (retries, offline detection, health checks, persistence, orphan recovery), AiLogger, AiSettingsPanel, failure notifications. Tests: classification, retry rules, queue state machine.

## Phase 5 — Masteries & Alignment
Pillars CRUD + versioning, Dashboard + Detail (trend, scrub), smart advice, check-in flow (3 h rate limit, dangerous deck), CustomSlider, alignment tiers. Tests: check-in pick, smart advice weights, version bump.

## Phase 6 — Vlogs & Media
Recording (countdown, quality), thumbnails, compression queue (presets, retries, timeout), calendar gallery, video viewer, disk monitoring. Tests: job state machine, preset mapping.

## Phase 7 — Security & Backup
PIN pad (lockout, setup modes), biometric tiers + auto-lock, backup v2 export/import with old-app compatibility (gates, rollback). Tests: backup roundtrip, secrets policy, rollback.

## Phase 8 — Feed, Settings, Dev Tools
Feed screen + cards (reveal gesture, filters, bookmarks/comments, autoplay), full settings modal, compression status, dev tools + sandbox, changelog. Tests: feed filter, comment limit.

## Phase 9 — Performance & Release
`flutter analyze` 0 issues, full test suite, DevTools profiling (rebuild counts, jank), Impeller on Android, animation audit, release APK (gradle), device test, docs update (AGENTS.md).
