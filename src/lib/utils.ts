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
