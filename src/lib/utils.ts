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
