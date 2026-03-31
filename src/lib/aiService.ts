/**
 * AI Service — Ollama Cloud API Client
 *
 * Pure service module (no React) that communicates with the Ollama Cloud API.
 * Uses `fetch()` (available in React Native) to call the `/api/chat` endpoint.
 *
 * Three main functions:
 * - generateTitle()  → short title for a journal entry
 * - generateSummary() → 2-5 bullet points of key takeaways
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
    type AiPrompts,
} from '@/config/ai';

/* ── Types ────────────────────────────────────────────────────────────── */

/** Single grammar correction returned by checkGrammar() */
export interface GrammarSuggestion {
    /** The exact word/phrase in the original text that has an issue */
    original: string;
    /** The corrected replacement */
    suggestion: string;
    /** Short explanation of the fix */
    explanation: string;
}

/** Configuration overrides — pass user-customized values from AsyncStorage */
export interface AiConfig {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    prompts?: Partial<AiPrompts>;
}

/* ── Internal Helpers ─────────────────────────────────────────────────── */

/**
 * Send a chat completion request to the Ollama Cloud API.
 *
 * Endpoint: POST <baseUrl>/api/chat
 * Auth: Bearer token in Authorization header
 * Body: { model, messages, stream: false }
 *
 * Returns the assistant's response content as a string.
 * Throws on network or API errors.
 */
async function ollamaChat(
    systemPrompt: string,
    userMessage: string,
    config: AiConfig = {},
    optionsOverwrite: Record<string, any> = {},
    onChunk?: (text: string) => void
): Promise<string> {
    const apiKey = config.apiKey || DEFAULT_OLLAMA_API_KEY;
    const baseUrl = (config.baseUrl || DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, '');
    const model = config.model || DEFAULT_OLLAMA_MODEL;

    const url = `${baseUrl}/api/chat`;
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
            
        xhr.onreadystatechange = () => {
            if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
                if (xhr.status !== 200) {
                    reject(new Error(`Ollama API error ${xhr.status}`));
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
                            const parsed = JSON.parse(line);
                            if (parsed.error) {
                                reject(new Error(`Ollama Error: ${parsed.error}`));
                                return;
                            }
                            const chunkStr = parsed.message?.content || '';
                            
                            fullResponse += chunkStr;
                            
                            if (onChunk && chunkStr) {
                                wordBuffer += chunkStr;
                                
                                // Flush wordBuffer when a boundary is found (space, tab, newline, common or Chinese punctuation, or CJK characters)
                                if (/[ \t\n\.,\!\?\-:;，。！？、“”'\"\u4e00-\u9fa5]/.test(chunkStr.slice(-1)) || wordBuffer.length > 12) {
                                    streamedResponse += wordBuffer;
                                    wordBuffer = '';
                                    onChunk(streamedResponse);
                                }
                            }
                        } catch (e) {
                            console.warn('[AI] Failed to parse stream line:', line);
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
                    resolve(fullResponse.trim());
                }
            }
        };
        
        xhr.onerror = () => reject(new Error('Network request failed'));
        
        xhr.send(JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
            ],
            stream: !!onChunk,
            options: mergedOptions,
        }));
    });
}

/* ── Public API ───────────────────────────────────────────────────────── */

/**
 * Generate a short, fitting title for a journal entry.
 *
 * @param text - The full journal entry text
 * @param config - Optional config overrides (apiKey, model, prompts)
 * @returns A title string (5-10 words)
 */
export async function generateTitle(
    text: string,
    config: AiConfig = {},
    onChunk?: (text: string) => void
): Promise<string> {
    const prompt = config.prompts?.title || DEFAULT_AI_PROMPTS.title;
    // Removed num_predict to prevent empty outputs
    const title = await ollamaChat(prompt, text, config, {}, onChunk);
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
    onChunk?: (text: string) => void
): Promise<string[]> {
    const prompt = config.prompts?.summary || DEFAULT_AI_PROMPTS.summary;
    const raw = await ollamaChat(prompt, text, config, {}, onChunk);

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
    onChunk?: (text: string) => void
): Promise<GrammarSuggestion[]> {
    const prompt = config.prompts?.grammar || DEFAULT_AI_PROMPTS.grammar;
    const raw = await ollamaChat(prompt, text, config, { num_predict: 250 }, onChunk);

    try {
        // Try to extract JSON from the response (model might wrap in code fences)
        const jsonStr = raw.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonStr);

        if (!Array.isArray(parsed)) return [];

        // Validate each item has required fields
        return parsed.filter(
            (item: any) =>
                typeof item.original === 'string' &&
                typeof item.suggestion === 'string' &&
                typeof item.explanation === 'string'
        ) as GrammarSuggestion[];
    } catch {
        console.warn('[AI] Failed to parse grammar response as JSON:', raw);
        return [];
    }
}

/**
 * Ping the Ollama server to check if the API is reachable.
 *
 * Sends a minimal request to the /api/version endpoint.
 * Returns true if the server responds without throwing a network error.
 *
 * @param config - Optional config overrides
 * @returns boolean — true if server is reachable
 */
export async function pingServer(config: AiConfig = {}): Promise<boolean> {
    const apiKey = config.apiKey || DEFAULT_OLLAMA_API_KEY;
    const baseUrl = (config.baseUrl || DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, '');

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`${baseUrl}/api/version`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // If we get a response (even 401/404), the server is reachable at this URL
        return response.ok || response.status === 401 || response.status === 404;
    } catch (err) {
        console.warn('[AI] Ping failed:', err);
        return false;
    }
}
