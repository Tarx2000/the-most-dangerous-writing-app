/* eslint-disable no-console */
import { storage } from '@/lib/storage';
import { logAi, getAiLog, clearAiLog, logStartupDiagnostics } from '@/lib/aiLogger';
import { AI_STORAGE_KEYS, AI_LOG_MAX_ENTRIES } from '@/config/ai';

describe('aiLogger', () => {
    beforeEach(() => {
        jest.spyOn(storage, 'setItem').mockResolvedValue(undefined);
        jest.spyOn(storage, 'getItem').mockResolvedValue(null);
        jest.spyOn(storage, 'removeItem').mockResolvedValue(undefined);
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('logAi', () => {
        it('appends entry, calls storage.setItem, and serializes JSON', async () => {
            await logAi({ action: 'enqueue', noteId: '123', model: 'm', phase: 'title' });
            expect(storage.setItem).toHaveBeenCalledTimes(1);
            const [key, value] = (storage.setItem as jest.Mock).mock.calls[0];
            expect(key).toBe(AI_STORAGE_KEYS.LOG);
            const parsed = JSON.parse(value);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].action).toBe('enqueue');
            expect(parsed[0].noteId).toBe('123');
            expect(typeof parsed[0].timestamp).toBe('number');
        });

        it('trims FIFO to only the most recent 200 entries when existing log exceeds limit', async () => {
            const existing = Array.from({ length: AI_LOG_MAX_ENTRIES + 50 }, (_, i) => ({
                timestamp: i,
                action: 'enqueue' as const,
                noteId: `note-${i}`,
                model: 'm',
                phase: 'title' as const,
            }));
            (storage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(existing));
            await logAi({ action: 'success', noteId: 'new', model: 'm', phase: 'title' });
            expect(storage.setItem).toHaveBeenCalledTimes(1);
            const [key, value] = (storage.setItem as jest.Mock).mock.calls[0];
            expect(key).toBe(AI_STORAGE_KEYS.LOG);
            const parsed = JSON.parse(value);
            expect(parsed).toHaveLength(AI_LOG_MAX_ENTRIES);
            expect(parsed[0].timestamp).toBe(51);
            expect(parsed[parsed.length - 1].action).toBe('success');
            expect(parsed[parsed.length - 1].noteId).toBe('new');
        });

        it('serializes rapid calls so both entries persist without overwriting each other', async () => {
            let stored: string | null = null;
            (storage.getItem as jest.Mock).mockImplementation((key: string) => {
                if (key === AI_STORAGE_KEYS.LOG) return Promise.resolve(stored);
                return Promise.resolve(null);
            });
            (storage.setItem as jest.Mock).mockImplementation((key: string, value: string) => {
                if (key === AI_STORAGE_KEYS.LOG) stored = value;
                return Promise.resolve();
            });

            const p1 = logAi({ action: 'enqueue', noteId: '1', model: 'm', phase: 'title' });
            const p2 = logAi({ action: 'enqueue', noteId: '2', model: 'm', phase: 'title' });
            await Promise.all([p1, p2]);

            expect(stored).not.toBeNull();
            if (!stored) throw new Error('stored should not be null');
            const final = JSON.parse(stored);
            expect(final).toHaveLength(2);
            expect(final[0].noteId).toBe('1');
            expect(final[1].noteId).toBe('2');
        });
    });

    describe('getAiLog', () => {
        it('returns parsed array when storage has data', async () => {
            const data = [
                { timestamp: 1, action: 'enqueue' as const, noteId: '1', model: 'm', phase: 'title' as const },
            ];
            (storage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(data));
            const result = await getAiLog();
            expect(result).toEqual(data);
        });

        it('returns empty array when storage returns null', async () => {
            (storage.getItem as jest.Mock).mockResolvedValue(null);
            const result = await getAiLog();
            expect(result).toEqual([]);
        });

        it('returns empty array on JSON parse error', async () => {
            (storage.getItem as jest.Mock).mockResolvedValue('not valid json');
            const result = await getAiLog();
            expect(result).toEqual([]);
        });
    });

    describe('clearAiLog', () => {
        it('removes the AI log key from storage', async () => {
            await clearAiLog();
            expect(storage.removeItem).toHaveBeenCalledTimes(1);
            expect(storage.removeItem).toHaveBeenCalledWith(AI_STORAGE_KEYS.LOG);
        });
    });

    describe('logStartupDiagnostics', () => {
        it('logs a banner to console.log', () => {
            logStartupDiagnostics({
                apiKey: 'test-key-123',
                baseUrl: 'http://localhost',
                model: 'test-model',
                hasCustomPrompts: false,
                pingResult: { online: true },
                pendingJobs: 0,
            });
            expect(console.log).toHaveBeenCalled();
            const bannerCall = (console.log as jest.Mock).mock.calls.find(
                (call) => typeof call[0] === 'string' && call[0].includes('AI QUEUE STARTUP DIAGNOSTICS'),
            );
            expect(bannerCall).toBeDefined();
        });

        it('logs errors when API key is missing', () => {
            logStartupDiagnostics({
                apiKey: '',
                baseUrl: 'http://localhost',
                model: 'test-model',
                hasCustomPrompts: false,
                pingResult: { online: true },
                pendingJobs: 0,
            });
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('AI_API_KEY is missing'));
        });

        it('logs errors when base URL is missing', () => {
            logStartupDiagnostics({
                apiKey: 'test-key',
                baseUrl: '',
                model: 'test-model',
                hasCustomPrompts: false,
                pingResult: { online: true },
                pendingJobs: 0,
            });
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('AI_BASE_URL is missing'));
        });

        it('logs warning when server ping is offline', () => {
            logStartupDiagnostics({
                apiKey: 'test-key',
                baseUrl: 'http://localhost',
                model: 'test-model',
                hasCustomPrompts: false,
                pingResult: { online: false, error: 'timeout' },
                pendingJobs: 2,
            });
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Server ping failed'));
        });
    });
});
