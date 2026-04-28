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
    prompts?: Partial<AiPrompts>;
}

export interface RelationshipContext {
    personName: string;
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
 * Network errors, timeouts, and 5xx responses are retryable.
 * Auth errors and 4xx client errors are NOT retryable.
 */
function isTransientError(error: Error): boolean {
    const msg = error.message || '';

    // Network / connection errors
    if (msg.includes('Network request failed')) return true;
    if (msg.includes('connection dropped')) return true;
    if (msg.includes('unreachable')) return true;

    // Timeout errors
    if (msg.includes('timed out')) return true;

    // 5xx server errors — retryable (server is having a bad time)
    if (/Ollama API error [5]\d\d/.test(msg)) return true;

    // Everything else (4xx, auth errors, parse errors, etc.) — not retryable
    return false;
}

/**
 * Sleep helper — returns a promise that resolves after `ms` milliseconds.
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
    cancelToken?: AiCancelToken
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
            if (cancelCheckInterval) { clearInterval(cancelCheckInterval); cancelCheckInterval = null; }
            if (fn === 'resolve') resolve(value as string);
            else reject(value as Error);
        };

        xhr.onreadystatechange = () => {
            if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
                if (xhr.status !== 200) {
                    xhr.abort();
                    settle('reject', new Error(`Ollama API error ${xhr.status}`));
                }
            } else if (xhr.readyState === XMLHttpRequest.LOADING || xhr.readyState === XMLHttpRequest.DONE) {
                if (!xhr.responseText) return;
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
                                settle('reject', new Error(`Ollama Error: ${parsed.error}`));
                                return;
                            }
                            
                            // Support both OpenAI (choices[0].delta.content) and Ollama native (message.content)
                            const chunkStr = parsed.choices?.[0]?.delta?.content || 
                                           parsed.choices?.[0]?.message?.content || 
                                           parsed.message?.content || '';

                            fullResponse += chunkStr;

                            if (onChunk && chunkStr) {
                                wordBuffer += chunkStr;

                                // Flush wordBuffer when a boundary is found (space, tab, newline, common or Chinese punctuation, or CJK characters)
                                if (/[ \t\n.,!?\-:;，。！？、"”'"\u4e00-\u9fa5]/.test(chunkStr.slice(-1)) || wordBuffer.length > 12) {
                                    streamedResponse += wordBuffer;
                                    wordBuffer = '';
                                    onChunk(streamedResponse);
                                }
                            }
                        } catch (err) {
                            console.warn('[AI] Failed to parse stream line:', line, err);
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
            console.warn('[AI] XHR Error occurred. ReadyState:', xhr.readyState, 'Status:', xhr.status);
            settle('reject', new Error(`Network request failed (connection dropped or unreachable)`));
        };

        // Abort after timeout to prevent hanging requests
        const timeoutId = setTimeout(() => {
            xhr.abort();
            settle('reject', new Error(`AI request timed out after ${AI_REQUEST_TIMEOUT_MS / 1000}s`));
        }, AI_REQUEST_TIMEOUT_MS);

        // Cancel token: poll for external abort (e.g. user cancels or queue cancels)
        if (cancelToken) {
            if (cancelToken.aborted) {
                clearTimeout(timeoutId);
                return Promise.reject(new Error('AI request cancelled'));
            }
            cancelCheckInterval = setInterval(() => {
                if (cancelToken && cancelToken.aborted) {
                    if (cancelCheckInterval) clearInterval(cancelCheckInterval);
                    xhr.abort();
                    settle('reject', new Error('AI request cancelled'));
                }
            }, 200);
        }

        xhr.send(JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
            ],
            stream: true, // ALWAYS stream to prevent silent idle connection timeouts
            options: mergedOptions,
        }));
    });
}

/**
 * Send a chat completion request with exponential-backoff retries.
 *
 * Wraps `ollamaChatSingle` and retries on transient errors only
 * (network failures, timeouts, 5xx).  Auth errors and 4xx responses
 * are not retried.  Backoff starts at 1 s and doubles each attempt.
 *
 * The `onChunk` callback is only wired on the final (or only) attempt
 * so that partial streaming from a failed request doesn't corrupt the
 * consumer's buffer.
 */
async function ollamaChat(
    systemPrompt: string,
    userMessage: string,
    config: AiConfig = {},
    optionsOverwrite: Record<string, unknown> = {},
    onChunk?: (text: string) => void,
    cancelToken?: AiCancelToken
): Promise<string> {
    const maxAttempts = AI_MAX_RETRIES + 1; // e.g. AI_MAX_RETRIES=2 → 3 attempts
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            // Only attach the streaming callback on the last attempt.
            const isLastAttempt = attempt === maxAttempts - 1;
            const chunkCb = isLastAttempt ? onChunk : undefined;

            const result = await ollamaChatSingle(
                systemPrompt,
                userMessage,
                config,
                optionsOverwrite,
                chunkCb,
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
                const delayMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s, ...
                console.warn(
                    `[AI] Transient error (attempt ${attempt + 1}/${maxAttempts}), ` +
                    `retrying in ${delayMs}ms: ${(error as Error)?.message}`
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

export async function generateTitle(
    text: string,
    config: AiConfig = {},
    onChunk?: (text: string) => void,
    relationship?: RelationshipContext,
    cancelToken?: AiCancelToken
): Promise<string> {
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
    cancelToken?: AiCancelToken
): Promise<string[]> {
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
        .map(line => line.replace(/^[\s•\-*]+/, '').trim())
        .filter(line => line.length > 0);

    // Clamp to 2-5 bullets
    return bullets.slice(0, 5);
}

/**
 * Check grammar and spelling in a journal entry.
 *
 * @param text - The full journal entry text
 * @param config - Optional config overrides
 * @returns Array of GrammarSuggestion objects
 */
export async function checkGrammar(
    text: string,
    config: AiConfig = {},
    onChunk?: (text: string) => void,
    cancelToken?: AiCancelToken
): Promise<GrammarSuggestion[]> {
    const prompt = config.prompts?.grammar || DEFAULT_AI_PROMPTS.grammar;
    const raw = await ollamaChat(prompt, text, config, {}, onChunk, cancelToken);

    try {
        // Try to extract JSON from the response (model might wrap in code fences)
        const jsonStr = raw.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonStr);

        if (!Array.isArray(parsed)) return [];

        // Validate each item has required fields
        return parsed.filter(
            (item: unknown): item is GrammarSuggestion =>
                typeof (item as Record<string, unknown>).original === 'string' &&
                typeof (item as Record<string, unknown>).suggestion === 'string' &&
                typeof (item as Record<string, unknown>).explanation === 'string'
        );
    } catch (err: unknown) {
        console.warn('[AI] Failed to parse grammar response as JSON:', raw, err);
        return [];
    }
}

/**
 * Health check — ping the server to verify it's reachable and properly configured.
 * Returns { online: true } if the server responds without throwing a network error.
 *
 * Tracks consecutive failures: after more than 3 in a row the server is
 * considered persistently offline.  This status can be queried via
 * `isServerPersistentlyOffline()` so that callers reduce health-check
 * frequency or skip work when the server is clearly down for an extended
 * period.
 *
 * @param config - Optional config overrides
 * @returns Object with online status and any error message
 */
export async function pingServer(config: AiConfig = {}): Promise<{ online: boolean; error?: string }> {
    const apiKey = config.apiKey || DEFAULT_OLLAMA_API_KEY;
    const baseUrl = (config.baseUrl || DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, '');

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        // If baseUrl ends in /v1, we hit /models as a health check. 
        // Otherwise we hit the native /api/version.
        const pingUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/models` : `${baseUrl}/api/version`;

        const response = await fetch(pingUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // If we get a response (even 401/404), the server is reachable at this URL
        const isOk = response.ok || response.status === 401 || response.status === 404;
        if (!isOk) {
            _consecutivePingFailures++;
            return { online: false, error: `Server connected but returned HTTP ${response.status}` };
        }

        // Success — reset consecutive failure counter
        _consecutivePingFailures = 0;
        return { online: true };
    } catch (err: unknown) {
        _consecutivePingFailures++;
        console.warn(`[AI] Ping failed (${_consecutivePingFailures} consecutive):`, err);
        return { online: false, error: (err as Error | undefined)?.message || 'Network request failed' };
    }
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
    cancelToken?: AiCancelToken
): Promise<AiProcessResult> {
    try {
        const title = await generateTitle(text, config, undefined, relationship, cancelToken);
        const summary = await generateSummary(text, config, undefined, relationship, cancelToken);
        return { title, summary, failed: false };
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.warn('[AI] processNote failed — returning empty result:', errMsg);
        return { title: '', summary: [], failed: true };
    }
}
