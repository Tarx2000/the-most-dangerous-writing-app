# Domain Instruction: AI Integration

## Scope
Any file in `src/lib/aiQueue.ts`, `src/lib/aiService.ts`, `src/lib/aiLogger.ts`, or `src/config/ai.ts`.

## Singleton Queue Pattern (Mandatory)
- `aiQueue.ts` is a singleton. Do NOT instantiate new queues.
- Access via `useAiQueueContext()` — the old `useAiQueue` hook is deprecated.
- `AiQueueProvider` wraps the app once in `App.tsx`.

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

## Retry & Error Handling
- Failed jobs retry up to `AI_MAX_RETRIES` times, then move to end of queue
- Network/timeout errors mark server as offline (`serverOnline = false`)
- Health checks resume automatically when server comes back online
- Jobs in 'processing' status during app crash are recovered on next startup (`recoverOrphans()`)

## Cancellation
- Individual job cancellation: `aiQueue.cancelJob(jobId)` — aborts in-flight XHR
- Batch cancellation: `aiQueue.cancelBatch()` — removes all queued jobs, current job finishes

## Logging
All AI operations are logged via `aiLogger.ts` with structured data (FIFO 200 entries).
