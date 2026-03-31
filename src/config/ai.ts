/**
 * AI Configuration — Ollama Cloud API with KimiK2.5
 *
 * This file holds all AI-related configuration constants.
 * The API key is hardcoded here as a default, but users can override it
 * at runtime via Settings → AI Settings. Overrides are persisted in AsyncStorage.
 *
 * Endpoint reference: https://docs.ollama.com/cloud#cloud-api-access
 * Auth: Bearer token via "Authorization" header
 * Model: kimi-k2.5:cloud (Moonshot AI's KimiK2.5 served via Ollama Cloud)
 */

/* ── Customizable Config Variables ───────────────────────────────────── */

/** Default Ollama Cloud API key — override in Settings without rebuilding */
export const DEFAULT_OLLAMA_API_KEY = '0256ae2a4fa64e95980bc0c6d6177e3d.5l7X5me0ClCd9Nnx3pUKJIKS';

/** Ollama Cloud base URL (NOT localhost — this is the cloud-hosted endpoint) */
export const DEFAULT_OLLAMA_BASE_URL = 'https://ollama.com';

/** Model identifier for KimiK2.5 on Ollama Cloud */
export const DEFAULT_OLLAMA_MODEL = 'kimi-k2.5:cloud';

/** How often to ping Ollama to check connectivity (milliseconds) */
export const AI_HEALTH_CHECK_INTERVAL_MS = 10_000;

/* ── AsyncStorage Keys for User Overrides ────────────────────────────── */

export const AI_STORAGE_KEYS = {
    API_KEY: 'AI_OLLAMA_API_KEY',
    BASE_URL: 'AI_OLLAMA_BASE_URL',
    MODEL: 'AI_OLLAMA_MODEL',
    GRAMMAR_MODEL: 'AI_OLLAMA_GRAMMAR_MODEL',
    /** JSON-serialized AI_PROMPTS override */
    PROMPTS: 'AI_CUSTOM_PROMPTS',
} as const;

/* ── Default AI Prompts ──────────────────────────────────────────────── */

/**
 * System prompts for each AI task.
 * These are editable in Dev Settings so you can fine-tune without code changes.
 */
export const DEFAULT_AI_PROMPTS = {
    /**
     * TITLE — Generate a concise, fitting title for a journal entry.
     * The AI receives the full journal text as the user message.
     */
    title: `You are a journal assistant. Given a journal entry, generate a single short title (5-10 words max) that captures the main theme or emotion. Reply with ONLY the title, no quotes, no explanation, no punctuation at the end.`,

    /**
     * SUMMARY — Generate 2-5 bullet-point key takeaways.
     * Response format: one bullet per line, starting with "• ".
     */
    summary: `You are a journal assistant. Given a journal entry, create 2 to 5 concise bullet points summarizing the most important ideas, emotions, or events mentioned. Each bullet should be one sentence max. Use bold (**text**) to highlight key words. Format: start each bullet with "• ". Reply with ONLY the bullet points, nothing else.`,

    /**
     * GRAMMAR — Find grammar and spelling issues and suggest corrections.
     * Response format: JSON array of { original, suggestion, explanation }.
     */
    grammar: `You are a professional proofreader. Given a journal entry, find all grammar and spelling errors. For each issue, return a JSON array of objects with these fields:
- "original": the exact word or phrase with the error (must match the text exactly)
- "suggestion": the corrected version
- "explanation": a brief explanation of the fix (10 words max)

If there are no issues, return an empty array: []
Reply with ONLY valid JSON, no markdown code fences, no extra text.`,
} as const;

/** Type for user-customizable prompt overrides */
export type AiPrompts = {
    title: string;
    summary: string;
    grammar: string;
};
