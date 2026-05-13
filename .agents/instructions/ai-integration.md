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
Ollama Cloud API uses `XMLHttpRequest` (not fetch) for progressive response reading. `aiService.ts` handles the XHR streaming with reader callbacks. Do not switch to `fetch` — it buffers the entire response before resolving.

## Config & Prompts
- Models and prompts are defined in `src/config/ai.ts`
- `DEFAULT_AI_PROMPTS` is overridable at runtime via Dev Settings
- `AI_AVAILABLE_MODELS` lists supported models
- Base URL and model are user-configurable in settings
- Queue validates `apiKey` and `baseUrl` are non-empty before starting any job; missing credentials fail fast without retries

## Retry & Error Handling
- Failed AI jobs retry up to `AI_MAX_RETRIES` times, then move to end of queue
- Failed compression jobs retry up to `COMPRESSION_MAX_RETRIES` (2) times, then show error in UI
- Missing API key or base URL fails immediately (no retries)
- Network/timeout/auth errors mark server as offline (`serverOnline = false`)
- Health checks resume automatically when server comes back online
- Jobs in 'processing' status during app crash are recovered on next startup (`recoverOrphans()`)
- Orphan recovery resets `retryCount` and `error` to ensure clean restart

## Compression Queue Specifics
- Sequential processing — one video at a time to avoid CPU thrashing
- Real-time progress via `compressVideo()` `onProgress` callback → emits state update
- Active jobs **CANNOT be cancelled** because `react-native-compressor` has no cancellation API
- Legacy `PENDING_COMPRESSION_KEY` entries are auto-migrated on first startup

## Cancellation
- Individual AI job cancellation: `aiQueue.cancelJob(jobId)` — aborts in-flight XHR
- Batch AI cancellation: `aiQueue.cancelBatch()` — removes all queued jobs, current job finishes
- Compression queue: `compressionQueue.cancelJob(jobId)` — cancels QUEUED jobs only; active jobs show disabled button

## Logging
All AI operations are logged via `aiLogger.ts` with structured data (FIFO 200 entries).
Compression queue logs via `logger('info'|'error', 'CompressionQueue', ...)`.
