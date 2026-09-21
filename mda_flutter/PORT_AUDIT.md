# Flutter port repair audit

Status: in progress. RN (`../mda_rn/`) remains the behavioral and visual reference.
A clean analyzer and passing tests do not establish full device or design parity.

## Repairs implemented (2026-09-18 session)

| Area | Repair | Evidence / remaining verification |
| --- | --- | --- |
| Back navigation | Root-PIN test resets `debugDefaultTargetPlatformOverride` before the framework's foundation-var check (the old tearDown ran too late, failing 1 of 4 tests). | 4/4 Back-navigation tests pass. Predictive-Back on a physical Android device pending. |
| Backup import crash | ZIP decode moved to a worker isolate (names/sizes only cross back); header-only manifest gate now followed by a post-extraction byte-size check; scoped imports without media no longer rename/delete `vlogs/` + `vlog_thumbnails/`; springs/preset constants reused via `AppSprings`. | 16 backup tests pass (incl. new scoped-media-preservation test + 6 MB media roundtrip). Real RN export + large-video device restore still pending. |
| Vlog calendar (History) | Root cause: the grid grouped by the `dateStr` STRING, but RN backups carry German display text (`18.4.2026 14:20`) — every video fell into a phantom day and the calendar looked empty. Now groups by LOCAL day from `timestamp` (RN key `year-month-day`, newest-first per day), Monday-first offset fixed (was `% 7` → Sunday-first on some months), weekday header `MON…SUN` (RN `WEEKDAYS`), › arrow disabled at the current month, horizontal month swipe, today ring, stats row only with content, missing thumbnails backfill lazily (RN `ThumbnailFetcher` parity). | New `vlog_calendar_grouping_test.dart` (5 tests: newest-first, German-dateStr immunity, midnight split, empty, key format). On-device proof: 1.2 GB user backup (43 notes, 13 vlogs, 17 persons) imports in ~8 s with `verification: ok`; all 13 videos byte-exact vs manifest; one 21 MB file pulled + `ffprobe`-verified playable (`duration=62.09s`); settings shows `Vlog Footprint 1.2 GB`. |
| Circles profile crash | Redbox `dependOnInheritedWidget… called before _PersonProfileModalState.initState() completed`: the `_person` getter used `ref.watch` and `initState` called it (also `ref.read`-through-getter is unsafe pre-mount on some devices). Controllers now init empty; provider read moved to `didChangeDependencies` (syncs once, never clobbers edits). Profile opens via Navigator route (`showGeneralDialog`) instead of a bare `OverlayEntry` (Back works, PIN stays above, scope always valid — the PORT_AUDIT route invariant). | Analyzer clean; profile-modal route verified via widget tree. Full tap-through on emulator pending (VM-service stall during session, see below). |
| RN Metro Redbox "Unable to load script" | The RN APK on the emulator (installed 2026-07-08, 79 MB, NO `index.android.bundle` inside) was a stale dev build that can only load JS from Metro. Fixed without code changes: `adb reverse tcp:8081 tcp:8081` + fresh `expo run:android` debug build (BUILD SUCCESSFUL, all native modules incl. `expo-document-picker` present) → Metro bundled `index.ts` (1870 modules) → app boots to "Free Writing" (screenshot proof), AI queue online. The earlier `Cannot find native module 'ExpoDocumentPicker'` came from the same stale APK. No RN source fix needed; workflow note: after a fresh install, always relaunch via Metro-connected `expo run:android`, never by tapping a months-old icon. |
| Backup hardening (weak phones) | Free-space gate was a stub (`-1` = unknown): now a real two-stage probe (1 MB writability check, then fill-to-full in 64 MB steps capped at 4 GB) — unknown still means "proceed, never block". DEFLATE gets a zip-bomb cap (manifest size + 1 MB): corrupt streams abort as "damaged backup" instead of OOM-killing. Media streams to `.part` files with per-file byte-exact promotion (kill/full-disk can never leave an accepted truncated video); stale `.part` files are ignored + cleaned; per-file size mismatch aborts with attribution. Auth gate moved BEFORE the SAF picker (RN parity: picker backgrounds the app → auto-lock race); confirm dialog notes the PIN stays local; media rollback journal is one map for the whole merge (was recreated per file, losing all but the last entry). | 21 backup tests pass (incl. new per-file-mismatch + multi-file-journal regression tests + the REAL 1.3 GB archive test). Full suite 169 green, analyzer clean. |
| Streak calendar ring + weekday offset | Ring could appear on the 21st of EVERY scrolled month (bare day-number comparison in neighbour pages; PageView could drift into future months no arrow reaches). `_MonthGrid` now takes `showTodayRing` (only the live current-month page rings); month offset clamped ≥ 0 (RN `canGoForward`); Monday-first blanks fixed (`weekday − 1` = RN `(getDay()+6)%7`; old `weekday % 7` was off by one, Sunday-first on some months). Date math extracted as testable statics (`mondayFirstBlanks`, `monthForOffset`, `clampOffset` — `CalendarViewState` public for tests). | New `calendar_math_test.dart` (7 tests incl. August-2026 Saturday case from the report + full 2026 month sweep); wave2 calendar tests still green. |
| Vlog history thumbnails | `_ThumbnailBackfill` was constructed inline in `build()` but never mounted — scheduling nothing, so thumbnail-less days (e.g. after import) never regenerated (RN `ThumbnailFetcher` parity broken). Backfills are now collected per day and mounted below the grid (zero layout impact); `_DayThumbnail` guards with `existsSync` so dangling paths show the play placeholder. | New `vlog_gallery_test.dart` drives the REAL gallery with a fake notifier: German-`dateStr` vlogs land on timestamp days, arrows walk months with › stopping at now, stats row counts. |
| Free-space probe cost + ENOSPC wording | Sized probe always filled up to 4 GB even for KB restores; disk-full from wrapped `FileSystemException`s (errno 28 text buried in `toString`) fell through to the generic message. Probe now takes `needed` (gate passes manifest × 1.1) and stops at the target; error matcher covers `errno 28` / `no space left` / `disk full` / `out of space` variants plus inflate/decompress failures. | New gate tests: refuse-before-touch with "Not enough free space" copy, unknown-probe still restores. |
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
- Sixth session (German date-library bug report + Redbox screenshots):
  streak-calendar ring + Monday offset, vlog thumbnail backfill mounting,
  sized free-space probe, ENOSPC message coverage, gallery widget tests —
  full suite **181 passed**, analyzer clean (see table above).
- Fifth session (1.2 GB user backup self-driven on emulator + German bug report):
  calendar/history, profile Redbox, backup low-end hardening, RN Metro diagnosis —
  full suite **169 passed**, analyzer clean (see table above).
- Second session (1.3 GB user backup + 4 UI reports): **159 passed**, analyzer clean.
- Third session (user re-crash): the crash is FIXED at the root, not papered
  over. Diagnosis (measured, not guessed): the user's archive stores videos
  as DEFLATE (27/29 entries, RN exporter uses STORE but native zippers use
  DEFLATE) — every import pass ran a full `ZipDecoder.decodeStream`, which
  buffers each video's compressed bytes before inflating (worker RSS 447 MB
  for the listing pass alone; Android kills the app there). Fix: true
  streaming — central-directory scan only (~KBs), then per video a raw
  byte-copy (STORE) or incremental 1 MB-chunk inflate (DEFLATE, constant
  memory, verified byte-exact on the 326 MB entry: 341,746,946 bytes match).
  A missing `await sink.close()` (zero-byte staged files → size-gate fail)
  was caught by the new tests. Proof: new 13-video DEFLATE fixture test
  (~160 MB, same shape as the user's 1.3 GB archive) passes with monotonic
  progress + stage labels; full suite **161 passed**, analyzer clean.
- Fourth session (still crashing on-device): FIVE further root causes found
  by re-auditing the whole pipeline + a REAL-archive test (the exact 1.3 GB
  user ZIP now imports green in-test, byte-exact on all 13 videos):
  1. `_readEntryBytes` still ran a FULL ZipDecoder pass for the tiny metadata
     (buffers all videos' compressed bytes; measured +1.1 GB RSS on a single
     326 MB readBytes) — replaced by offset-based single-entry streaming.
  2. Nested `Isolate.run` per video inside the worker isolate (measured
     +166 MB peak, buys nothing) — removed; exactly ONE worker isolate owns
     the whole import, JSON validation + stat checks run inline (KBs).
  3. Rename-swap of whole media dirs destroyed user videos before the new
     ones were verified — replaced by per-file merge with rollback journal
     (RN parity: merge, never swap).
  4. Row↔manifest join by vlog id restored the WRONG file for compressed
     renames (id `mp4pml77_hgi0mlf` ≠ file `compressed_mp4pmmt8_9s0hcpd.mp4`)
     — now joins on file basename; row `file_size_bytes` refreshed to staged
     bytes (rows can carry pre-compression sizes, e.g. 9246777 vs 6676818).
  5. Test helper `readManifestSizes` itself used a full decode (would OOM the
     test runner the same way) — kept streaming-only.
  Full suite **162 passed**, analyzer clean. The REAL-archive test IS the
  crash reproduction: it uses the exact user file and fails (OOM / wrong
  file / wrong size) on any regression to full-decode, nested isolates,
  rename-swap or id-join.
- Library 1:1 (RN `LibraryScreen.tsx` read line-by-line): header tab pills
  REMOVED (RN has none — section is mode-driven only); title 32/w600 +
  subtitle 16/secondary (were w800/-0.5 + 13/muted); live AI badge moved
  under the title, processing-only with spinner + count; sort dropdown is a
  bordered button with chevron-down + full RN labels; lock pill is the RN
  text-morph (`Un` 17.5 + `l` 4.5 collapse, `L` 7.2 expands, 250 ms
  cubic-out) with a swing-gate shackle (rotateY 180°, 300 ms quad-out, custom
  painter — the old flat 180° spin is gone); circles/vlogs unlock on the
  lower tier (circles OR notes); lock cards carry the per-section RN copy +
  geometry (48 px red lock, 22/w900, 15/22, red pill 16/28 + shadow); the
  lock/content cross-fade runs on one spring (30/200) with slide-up overlay.
  Two latent overflow bugs fixed on the way (group-header Divider row,
  card-button Row) — the 400 px test phone is overflow-free again.
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
   DONE on emulator 2026-09-21 (see Vlog-calendar row): the exact 1.2 GB user
   ZIP restores in ~8 s, byte-exact, `verification: ok`. Remaining: the same
   proof on the user's physical low-end phone (free-space gate + .part resume
   are implemented for exactly that case, but unproven on real hardware).
3. Profile on device with a long mixed Feed; check offscreen/covered/background video
   silence, fullscreen transitions, missing files, and memory after repeated open/close.
4. Compare every main screen and sheet against RN at matching content/device size.
   Smoothness and visual parity have not yet been established globally.
5. Finish broader parity audit: Mastery text/weekly flows, remaining viewer save/share
   actions, route-specific protection/relock behavior and recording/export paths.

Keep this document current when checks are actually completed; do not convert a
pending device check into a pass based solely on code inspection.
