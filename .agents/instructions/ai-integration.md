# Domain Instruction: AI Integration & Streaming (Flutter)

## Scope
`mda_flutter/lib/data/services/ai_service.dart`, `mda_flutter/lib/data/queues/ai_queue.dart`, `mda_flutter/lib/data/queues/compression_queue.dart`, and AI settings UI.

## Singleton Queues
- **`AiQueue`** (`lib/data/queues/ai_queue.dart`): Central singleton managing automated title, summary, and reflection generation.
- **`CompressionQueue`** (`lib/data/queues/compression_queue.dart`): Central singleton managing background vlog video compression sequentially.
- Both queues initialize at app startup, persist job status to SQLite, and support `pauseAndDrain()` for backup safety.

## Streaming Protocol
- AI requests use `http.Client().send(StreamedResponse)` with an SSE (Server-Sent Events) line parser to stream response tokens piece by piece.
- Supports Ollama Cloud, Neuralwatt, and OpenAI-compatible providers.
- Missing credentials fail fast without retrying.

## Structured Error Classification (`AiError`)
All AI exceptions flow through `AiError` and its classifiers:
- **Kinds (`AiErrorKind`)**:
  - `network`, `timeout`, `server`, `rateLimit` (Retryable)
  - `auth`, `config`, `cancelled`, `parse` (Non-retryable / Fail-fast)
- **Two Messages**:
  - `message`: Technical description for logs and diagnostics.
  - `userMessage`: Plain-English, actionable explanation safe to display in banners and snackbars.

## Grammar Check Contract
- `checkGrammar()` returns `List<GrammarSuggestion>` (empty list means 0 issues found).
- If JSON parsing fails, throws `AiError(AiErrorKind.parse)`. The UI catches this and surfaces a "Couldn't check grammar" banner with a Retry button rather than claiming "No issues found".
