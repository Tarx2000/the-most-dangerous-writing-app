/**
 * Tests for the structured AI error classification.
 *
 * These guard the contract that the AI Queue + UI rely on:
 *  - classifyHttpStatus maps 401/403 → auth, 429 → rateLimit, 5xx → server, else → config
 *  - classifyError maps message heuristics to the right kind (network/timeout/auth/...)
 *  - isRetryableKind tells the queue what to retry (transient) vs fail-fast (permanent)
 *  - AiError keeps a stable `.message` (so legacy string-based catchers still work)
 *    while exposing an actionable `userMessage` + `kind`.
 */

import { AiError, classifyError, classifyHttpStatus, isRetryableKind, type AiErrorKind } from '@/lib/aiService';

describe('classifyHttpStatus', () => {
    it('maps 401 and 403 to auth', () => {
        expect(classifyHttpStatus(401).kind).toBe('auth');
        expect(classifyHttpStatus(403).kind).toBe('auth');
    });

    it('maps 429 to rateLimit', () => {
        expect(classifyHttpStatus(429).kind).toBe('rateLimit');
    });

    it('maps 5xx to server', () => {
        expect(classifyHttpStatus(500).kind).toBe('server');
        expect(classifyHttpStatus(502).kind).toBe('server');
        expect(classifyHttpStatus(503).kind).toBe('server');
        expect(classifyHttpStatus(529).kind).toBe('server');
    });

    it('maps other 4xx (400/404/422) to config', () => {
        expect(classifyHttpStatus(400).kind).toBe('config');
        expect(classifyHttpStatus(404).kind).toBe('config');
        expect(classifyHttpStatus(422).kind).toBe('config');
    });

    it('always provides an actionable userMessage (non-empty)', () => {
        for (const status of [400, 401, 403, 404, 422, 429, 500, 502, 503]) {
            const err = classifyHttpStatus(status);
            expect(typeof err.userMessage).toBe('string');
            expect(err.userMessage.length).toBeGreaterThan(10);
        }
    });

    it('captures the statusCode for UI context', () => {
        expect(classifyHttpStatus(403).statusCode).toBe(403);
        expect(classifyHttpStatus(500).statusCode).toBe(500);
    });
});

describe('classifyError (message heuristics)', () => {
    it('passes through AiError instances unchanged', () => {
        const original = new AiError('auth', 'Key bad', 'technical');
        const result = classifyError(original);
        expect(result).toBe(original);
        expect(result.kind).toBe('auth');
    });

    it('classifies cancellation messages', () => {
        expect(classifyError(new Error('AI request cancelled')).kind).toBe('cancelled');
        expect(classifyError(new Error('request aborted')).kind).toBe('cancelled');
    });

    it('classifies timeout messages', () => {
        expect(classifyError(new Error('AI request timed out after 180s')).kind).toBe('timeout');
    });

    it('classifies network messages', () => {
        expect(classifyError(new Error('Network request failed')).kind).toBe('network');
        expect(classifyError(new Error('connection dropped')).kind).toBe('network');
        expect(classifyError(new Error('unreachable')).kind).toBe('network');
    });

    it('classifies auth markers (401/403/auth)', () => {
        expect(classifyError(new Error('HTTP 401')).kind).toBe('auth');
        expect(classifyError(new Error('403 Forbidden')).kind).toBe('auth');
    });

    it('classifies rate-limit markers (429)', () => {
        expect(classifyError(new Error('429 Too Many Requests')).kind).toBe('rateLimit');
    });

    it('classifies 5xx markers', () => {
        expect(classifyError(new Error('HTTP 503')).kind).toBe('server');
    });

    it('falls back to parse for unknown errors', () => {
        expect(classifyError(new Error('something weird happened')).kind).toBe('parse');
        expect(classifyError('a string error').kind).toBe('parse');
        expect(classifyError(undefined).kind).toBe('parse');
    });
});

describe('isRetryableKind', () => {
    const retryable: AiErrorKind[] = ['network', 'timeout', 'server', 'rateLimit'];
    const permanent: AiErrorKind[] = ['auth', 'config', 'cancelled', 'parse'];

    it.each(retryable)('returns true for transient kind: %s', (kind) => {
        expect(isRetryableKind(kind)).toBe(true);
    });

    it.each(permanent)('returns false for permanent kind: %s', (kind) => {
        expect(isRetryableKind(kind)).toBe(false);
    });
});

describe('AiError', () => {
    it('extends Error so string-based catchers keep working', () => {
        const err = new AiError('auth', 'Key bad', 'HTTP 401 from server');
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('HTTP 401 from server');
    });

    it('falls back to userMessage when no technical message is given', () => {
        const err = new AiError('network', 'Cannot reach server.');
        expect(err.message).toBe('Cannot reach server.');
        expect(err.userMessage).toBe('Cannot reach server.');
    });

    it('preserves kind + userMessage distinctly from message', () => {
        const err = new AiError('parse', "Couldn't read response.", 'JSON.parse failed');
        expect(err.kind).toBe('parse');
        expect(err.userMessage).toBe("Couldn't read response.");
        // technical message used for logs
        expect(err.message).toBe('JSON.parse failed');
    });

    it('userMessages are actionable (mention the likely fix or symptom)', () => {
        const auth = classifyHttpStatus(401);
        expect(auth.userMessage.toLowerCase()).toContain('api key');

        const net = classifyError(new Error('Network request failed'));
        expect(net.userMessage.toLowerCase()).toMatch(/connection|internet|base url/);

        const config400 = classifyHttpStatus(400);
        // config errors should hint at model/base URL
        expect(config400.userMessage.toLowerCase()).toMatch(/model|base url|provider/);
    });
});
