/**
 * AI Configuration — Ollama Cloud API
 *
 * Central configuration for all AI-related constants.
 * Users can override API key, model, and prompts at runtime via Settings.
 * Overrides are persisted in AsyncStorage.
 *
 * Key concepts:
 * - AI_AVAILABLE_MODELS: All selectable models (shown in Settings picker)
 * - AI_STORAGE_KEYS: AsyncStorage keys for persisted AI state
 * - DEFAULT_AI_PROMPTS: System prompts for title/summary/grammar tasks
 * - RATE_LIMIT_DELAY_MS: Pause between sequential AI requests
 */

/* ── Customizable Config Variables ───────────────────────────────────── */

/** Default Ollama Cloud API key — override in Settings without rebuilding */
export const DEFAULT_OLLAMA_API_KEY = '0256ae2a4fa64e95980bc0c6d6177e3d.5l7X5me0ClCd9Nnx3pUKJIKS';

/** Ollama Cloud base URL (NOT localhost — this is the cloud-hosted endpoint) */
export const DEFAULT_OLLAMA_BASE_URL = 'https://ollama.com/v1';

/** Model identifier for KimiK2.5 on Ollama Cloud */
export const DEFAULT_OLLAMA_MODEL = 'kimi-k2.5:cloud';

/** How often to ping Ollama to check connectivity (milliseconds) */
export const AI_HEALTH_CHECK_INTERVAL_MS = 10_000;

/** Delay between sequential AI requests to prevent API rate limiting */
export const RATE_LIMIT_DELAY_MS = 500;

/** Max retry attempts before moving a failed job to the end of the queue */
export const AI_MAX_RETRIES = 2;

/** Maximum number of AI log entries to keep in storage (FIFO) */
export const AI_LOG_MAX_ENTRIES = 200;

/** Timeout for a single AI request in milliseconds */
export const AI_REQUEST_TIMEOUT_MS = 60_000;

/* ── Available AI Models (shown in Settings picker) ──────────────────── */

export const AI_AVAILABLE_MODELS = [
    'kimi-k2.5:cloud',
    'kimi-k2.6:cloud',
    'qwen3.5:397b-cloud',
    'glm-5:cloud',
    'minimax-m2.7:cloud',
    'nemotron-3-super:cloud',
    'gemma4:31b-cloud',
] as const;

/* ── AsyncStorage Keys for User Overrides ────────────────────────────── */

export const AI_STORAGE_KEYS = {
    API_KEY: 'AI_OLLAMA_API_KEY',
    BASE_URL: 'AI_OLLAMA_BASE_URL',
    MODEL: 'AI_OLLAMA_MODEL',
    GRAMMAR_MODEL: 'AI_OLLAMA_GRAMMAR_MODEL',
    /** JSON-serialized AI_PROMPTS override */
    PROMPTS: 'AI_CUSTOM_PROMPTS',
    /** Persisted AI job queue (JSON array of AiJob) */
    QUEUE: 'AI_JOB_QUEUE',
    /** Structured AI operation log (JSON array of AiLogEntry) */
    LOG: 'AI_PROCESSING_LOG',
} as const;

/* ── Default AI Prompts ──────────────────────────────────────────────── */

/**
 * System prompts for each AI task.
 * These are editable in Dev Settings so you can fine-tune without code changes.
 */
export const DEFAULT_AI_PROMPTS = {
    /**
     * TITLE — Generate a short headline for a journal entry.
     * Capitalized like a book title, 3 to 6 words max, matching user's language.
     */
    title: `You are a minimalist title generator. Read the following journal entry and generate a title of EXACTLY 3 to 6 words. Capitalize it like a book title. Do not use punctuation. Do not use quotes. Capture the exact emotional or factual essence of the text using words closely matching the entry. Reply with ONLY the title, nothing else.`,

    /**
     * SUMMARY — highly personal, scales from 1-8 bullet points based on length.
     * Empathetic yet logical, pointing out reflections (in 1st person) and CTAs.
     */
    summary: `You are the empathetic, reflective, yet logical inner voice of the writer. Summarize the following journal entry.
Rules:
- Scale length with the input: 1-2 bullet points for short texts, up to 6-8 for long entries.
- Explicitly point out any actionable items ("Calls to Action").
- Highlight important reflections in the first-person perspective ("I realized...", "I felt...").
- Organize chaotic "brain dumps" into coherent, logical points but retain the raw emotional vibe.
- NEVER refer to "the author" or "the writer".
- Use bold (**text**) to highlight key words.
Format: start each bullet with "• ". Reply with ONLY the bullet points, nothing else.`,

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

    /**
     * RELATIONSHIP TITLE — Short event-focused label.
     * Should read like: "forgot the meeting", "helped me move", "talked about boundaries"
     * Avoids repeating the person's name (entry is already filed under them).
     * {{PERSON_NAME}} and {{RELATIONSHIP_STATUS}} are replaced at runtime.
     */
    relationshipTitle: `You are a short label generator for a relationship journal. Read the following entry about {{PERSON_NAME}} ({{RELATIONSHIP_STATUS}}) and generate a very short, event-focused label of 2 to 5 words that captures what happened or what the key topic was. Do NOT include the person's name in the label — the reader already knows who the entry is about. Do not use punctuation or quotes. Always respond in the same language the entry was written in. Reply with ONLY the label, nothing else.`,

    /**
     * RELATIONSHIP SUMMARY — Warm inner-voice summary about another person.
     * Not cold analysis — more like "a second me" reflecting on what happened.
     * {{PERSON_NAME}} and {{RELATIONSHIP_STATUS}} are replaced at runtime.
     */
    relationshipSummary: `You are the warm, reflective inner voice of the writer. Summarize the following journal entry about {{PERSON_NAME}} ({{RELATIONSHIP_STATUS}}).
Rules:
- Write as if you are the author's internal narrator — warm and clean, not a cold third-person analyst.
- Focus primarily on {{PERSON_NAME}} and what happened, and secondly on the underlying relationship dynamic.
- Use {{PERSON_NAME}}'s name naturally where it flows, but don't overuse it — reference them as "they" or "them" when the context is clear.
- If a conflict is mentioned, go one layer deeper: name the underlying dynamic behind the surface issue (e.g., "The argument was about dishes, but the tension underneath is about feeling unappreciated").
- Do NOT give advice, solutions, or judgments. Just reflect and summarize.
- Scale length with the input: 1-2 bullet points for short texts, up to 5-6 for long entries.
- ONLY include a "Call to Action" if the author explicitly mentions one in the text.
- Always respond in the same language the entry was written in.
- Use bold (**text**) to highlight key words.
Format: start each bullet with "• ". Reply with ONLY the bullet points, nothing else.`,
} as const;

/** Type for user-customizable prompt overrides */
export type AiPrompts = {
    title: string;
    summary: string;
    grammar: string;
    relationshipTitle: string;
    relationshipSummary: string;
};
