# Flutter port repair audit

Status: in progress. RN (`../mda_rn/`) remains the behavioral and visual reference.
A clean analyzer and passing tests do not establish full device or design parity.

## Repairs implemented (2026-09-18 session)

| Area | Repair | Evidence / remaining verification |
| --- | --- | --- |
| Back navigation | Root-PIN test resets `debugDefaultTargetPlatformOverride` before the framework's foundation-var check (the old tearDown ran too late, failing 1 of 4 tests). | 4/4 Back-navigation tests pass. Predictive-Back on a physical Android device pending. |
| Backup import crash | ZIP decode moved to a worker isolate (names/sizes only cross back); header-only manifest gate now followed by a post-extraction byte-size check; scoped imports without media no longer rename/delete `vlogs/` + `vlog_thumbnails/`; springs/preset constants reused via `AppSprings`. | 16 backup tests pass (incl. new scoped-media-preservation test + 6 MB media roundtrip). Real RN export + large-video device restore still pending. |
| Feed gesture | Start page no longer hosts a competing vertical scroller (RN parity: no inner scroll, upward pan always wins); close decision adds the RN velocity-projection rule (`projected < 0.5`, factor 0.12); top-edge overscroll forwards real fling velocity; `AppSprings.springSnappy` used instead of an inline spring. | Home + feed widget tests pass. Short-screen/large-text overflow now compacts instead of scrolling — visual check on a small device pending. |
| Security / PIN | Inactivity timer + `keepAlive` scoped to Stage 2 only (circles/profile persist until background/manual lock, RN parity); PIN copy matches RN (`Confirm PIN`, `PINs do not match. Try again.`); backspace uses dial-press haptic; entrance animation fires post-frame instead of mid-build. | 18 controller tests pass (incl. new circles-only `keepAlive` test). Physical biometric matrix pending. |
| Settings visuals | Hairline `SettingsDivider` restored (was a spacer); rows use RN `chevron-down` 16 red + w800 values; icons remapped to RN (`timer-lock-outline`, `server-network`, `zip-box-outline`, `newspaper-variant-outline`, `backup-restore`, `export`); Feed header icon fixed; copy matches RN (`Immediate`/`X Mins`, `Always ask for PIN instead of Biometrics`, `Subtle vibrations on interaction`, `Videos play muted…`); CompressionStatusBar restores RN radius/border/failed-state/title. | Analyzer clean; settings parity widget tests pass. Full visual side-by-side vs RN pending. |
| Haptics / motion | Death vibration owned once by `SessionEngine` (screen double-fire removed); escalation advances sequentially (no skipped warning levels); `CustomSlider` release ticks only on change; `ConfirmDialog` card scales 0.9→1 (was 0→1) + press buttons use `AnimatedScaleButton` (no Material ripple); `StreakPopup` icon no longer overshoots (`easeOutBack` → cubic 0.6→1.0); ring caches its `CurvedAnimation` (no per-frame alloc); sheet snap-back 150 ms (SPEC). | Full suite green; analyzer clean. Physical haptic feel + profile timings pending. |

## Earlier repairs

| Area | Repair | Evidence / remaining verification |
| --- | --- | --- |
| Home / Feed | Committed gesture state is separate from drag progress; crossing halfway no longer loses the gesture. Close/cancel/top overscroll, Circles entry, independent nav layer, lazy feed mounting. | Home widget regressions; upward reveal and settled Feed visually checked on Android emulator. |
| Start layout | RN title case, subtitles, red quick-action pills, balanced dial spacing; Vlog duration keeps selection. Short displays scroll. | Emulator screenshots; home widget tests. Full screen-size and text-scale matrix pending. |
| Security | Enrollment-aware native authentication, app-PIN fallback, authenticated tiers, concurrency and stale-result guards; lifecycle/activity boundary; protected library/profile content unmounts on lock. | Controller tests and emulator PIN setup. Physical enrolled fingerprint/Face ID and native device-credential matrix pending. |
| System Back / sheets | Dismissible base sheets use Navigator routes; global PIN consumes Back before the router. Sheet layout stays above keyboard. | Three Back-navigation tests pass; keyboard regression passes. Note and video viewers now also use routes. |
| Backup | Validate metadata before replacement, reject unsupported/corrupt structures, strip imported secrets, stage media with rollback, move ZIP/media work off UI isolate, stream selected file, multi-scope export. | Corruption, rollback and RN-format fixtures tested. Original user crash archive and large-device restore stress test unavailable. |
| Restore queues | Pause and drain active AI/compression jobs and persistence before restore; reinitialization clears stale jobs; resume in finally. Cancelled delayed jobs do not run. | AI queue tests; new timeout test proves drain waits for native completion, discards late output and prevents overlapping jobs. |
| Settings / AI | RN surfaces and spacing; corrected timeout choices; per-provider fields; summary toggle, explicit model favorites, model refresh/custom selection, prompt editors, batch category controls and retry. | Narrow 320px / larger-text layout tests. Real provider requests and full visual comparison pending. |
| Haptics / motion | Native selection/light feedback for short actions, throttling, cancellation when disabled; feed and sheet transforms avoid per-frame screen rebuilds; cancellable four-second developer hold. | Haptic channel and gesture tests. Physical haptic feel and profile-mode frame timings pending. |
| Alignment | Saving own logs no longer rate-limits the active check-in. Selectable reflection deck; typing resets idle timer; death clears text; save stops timers. | Regression exercises log → deck → typing → idle death. Advice-only weekly check-ins and completion reminder are covered; text defaults now match RN. |
| Feed media | Vlog bookmarks/comments/fullscreen wired; reactive filters; portrait frames; viewport/reveal/route/lifecycle gates; stale video initialization guarded; viewer keeps mute and shows remaining duration. | 8 targeted Feed/viewport/viewer tests pass; native codec/media device check pending. |

Additional repairs: saved-entry Generate/Retry now connects to the AI queue and
shows updated stored results. Post-writing edit confirmation persists changes;
delete confirms and actually deletes. Three entry-action tests pass. Queue state
now delivers its initial snapshot, and streaming chunks refresh stall detection.

## Verification history

- Full suite after the 2026-09-18 repair session: **158 passed**, analyzer **no issues found**.
- Second session (1.3 GB user backup + 4 UI reports): **159 passed**, analyzer clean.
- Large-restore design: media extracts checkpointed (one isolate pass per
  video, flat ~300 MB memory, per-file progress + stage labels in German-safe
  wording); failures return user-facing messages (never raw exceptions, never
  a crash); media-less scoped imports preserve existing videos. The user's own
  1.3 GB archive (29 entries, 13 vlogs + 13 thumbs, schema v6) matches every
  gate; on-device restore with that file is still the pending proof.
- Back navigation: **4 passed** (was 3 + 1 foundation-var failure).
- Backup: **16 passed** (incl. scoped-media + 6 MB roundtrip + RN fixture).
- Security controller: **18 passed** (incl. circles-only `keepAlive` scope).
- **8 Feed/video tests passed**, including initial cache visibility, route overlays,
  background/resume, fast switching, mute persistence and remaining duration.
- Targeted Feed/video tests are in `test/ui/feed_interaction_test.dart`,
  `viewport_activity_test.dart`, and `vlog_viewer_test.dart`; physical media testing remains pending.
- Android debug app previously built, installed and opened on API 36 emulator.
  Home/Feed/PIN screenshots were inspected; settings were not successfully inspected.
- No new release APK or iOS build is claimed. Xcode's license is unaccepted on this
  machine; testing used the installed Command Line Tools through a temporary xcrun
  shim. No system license was accepted or changed.

## Outstanding acceptance work

1. Physical-device fingerprint/Face ID, cancellation, lockout, inactivity, app switch,
   notification shade, and global PIN Back behavior on both platforms.
2. Restore a real RN export (including large media) and round-trip Flutter export;
   force failure during replacement and confirm existing data stays recoverable.
   Default free-space probing is not yet implemented (service currently uses unknown).
3. Profile on device with a long mixed Feed; check offscreen/covered/background video
   silence, fullscreen transitions, missing files, and memory after repeated open/close.
4. Compare every main screen and sheet against RN at matching content/device size.
   Smoothness and visual parity have not yet been established globally.
5. Finish broader parity audit: Mastery text/weekly flows, remaining viewer save/share
   actions, route-specific protection/relock behavior and recording/export paths.

Keep this document current when checks are actually completed; do not convert a
pending device check into a pass based solely on code inspection.
