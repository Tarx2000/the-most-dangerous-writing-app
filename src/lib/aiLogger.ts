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

/* ── Public API ───────────────────────────────────────────────────────── */

/**
 * Log an AI operation. Automatically adds a timestamp.
 * Appends to the persisted log and trims to max size.
 */
export async function logAi(
    entry: Omit<AiLogEntry, 'timestamp'>
): Promise<void> {
    try {
        const fullEntry: AiLogEntry = {
            ...entry,
            timestamp: Date.now(),
        };

        const existing = await getAiLog();
        const updated = [...existing, fullEntry];

        // FIFO trim: keep only the most recent entries
        const trimmed = updated.length > AI_LOG_MAX_ENTRIES
            ? updated.slice(updated.length - AI_LOG_MAX_ENTRIES)
            : updated;

        await storage.setItem(AI_STORAGE_KEYS.LOG, JSON.stringify(trimmed));

        // Also log to console for real-time debugging (dev-only)
        if (__DEV__) {
            const emoji = LOG_EMOJIS[entry.action] || '📝';
            console.log(
                `[AI ${emoji}] ${entry.action.toUpperCase()} | note=${entry.noteId} | model=${entry.model} | phase=${entry.phase}${entry.durationMs ? ` | ${entry.durationMs}ms` : ''}${entry.error ? ` | ERROR: ${entry.error}` : ''}`
            );
        }
    } catch (err) {
        logger("warn", "AI Logger", "Failed to persist log entry:", err);
    }
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
        logger("warn", "AI Logger", "Failed to read AI log:", err);
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

/* ── Internal ─────────────────────────────────────────────────────────── */

/** Emoji map for console output readability */
const LOG_EMOJIS: Record<string, string> = {
    enqueue: '📥',
    start: '▶️',
    success: '✅',
    fail: '❌',
    cancel: '🛑',
    orphan_recovery: '🔄',
    retry: '🔁',
};
