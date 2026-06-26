# Domain Instruction: AI Integration

## Scope
Any file in `src/lib/aiQueue.ts`, `src/lib/aiService.ts`, `src/lib/aiLogger.ts`, `src/lib/compressionQueue.ts`, or `src/config/ai.ts`.

## Singleton Queue Pattern (Mandatory)
- `aiQueue.ts` is a singleton. Do NOT instantiate new queues.
- Access via `useAiQueueContext()` — the old `useAiQueue` hook is deprecated.
- `AiQueueProvider` wraps the app once in `App.tsx`.

- `compressionQueue.ts` follows the SAME singleton + DeviceEventEmitter pattern for video compression.
- Access via `useCompressionQueueContext()`.
- `CompressionQueueProvider` wraps the app once in `App.tsx` (nested inside `AiQueueProvider`).

## Job Categories
AI jobs are processed in this order:
1. `journal` — Journal entry title/summary generation
2. `circle` — Circle note processing (uses `RelationshipContext`)
3. `checkin` — Weekly alignment check-in processing

Within each category, newest entries are processed first.

## Streaming Protocol
AI Providers use `XMLHttpRequest` (not fetch) for progressive response reading. `aiService.ts` handles the XHR streaming with reader callbacks (with Ollama-specific properties conditionally omitted for Neuralwatt). Do not switch to `fetch` — it buffers the entire response before resolving.

## Config & Prompts
- Providers (Ollama & Neuralwatt), default models, and system prompts are defined in `src/config/ai.ts`
- `DEFAULT_AI_PROMPTS` is overridable at runtime via Dev Settings
- Base URL, API key, model, and active provider are user-configurable in settings
- Queue validates that the active provider's `apiKey` and `baseUrl` are non-empty before starting any job; missing credentials fail fast without retries
- **The `AiConfig` passed to `aiQueue.initialize()` MUST include `provider`.** Omitting it causes the first init to silently fall back to `'ollama'` even when Neuralwatt is selected — `useAiQueueProvider.initializeQueue` sets this correctly; any new init site must too.

## Retry & Error Handling

### Structured Error Classification (Mandatory)
All AI failures flow through the `AiError` class (`src/lib/aiService.ts`) and its
classifiers. Never inspect raw error strings in UI or queue code — use `kind`.

- **`AiErrorKind`**: `'network' | 'timeout' | 'server' | 'rateLimit' | 'auth' | 'config' | 'cancelled' | 'parse'`
- **`classifyHttpStatus(status, context?)`** → maps HTTP codes: 401/403→`auth`, 429→`rateLimit`, 5xx→`server`, other 4xx→`config`.
- **`classifyError(unknown)`** → wraps any thrown value into `AiError` using message heuristics (cancellation, timeout, network, auth markers, 5xx). Pass-through for existing `AiError` instances.
- **`isRetryableKind(kind)`** → true for `network | timeout | server | rateLimit`. The queue and `ollamaChat` retry only these; `auth | config | cancelled | parse` fail-fast.

Every `AiError` carries TWO messages:
- `message` — technical line for logs (kept stable so legacy string-based catchers keep working).
- `userMessage` — short, actionable, non-technical text **safe to surface directly to users** (e.g. "Your API key is invalid or expired. Open AI Settings…").

**Rule:** when setting a user-facing error state (e.g. `queueState.lastError`, a notification, an alert), always use `classified.userMessage`, never the raw technical string.

### Retry Behavior
- Failed AI jobs retry up to `AI_MAX_RETRIES` times **only on retryable kinds**, then move to end of queue.
- Permanently-fatal kinds (`auth`, `config`, `parse`) skip retries entirely and emit a permanent failure immediately.
- `processNote` treats "empty results" (model returned nothing) as a transient `AiError('server')` so it still retries — don't downgrade it to `parse`.
- Failed compression jobs retry up to `COMPRESSION_MAX_RETRIES` (2) times, then show error in UI
- Missing API key or base URL fails immediately (no retries)
- Network/timeout/auth/rateLimit/server errors mark server as offline (`serverOnline = false`)
- Health checks resume automatically when server comes back online

### Adaptive Health-Check Throttling
`isServerPersistentlyOffline()` (more than 3 consecutive ping failures) widens the
health-check interval from `AI_HEALTH_CHECK_INTERVAL_MS` (10s) to
`HEALTH_CHECK_PERSISTENT_INTERVAL_MS` (60s) so a dead endpoint stops draining the
battery, while still auto-resuming the moment a ping succeeds. The interval is
re-evaluated after each check via `rescheduleHealthCheck()`.
- Jobs in 'processing' status during app crash are recovered on next startup (`recoverOrphans()`)
- Orphan recovery resets `retryCount` and `error` to ensure clean restart

## Grammar Check Contract
`checkGrammar()` distinguishes a **real failure** from a genuine "no issues" result:
- Returns `GrammarSuggestion[]` (`[]` means the model successfully found nothing).
- **Throws `AiError('parse')`** when the response cannot be parsed into the
  expected JSON shape. UIs MUST catch this and show a "couldn't check" state
  (with Retry) instead of the misleading "No issues found!".
Callers (e.g. `PostWritingScreen`) wrap in try/catch, classify the error, and
surface `userMessage` in an error banner.

## User-Facing Troubleshooting Surfaces
The provider (`useAiQueueProvider.tsx`) builds `AiFailureNotification[]` from
`AI_JOB_FAILED_EVENT` / `AI_JOB_TIMEOUT_EVENT`, each carrying `errorKind` +
the friendly `message`. **These MUST be surfaced, never dropped:**
- **`AiSettingsPanel` → AI Status section** lists recent permanent failures with the actionable reason, a per-note **Retry** (`retryNote(noteId)`), and dismiss/Clear-all.
- **`PostWritingScreen`** shows a per-note failure banner (Retry) for the current note, actionable hints on "AI Server Unreachable" (renders `queueState.lastError` + a Settings pointer), and a grammar-check error banner (classify + Retry) when the check itself fails.
- **Test Connection** (`AiSettingsPanel`) uses the classified `PingResult` to render an actionable message (e.g. auth → "invalid API key", network → "check connection/base URL") instead of a cryptic HTTP status.

## Compression Queue Specifics
- Sequential processing — one video at a time to avoid CPU thrashing
- Real-time progress via `compressVideo()` `onProgress` callback → emits state update
- Active jobs **CANNOT be cancelled** because `react-native-compressor` has no cancellation API
- Legacy `PENDING_COMPRESSION_KEY` entries are auto-migrated on first startup

## Cancellation
- Individual AI job cancellation: `aiQueue.cancelJob(jobId)` — aborts in-flight XHR
- Batch AI cancellation: `aiQueue.cancelBatch()` — removes all queued jobs, current job finishes
- Compression queue: `compressionQueue.cancelJob(jobId)` — cancels QUEUED jobs only; active jobs show disabled button
- `retryNote(noteId)` (provider) re-enqueues a previously-failed note and clears its failure notification

## Logging
All AI operations are logged via `aiLogger.ts` with structured data (FIFO 200 entries).
Compression queue logs via `logger('info'|'error', 'CompressionQueue', ...)`.
On permanent failures, `AI_JOB_FAILED_EVENT` payloads include `errorKind` so the UI can render targeted fix hints; `AI_JOB_TIMEOUT_EVENT` payloads map to `errorKind: 'timeout'`.

## Logging
All AI operations are logged via `aiLogger.ts` with structured data (FIFO 200 entries).
Compression queue logs via `logger('info'|'error', 'CompressionQueue', ...)`.
