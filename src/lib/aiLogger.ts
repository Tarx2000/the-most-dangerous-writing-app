/**
 * AI Logger — Structured Logging for AI Operations
 *
 * Every AI operation (enqueue, start, success, fail, retry, cancel)
 * is logged with timestamps, model info, note IDs, and durations.
 *
 * Log entries are persisted to storage under `AI_PROCESSING_LOG`
 * with a FIFO cap of AI_LOG_MAX_ENTRIES (200) to prevent storage bloat.
 *
 * Usage:
 *   import { logAi, getAiLog, clearAiLog } from '@/lib/aiLogger';
 *   await logAi({ action: 'start', noteId: '123', model: 'kimi-k2.5:cloud', phase: 'title' });
 */

import { storage } from '@/lib/storage';
import { logger } from '@/lib/logger';
import { AI_STORAGE_KEYS, AI_LOG_MAX_ENTRIES } from '@/config/ai';
import type { AiLogEntry } from '@/types';

/* ── Internal ─────────────────────────────────────────────────────────── */

/** In-memory promise chain prevents concurrent storage corruption. */
let writeChain: Promise<void> = Promise.resolve();

/** Emoji map for console output readability */
const LOG_EMOJIS: Record<string, string> = {
    enqueue: '📥',
    start: '▶️',
    success: '✅',
    fail: '❌',
    cancel: '🛑',
    orphan_recovery: '🔄',
    retry: '🔁',
    timeout: '⏱️',
    stall_recovery: '🚑',
    init: '🚀',
    config: '⚙️',
};

/** Verbose human-readable descriptions for startup logs */
const ACTION_DESCRIPTIONS: Record<string, string> = {
    init: 'AI Queue initialized',
    config: 'AI Configuration loaded',
    enqueue: 'Job enqueued',
    start: 'Job started processing',
    success: 'Job completed successfully',
    fail: 'Job failed permanently',
    cancel: 'Job cancelled by user',
    orphan_recovery: 'Orphaned job recovered after app restart',
    retry: 'Job retry scheduled',
    timeout: 'Job timed out (hard limit exceeded)',
    stall_recovery: 'Stall detected — auto-recovering queue',
};

/* ── Public API ───────────────────────────────────────────────────────── */

/**
 * Log an AI operation. Automatically adds a timestamp.
 * Appends to the persisted log and trims to max size.
 * Writes are serialized to avoid race conditions where concurrent calls
 * read stale data and overwrite each other's entries.
 */
export async function logAi(entry: Omit<AiLogEntry, 'timestamp'>): Promise<void> {
    // Chain each write so reads happen after previous writes complete
    writeChain = writeChain.then(async () => {
        try {
            const fullEntry: AiLogEntry = {
                ...entry,
                timestamp: Date.now(),
            };

            const existing = await getAiLog();
            const updated = [...existing, fullEntry];

            // FIFO trim: keep only the most recent entries
            const trimmed =
                updated.length > AI_LOG_MAX_ENTRIES ? updated.slice(updated.length - AI_LOG_MAX_ENTRIES) : updated;

            await storage.setItem(AI_STORAGE_KEYS.LOG, JSON.stringify(trimmed));

            // Console logging goes through structured logger so it respects logMode
            const emoji = LOG_EMOJIS[entry.action] || '📝';
            const desc = ACTION_DESCRIPTIONS[entry.action] || entry.action;
            const durationStr = entry.durationMs ? ` | ${entry.durationMs}ms` : '';
            const errorStr = entry.error ? ` | ERROR: ${entry.error}` : '';
            const modelStr = entry.model ? ` | model=${entry.model}` : '';
            const noteStr = entry.noteId ? ` | note=${entry.noteId}` : '';
            const phaseStr = entry.phase ? ` | phase=${entry.phase}` : '';

            logger('info', 'AI', `${emoji} ${desc}${noteStr}${modelStr}${phaseStr}${durationStr}${errorStr}`);

            // If it's an error-level action, also log with error level for visibility
            if (entry.action === 'fail' || entry.action === 'timeout' || entry.action === 'stall_recovery') {
                logger('error', 'AI CRITICAL', `${desc}${noteStr}${errorStr}`);
            }
        } catch (err) {
            logger('warn', 'AI Logger', 'Failed to persist log entry:', err);
        }
    });
    return writeChain;
}

/**
 * Retrieve the full AI operation log from storage.
 * Returns an empty array if no log exists or on parse error.
 */
export async function getAiLog(): Promise<AiLogEntry[]> {
    try {
        const raw = await storage.getItem(AI_STORAGE_KEYS.LOG);
        if (!raw) return [];
        return JSON.parse(raw) as AiLogEntry[];
    } catch (err: unknown) {
        logger('warn', 'AI Logger', 'Failed to read AI log:', err);
        return [];
    }
}

/**
 * Clear all AI log entries from storage.
 * Useful for freeing up space or resetting debug state.
 */
export async function clearAiLog(): Promise<void> {
    await storage.removeItem(AI_STORAGE_KEYS.LOG);
}

/**
 * Print a startup diagnostic banner to the console.
 * This runs once when the AI queue initializes and confirms the exact
 * configuration that will be used for all AI requests.
 */
export function logStartupDiagnostics(config: {
    apiKey: string;
    baseUrl: string;
    model: string;
    grammarModel?: string;
    hasCustomPrompts: boolean;
    pingResult: { online: boolean; error?: string };
    pendingJobs: number;
}): void {
    const keyPresent = config.apiKey && config.apiKey.trim().length > 0;
    const keyMasked = keyPresent ? `${config.apiKey.slice(0, 8)}...${config.apiKey.slice(-4)}` : 'NOT SET';
    const urlPresent = config.baseUrl && config.baseUrl.trim().length > 0;

    logger('info', 'AI Startup', `
╔══════════════════════════════════════════════════════════════════════╗
║                    🤖 AI QUEUE STARTUP DIAGNOSTICS                  ║
╠══════════════════════════════════════════════════════════════════════╣
║  API Key present : ${keyPresent ? '✅ YES' : '❌ NO'}  (value: ${keyMasked})
║  Base URL        : ${urlPresent ? '✅ ' + config.baseUrl : '❌ NOT SET'}
║  Title/Sum Model : ${config.model || '❌ NOT SET'}
║  Grammar Model   : ${config.grammarModel || '(same as title/sum)'}
║  Custom Prompts  : ${config.hasCustomPrompts ? '✅ YES' : '❌ no'}
║  Server Ping     : ${config.pingResult.online ? '✅ ONLINE' : '❌ OFFLINE'} ${config.pingResult.error ? '(' + config.pingResult.error + ')' : ''}
║  Pending Jobs    : ${config.pendingJobs}
╚══════════════════════════════════════════════════════════════════════╝
    `);

    if (!keyPresent) {
        logger('error', 'AI Startup', 'AI_API_KEY is missing. AI processing will FAIL.');
    }
    if (!urlPresent) {
        logger('error', 'AI Startup', 'AI_BASE_URL is missing. AI processing will FAIL.');
    }
    if (!config.pingResult.online) {
        logger('error', 'AI Startup', 'Server ping failed. AI jobs will stall until server responds.');
    }
}
