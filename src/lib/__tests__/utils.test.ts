import { generateId } from '../utils';

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