/**
 * Config constants contract tests.
 *
 * Guards against accidental changes to AI and App configuration constants.
 */

import {
    isApiKeyConfigured,
    AI_HEALTH_CHECK_INTERVAL_MS,
    RATE_LIMIT_DELAY_MS,
    AI_MAX_RETRIES,
    AI_LOG_MAX_ENTRIES,
    MIN_AI_WORDS,
    AI_REQUEST_TIMEOUT_MS,
    AI_JOB_TIMEOUT_MS,
    AI_STALL_DETECTION_MS,
    AI_AVAILABLE_MODELS,
    AI_STORAGE_KEYS,
    DEFAULT_AI_PROMPTS,
} from '@/config/ai';
import { APP_VERSION, CONFIG, TWEET_THRESHOLD, isTweet } from '@/config';
import { isTweet as isTweetDirect, TWEET_THRESHOLD as TWEET_THRESHOLD_DIRECT } from '@/config/tweet';

describe('AI Config (ai.ts)', () => {
    describe('isApiKeyConfigured', () => {
        it('returns true with default key (no config arg)', () => {
            expect(isApiKeyConfigured()).toBe(true);
        });

        it('returns true with custom non-empty key', () => {
            expect(isApiKeyConfigured({ apiKey: 'custom-key-123' })).toBe(true);
        });

        it('returns false with empty string key', () => {
            expect(isApiKeyConfigured({ apiKey: '' })).toBe(false);
        });

        it('returns false with whitespace-only key', () => {
            expect(isApiKeyConfigured({ apiKey: '   ' })).toBe(false);
        });

        it('falls back to default key when apiKey is undefined', () => {
            expect(isApiKeyConfigured({ apiKey: undefined })).toBe(true);
        });
    });

    describe('AI constants', () => {
        it('AI_MAX_RETRIES is reasonable (>0, <10)', () => {
            expect(AI_MAX_RETRIES).toBeGreaterThan(0);
            expect(AI_MAX_RETRIES).toBeLessThan(10);
            expect(AI_MAX_RETRIES).toBe(2);
        });

        it('AI_LOG_MAX_ENTRIES is 200', () => {
            expect(AI_LOG_MAX_ENTRIES).toBe(200);
        });

        it('AI_REQUEST_TIMEOUT_MS <= AI_JOB_TIMEOUT_MS', () => {
            expect(AI_REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(AI_JOB_TIMEOUT_MS);
        });

        it('RATE_LIMIT_DELAY_MS > 0', () => {
            expect(RATE_LIMIT_DELAY_MS).toBeGreaterThan(0);
        });

        it('AI_HEALTH_CHECK_INTERVAL_MS > 0', () => {
            expect(AI_HEALTH_CHECK_INTERVAL_MS).toBeGreaterThan(0);
        });

        it('MIN_AI_WORDS >= 10', () => {
            expect(MIN_AI_WORDS).toBeGreaterThanOrEqual(10);
        });

        it('AI_STALL_DETECTION_MS < AI_JOB_TIMEOUT_MS', () => {
            expect(AI_STALL_DETECTION_MS).toBeLessThan(AI_JOB_TIMEOUT_MS);
        });
    });

    describe('AI_AVAILABLE_MODELS', () => {
        it('is non-empty and all strings', () => {
            expect(AI_AVAILABLE_MODELS.length).toBeGreaterThan(0);
            AI_AVAILABLE_MODELS.forEach((model) => {
                expect(typeof model).toBe('string');
                expect(model.length).toBeGreaterThan(0);
            });
        });
    });

    describe('AI_STORAGE_KEYS', () => {
        it('has unique values', () => {
            const values = Object.values(AI_STORAGE_KEYS);
            const uniqueValues = new Set(values);
            expect(uniqueValues.size).toBe(values.length);
        });
    });

    describe('DEFAULT_AI_PROMPTS', () => {
        it('has all required keys', () => {
            expect(DEFAULT_AI_PROMPTS).toHaveProperty('title');
            expect(DEFAULT_AI_PROMPTS).toHaveProperty('summary');
            expect(DEFAULT_AI_PROMPTS).toHaveProperty('grammar');
            expect(DEFAULT_AI_PROMPTS).toHaveProperty('relationshipTitle');
            expect(DEFAULT_AI_PROMPTS).toHaveProperty('relationshipSummary');
        });

        it('each prompt is a non-empty string', () => {
            Object.entries(DEFAULT_AI_PROMPTS).forEach(([, value]) => {
                expect(typeof value).toBe('string');
                expect(value.length).toBeGreaterThan(0);
            });
        });
    });
});

describe('App Config (index.ts)', () => {
    describe('APP_VERSION', () => {
        it('matches semver-ish pattern', () => {
            expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
        });
    });

    describe('DIFFICULTIES', () => {
        it('has 3 entries with descending idle limits', () => {
            expect(CONFIG.DIFFICULTIES).toHaveLength(3);
            expect(CONFIG.DIFFICULTIES[0].value).toBeGreaterThan(CONFIG.DIFFICULTIES[1].value);
            expect(CONFIG.DIFFICULTIES[1].value).toBeGreaterThan(CONFIG.DIFFICULTIES[2].value);
        });
    });

    describe('SESSION_OPTIONS_MINS', () => {
        it('is sorted ascending', () => {
            const arr = CONFIG.SESSION_OPTIONS_MINS;
            for (let i = 1; i < arr.length; i++) {
                expect(arr[i]).toBeGreaterThanOrEqual(arr[i - 1]);
            }
        });
    });

    describe('VLOG_SESSION_OPTIONS_MINS', () => {
        it('is sorted ascending', () => {
            const arr = CONFIG.VLOG_SESSION_OPTIONS_MINS;
            for (let i = 1; i < arr.length; i++) {
                expect(arr[i]).toBeGreaterThanOrEqual(arr[i - 1]);
            }
        });
    });

    describe('SIZES', () => {
        it('has 4 entries with ascending values', () => {
            expect(CONFIG.SIZES).toHaveLength(4);
            for (let i = 1; i < CONFIG.SIZES.length; i++) {
                expect(CONFIG.SIZES[i].value).toBeGreaterThan(CONFIG.SIZES[i - 1].value);
            }
        });
    });

    describe('FONTS', () => {
        it('has 11 entries', () => {
            expect(CONFIG.FONTS).toHaveLength(11);
        });
    });

    describe('VLOG_COMPRESSION_PRESETS', () => {
        it('has 4 entries including off, light, balanced, max', () => {
            expect(CONFIG.VLOG_COMPRESSION_PRESETS).toHaveLength(4);
            const ids = CONFIG.VLOG_COMPRESSION_PRESETS.map((p) => p.id);
            expect(ids).toContain('off');
            expect(ids).toContain('light');
            expect(ids).toContain('balanced');
            expect(ids).toContain('max');
        });
    });

    describe('VLOG_BITRATE_MAP', () => {
        it('has entries for 720p, 1080p, 2160p with ascending bitrates', () => {
            expect(CONFIG.VLOG_BITRATE_MAP['720p']).toBeDefined();
            expect(CONFIG.VLOG_BITRATE_MAP['1080p']).toBeDefined();
            expect(CONFIG.VLOG_BITRATE_MAP['2160p']).toBeDefined();
            expect(CONFIG.VLOG_BITRATE_MAP['720p']).toBeLessThan(CONFIG.VLOG_BITRATE_MAP['1080p']);
            expect(CONFIG.VLOG_BITRATE_MAP['1080p']).toBeLessThan(CONFIG.VLOG_BITRATE_MAP['2160p']);
        });
    });

    describe('PIN_MAX_ATTEMPTS', () => {
        it('is 3', () => {
            expect(CONFIG.PIN_MAX_ATTEMPTS).toBe(3);
        });
    });

    describe('PIN_LOCKOUT_DURATION_MS', () => {
        it('is 30_000', () => {
            expect(CONFIG.PIN_LOCKOUT_DURATION_MS).toBe(30_000);
        });
    });

    describe('CHECKIN_URGENT_MS', () => {
        it('equals CHECKIN_URGENT_DAYS in milliseconds', () => {
            expect(CONFIG.CHECKIN_URGENT_MS).toBe(CONFIG.CHECKIN_URGENT_DAYS * 24 * 60 * 60 * 1000);
        });
    });

    describe('DEV_MODE_LONG_PRESS_MS', () => {
        it('is greater than DEV_MODE_TOAST_DURATION_MS', () => {
            expect(CONFIG.DEV_MODE_LONG_PRESS_MS).toBeGreaterThan(CONFIG.DEV_MODE_TOAST_DURATION_MS);
        });
    });

    describe('TICK_RATE_MS', () => {
        it('is 100', () => {
            expect(CONFIG.TICK_RATE_MS).toBe(100);
        });
    });

    describe('TWEET_THRESHOLD integration', () => {
        it('config/tweet.ts exports a positive TWEET_THRESHOLD', () => {
            expect(TWEET_THRESHOLD).toBeGreaterThan(0);
        });

        it('config/tweet.ts isTweet function correctly classifies word counts', () => {
            expect(isTweet(0)).toBe(true);
            expect(isTweet(1)).toBe(true);
            expect(isTweet(TWEET_THRESHOLD)).toBe(true);
            expect(isTweet(TWEET_THRESHOLD + 1)).toBe(false);
        });

        it('config/ai.ts can be imported without Platform.OS crash (regression test)', () => {
            // This test guards against a startup crash where config/ai.ts
            // imported TWEET_THRESHOLD from config/index.ts, which bundles
            // Platform.OS at module load — causing a Jest runtime crash.
            // MIN_AI_WORDS must be a positive integer derived from the threshold.
            expect(MIN_AI_WORDS).toBe(TWEET_THRESHOLD);
            expect(typeof MIN_AI_WORDS).toBe('number');
        });
    });
});
