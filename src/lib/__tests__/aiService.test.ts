/**
 * aiService tests — Unit tests for exported AI service functions.
 *
 * Only imports from @/config/ai (pure constants) — no native modules needed.
 */

import { isServerPersistentlyOffline } from '@/lib/aiService';
import { DEFAULT_AI_PROMPTS, AI_MAX_RETRIES, RATE_LIMIT_DELAY_MS, AI_REQUEST_TIMEOUT_MS } from '@/config/ai';

describe('aiService', () => {
    describe('isServerPersistentlyOffline', () => {
        it('should return a boolean', () => {
            expect(typeof isServerPersistentlyOffline()).toBe('boolean');
        });

        it('should return false initially (no pings attempted)', () => {
            expect(isServerPersistentlyOffline()).toBe(false);
        });
    });
});

describe('AI config constants', () => {
    it('should have valid default prompts', () => {
        expect(DEFAULT_AI_PROMPTS.title).toBeDefined();
        expect(DEFAULT_AI_PROMPTS.summary).toBeDefined();
        expect(DEFAULT_AI_PROMPTS.grammar).toBeDefined();
        expect(typeof DEFAULT_AI_PROMPTS.title).toBe('string');
        expect(typeof DEFAULT_AI_PROMPTS.summary).toBe('string');
        expect(typeof DEFAULT_AI_PROMPTS.grammar).toBe('string');
    });

    it('should have reasonable retry/timeout values', () => {
        expect(AI_MAX_RETRIES).toBeGreaterThan(0);
        expect(AI_MAX_RETRIES).toBeLessThan(10);
        expect(AI_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
        expect(RATE_LIMIT_DELAY_MS).toBeGreaterThan(0);
    });
});