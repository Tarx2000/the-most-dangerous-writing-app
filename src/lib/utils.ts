/**
 * Shared Utility Functions
 *
 * Small, reusable helpers used across the app.
 * Keep this file free of React imports — pure JS/TS only.
 */

/**
 * Generate a collision-resistant unique ID.
 *
 * Combines a base-36 timestamp (millisecond precision) with a random suffix.
 * Produces IDs like "lxyz1234_a7f3k9p" — short, URL-safe, and unique
 * even under rapid-fire creation (unlike bare `Date.now().toString()`).
 *
 * @returns A unique string ID (typically 15-18 chars)
 */
export function generateId(): string {
    return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

export function formatRelativeTime(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    const weeks = Math.floor(diff / 604800000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    if (weeks < 4) return `${weeks}w ago`;
    return new Date(timestamp).toLocaleDateString('default', { month: 'short', day: 'numeric' });
}

/**
 * Get a local-date string (YYYY-MM-DD) in the user's timezone.
 *
 * Unlike `toISOString().slice(0, 10)` which returns UTC dates,
 * this uses the local timezone so that a user writing at 11pm EST
 * gets credit for today, not tomorrow in UTC.
 */
export function toLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Format a timestamp into a locale-aware display string for session dates.
 *
 * Produces strings like "4/19/2026, 11:30 PM" consistently across locales.
 * Avoids the locale-inconsistency of `toLocaleDateString() + ' ' + toLocaleTimeString()`.
 */
export function formatSessionDate(timestamp: number): string {
    const date = new Date(timestamp);
    const dateStr = date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
    });
    const timeStr = date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
    });
    return `${dateStr} ${timeStr}`;
}

/**
 * Count words in a text string.
 *
 * Single source of truth for word counting — previously the same
 * `trim().split(/\s+/).filter(Boolean).length` expression was copy-pasted in
 * 11 places with subtly different null/whitespace handling. Whitespace-only or
 * empty text counts as 0 words.
 */
export function countWords(text: string | null | undefined): number {
    return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

/**
 * True when a note qualifies for streak credit (won session of >= 3 minutes,
 * not a quick note, not a tweet).
 *
 * Single source of truth shared by `saveNote` (authoritative) and the boot-time
 * streak recalculation so the two can never drift apart again.
 */
export function isStreakEligible(note: {
    won?: boolean;
    durationMin?: number;
    isQuickNote?: boolean;
    isTweet?: boolean;
}): boolean {
    return !!note.won && (note.durationMin ?? 0) >= 3 && !note.isQuickNote && !note.isTweet;
}
