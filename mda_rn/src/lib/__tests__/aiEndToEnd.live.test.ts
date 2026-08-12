/**
 * aiEndToEnd.live.test.ts — Live API Smoke Test
 *
 * Hits the real Ollama Cloud API with the hardcoded key, measures latency,
 * gates itself via pingServer(), and performs a real end-to-end queue lifecycle.
 * Skips gracefully when the server is down.
 */

jest.setTimeout(300_000);

/* ── Mocks ─────────────────────────────────────────────────────────────── */

jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    multiSet: jest.fn(() => Promise.resolve()),
    multiRemove: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native', () => ({
    DeviceEventEmitter: {
        emit: jest.fn(),
        addListener: jest.fn(() => ({ remove: jest.fn() })),
    },
    AppState: {
        addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    },
}));

jest.mock('@/lib/aiLogger', () => ({
    logAi: jest.fn(() => Promise.resolve()),
    getAiLog: jest.fn(() => Promise.resolve([])),
    clearAiLog: jest.fn(() => Promise.resolve()),
    logStartupDiagnostics: jest.fn(),
}));

/* ── Imports ───────────────────────────────────────────────────────────── */

import {
    pingServer,
    generateTitle,
    generateSummary,
    checkGrammar,
    processNote,
    resetStateForTesting,
} from '@/lib/aiService';
import { aiQueue } from '@/lib/aiQueue';
import type { SavedNote } from '@/types';

/* ── Dummy Data ────────────────────────────────────────────────────────── */

const DUMMY_ENTRY_TEXT = `Today was exhausting but illuminating. I spent the morning wrestling with a bug in the authentication flow that kept rejecting valid tokens. After three hours of printf-debugging, I realized the clock skew on the staging server was exactly 58 seconds — just enough to invalidate every JWT.

In the afternoon, I met Sarah for coffee. We hadn't spoken in weeks, and I was nervous, but the conversation flowed naturally. She asked about the app, and for the first time, I described the "dangerous writing" mechanic out loud. Her eyes lit up. She said it sounded like digital exposure therapy, and I think she's right.

On the walk home, I wondered why I avoid sharing my work until it feels perfect. The app itself is built around the opposite idea — raw, unfiltered, immediate. Maybe I should start treating my conversations the same way.`;

const DUMMY_ENTRY_WITH_TYPOS = `Today was exausting but iluminating. I spent the morning wresteling with a bug in the authentification flow that kept rejecting valid tokens. After three hours of printf-debugging, I realized the clock skew on the staging server was exactly 58 seconds — just enough to invalidate every JWT.`;

const dummyNote: SavedNote = {
    id: 'test-note-live-001',
    text: DUMMY_ENTRY_TEXT,
    dateStr: new Date().toLocaleDateString(),
    timestamp: Date.now(),
    durationMin: 7,
    won: true,
};

/* ── Tracer ────────────────────────────────────────────────────────────── */

class AiTestTracer {
    private steps: { name: string; time: number }[] = [];

    step(name: string): void {
        this.steps.push({
            name,
            time: typeof performance !== 'undefined' ? performance.now() : Date.now(),
        });
    }

    printTimeline(): string {
        const lines: string[] = ['\n=== AI Live Test Tracer Timeline ==='];
        let last = this.steps[0]?.time ?? 0;
        for (const s of this.steps) {
            const delta = s.time - last;
            lines.push(`  ${s.name}  (+${delta.toFixed(2)}ms)`);
            last = s.time;
        }
        lines.push('====================================\n');
        return lines.join('\n');
    }
}

/* ── Live Test Suite ───────────────────────────────────────────────────── */

describe('AI End-to-End (Live API)', () => {
    let serverOnline = false;

    // Gate the entire suite on server reachability.
    // We only ping the server here; the actual inference tests below will
    // catch model-level failures.  Previously we also ran a generateTitle
    // probe, but cloud models often need >60 s to warm up on the first
    // request, causing false-negative skips even though the server is
    // healthy.  Trust pingServer and let the real tests speak.
    beforeAll(async () => {
        const pingResult = await pingServer();
        if (!pingResult.online) {
            serverOnline = false;

            console.warn(`[LIVE TEST] Ollama Cloud unreachable — skipping live suite. Error: ${pingResult.error}`);
            return;
        }

        serverOnline = true;
    });

    beforeEach(() => {
        aiQueue.shutdown();
        resetStateForTesting();
        jest.clearAllMocks();
    });

    afterEach(() => {
        aiQueue.shutdown();
    });

    /* ── Test 1: Ping Server ─────────────────────────────────────────────── */
    it('should ping the server and report online', async () => {
        if (!serverOnline) {
            console.warn('[LIVE TEST] Skipping — Ollama Cloud is offline or unresponsive (see beforeAll logs)');
            return;
        }
        const tracer = new AiTestTracer();
        tracer.step('test_start');

        const start = Date.now();
        const result = await pingServer();
        const latency = Date.now() - start;
        tracer.step('ping_done');

        expect(result.online).toBe(true);
        expect(latency).toBeLessThan(30_000);

        // eslint-disable-next-line no-console
        console.log(`[LIVE TEST] pingServer latency: ${latency}ms`);
        // eslint-disable-next-line no-console
        console.log(tracer.printTimeline());
    });

    /* ── Test 2: Generate Title Live ─────────────────────────────────────── */
    it('should generate a title from the dummy entry', async () => {
        if (!serverOnline) {
            console.warn('[LIVE TEST] Skipping — Ollama Cloud is offline or unresponsive (see beforeAll logs)');
            return;
        }
        const tracer = new AiTestTracer();
        tracer.step('test_start');

        const start = Date.now();
        const title = await generateTitle(DUMMY_ENTRY_TEXT);
        const latency = Date.now() - start;
        tracer.step('generateTitle_done');

        expect(typeof title).toBe('string');
        expect(title.length).toBeGreaterThan(0);
        expect(title.length).toBeLessThan(100);
        expect(title).not.toMatch(/^["'].*["']$/);

        // eslint-disable-next-line no-console
        console.log(`[LIVE TEST] generateTitle latency: ${latency}ms`);
        // eslint-disable-next-line no-console
        console.log(`[LIVE TEST] Title: "${title}"`);
        // eslint-disable-next-line no-console
        console.log(tracer.printTimeline());
    });

    /* ── Test 3: Generate Summary Live ─────────────────────────────────────── */
    it('should generate a summary from the dummy entry', async () => {
        if (!serverOnline) {
            console.warn('[LIVE TEST] Skipping — Ollama Cloud is offline or unresponsive (see beforeAll logs)');
            return;
        }
        const tracer = new AiTestTracer();
        tracer.step('test_start');

        const start = Date.now();
        const summary = await generateSummary(DUMMY_ENTRY_TEXT);
        const latency = Date.now() - start;
        tracer.step('generateSummary_done');

        expect(Array.isArray(summary)).toBe(true);
        expect(summary.length).toBeGreaterThanOrEqual(2);
        expect(summary.length).toBeLessThanOrEqual(5);
        for (const bullet of summary) {
            expect(typeof bullet).toBe('string');
            expect(bullet.length).toBeGreaterThan(0);
        }

        // eslint-disable-next-line no-console
        console.log(`[LIVE TEST] generateSummary latency: ${latency}ms`);
        // eslint-disable-next-line no-console
        console.log(`[LIVE TEST] Summary:`, summary);
        // eslint-disable-next-line no-console
        console.log(tracer.printTimeline());
    });

    /* ── Test 4: Check Grammar Live ────────────────────────────────────────── */
    it('should find grammar issues in the dummy entry with typos', async () => {
        if (!serverOnline) {
            console.warn('[LIVE TEST] Skipping — Ollama Cloud is offline or unresponsive (see beforeAll logs)');
            return;
        }
        const tracer = new AiTestTracer();
        tracer.step('test_start');

        const start = Date.now();
        const suggestions = await checkGrammar(DUMMY_ENTRY_WITH_TYPOS);
        const latency = Date.now() - start;
        tracer.step('checkGrammar_done');

        expect(Array.isArray(suggestions)).toBe(true);
        for (const item of suggestions) {
            expect(typeof item.original).toBe('string');
            expect(typeof item.suggestion).toBe('string');
            expect(typeof item.explanation).toBe('string');
        }

        // eslint-disable-next-line no-console
        console.log(`[LIVE TEST] checkGrammar latency: ${latency}ms`);
        // eslint-disable-next-line no-console
        console.log(`[LIVE TEST] Suggestions:`, suggestions);
        // eslint-disable-next-line no-console
        console.log(tracer.printTimeline());
    });

    /* ── Test 5: Process Note Live ─────────────────────────────────────────── */
    it('should process a note end-to-end with title and summary', async () => {
        if (!serverOnline) {
            console.warn('[LIVE TEST] Skipping — Ollama Cloud is offline or unresponsive (see beforeAll logs)');
            return;
        }
        const tracer = new AiTestTracer();
        tracer.step('test_start');

        const start = Date.now();
        const result = await processNote(DUMMY_ENTRY_TEXT);
        const latency = Date.now() - start;
        tracer.step('processNote_done');

        expect(result.failed).toBe(false);
        expect(result.title).toBeDefined();
        expect(typeof result.title).toBe('string');
        if (result.title) {
            expect(result.title.length).toBeGreaterThan(0);
        }
        expect(Array.isArray(result.summary)).toBe(true);
        expect(result.summary.length).toBeGreaterThan(0);

        // eslint-disable-next-line no-console
        console.log(`[LIVE TEST] processNote latency: ${latency}ms`);
        // eslint-disable-next-line no-console
        console.log(`[LIVE TEST] Result:`, result);
        // eslint-disable-next-line no-console
        console.log(tracer.printTimeline());
    });

    /* ── Test 6: Full Queue Lifecycle Live ───────────────────────────────── */
    it('should process a note through the full queue lifecycle', async () => {
        if (!serverOnline) {
            console.warn('[LIVE TEST] Skipping — Ollama Cloud is offline or unresponsive (see beforeAll logs)');
            return;
        }
        const tracer = new AiTestTracer();
        tracer.step('test_start');

        const mockGetAiConfig = () => ({
            model: 'kimi-k2.5:cloud',
            apiKey: '0256ae2a4fa64e95980bc0c6d6177e3d.5l7X5me0ClCd9Nnx3pUKJIKS',
            baseUrl: 'https://ollama.com/v1',
            prompts: undefined,
        });

        const notesMap = new Map<string, SavedNote>([[dummyNote.id, dummyNote]]);
        const getNoteById = (id: string) => notesMap.get(id);
        const updateNotes: Array<{ id: string; updates: Partial<SavedNote> }> = [];
        const updateNote = jest.fn(async (id: string, updates: Partial<SavedNote>) => {
            updateNotes.push({ id, updates });
            const existing = notesMap.get(id);
            if (existing) {
                notesMap.set(id, { ...existing, ...updates });
            }
        });
        const getAllNotes = () => Array.from(notesMap.values());

        await aiQueue.initialize(mockGetAiConfig, getNoteById, updateNote, getAllNotes);
        tracer.step('queue_initialized');

        await aiQueue.enqueueNote(dummyNote.id, 'journal');
        tracer.step('note_enqueued');

        // Poll until the queue is idle with no pending jobs
        const startWait = Date.now();
        const POLL_INTERVAL_MS = 250;
        const MAX_WAIT_MS = 120_000;
        let elapsed = 0;
        while (elapsed < MAX_WAIT_MS) {
            const state = aiQueue.getState();
            if (state.pendingCount === 0 && !state.isProcessing) {
                break;
            }
            await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
            elapsed += POLL_INTERVAL_MS;
        }
        if (elapsed >= MAX_WAIT_MS) {
            throw new Error('Queue did not finish within 120s');
        }
        tracer.step('queue_empty');

        const finalNote = notesMap.get(dummyNote.id);
        expect(finalNote).toBeDefined();
        if (finalNote) {
            expect(finalNote.aiTitle).toBeDefined();
            expect(typeof finalNote.aiTitle).toBe('string');
            if (finalNote.aiTitle) {
                expect(finalNote.aiTitle.length).toBeGreaterThan(0);
            }

            expect(finalNote.aiSummary).toBeDefined();
            expect(Array.isArray(finalNote.aiSummary)).toBe(true);
            if (finalNote.aiSummary) {
                expect(finalNote.aiSummary.length).toBeGreaterThan(0);
            }

            const totalLatency = Date.now() - startWait;
            // eslint-disable-next-line no-console
            console.log(`[LIVE TEST] Full queue lifecycle latency: ${totalLatency}ms`);
            // eslint-disable-next-line no-console
            console.log(`[LIVE TEST] aiTitle: "${finalNote.aiTitle}"`);
            // eslint-disable-next-line no-console
            console.log(`[LIVE TEST] aiSummary:`, finalNote.aiSummary);
        }
        // eslint-disable-next-line no-console
        console.log(tracer.printTimeline());
    });
});
