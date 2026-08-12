# SPEC 1:1 — Behavioral Contract (Expo → Flutter)

Single source of truth for replicating **The Most Dangerous Writing App v1.5.8** in Flutter.
Every number, color, threshold, prompt and flow below was extracted from the RN codebase
(`mda_rn/App.tsx`, `mda_rn/src/config/*`, `mda_rn/src/styles/theme.ts`, `mda_rn/src/lib/*`, `mda_rn/src/screens/*`, `.agents/instructions/*`).
When in doubt, **the RN code wins** — update this file and port the behavior.

---

## 1. App Identity

- Name: "The Most Dangerous Writing App" — version `1.5.8`
- Portrait only, dark UI only (AMOLED). No light theme. No BlurView / liquid glass.
- Status bar hidden everywhere. Android nav bar black.
- Icon font: MaterialCommunityIcons (Flutter: `material_design_icons_flutter`, same glyph names).

## 2. Config Values (`mda_rn/src/config/index.ts`)

| Constant | Value |
|---|---|
| `APP_VERSION` | `1.5.8` |
| `DIFFICULTIES` | EASY → **12,000 ms** / MID → **8,000 ms** / HARD → **5,000 ms** idle limits (default MID) |
| `TICK_RATE_MS` | `100` (idle timer tick) |
| `BLUR_RATIO_START` | `0.5` |
| `SESSION_OPTIONS_MINS` | `[3, 5, 10, 15, 30, 60]` (default index 1 = 5 min) |
| `VLOG_SESSION_OPTIONS_MINS` | `[1, 2, 3, 5, 10, 15]` |
| `VLOG_VIDEO_QUALITY` | `'1080p'` default |
| `VLOG_STORAGE_DIR` | `'vlogs/'` |
| `VLOG_BITRATE_MAP` | 720p → 2.5 Mbps, 1080p → 4.5 Mbps, 2160p → 12 Mbps |
| Compression presets | `off` (0/0), `light` (1920 px / 4,000,000 bps), `balanced` (1080 / 2,500,000, **default**), `max` (720 / 1,200,000) |
| `PIN_MAX_ATTEMPTS` | `3`; `PIN_LOCKOUT_DURATION_MS` = `30_000` |
| `CHECKIN_URGENT_DAYS` | `7` (604,800,000 ms) |
| `PIN_DOT_DELAY_MS` | `150` |
| `PERMISSION_GRANTED_DELAY_MS` | `500`; `COUNTDOWN_INTERVAL_MS` = `1000` |
| Dev mode | long-press settings cog 4,000 ms; toast 2,000 ms |
| Font sizes | Small 14/22, Normal 18/28, Large 24/36, Giant 32/48 (font/lineHeight); default size index 1 |
| `DANGER_COLOR_RGB` | `{255, 77, 77}` = `#ff4d4d` (timer border); main danger accent = `#FF2A2A` |
| `TWEET_THRESHOLD` | `45` words; `isTweet(wc) = wc <= 45` |
| `MIN_AI_WORDS` | `45` |

## 3. Color Tokens (verbatim from `theme.ts`)

### Backgrounds / Surfaces
| Token | Value |
|---|---|
| background | `#000000` |
| surfaceDark | `#0A0A0A` |
| surfaceRaised | `#1A1A1A` |
| surfaceMedium | `#111` |
| surfaceLight | `#222` |
| surfaceCard | `#161616` |
| surfaceOverlay | `rgba(18,18,18,0.85)` |
| surfaceOverlayLight | `rgba(0,0,0,0.2)` |
| cardBackground | `rgba(255,255,255,0.06)` |
| modalBackground | `rgba(0,0,0,0.6)` |
| overlayLockAndroid | `rgba(10,10,10,0.88)` ← liquid-glass replacement |

### Text (white ladder)
| Token | Value |
|---|---|
| textPrimary | `#FFFFFF` |
| textBody | `rgba(255,255,255,0.85)` |
| textInput | `rgba(255,255,255,0.9)` |
| textTweet | `rgba(255,255,255,0.88)` |
| textBodyDim | `rgba(255,255,255,0.7)` |
| textSecondary | `rgba(255,255,255,0.6)` |
| textDim | `rgba(255,255,255,0.4)` |
| textMuted | `rgba(255,255,255,0.3)` |
| lightGrey / grey / darkGrey | `rgba(255,255,255,0.5)` / `0.2` / `rgba(0,0,0,0.3)` |
| placeholder | `#555` |

### Danger / Primary (True Red `#FF2A2A`)
| Token | Value |
|---|---|
| primaryAction / danger | `#FF2A2A` |
| primaryActionText | `#FFFFFF` |
| dangerSubtle | `rgba(255,42,42,0.06)` |
| dangerLight / dangerMedium / dangerTint | `0.08` / `0.10` / `0.10` |
| dangerBorderLight | `rgba(255,42,42,0.12)` |
| dangerAccent | `rgba(255,42,42,0.15)` |
| dangerBorder | `rgba(255,42,42,0.2)` |
| dangerBorderMedium | `rgba(255,42,42,0.25)` |
| dangerBorderStrong | `rgba(255,42,42,0.3)` |
| dangerFill | `rgba(255,42,42,0.15)` |
| dangerFillStrong | `rgba(255,42,42,0.3)` |
| dangerOverlayLight | `rgba(255,42,42,0.45)` |
| dangerGradientEnd | `rgba(255,42,42,0.45)` |
| dangerPressed | `rgba(255,42,42,0.7)` |
| dangerOverlayStrong / dangerIconOverlay | `rgba(255,100,100,0.8)` |
| dangerFillLight | `rgba(255,100,100,0.2)` |

### Glass scale (solid translucency — NO blur)
| Token | Value |
|---|---|
| glassBackground | `rgba(255,255,255,0.05)` |
| glassSurface | `rgba(255,255,255,0.06)` |
| glassSurfaceMedium | `rgba(255,255,255,0.08)` |
| glassSurfaceMinimal | `rgba(255,255,255,0.03)` |
| glassSurfaceSubtle | `rgba(255,255,255,0.02)` |
| glassSurfaceLow | `rgba(255,255,255,0.04)` |
| glassBorder | `rgba(255,255,255,0.1)` |
| glassBorderSubtle | `rgba(255,255,255,0.06)` |
| glassBorderFaint | `rgba(255,255,255,0.05)` |
| glassBorderMedium | `rgba(255,255,255,0.12)` |
| glassHighlight | `rgba(255,255,255,0.15)` |

### Overlays (black ladder)
| Token | Value |
|---|---|
| overlayDark | `rgba(0,0,0,0.4)` |
| overlayMedium | `rgba(0,0,0,0.85)` |
| overlayStrong | `rgba(0,0,0,0.9)` |
| overlaySubtle / overlayLight / overlaySoft | `0.1` / `0.2` / `0.5` |
| overlayVideoMuted | `rgba(0,0,0,0.6)` |
| overlayVideoStrong | `rgba(0,0,0,0.7)` |
| overlayPopup | `rgba(0,0,0,0.92)` |
| deathOverlay | `rgba(40,35,32,0.95)` |
| shadowDark | `#000000` |

### Nav bar + specular + semantic
| Token | Value |
|---|---|
| navIconActive / navIconInactive | `rgba(255,255,255,1)` / `0.35` |
| navPillShadow | `rgba(0,0,0,0.9)` |
| navIndicatorBackground / Border | `rgba(255,255,255,0.12)` / `0.08` |
| navSpecularHighlightStart / Mid | `0.28` / `0.04` |
| specularBorderStart | `rgba(255,255,255,0.3)` |
| specularBorderEnd | `rgba(255,255,255,0.03)` |
| specularBorderCardStart | `rgba(255,255,255,0.25)` |
| gold | `#FFD700` |
| green | `#4ade80` |
| orange | `#FF6B35` |
| suggestionError | `#ff6b6b` |
| devBlue / devPurple / devOrange | `#3296FF` / `#6464FF` / `#FFA500` |
| border | `rgba(255,255,255,0.1)` |
| bloodDark / bloodMedium / bloodGlow | `#4A0000` / `#7A0000` / `rgba(74,0,0,0.6)` |
| SAFE_BORDER_COLOR | `rgba(50,50,50,1)` |

### Alignment score tiers (`alignmentScores.ts`)
| Score | Tier | Color | Glow | Emoji |
|---|---|---|---|---|
| 0–2 | struggling | `#ff4d4d` | `rgba(255,77,77,0.3)` | 😵 |
| 3–4 | drifting | `#ff9933` | `rgba(255,153,51,0.3)` | 😕 |
| 5 | okay | `#ffcc00` | `rgba(255,204,0,0.3)` | 😐 |
| 6–7 | good | `#a2ff66` | `rgba(162,255,102,0.3)` | 😊 |
| 8–9 | great | `#66ffcc` | `rgba(102,255,204,0.3)` | 😄 |
| 10 | aligned | `#00ccff` | `rgba(0,204,255,0.3)` | 😎 |

## 4. Typography & Spacing

- Spacing: xs 4, sm 8, md 16, lg 20, xl 32, xxl 48. Radius: sm 12, md 20, lg 32, round 100.
- Weights: light 300, regular 400, medium 500, bold 600, extraBold 800, black 900.
- Fonts (user-selectable, index 0–10): System, Serif (Georgia/serif), Casual (Chalkboard SE/casual), PlayfairDisplay, SpaceMono, Caveat, Lora, ZillaSlab, CrimsonPro, DMSans, EagleLake. **Bundle TTFs as assets, no runtime fetch.**
- Type scale: hero title 28–32/900 (letterSpacing −0.5), library title 32/bold, sheet title 18–20/600–700, card title 16/bold, note AI title 16/700, section labels 13/bold/UPPERCASE/letterSpacing 1.5, TickDial value 44/200 (unit 20/300), death 44/bold, diff pills 13/600, nav labels 10/600.

## 5. Animation Rules (`.agents/instructions/animations.md` + theme)

- Springs: `springDefault` (30/200/0.8), `springSnappy` (35/250/0.8), `springGentle` (26/120/0.8), `springLight` (28/150/0.5), `springFeed` (32/160/0.9) — damping **26–35 only, no overshoot**.
- Max **3 visual layers** per composite widget. Scales ≤ 1.05 (press shrink 0.95–0.97).
- Timing-based micro-interactions: nav indicator `180 ms` cubic-out; sheet entry spring + scrim 300 ms; sheet exit 300 ms timing; scrim snap-back 150 ms; ConfirmDialog scrim 250 in/180 out + card spring 0.9→1; lock overlay 350 ms cubic-out + content scale 0.96→1.0; Shimmer 1 s up/1 s down infinite (opacity 0.15→0.35); ring draw 600 ms cubic-out / retract 400 ms; lock shackle 300 ms quad-out 180°; writing save fly-away = GPU scaleX/Y shrink (never width/height).
- Haptics never inline springs; reference presets.

## 6. Database (`mda_v2.db`, schema v6, SQLite)

- Versioning: **dual-track** — `PRAGMA user_version` + AsyncStorage/SharedPreferences key `__DB_SCHEMA_VERSION__`; effective version = `max(both)`; migrations idempotent, self-healing (`duplicate column name`/`already exists` skipped), wrapped in transactions; never brick startup.
- Wrappers only: `getDb / closeDb / run / getAll / getFirst / exec`; sanitize bind params (null/undefined → SQL NULL).

### Tables (verbatim)
```sql
notes(id TEXT PK, text TEXT NOT NULL, date_str TEXT NOT NULL, timestamp INTEGER NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 0, won INTEGER NOT NULL DEFAULT 0, person_id TEXT,
  is_quick_note INTEGER NOT NULL DEFAULT 0, ai_title TEXT, ai_summary TEXT, ai_model_used TEXT,
  is_alignment_reflection INTEGER NOT NULL DEFAULT 0, alignment_score INTEGER, stop_text TEXT,
  start_text TEXT, continue_text TEXT, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
  is_tweet INTEGER NOT NULL DEFAULT 0, pillar_id TEXT, advice_id TEXT, pillar_value REAL,
  pillar_version INTEGER)
-- idx_notes_timestamp(timestamp), idx_notes_person(person_id)
persons(id TEXT PK, name TEXT NOT NULL, created_at INTEGER NOT NULL, nickname TEXT,
  relationship TEXT, birthday TEXT, bio TEXT, custom_relationships TEXT)
vlogs(id TEXT PK, file_path TEXT NOT NULL, date_str TEXT NOT NULL, timestamp INTEGER NOT NULL,
  duration_sec INTEGER NOT NULL, file_size_bytes INTEGER NOT NULL DEFAULT 0, thumbnail_path TEXT,
  compression_preset TEXT, original_file_size_bytes INTEGER, compression_pending INTEGER NOT NULL DEFAULT 0)
settings(key TEXT PK, value TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000))
feed_bookmarks(note_id TEXT PK, created_at ...)   -- dead code, keep for backup scope parity
feed_comments(note_id TEXT PK, comment TEXT NOT NULL, updated_at ...)  -- dead code, keep
ai_jobs(id TEXT PK, note_id TEXT NOT NULL, category TEXT NOT NULL, status TEXT NOT NULL,
  created_at INTEGER NOT NULL, started_at INTEGER, completed_at INTEGER, error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0)
ai_logs(timestamp INTEGER NOT NULL, action TEXT NOT NULL, note_id TEXT, model TEXT NOT NULL,
  phase TEXT NOT NULL, duration_ms INTEGER, error TEXT)
pillars(id TEXT PK, title TEXT NOT NULL, type TEXT NOT NULL, scope TEXT NOT NULL,
  created_at INTEGER NOT NULL, adaptive_days INTEGER NOT NULL DEFAULT 14,
  is_active INTEGER NOT NULL DEFAULT 1, description TEXT, last_edited_at INTEGER, version INTEGER NOT NULL DEFAULT 1)
advice_cards(id TEXT PK, text TEXT NOT NULL, created_at INTEGER NOT NULL,
  last_reflected_at INTEGER, reflection_count INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1)
pillar_logs(id TEXT PK, pillar_id TEXT NOT NULL, value_num REAL, value_str TEXT,
  timestamp INTEGER NOT NULL, note_id TEXT, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000))
pillar_versions(id TEXT PK, pillar_id TEXT NOT NULL, version INTEGER NOT NULL, title TEXT NOT NULL,
  description TEXT, created_at INTEGER NOT NULL)
```
- Seed (v4, INSERT OR IGNORE): 3 mock pillars (`mock_pillar_sleep`, `mock_pillar_comfort`, `mock_pillar_mindfulness`) + 2 advice cards (`mock_advice_listen`, `mock_advice_comfort`).
- v6 backfill: `pillar_versions` rows `id || '_v1'` from existing pillars.

## 7. Settings Keys + Defaults (settings table = pref store)

| Key | Default |
|---|---|
| USER_FONT_IDX | 0 |
| USER_SIZE_IDX | 1 |
| USE_BIOMETRICS | true |
| ENABLE_HAPTICS | true |
| LOCK_TIMEOUT_MINS | 3 |
| VLOG_QUALITY | '1080p' |
| COMPRESSION_PRESET | 'balanced' |
| DEV_MODE | false |
| DEBUG_LAYOUT | false |
| VISION_BOARD | null |
| PREFER_PIN_AUTH | false |
| LOG_MODE | __DEV__ |
| CURRENT_STREAK | 0 |
| LAST_WIN_DATE | '' |
| STREAK_HISTORY | [] |
| LAST_REFLECTION_DATE | null |
| BOOKMARKED_NOTE_IDS | [] |
| FEED_COMMENTS | {} |
| AUTO_PLAY_FEED_VIDEOS | true |
| AUTO_GENERATE_SUMMARIES | true |
| AI_PROVIDER | 'ollama' |
| AI_OLLAMA_API_KEY / AI_NEURALWATT_API_KEY | hardcoded default / '' (secret) |
| AI_OLLAMA_BASE_URL | 'https://ollama.com/v1' |
| AI_NEURALWATT_BASE_URL | 'https://api.neuralwatt.com/v1' |
| AI_OLLAMA_MODEL | 'gemma4:31b-cloud' |
| AI_NEURALWATT_MODEL | 'glm-5.2' |
| AI_*_GRAMMAR_MODEL | same as model |
| AI_CUSTOM_PROMPTS | {} (merged over defaults) |
| AI_FAVORITE_MODELS | [] |

**Secret keys (never exported, never restored):** `@mda_security_pin`, `@mda_pin_attempt_count`, `@mda_pin_lockout_until`.
Queues persisted separately (not in backups): `COMPRESSION_JOBS_QUEUE`, `AI_JOB_QUEUE`, `AI_PROCESSING_LOG`, plus `FEATURE_FLAGS` + `__DB_SCHEMA_VERSION__` (allowlisted for backup).

## 8. Core Writing Mechanic (the heart)

- Idle tick 100 ms; death when `idleTimeMs >= difficultyLimit`; typing resets idle (only while `!hasLost && !isContinuingAfterLoss`).
- Death: vibrate `[0,200,100,200]`; shake ±15 px (50 ms steps); overlay fade 300 ms; **text wiped 200 ms after death**.
- Death overlay: "YOU DIED" / "You stopped writing for too long." → "Return to Menu" | "I don't care, let me write" (`resumeWritingFreely`, note saves `won: false`).
- Idle vaporize preview after `min(1500, limit*0.2)` ms; last **8 words** fade to opacity 0.3; word *i* from end starts fading at `min(0.85, 0.3 + i*0.05)`, fully faded at `min(0.95, 0.5 + i*0.05)`; white `rgba(255,255,255,o)`.
- Danger overlay: vignette fade starts at ratio 0.15 (opacity `((r−0.15)/0.85)*0.95`, scale 1.12→1.0); fog above 0.50 (`((r−0.5)/0.5)*0.85`); heartbeat above 0.75 (lub 120 → 0 → dub 100 → 0 → pause 600, infinite; contraction 6%; SVG radial gradient: transparent core → 45%, blood 0.7@55%, 0.85@85%, 1.0@100%).
- Haptic escalation (once per level, reset on typing): 0.70 → `vibrate(20)`; 0.80 → `[0,30,50,30]`; 0.90 → `[0,40,25,40]`; 0.95 → `[0,50,25,50,25,50,25,80]`.
- Word count: O(1) append-only fast path + 400 ms debounced full recount; tweet mode blocks typing past 45 words, counter red > 35.
- No autosave. Save only when time up / continuing after loss / quick note. `durationMin = sessionMins (0 quick)`, `won = !hasLost && !isContinuingAfterLoss`; auto-tag `isTweet` if `wc <= 45`. Empty text → exit without saving.
- Streak: eligible = `won && durationMin >= 3 && !isQuickNote && !isTweet`; today added to history; `lastWin == yesterday → streak+1`; else gap → 1; same-day no change. Tweets & vlogs never count.
- Tweets skip PostWriting (fly-away → Home + streak event). Others → PostWriting.
- Navigation back from Writing/PostWriting intercepted with morph-collapse exit animation.

## 9. AI Integration (`.agents/instructions/ai-integration.md`)

- Providers: `ollama` (default) / `neuralwatt`. Base URL includes `/v1`; endpoint `POST {baseUrl}/chat/completions`; headers JSON + `Authorization: Bearer {key}`.
- Body: `{model, messages:[{role,content}], stream:true, options:{num_ctx:16384}}` — `options` **only** for ollama.
- **Streaming via XHR/SSE** (Dart: `http` StreamedResponse + line parser). Chunk shapes: `choices[0].delta.content` | `choices[0].message.content` | `message.content`. Chunk flush rule: last char in `/[ \t\n.,!?\-:;，。！？、"”'"\u4e00-\u9fa5]/` or buffer > 12 chars.
- Timeouts: request 180 s; job 180 s; stall detection 60 s (checked every 10 s). Health check 10 s; **60 s when persistently offline (3+ consecutive ping fails)**. Queue rate limit 500 ms; max queue 1000.
- Retries: 2 (`AI_MAX_RETRIES`), backoff `1000*2^attempt` (1 s, 2 s); only `network|timeout|server|rateLimit` retry; `auth|config|cancelled|parse` fail fast (permanent). Failed job moves to **end of queue**; 3rd failure → permanent fail + notification.
- Offline kinds: `network|timeout|auth|rateLimit|server` → `serverOnline=false` + pause; ping `GET {baseUrl}/models` (Neuralwatt or `/v1` URL) else `GET {baseUrl}/api/version`; 5 s timeout; Neuralwatt empty key → fail fast `config` ("No Neuralwatt API key set. Add your key in AI Settings.").
- Pre-flight per job: missing note → fail; tweet → done skip; `< 45` words → done skip ("too short"); missing key/URL → immediate permanent fail.
- `AiError` kinds: `network | timeout | server | rateLimit | auth | config | cancelled | parse` + `userMessage`. Classify: 401/403→auth, 429→rateLimit, 5xx→server, other 4xx→config; strings: cancelled/aborted, "timed out", "Network request failed"/"connection dropped"/"unreachable", auth, 429, `/[5]\d\d/`, fallback parse.
- Title: strip surrounding quotes; max 5 summary bullets (strip `^[\s•\-*]+`); grammar: strip ```json fences, require original/suggestion/explanation strings, `[]` = valid "no issues", garbage → throw `AiError('parse')`.
- Ollama models: `kimi-k2.5:cloud`, `kimi-k2.6:cloud`, `qwen3.5:397b-cloud`, `glm-5:cloud`, `minimax-m2.7:cloud`, `nemotron-3-super:cloud`, `gemma4:31b-cloud`. Neuralwatt: `glm-5.2`.
- Batch order: journal → circle → checkin; newest first within category. `enqueueNote` dedupes. Category: `isAlignmentReflection ? checkin : personId ? circle : journal`.
- AI log: FIFO 200 entries; actions enqueue/start/success/fail/cancel/orphan_recovery/retry/timeout/stall_recovery/init/config. Startup diagnostics banner: masked key (first8...last4 / NOT SET), base URL, models, custom-prompts flag, ping result, pending count.
- Grammar prompt output: JSON array `{original, suggestion, explanation}` (explanation ≤ 10 words).
- Default prompts (verbatim semantics, `mda_rn/src/config/ai.ts`): title "EXACTLY 3 to 6 words… no punctuation/quotes… ONLY the title"; summary "empathetic inner voice… 1–2 bullets short → 6–8 long… first person… **bold**… • bullets… never 'the author'"; relationshipTitle 2–5 words, no person name, entry language; relationshipSummary warm narrator + `{{PERSON_NAME}}`/`{{RELATIONSHIP_STATUS}}` templating.

## 10. Masteries (Pillars)

- Types: `rating` (1–10 slider) / `time` (±0.5 h stepper, default 7.0) / `boolean` (YES/NO, default true) / `text`; scopes `daily|weekly|adaptive`; `adaptiveDays` default 14.
- Version bump **only when title or description changed** (`version+1`, `lastEditedAt=now`, new `pillar_versions` row). New pillar → version 1 + initial row.
- Progress = `min(uniqueDays(adaptiveDays window) / adaptiveDays, 1)` — "X/14 days to graduate". Sparkline: last 7 logs, normalized `(val−min)/range` in 80×30 viewport.
- Detail trend: last **30** logs; pan-scrub + haptics + floating value bubble (130 px wide, clamped).
- Smart advice: weight = `max(0.1, daysSinceLastReflected) / (reflectionCount + 1)`; baseline 30 days staleness; weighted random, fallback last card.
- Check-in pick: weekly → scope weekly|adaptive, limit **3**; else daily|adaptive, limit **2**; random shuffle; weekly adds 1 advice card. Rate limit: **3 hours** since `MAX(timestamp) FROM pillar_logs` (dev-mode bypass).
- Reflection: 1-minute session, EASY (12 s idle); save `{won:true, durationMin:1, pillarId|adviceId, pillarValue, pillarVersion, isAlignmentReflection:true}`; then `linkPillarLogNote(logId, noteId)` or increment advice reflection. Death overlay text: "You stopped reflecting for too long." / "Cancel Reflection" / "Let me finish". Reflections don't extend streak.

## 11. Vlogs & Compression

- Recording: front camera, video, quality pref (1080p default), bitrate map above, keep-awake, 3-2-1 countdown (1 s ticks, spring scale, vibrate 50 ms), regular countdown `MM:SS`, at 0 → vibrate `[0,100,50,100]` + stop button springs up; quick video = unlimited elapsed. AppState background → stop recording. Cancel deletes temp file.
- Save: move to `vlogs/{id}.mp4`, `durationSec = elapsed`, `compressionPreset` set, enqueue compression if preset ≠ off. No streak credit.
- Thumbnails: frame at **1000 ms**, JPEG quality 0.7, `vlog_thumbnails/{id}.jpg`, persisted, in-flight dedup.
- Compression queue: sequential; 500 ms rate limit; 2 retries; 5-min hard timeout (clears `compressionPending`); progress 0→1; active jobs NOT cancellable; dedupe by vlog; orphan recovery on boot (processing→queued); legacy `PENDING_COMPRESSIONS` migration; done/cancelled pruned after 5 min; on success update file path/size + delete old file (iOS-safe: never overwrite existing path).
- Disk monitoring: `cleanupOrphanedVlogs` (delete files without DB row — never user content), `scanOrphanVlogFiles` (skip .jpg/.png), `reattachOrphanVlogFiles` (size+mtime recovered).
- Path rewriting in vlog row converter: rebase `file_path`/`thumbnail_path` to current documentDirectory + `vlogs/` / `vlog_thumbnails/`.

## 12. Security

- PIN: 4 digits, plaintext in old app → **Flutter: flutter_secure_storage** (Keychain/Keystore); never in backups; `allowBackup=false`.
- PinPadModal: dots 14 px, dials 72 px (glassSurfaceSubtle + glassBorderSubtle border, digits 28 px, pressed glassHighlight), vibrate 30 ms per press; 4th digit after 150 ms delay; wrong → shake ±10 px 5×50 ms + vibrate `[0,50,50,50]`; 3 attempts → 30 s lockout banner (danger, pad opacity 0.4, lock-clock icon).
- Modes: `setup_1` ("Create a 4-Digit PIN") → `setup_2` (confirm, mismatch → shake + back) → `verify`. `requestPin(prompt?) → Future<bool>`, overlapping requests reject previous.
- Biometric tiers: 0 locked → 1 `isCirclesUnlocked` → 1.5 `isProfileUnlocked` → 2 `isNotesUnlocked` (implies all; starts inactivity timer). Vision ★ button = central unlock. `keepAlive` resets timer.
- Auto-lock: `lockTimeoutMins` default 3 (0 disables); background grace 30 s (immediate if timeout 0); Inactive state (control center) → immediate; foreground resumes inactivity timer.

## 13. Backup (format v2 — import/export compatible with old app)

- Container: plaintext ZIP `mda_backup_<ISO>.zip` (STORE), entries:
  - `backup_metadata.json`: `{backupVersion:2, schemaVersion, appVersion, createdAt, scopes, sqlite:{table:[rows]}, asyncStorage:{allowlisted}, tableManifest:{table:{columns[], rowCount}}, fileManifest:{vlogs:[], thumbnails:[]}}`
  - `vlogs/<basename>` (unique basename: `${vlogId}_` prefix, then `${vlogId}_${n}_`), `thumbnails/<basename>`.
- Scope → tables: settings→`settings`; notes→`notes,persons,feed_bookmarks,feed_comments`; masteries→`pillars,advice_cards,pillar_logs,pillar_versions`; vlogs→`vlogs`; system (always)→`ai_jobs,ai_logs`.
- Export: checkpoint WAL → scope SELECTs (strip secret setting keys `AI_OLLAMA_API_KEY`, `AI_NEURALWATT_API_KEY`) → AsyncStorage allowlist only (`__DB_SCHEMA_VERSION__`, `FEATURE_FLAGS`) → media manifest (missing → `included:false,reason:'missing'`) → ZIP → **post-zip verification** (every included entry exists with exact size; missing metadata = fatal, missing entries = `verification:'warn'`) → share only after verification. Cleanup old `mda_backup_*.zip`.
- Import gates: `.zip` only → extract → normalize (v2 + legacy v1, else reject) → **schema gate** (`backup.schemaVersion > current` → reject "update the app first") → **manifest gate** (all included present with exact size, else "corrupt backup") → **free-space gate** (`requiredBytes = manifestTotal × 1.1` vs free disk) → pause queues → safety snapshots (prefs pairs + DB file copy + vlog dir + thumbnail dir) → restore SQLite in ONE transaction (DELETE all, column-filtered re-insert) → rewrite media paths to sandbox → restore prefs allowlist (secret keys skipped, schema marker forced local) → restore media files → success.
- Rollback: any failure → restore snapshots (closeDb + delete + copy back, dirs, prefs), never throws out of catch. Queues always resumed in `finally`.
- `BackupResult`: `{success, verification: ok|warn|failed, error?, cancelled?, zipPath?, scopes, tablesIncluded, videosIncluded, videosExcluded[], thumbnailsIncluded, warnings[]}`.

## 14. Feed & Home

- Home = 3 layers: feed layer (starts `translateY = +screenHeight`, slides up), main content (Start | Library pager), LiquidGlassNav (floats, fades + slides down 80 px when feed open).
- Feed reveal: upward-only pan, activation ≥ 8 px, fail on |dx| > 20 px, finger 1:1 tracking; commit ≥ 0.40 progress or velocity < −3000 px/s; spring `springSnappy`; close: progress < 0.70 or velocity > 3000 px/s or projected < 0.5 (factor 0.12).
- Nav: 4 tabs Journal/Circles/Vlog/Check-in; width 88% screen, height 62, bottom = safeBottom + 14; indicator 180 ms cubic-out; gold urgent dot (8 px, top −3, right −5) on Check-in when no check-in in 7 days.
- Feed items: `story` (journal + AI title, 50-word preview, star avatar), `tweet` (full text, bird badge), `checkin` (score emoji + `{n}/10` + tier, 40-word truncate), `clip` (vlog, orange accent). Sort newest first. Filters: All/Bookmarked + type checkboxes (journals/tweets/vlogs/checkins, all default on). Comments ≤ 500 chars. Autoplay when pref on + item visible (threshold 0) + feed progress ≥ 0.95. Scroll-to-top button after 300 px.
- Duration labels: `${min} min` / 🐦 / "Quick Note" / vlog `ceil(durationSec/60) min`.

## 15. UI Component Inventory (spec)

- **LiquidGlassNav**: pill `overlayLockAndroid` fill + `specularBorderStart` 1 px + radius half + shadow 0/10/24 @0.7 (elevation 24, overflow hidden); indicator bubble inset 7 px, `navIndicatorBackground` + `navIndicatorBorder`; icon 22 px + label 10 px.
- **BaseModal** (all sheets): scrim `overlayDark` tap-to-dismiss; sheet `surfaceDark`, top radius 24 (PinPad 32), full `glassBorderMedium` border (sides hidden via off-screen), drag zone 40×5 handle; entry spring + scrim 300 ms; dismiss drag > 80 px or velocity > 600 px/s; height 88% default; keyboard avoid.
- **ConfirmDialog**: `modalBackground` scrim, `surfaceRaised` card radius 20, padding 28, border `glassBorderMedium`, shadow 0/12/30 @0.5, maxWidth min(380, w−48); title 22/800; buttons row (radius 14, cancel glassHighlight / confirm primaryAction, destructive danger + pressed dangerPressed).
- **AnimatedScaleButton**: press 0.95 springSnappy + opacity 0.8/100 ms.
- **TickDial**: major tick every 80 px (2.5×28, lightGrey), 4 minor between (1.5×12, glassBorderMedium), center indicator 3×42 danger; value 44/200 with scale bounce 1.03/90 ms → springSnappy; vibrate 10 ms; snap via smooth scrollTo.
- **PinPad**: see §12.
- **VisionLockButton**: 16 px lock icon + "Locked" (dangerIconOverlay) ↔ gold pillar + "Masteries"; layout placeholder reserves width; shackle 300 ms then 300 ms delay then 250 ms cross-fade (locked shrink 0.85 + rotate 25°).
- **LiquidMorphIcon**: 4 MDI paths (feather/journal, person/circles, video/vlog, star/checkin) morph via path interpolation (~200 ms), 12 frames, scale bounce max 1.04, color lerp 150 ms; default color primaryAction, checkin uses tier color; rendered 42 px (40 checkin).
- **AnimatedSymmetricalRing**: dual arcs draw 600 ms cubic-out (delay), retract 400 ms; color morph 150 ms.
- **StreakPopup**: full-screen `overlayPopup`; staggered: overlay 400, icon spring 200, text 500, week 800, button 1000 ms.
- **NoteCard**: `cardBackground`, radius 20, border glassBorder; header date+duration ("12 Min" / 🐦 Tweet / Quick Note + 🔥 won / 💀 lost); AI processing = 2.4 s pulsing border (dangerBorder ↔ dangerOverlayLight) + "Processing..."; locked = 350 ms fade + `overlayLockAndroid` + lock icon 24 px textDim; press scale 0.97.
- **EmptyLibraryState**: 100 px circle glassSurfaceMinimal + danger gradient, icon 48 red, title 22/800, white pill CTA.
- **Person cards**: 44 px avatar (glassHighlight, initial), count badge dangerAccent/red 12/800; accordion maxHeight 0→320, 250 ms cubic-out.
- **Calendar**: 7-col Monday-first; cell `(w−48)/7`, thumb height ×1.15; empty = 32 px circle; today = 2 px primaryAction ring; vlog days = dangerFill + dangerBorderMedium (today red border), day number 11/800, duration badge "m:ss", stack counter red 16; month swipe with spring commit ±6%.
- **NoteViewerModal**: `overlayVideoStrong` backdrop, `surfaceMedium` sheet radius 32, height 88%+20; meta "123 words • 5 min • v2" red uppercase; swipe-dismiss 150 px / 1000 px/s.
- **VlogViewerModal**: morph-expand 350 ms quad-out from source rect; play/pause flash, mute (0.6 black circle), countdown badge overlayVideoStrong, swipe between same-day vlogs.
- **Settings cards**: glassBackground radius 20 padding 20 marginBottom 20 border glassBorder; active (dev) = 2 px gold border.
- **Toggle**: 44×26 track, 22 px knob, red when on.

## 16. Haptic Patterns (`haptics.ts`)

| Action | Pattern |
|---|---|
| tick snap / option select / version | `10` |
| dial press / regenerate / tweet | `30` |
| unlock success / lock all | `50` |
| open vlog day | `20` |
| backup ops | `15` |
| favorite star | `5` |
| PIN error | `[0,50,50,50]` |
| dev ON | `[0,50,100,50,100,150]` |
| dev OFF | `[0,150,100,150]` |
| death | `[0,200,100,200]` |
| session end (vlog) | `[0,100,50,100]` |

## 17. Navigation Graph (go_router mapping)

- Home (Start|Library pager + Feed overlay + Nav) — root.
- `Writing`: params `{timeIndex, diffIndex, mode: journal|circles, personId?, isTweet?, isQuickNote?, buttonLayout?}` — transparent modal, no animation, detach-previous OFF.
- `PostWriting`: `{noteId, streakIncreased?, newStreak?}` — transparent modal fade.
- `PillarsDashboard` → `PillarDetail {pillarId}`.
- `AlignmentWriting`: `{alignmentScore, timeIndex, buttonLayout?}` — transparent modal; from locked gate → replace PillarsDashboard; complete → popToTop.
- `VlogRecording`: `{timeIndex, isQuickVideo?}` — on save reset to Home with streak params; cancel → back.
- `Sandbox` (dev).
- Events (not route params): streak popup, `VLOG_MODAL_CLOSED` (force remount of originating video).

## 18. Feature Flags (all default true, key `FEATURE_FLAGS`)

`ENABLE_TWEET_IN_JOURNAL_MODE`, `ENABLE_TWEET_IN_CIRCLE_MODE`, `ENABLE_TWEET_FILTER_IN_FEED`, `ENABLE_CIRCLE_TWEET_FEED`.
