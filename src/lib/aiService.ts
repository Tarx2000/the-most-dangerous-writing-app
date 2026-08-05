/**
 * AI Service — Ollama Cloud API Client
 *
 * Pure service module (no React) that communicates with the Ollama Cloud API.
 * Uses XMLHttpRequest for streaming support in React Native.
 *
 * Functions:
 * - generateTitle()  → short headline for a journal entry (max 8 words)
 * - generateSummary() → 2-5 bullet points of key takeaways
 * - processNote()    → runs title + summary sequentially, returns both
 * - checkGrammar()   → array of grammar/spelling corrections
 * - pingServer()     → health check (is the AI reachable?)
 *
 * All functions accept config overrides so userStorage values can be passed in.
 */

import {
    DEFAULT_OLLAMA_API_KEY,
    DEFAULT_OLLAMA_BASE_URL,
    DEFAULT_OLLAMA_MODEL,
    DEFAULT_AI_PROMPTS,
    AI_REQUEST_TIMEOUT_MS,
    AI_MAX_RETRIES,
    type AiPrompts,
} from '@/config/ai';
import { logAi } from '@/lib/logger';

/* ── Structured Error Classification ──────────────────────────────────── */

/**
 * Machine-readable category for every failure mode the AI service can hit.
 *
 * The UI uses `kind` (not a fragile string) to decide what troubleshooting
 * hint to show the user and whether to retry.
 *
 * - `network`  → connection dropped / unreachable (retryable)
 * - `timeout`  → request exceeded the per-call limit (retryable)
 * - `server`   → 5xx from the provider (retryable)
 * - `rateLimit`→ 429 from the provider (retryable, with backoff)
 * - `auth`     → 401 / 403, or Neuralwatt with no key (NOT retryable)
 * - `config`   → missing API key / base URL (NOT retryable)
 * - `cancelled`→ user or queue aborted (NOT retryable)
 * - `parse`    → response could not be parsed into the expected shape
 *                (e.g. grammar JSON malformed) (NOT retryable)
 */
export type AiErrorKind = 'network' | 'timeout' | 'server' | 'rateLimit' | 'auth' | 'config' | 'cancelled' | 'parse';

/**
 * Error thrown (or returned via classification) by the AI service.
 *
 * The `message` field stays a plain, human-readable string so that legacy
 * string-based callers (e.g. the queue's catch path) keep behaving the same.
 * The `kind` + `userMessage` give the UI a precise, actionable signal:
 * `userMessage` is what we surface directly to the end user, while `message`
 * is a slightly more technical line used for logs.
 *
 * SSE: Server-Sent Events — a streaming text format where each event is a
 * line starting with "data: ". Providers stream tokens this way so the UI
 * can render text piece-by-piece as the model generates it.
 */
export class AiError extends Error {
    readonly kind: AiErrorKind;
    /** Short, non-technical message safe to show end users. */
    readonly userMessage: string;
    /** HTTP status code if the error originated from a response, else undefined. */
    readonly statusCode?: number;

    constructor(kind: AiErrorKind, userMessage: string, technicalMessage?: string, statusCode?: number) {
        // Prefer the explicit technical message; fall back to userMessage so
        // string-based catchers always see something useful.
        super(technicalMessage || userMessage);
        this.name = 'AiError';
        this.kind = kind;
        this.userMessage = userMessage;
        this.statusCode = statusCode;
    }
}

/**
 * True when an error kind is worth retrying.
 * Network blips, timeouts, 5xx, and rate-limit (with backoff) recover.
 * Auth / config / cancel / parse errors never will.
 */
export function isRetryableKind(kind: AiErrorKind): boolean {
    return kind === 'network' || kind === 'timeout' || kind === 'server' || kind === 'rateLimit';
}

/**
 * Map an HTTP status code to a structured AiError.
 * 401/403 → auth, 429 → rateLimit, 4xx → config/parse, 5xx → server.
 */
export function classifyHttpStatus(status: number, context: string = 'AI request'): AiError {
    if (status === 401 || status === 403) {
        return new AiError(
            'auth',
            'Your API key is invalid or expired. Open AI Settings and check the key for the active provider.',
            `${context} failed with HTTP ${status} (auth)`,
            status,
        );
    }
    if (status === 429) {
        return new AiError(
            'rateLimit',
            'The AI provider is rate-limiting your account. Wait a moment and try again.',
            `${context} failed with HTTP 429 (rate limited)`,
            status,
        );
    }
    if (status >= 500 && status < 600) {
        return new AiError(
            'server',
            `The AI provider returned a server error (HTTP ${status}). It's usually temporary — try again shortly.`,
            `${context} failed with HTTP ${status} (server)`,
            status,
        );
    }
    // Other 4xx (400, 404, 422, ...) — generally not recoverable by retrying.
    return new AiError(
        'config',
        `The request was rejected by the provider (HTTP ${status}). Check the model name and base URL in AI Settings.`,
        `${context} failed with HTTP ${status} (client)`,
        status,
    );
}

/**
 * Convert any thrown value (Error, string, unknown) into an `AiError`.
 * Uses string heuristics for non-AiError values so existing code paths
 * that throw plain `Error('Network request failed')` still classify.
 */
export function classifyError(error: unknown): AiError {
    if (error instanceof AiError) return error;

    const msg = error instanceof Error ? error.message : String(error ?? '');

    // Cancellation
    if (msg.includes('cancelled') || msg.includes('aborted')) {
        return new AiError('cancelled', 'The request was cancelled.', msg);
    }
    // Timeout
    if (msg.includes('timed out')) {
        return new AiError('timeout', 'The request took too long and timed out.', msg);
    }
    // Network / connection
    if (msg.includes('Network request failed') || msg.includes('connection dropped') || msg.includes('unreachable')) {
        return new AiError('network', 'Cannot reach the AI server. Check your internet connection and base URL.', msg);
    }
    // Auth markers produced by classifyHttpStatus or plain status strings
    if (msg.includes('401') || msg.includes('403') || /auth/i.test(msg)) {
        return new AiError('auth', 'Your API key is invalid or expired. Check it in AI Settings.', msg);
    }
    // Rate limit
    if (msg.includes('429')) {
        return new AiError('rateLimit', 'The AI provider is rate-limiting you. Wait a moment.', msg);
    }
    // 5xx
    if (/[5]\d\d/.test(msg)) {
        return new AiError('server', 'The AI provider returned a server error. Try again shortly.', msg);
    }

    // Fallback — treat as a generic/parse failure (not retryable)
    return new AiError('parse', 'The AI response could not be processed. Try again later.', msg);
}

/* ── Types ────────────────────────────────────────────────────────────── */

export interface GrammarSuggestion {
    original: string;
    suggestion: string;
    explanation: string;
}

export interface AiConfig {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    grammarModel?: string;
    prompts?: Partial<AiPrompts>;
    provider?: string;
}

/**
 * Context for relationship journal entries.
 * Passed when processing Circle (person) entries to inject person-specific data into prompts.
 */
export interface RelationshipContext {
    /** The person's name (e.g. "Sarah") */
    personName: string;
    /** The relationship label (e.g. "Friend", "Family") */
    relationshipStatus: string;
}

export interface AiProcessResult {
    title: string;
    summary: string[];
    /** True when the AI call failed or returned empty results */
    failed: boolean;
}

/* ── Connection Health State ──────────────────────────────────────────── */

/** Consecutive ping failures (reset to 0 on success) */
let _consecutivePingFailures = 0;

/** Threshold above which the server is considered persistently offline */
const PERSISTENT_OFFLINE_THRESHOLD = 3;

/**
 * Returns whether the server appears persistently offline based on
 * consecutive ping failure count.  When true callers may reduce
 * health-check frequency or skip work entirely.
 */
export function isServerPersistentlyOffline(): boolean {
    return _consecutivePingFailures > PERSISTENT_OFFLINE_THRESHOLD;
}

/** Reset ping failure counter — call when API config changes to avoid stale offline state */
export function resetConnectionState(): void {
    _consecutivePingFailures = 0;
}

/** Reset all module-level state for test isolation */
export function resetStateForTesting(): void {
    _consecutivePingFailures = 0;
}

/** Alias for test consumers expecting a different name */
export const resetAiServiceState = resetStateForTesting;

/* ── Retry Utilities ─────────────────────────────────────────────────── */

/**
 * Determine whether an error is transient (worth retrying).
 *
 * Delegates to the structured `AiError.kind` when possible; for callers that
 * still throw plain `Error` objects, `classifyError` heuristically maps the
 * message to a kind. Network errors, timeouts, 5xx, and 429 are retryable.
 * Auth errors, 4xx client errors, parse errors, and cancellations are NOT.
 */
function isTransientError(error: Error): boolean {
    return isRetryableKind(classifyError(error).kind);
}

/**
 * Sleep helper — returns a promise that resolves after `ms` milliseconds.
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ── Cancel Token ─────────────────────────────────────────────────── */

/**
 * Token for cancelling in-flight AI requests.
 * Pass the same token instance to ollamaChat/ollamaChatSingle to allow
 * external cancellation (e.g. user hits "Cancel" or queue cancels a job).
 * Calling abort() will cause the in-flight XHR to be rejected with
 * an "AI request cancelled" error.
 */
export class AiCancelToken {
    public aborted = false;

    /** Mark this token as cancelled and abort any in-flight request. */
    abort(): void {
        this.aborted = true;
    }

    /** Reset the token so it can be reused for a new request. */
    reset(): void {
        this.aborted = false;
    }
}

/* ── Internal Helpers ─────────────────────────────────────────────────── */

/**
 * Send a single (non-retried) chat completion request to the Ollama Cloud API.
 * This is the low-level XHR call; retry logic lives in the wrapper above it.
 */
async function ollamaChatSingle(
    systemPrompt: string,
    userMessage: string,
    config: AiConfig = {},
    optionsOverwrite: Record<string, unknown> = {},
    onChunk?: (text: string) => void,
    cancelToken?: AiCancelToken,
): Promise<string> {
    const apiKey = config.apiKey || DEFAULT_OLLAMA_API_KEY;
    const baseUrl = (config.baseUrl || DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, '');
    const model = config.model || DEFAULT_OLLAMA_MODEL;

    const url = `${baseUrl}/chat/completions`;
    const mergedOptions = {
        num_ctx: 16384,
        ...optionsOverwrite,
    };

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);

        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);

        let processedLength = 0;
        let rawBuffer = '';
        let fullResponse = '';
        let streamedResponse = '';
        let wordBuffer = '';
        let settled = false;
        let cancelCheckInterval: ReturnType<typeof setInterval> | null = null;

        /** Guard against double-resolve/reject — clears timeout on first settlement */
        const settle = (fn: 'resolve' | 'reject', value: string | Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            if (cancelCheckInterval) {
                clearInterval(cancelCheckInterval);
                cancelCheckInterval = null;
            }
            if (fn === 'resolve') resolve(value as string);
            else reject(value as Error);
        };

        xhr.onreadystatechange = () => {
            if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
                if (xhr.status === 0 || xhr.status === 200) {
                    // 100 Continue / 200 OK headers are fine — keep reading stream
                    return;
                }
                if (xhr.status !== 200) {
                    xhr.abort();
                    // Classify the HTTP status into an actionable AiError
                    // (401/403 → auth, 429 → rateLimit, 5xx → server, else → config).
                    settle('reject', classifyHttpStatus(xhr.status, 'Ollama API'));
                }
            } else if (xhr.readyState === XMLHttpRequest.LOADING || xhr.readyState === XMLHttpRequest.DONE) {
                if (!xhr.responseText) {
                    // On DONE with empty body, settle to prevent promise from hanging forever
                    if (xhr.readyState === XMLHttpRequest.DONE) {
                        settle('resolve', '');
                    }
                    return;
                }
                const newText = xhr.responseText.substring(processedLength);
                processedLength = xhr.responseText.length;
                rawBuffer += newText;

                let newlineIndex;
                while ((newlineIndex = rawBuffer.indexOf('\n')) !== -1) {
                    const line = rawBuffer.slice(0, newlineIndex).trim();
                    rawBuffer = rawBuffer.slice(newlineIndex + 1);
                    if (line) {
                        try {
                            // Handle OpenAI-style SSE prefix "data: "
                            let contentToParse = line;
                            if (line.startsWith('data: ')) {
                                contentToParse = line.slice(6).trim();
                            }

                            // OpenAI "Done" signal
                            if (contentToParse === '[DONE]') return;

                            const parsed = JSON.parse(contentToParse);
                            if (parsed.error) {
                                settle(
                                    'reject',
                                    new AiError(
                                        'server',
                                        `The AI provider reported an error: ${String(parsed.error).slice(0, 140)}`,
                                        `Ollama Error: ${parsed.error}`,
                                    ),
                                );
                                return;
                            }

                            // Support both OpenAI (choices[0].delta.content) and Ollama native (message.content)
                            const chunkStr =
                                parsed.choices?.[0]?.delta?.content ||
                                parsed.choices?.[0]?.message?.content ||
                                parsed.message?.content ||
                                '';

                            fullResponse += chunkStr;

                            if (onChunk && chunkStr) {
                                wordBuffer += chunkStr;

                                // Flush wordBuffer when a boundary is found (space, tab, newline, common or Chinese punctuation, or CJK characters)
                                if (
                                    /[ \t\n.,!?\-:;，。！？、"”'"\u4e00-\u9fa5]/.test(chunkStr.slice(-1)) ||
                                    wordBuffer.length > 12
                                ) {
                                    streamedResponse += wordBuffer;
                                    wordBuffer = '';
                                    onChunk(streamedResponse);
                                }
                            }
                        } catch (err) {
                            logAi('warn', 'Failed to parse stream line:', { line, err });
                        }
                    }
                }

                // Flush remaining buffer on DONE
                if (xhr.readyState === XMLHttpRequest.DONE) {
                    if (wordBuffer && onChunk) {
                        streamedResponse += wordBuffer;
                        wordBuffer = '';
                        onChunk(streamedResponse);
                    }
                    settle('resolve', fullResponse.trim());
                }
            }
        };
        xhr.onerror = () => {
            logAi('warn', 'XHR Error occurred', { readyState: xhr.readyState, status: xhr.status });
            settle(
                'reject',
                new AiError(
                    'network',
                    'Cannot reach the AI server. Check your internet connection and base URL in AI Settings.',
                    'Network request failed (connection dropped or unreachable)',
                ),
            );
        };

        // Abort after timeout to prevent hanging requests
        const timeoutId = setTimeout(() => {
            xhr.abort();
            settle(
                'reject',
                new AiError(
                    'timeout',
                    `The AI request timed out after ${AI_REQUEST_TIMEOUT_MS / 1000}s. The model may be cold-starting or busy.`,
                    `AI request timed out after ${AI_REQUEST_TIMEOUT_MS / 1000}s`,
                ),
            );
        }, AI_REQUEST_TIMEOUT_MS);

        // Cancel token: poll for external abort (e.g. user cancels or queue cancels)
        if (cancelToken) {
            if (cancelToken.aborted) {
                // Settle via the shared `settle` helper — a bare `return Promise.reject(...)`
                // inside the executor is DISCARDED and would leave the outer promise
                // pending forever, permanently wedging the AI queue.
                settle('reject', new AiError('cancelled', 'The request was cancelled.', 'AI request cancelled'));
                return;
            }
            cancelCheckInterval = setInterval(() => {
                if (cancelToken && cancelToken.aborted) {
                    if (cancelCheckInterval) clearInterval(cancelCheckInterval);
                    xhr.abort();
                    settle('reject', new AiError('cancelled', 'The request was cancelled.', 'AI request cancelled'));
                }
            }, 200);
        }

        const payload: Record<string, unknown> = {
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
            ],
            stream: true, // ALWAYS stream to prevent silent idle connection timeouts
        };

        // Only send Ollama-specific options block if the provider is Ollama
        const provider = config.provider || 'ollama';
        if (provider === 'ollama') {
            payload.options = mergedOptions;
        }

        xhr.send(JSON.stringify(payload));
    });
}

/**
 * Send a chat completion request with exponential-backoff retries.
 *
 * Wraps `ollamaChatSingle` and retries on transient errors only
 * (network failures, timeouts, 5xx, 429).  Auth errors, 4xx, parse and
 * cancellation errors are short-circuited — never retried — via
 * `isRetryableKind`.  Backoff starts at 1 s and doubles each attempt.
 *
 * NOTE on streaming + retries: `onChunk` IS wired on every attempt so the
 * UI keeps updating live.  When a transient error triggers a retry, we
 * reset the consumer's buffer by calling `onChunk('')` first so that
 * partial tokens from the failed attempt don't corrupt the output.
 */
async function ollamaChat(
    systemPrompt: string,
    userMessage: string,
    config: AiConfig = {},
    optionsOverwrite: Record<string, unknown> = {},
    onChunk?: (text: string) => void,
    cancelToken?: AiCancelToken,
): Promise<string> {
    const maxAttempts = AI_MAX_RETRIES + 1; // e.g. AI_MAX_RETRIES=2 → 3 attempts
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            // Stream progress on all attempts. If a retry occurs, we clear the buffer.
            const result = await ollamaChatSingle(
                systemPrompt,
                userMessage,
                config,
                optionsOverwrite,
                onChunk,
                cancelToken,
            );
            return result;
        } catch (error: unknown) {
            if (error instanceof Error) {
                lastError = error;
            }

            if (!(error instanceof Error) || !isTransientError(error)) {
                throw error;
            }

            // If we have retries left, wait with exponential backoff
            const retriesLeft = maxAttempts - attempt - 1;
            if (retriesLeft > 0) {
                // If a transient error occurs and we are about to retry, clear the consumer's UI buffer
                // so that partial streaming from the failed attempt doesn't corrupt the output.
                if (onChunk) {
                    try {
                        onChunk('');
                    } catch (cbErr) {
                        console.warn('[AI] Error in onChunk retry reset callback:', cbErr);
                    }
                }

                const delayMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s, ...
                console.warn(
                    `[AI] Transient error (attempt ${attempt + 1}/${maxAttempts}), ` +
                        `retrying in ${delayMs}ms: ${(error as Error)?.message}`,
                );
                // If cancelled, don't retry
                if (cancelToken && cancelToken.aborted) {
                    throw new Error('AI request cancelled', { cause: error });
                }
                await sleep(delayMs);
            }
        }
    }

    // All retries exhausted
    throw lastError;
}

/* ── Public API ───────────────────────────────────────────────────────── */

/**
 * Generate a short, fitting headline for a journal entry (max 8 words).
 *
 * @param text - The full journal entry text
 * @param config - Optional config overrides (apiKey, model, prompts)
 * @returns A headline string (max 8 words)
 */
export async function generateTitle(
    text: string,
    config: AiConfig = {},
    onChunk?: (text: string) => void,
    relationship?: RelationshipContext,
    cancelToken?: AiCancelToken,
): Promise<string> {
    if (!text || text.trim().length === 0) {
        logAi('warn', 'generateTitle called with empty text');
        return '';
    }
    let prompt = config.prompts?.title || DEFAULT_AI_PROMPTS.title;
    if (relationship) {
        prompt = (config.prompts?.relationshipTitle || DEFAULT_AI_PROMPTS.relationshipTitle)
            .replace(/\{\{PERSON_NAME\}\}/g, relationship.personName)
            .replace(/\{\{RELATIONSHIP_STATUS\}\}/g, relationship.relationshipStatus);
    }
    // Removed num_predict to prevent empty outputs
    const title = await ollamaChat(prompt, text, config, {}, onChunk, cancelToken);
    // Clean up: remove surrounding quotes if the model adds them
    return title.replace(/^["']+|["']+$/g, '').trim();
}

/**
 * Generate a 2-5 bullet-point summary of a journal entry.
 *
 * @param text - The full journal entry text
 * @param config - Optional config overrides
 * @returns Array of bullet-point strings (without the "• " prefix)
 */
export async function generateSummary(
    text: string,
    config: AiConfig = {},
    onChunk?: (text: string) => void,
    relationship?: RelationshipContext,
    cancelToken?: AiCancelToken,
): Promise<string[]> {
    if (!text || text.trim().length === 0) {
        logAi('warn', 'generateSummary called with empty text');
        return [];
    }
    let prompt = config.prompts?.summary || DEFAULT_AI_PROMPTS.summary;
    if (relationship) {
        prompt = (config.prompts?.relationshipSummary || DEFAULT_AI_PROMPTS.relationshipSummary)
            .replace(/\{\{PERSON_NAME\}\}/g, relationship.personName)
            .replace(/\{\{RELATIONSHIP_STATUS\}\}/g, relationship.relationshipStatus);
    }
    const raw = await ollamaChat(prompt, text, config, {}, onChunk, cancelToken);

    // Parse bullet points: split by newline, strip "• " or "- " prefixes
    const bullets = raw
        .split('\n')
        .map((line) => line.replace(/^[\s•\-*]+/, '').trim())
        .filter((line) => line.length > 0);

    // Clamp to 2-5 bullets
    return bullets.slice(0, 5);
}

/**
 * Check grammar and spelling in a journal entry.
 *
 * @param text - The full journal entry text
 * @param config - Optional config overrides
 * @returns Array of GrammarSuggestion objects. An empty array means the
 *          model successfully found no issues.
 * @throws {AiError} with kind 'parse' if the response cannot be parsed
 *         into the expected JSON shape (so callers can show "couldn't check"
 *         instead of the misleading "No issues found").
 */
export async function checkGrammar(
    text: string,
    config: AiConfig = {},
    onChunk?: (text: string) => void,
    cancelToken?: AiCancelToken,
): Promise<GrammarSuggestion[]> {
    const prompt = config.prompts?.grammar || DEFAULT_AI_PROMPTS.grammar;
    // Honour a dedicated grammar model when set, else fall through to the
    // provider default inside ollamaChatSingle (avoids passing an empty model).
    const grammarConfig: AiConfig = config.grammarModel ? { ...config, model: config.grammarModel } : config;
    const raw = await ollamaChat(prompt, text, grammarConfig, {}, onChunk, cancelToken);

    try {
        // Try to extract JSON from the response (model might wrap in code fences)
        const jsonStr = raw
            .replace(/```json?\s*/g, '')
            .replace(/```/g, '')
            .trim();
        const parsed = JSON.parse(jsonStr);

        if (!Array.isArray(parsed)) {
            throw new Error('Grammar response was not a JSON array');
        }

        // Validate each item has required fields
        return parsed.filter(
            (item: unknown): item is GrammarSuggestion =>
                typeof (item as Record<string, unknown>).original === 'string' &&
                typeof (item as Record<string, unknown>).suggestion === 'string' &&
                typeof (item as Record<string, unknown>).explanation === 'string',
        );
    } catch (err: unknown) {
        // Distinguish "model returned garbage" from "model returned []": the
        // former is a parse error so the UI shows "couldn't check", never the
        // misleading "No issues found".
        logAi('warn', 'Grammar response could not be parsed as JSON', { raw, err });
        throw new AiError(
            'parse',
            "Couldn't read the grammar response. The model may be unable to follow the JSON format — try another model.",
            `Failed to parse grammar response: ${(err as Error)?.message ?? err}`,
        );
    }
}

/**
 * Fetch available models from the AI provider.
 * Returns an array of model IDs (strings) or an empty array on failure.
 * Uses the OpenAI-compatible /v1/models endpoint.
 *
 * Failures are logged with a classified reason so the Settings UI can
 * explain why the model list is empty (auth, network, etc.) rather than
 * silently rendering a blank picker.
 */
export async function fetchAvailableModels(config: AiConfig = {}): Promise<string[]> {
    const provider = config.provider || 'ollama';
    const apiKey = config.apiKey !== undefined ? config.apiKey : provider === 'ollama' ? DEFAULT_OLLAMA_API_KEY : '';
    const baseUrl = (
        config.baseUrl || (provider === 'ollama' ? DEFAULT_OLLAMA_BASE_URL : 'https://api.neuralwatt.com/v1')
    ).replace(/\/$/, '');

    return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        const url = `${baseUrl}/models`;

        xhr.open('GET', url);
        if (apiKey && apiKey.trim().length > 0) {
            xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);
        }
        xhr.send();

        const timeoutId = setTimeout(() => {
            xhr.abort();
            logAi('warn', 'fetchAvailableModels timed out', { url });
            resolve([]);
        }, 10_000);

        xhr.onreadystatechange = () => {
            if (xhr.readyState !== XMLHttpRequest.DONE) return;
            clearTimeout(timeoutId);
            if (xhr.status !== 200) {
                const err = classifyHttpStatus(xhr.status, 'fetchAvailableModels');
                logAi('warn', 'fetchAvailableModels failed', {
                    status: xhr.status,
                    kind: err.kind,
                    userMessage: err.userMessage,
                });
                resolve([]);
                return;
            }
            try {
                const parsed = JSON.parse(xhr.responseText);
                const models = (parsed.data || [])
                    .map((m: Record<string, unknown>) => m.id as string)
                    .filter((id: string | undefined) => !!id);
                resolve(models);
            } catch (err) {
                logAi('warn', 'fetchAvailableModels parse failed', { err });
                resolve([]);
            }
        };

        xhr.onerror = () => {
            clearTimeout(timeoutId);
            const classified = classifyError(new Error('Network request failed'));
            logAi('warn', 'fetchAvailableModels network error', { kind: classified.kind });
            resolve([]);
        };
    });
}

/**
 * Health check — ping the server to verify it's reachable and properly configured.
 * Returns `{ online: true }` if the server responds successfully.
 *
 * On failure, `error` carries a short, actionable, user-facing string
 * (e.g. "Your API key is invalid or expired…") derived from the
 * `AiError` classification, plus `errorKind` so callers can render
 * targeted troubleshooting hints (e.g. a "Check API key" link on `auth`).
 *
 * Tracks consecutive failures: after more than 3 in a row the server is
 * considered persistently offline.  This status can be queried via
 * `isServerPersistentlyOffline()` so that callers reduce health-check
 * frequency or skip work when the server is clearly down for an extended
 * period.
 *
 * @param config - Optional config overrides
 * @returns Object with online status, error message, and error kind
 */
export interface PingResult {
    online: boolean;
    /** Short, actionable, user-facing message (empty when online) */
    error?: string;
    /** Structured error kind (empty when online) */
    errorKind?: AiErrorKind;
}
export async function pingServer(config: AiConfig = {}): Promise<PingResult> {
    const provider = config.provider || 'ollama';
    const apiKey = config.apiKey !== undefined ? config.apiKey : provider === 'ollama' ? DEFAULT_OLLAMA_API_KEY : '';
    const baseUrl = (
        config.baseUrl || (provider === 'ollama' ? DEFAULT_OLLAMA_BASE_URL : 'https://api.neuralwatt.com/v1')
    ).replace(/\/$/, '');

    // Fast pre-flight: Neuralwatt has no default key — classify as config
    // error up front so the user sees a clear message instead of a 401 from
    // a ping that was doomed from the start.
    if (provider === 'neuralwatt' && (!apiKey || apiKey.trim().length === 0)) {
        _consecutivePingFailures++;
        return {
            online: false,
            error: 'No Neuralwatt API key set. Add your key in AI Settings.',
            errorKind: 'config',
        };
    }

    return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        const pingUrl =
            provider === 'neuralwatt' || baseUrl.endsWith('/v1') ? `${baseUrl}/models` : `${baseUrl}/api/version`;

        xhr.open('GET', pingUrl);
        if (apiKey && apiKey.trim().length > 0) {
            xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);
        }
        xhr.send();

        const timeoutId = setTimeout(() => {
            xhr.abort();
            _consecutivePingFailures++;
            resolve({
                online: false,
                error: 'The server did not respond within 5s. It may be offline or the base URL is wrong.',
                errorKind: 'timeout',
            });
        }, 5000);

        xhr.onreadystatechange = () => {
            if (xhr.readyState !== XMLHttpRequest.DONE) return;
            clearTimeout(timeoutId);
            if (xhr.status === 200) {
                _consecutivePingFailures = 0;
                resolve({ online: true });
                return;
            }
            // Map the status to an actionable message via AiError classification.
            _consecutivePingFailures++;
            const err = classifyHttpStatus(xhr.status, 'Ping');
            resolve({ online: false, error: err.userMessage, errorKind: err.kind });
        };

        xhr.onerror = () => {
            clearTimeout(timeoutId);
            _consecutivePingFailures++;
            resolve({
                online: false,
                error: 'Cannot reach the AI server. Check your internet connection and base URL.',
                errorKind: 'network',
            });
        };
    });
}

/**
 * Process a single note: generate title then summary, sequentially.
 * This is the main entry point used by the AI Queue Manager.
 * Runs title first, then summary (sequential to be kind to the API).
 *
 * The entire pipeline is wrapped in a defensive try/catch so that no
 * unhandled exception can propagate.  On failure a structured result is
 * returned with empty fields rather than throwing, giving the caller a
 * safe object to work with regardless of the outcome.
 *
 * @param text - The full journal entry text
 * @param config - Optional config overrides
 * @returns Object with title string and summary bullet array
 */
export async function processNote(
    text: string,
    config: AiConfig = {},
    relationship?: RelationshipContext,
    cancelToken?: AiCancelToken,
): Promise<AiProcessResult> {
    const model = config.model || DEFAULT_OLLAMA_MODEL;
    try {
        logAi('info', 'processNote START', { model, textLength: text.length, hasRelationship: !!relationship });

        logAi('info', 'Calling generateTitle...', { model });
        const title = await generateTitle(text, config, undefined, relationship, cancelToken);
        logAi('info', 'generateTitle DONE', { titlePreview: title.slice(0, 50) });

        logAi('info', 'Calling generateSummary...', { model });
        const summary = await generateSummary(text, config, undefined, relationship, cancelToken);
        logAi('info', 'generateSummary DONE', { bulletCount: summary.length });

        if (!title || title.trim().length === 0 || summary.length === 0) {
            logAi('warn', 'processNote FAILED — empty results', {
                titleEmpty: !title || title.trim().length === 0,
                summaryEmpty: summary.length === 0,
            });
            return { title: title || '', summary, failed: true };
        }

        logAi('info', 'processNote SUCCESS', { model });
        return { title, summary, failed: false };
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logAi('error', 'processNote EXCEPTION', { model, error: errMsg });
        throw error;
    }
}
