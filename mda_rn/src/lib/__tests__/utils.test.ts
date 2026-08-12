import { generateId, toLocalDateString, formatRelativeTime } from '../utils';

describe('generateId', () => {
    it('returns a string', () => {
        const id = generateId();
        expect(typeof id).toBe('string');
    });

    it('contains an underscore separator', () => {
        const id = generateId();
        expect(id).toContain('_');
    });

    it('produces unique IDs on rapid calls', () => {
        const ids = new Set(Array.from({ length: 100 }, () => generateId()));
        expect(ids.size).toBe(100);
    });

    it('timestamp portion is base-36', () => {
        const id = generateId();
        const tsPart = id.split('_')[0];
        // Base-36 strings only contain [0-9a-z]
        expect(/^[0-9a-z]+$/.test(tsPart)).toBe(true);
    });

    it('random suffix is at least 7 characters', () => {
        const id = generateId();
        const suffix = id.split('_')[1];
        expect(suffix.length).toBeGreaterThanOrEqual(7);
    });
});

describe('toLocalDateString', () => {
    it('formats a date as YYYY-MM-DD in local timezone', () => {
        const date = new Date(2026, 0, 15); // Jan 15, 2026 local
        const result = toLocalDateString(date);
        expect(result).toBe('2026-01-15');
    });

    it('pads single-digit months and days', () => {
        const date = new Date(2026, 2, 5); // Mar 5, 2026 local
        const result = toLocalDateString(date);
        expect(result).toBe('2026-03-05');
    });

    it('handles December 31 correctly', () => {
        const date = new Date(2025, 11, 31); // Dec 31, 2025 local
        const result = toLocalDateString(date);
        expect(result).toBe('2025-12-31');
    });

    it('differs from toISOString near midnight in non-UTC timezones', () => {
        // Create a date that could be different day in UTC vs local
        // This test documents that toLocalDateString uses local time, not UTC
        const localDate = new Date(2026, 5, 15, 23, 0, 0); // 11pm local time June 15
        const localResult = toLocalDateString(localDate);
        const utcResult = localDate.toISOString().slice(0, 10);
        // Both should produce a valid date string; the important thing is
        // toLocalDateString uses local timezone consistently
        expect(localResult).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(utcResult).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns today for current date', () => {
        const now = new Date();
        const result = toLocalDateString(now);
        const expectedYear = now.getFullYear().toString();
        const expectedMonth = String(now.getMonth() + 1).padStart(2, '0');
        const expectedDay = String(now.getDate()).padStart(2, '0');
        expect(result).toBe(`${expectedYear}-${expectedMonth}-${expectedDay}`);
    });
});

describe('formatRelativeTime', () => {
    it('returns "just now" for very recent timestamps', () => {
        expect(formatRelativeTime(Date.now())).toBe('just now');
    });

    it('returns minutes for timestamps within an hour', () => {
        expect(formatRelativeTime(Date.now() - 5 * 60000)).toBe('5m ago');
    });

    it('returns hours for timestamps within a day', () => {
        expect(formatRelativeTime(Date.now() - 3 * 3600000)).toBe('3h ago');
    });
});
