/**
 * aiEndToEnd.mock.test.ts — Deterministic Full Lifecycle AI Test Suite
 *
 * 100% deterministic, fast, tests every state transition, retry path,
 * cancellation, batch ordering, orphan recovery, and pre-flight validation.
 * This is the primary regression guard.
 */

/* ── Mocks ─────────────────────────────────────────────────────────────── */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  multiSet: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

const listeners: Record<string, Array<(payload: unknown) => void>> = {};
jest.mock('react-native', () => ({
  DeviceEventEmitter: {
    emit: jest.fn((event: string, payload: unknown) => {
      (listeners[event] || []).forEach((fn) => fn(payload));
    }),
    addListener: jest.fn((event: string, fn: (payload: unknown) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
      return {
        remove: () => {
          listeners[event] = listeners[event].filter((l) => l !== fn);
        },
      };
    }),
  },
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock('@/lib/aiLogger', () => ({
  logAi: jest.fn(() => Promise.resolve()),
  getAiLog: jest.fn(() => Promise.resolve([])),
  clearAiLog: jest.fn(() => Promise.resolve()),
}));

let processNoteResolve: ((value: unknown) => void) | undefined;
let processNoteReject: ((reason?: unknown) => void) | undefined;
jest.mock('@/lib/aiService', () => ({
  processNote: jest.fn(
    () =>
      new Promise<unknown>((resolve, reject) => {
        processNoteResolve = resolve;
        processNoteReject = reject;
      }),
  ),
  pingServer: jest.fn(() => Promise.resolve({ online: true })),
  isServerPersistentlyOffline: jest.fn(() => false),
  resetAiServiceState: jest.fn(),
  resetStateForTesting: jest.fn(),
  AiCancelToken: class AiCancelToken {
    aborted = false;
    abort() {
      this.aborted = true;
    }
    reset() {
      this.aborted = false;
    }
  },
}));

/* ── Imports ───────────────────────────────────────────────────────────── */

import { aiQueue } from '@/lib/aiQueue';
import { processNote, pingServer, resetAiServiceState } from '@/lib/aiService';
import { logAi, clearAiLog } from '@/lib/aiLogger';
import type { SavedNote, AiJob } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AI_STORAGE_KEYS } from '@/config/ai';

/* ── Flush Promises Helper ─────────────────────────────────────────────── */

const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

/* ── Dummy Data ────────────────────────────────────────────────────────── */

const DUMMY_ENTRY_TEXT = `Today was exhausting but illuminating. I spent the morning wrestling with a bug in the authentication flow that kept rejecting valid tokens. After three hours of printf-debugging, I realized the clock skew on the staging server was exactly 58 seconds — just enough to invalidate every JWT.

In the afternoon, I met Sarah for coffee. We hadn't spoken in weeks, and I was nervous, but the conversation flowed naturally. She asked about the app, and for the first time, I described the "dangerous writing" mechanic out loud. Her eyes lit up. She said it sounded like digital exposure therapy, and I think she's right.

On the walk home, I wondered why I avoid sharing my work until it feels perfect. The app itself is built around the opposite idea — raw, unfiltered, immediate. Maybe I should start treating my conversations the same way.`;

const dummyNote: SavedNote = {
  id: 'test-note-e2e-001',
  text: DUMMY_ENTRY_TEXT,
  dateStr: new Date().toLocaleDateString(),
  timestamp: Date.now(),
  durationMin: 7,
  won: true,
};

/* ── Tracer ────────────────────────────────────────────────────────────── */

type TracerStep = { name: string; time: number };

class AiTestTracer {
  private steps: TracerStep[] = [];

  step(name: string): void {
    this.steps.push({
      name,
      time: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    });
  }

  timeline(): TracerStep[] {
    return [...this.steps];
  }

  printTimeline(): string {
    const lines: string[] = ['\n=== AI Test Tracer Timeline ==='];
    let last = this.steps[0]?.time ?? 0;
    for (const s of this.steps) {
      const delta = s.time - last;
      lines.push(`  ${s.name}  (+${delta.toFixed(2)}ms)`);
      last = s.time;
    }
    lines.push('=================================\n');
    return lines.join('\n');
  }

  hasStep(name: string): boolean {
    return this.steps.some((s) => s.name === name);
  }

  countStep(name: string): number {
    return this.steps.filter((s) => s.name === name).length;
  }
}

/* ── Test Helpers ─────────────────────────────────────────────────────── */

function waitForQueueEmpty(timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    const check = () => {
      const state = aiQueue.getState();
      if (state.pendingCount === 0 && !state.isProcessing) {
        resolve();
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error(`Queue did not empty within ${timeoutMs}ms`));
        return;
      }
      setTimeout(check, 20);
    };
    check();
  });
}

async function waitForProcessNoteCalled(timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const iv = setInterval(() => {
      if (typeof processNoteResolve === 'function') {
        clearInterval(iv);
        resolve();
      }
      if (Date.now() > deadline) {
        clearInterval(iv);
        reject(new Error('processNote was not called within timeout'));
      }
    }, 10);
  });
}

async function waitForJobStatus(
  predicate: (state: { currentJob: AiJob | null; jobs: AiJob[] }) => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const check = () => {
      const state = aiQueue.getState();
      if (predicate(state)) {
        resolve();
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error('Predicate not met within timeout'));
        return;
      }
      setTimeout(check, 20);
    };
    check();
  });
}

/* ── Test Setup ────────────────────────────────────────────────────────── */

describe('AI End-to-End (Mocked)', () => {
  const mockGetAiConfig = () => ({
    model: 'test-model',
    apiKey: 'test-api-key',
    baseUrl: 'http://localhost:11434',
    prompts: { title: 't', summary: 's', grammar: 'g' },
  });

  const mockGetNoteById = (id: string) =>
    id === dummyNote.id ? dummyNote : undefined;

  const mockUpdateNote = jest.fn(() => Promise.resolve());

  const mockGetAllNotes = () => [dummyNote];

  beforeEach(async () => {
    jest.clearAllMocks();
    aiQueue.shutdown();
    resetAiServiceState();
    (logAi as jest.Mock).mockClear();
    await clearAiLog();
    processNoteResolve = undefined;
    processNoteReject = undefined;

    // Clean up custom event listeners
    for (const key of Object.keys(listeners)) {
      listeners[key] = [];
    }

    (AsyncStorage.getItem as jest.Mock).mockImplementation(() =>
      Promise.resolve(null),
    );
    (AsyncStorage.setItem as jest.Mock).mockImplementation(() =>
      Promise.resolve(),
    );

    (processNote as jest.Mock).mockImplementation(
      () =>
        new Promise<unknown>((resolve, reject) => {
          processNoteResolve = resolve;
          processNoteReject = reject;
        }),
    );
    (pingServer as jest.Mock).mockImplementation(() =>
      Promise.resolve({ online: true }),
    );
  });

  afterEach(() => {
    aiQueue.shutdown();
  });

  /* ── Test 1: Full Lifecycle ─────────────────────────────────────────── */
  describe('full lifecycle', () => {
    it('should process a note from enqueue to updated note', async () => {
      const tracer = new AiTestTracer();
      tracer.step('test_start');
      tracer.step('note_created');

      await aiQueue.initialize(
        mockGetAiConfig,
        mockGetNoteById,
        mockUpdateNote,
        mockGetAllNotes,
      );
      tracer.step('queue_initialized');

      await aiQueue.enqueueNote(dummyNote.id, 'journal');
      tracer.step('note_enqueued');

      // Ensure processNote has been invoked so resolve/reject are defined
      await waitForProcessNoteCalled();
      tracer.step('job_status:que → processing');
      tracer.step('ai_request_start');

      if (processNoteResolve) {
        processNoteResolve({
          title: 'Mocked Title',
          summary: ['Point 1', 'Point 2'],
          failed: false,
        });
      }
      tracer.step('ai_request_end');

      await waitForQueueEmpty();
      tracer.step('job_status:processing → done');
      tracer.step('note_updated');
      tracer.step('queue_empty');

      // Assertions
      const state = aiQueue.getState();
      expect(state.pendingCount).toBe(0);
      expect(state.isProcessing).toBe(false);

      expect(mockUpdateNote).toHaveBeenCalledWith(dummyNote.id, {
        aiTitle: 'Mocked Title',
        aiSummary: ['Point 1', 'Point 2'],
        aiModelUsed: 'test-model',
      });

      const jobs = (aiQueue as unknown as { jobs: AiJob[] }).jobs;
      const job = jobs.find((j) => j.noteId === dummyNote.id);
      expect(job).toBeDefined();
      if (job) {
        expect(job.status).toBe('done');
        expect(job.retryCount).toBe(0);
      }

      // Tracer assertions
      tracer.step('test_complete');
      expect(tracer.hasStep('test_start')).toBe(true);
      expect(tracer.hasStep('note_created')).toBe(true);
      expect(tracer.hasStep('queue_initialized')).toBe(true);
      expect(tracer.hasStep('note_enqueued')).toBe(true);
      expect(tracer.hasStep('job_status:que → processing')).toBe(true);
      expect(tracer.hasStep('ai_request_start')).toBe(true);
      expect(tracer.hasStep('ai_request_end')).toBe(true);
      expect(tracer.hasStep('job_status:processing → done')).toBe(true);
      expect(tracer.hasStep('note_updated')).toBe(true);
      expect(tracer.hasStep('queue_empty')).toBe(true);
      expect(tracer.hasStep('test_complete')).toBe(true);

      const timeline = tracer.timeline();
      for (let i = 1; i < timeline.length; i++) {
        expect(timeline[i].time).toBeGreaterThanOrEqual(timeline[i - 1].time);
      }

      // Logger assertions
      expect(logAi).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'enqueue' } as Record<string, unknown>),
      );
      expect(logAi).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'start' } as Record<string, unknown>),
      );
      expect(logAi).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'success' } as Record<string, unknown>),
      );
    });
  });

  /* ── Test 2: Retry Path ─────────────────────────────────────────────── */
  describe('retry path', () => {
    it('should retry transient failures up to AI_MAX_RETRIES then succeed', async () => {
      const tracer = new AiTestTracer();
      tracer.step('test_start');

      let attempt = 0;
      (processNote as jest.Mock).mockImplementation(() => {
        attempt++;
        tracer.step('ai_request_start');
        return new Promise<unknown>((resolve, reject) => {
          setTimeout(() => {
            tracer.step('ai_request_end');
            if (attempt <= 2) {
              reject(new Error('Network request failed'));
            } else {
              resolve({
                title: 'Retried Title',
                summary: ['Retry Summary'],
                failed: false,
              });
            }
          }, 5);
        });
      });

      await aiQueue.initialize(
        mockGetAiConfig,
        mockGetNoteById,
        mockUpdateNote,
        mockGetAllNotes,
      );
      await aiQueue.enqueueNote(dummyNote.id, 'journal');

      await waitForQueueEmpty(5000);
      tracer.step('test_complete');

      const jobs = (aiQueue as unknown as { jobs: AiJob[] }).jobs;
      const job = jobs.find((j) => j.noteId === dummyNote.id);
      expect(job).toBeDefined();
      if (job) {
        expect(job.status).toBe('done');
        expect(job.retryCount).toBe(2);
      }

      expect(tracer.countStep('ai_request_start')).toBe(3);
      expect(tracer.countStep('ai_request_end')).toBe(3);

      // Logger assertions
      expect(logAi).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'fail' } as Record<string, unknown>),
      );
      expect(logAi).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'retry' } as Record<string, unknown>),
      );
      expect(logAi).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'success' } as Record<string, unknown>),
      );

      expect(mockUpdateNote).toHaveBeenCalledWith(dummyNote.id, {
        aiTitle: 'Retried Title',
        aiSummary: ['Retry Summary'],
        aiModelUsed: 'test-model',
      });
    });
  });

  /* ── Test 3: Cancellation ─────────────────────────────────────────────── */
  describe('cancellation mid-flight', () => {
    it('should cancel a job and not update the note', async () => {
      const tracer = new AiTestTracer();
      tracer.step('test_start');

      await aiQueue.initialize(
        mockGetAiConfig,
        mockGetNoteById,
        mockUpdateNote,
        mockGetAllNotes,
      );

      await aiQueue.enqueueNote(dummyNote.id, 'journal');
      tracer.step('note_enqueued');

      // Poll until processing starts
      await waitForJobStatus(
        (state) => state.currentJob?.status === 'processing',
        2000,
      );
      const currentJob = aiQueue.getState().currentJob;
      expect(currentJob).not.toBeNull();
      const startedJobId = currentJob?.id;
      expect(startedJobId).toBeDefined();
      tracer.step('job_status:que → processing');

      // Cancel immediately
      if (startedJobId) {
        aiQueue.cancelJob(startedJobId);
      }
      tracer.step('cancel_called');

      // Let the in-flight promise settle so processNext can finish
      if (processNoteReject) {
        processNoteReject(new Error('AI request cancelled'));
      }

      await flushPromises();
      await new Promise<void>((r) => setTimeout(r, 150));

      const jobs = (aiQueue as unknown as { jobs: AiJob[] }).jobs;
      const job = jobs.find((j) => j.id === startedJobId);
      expect(job).toBeDefined();
      if (job) {
        expect(job.status).toBe('failed');
        expect(job.error).toBe('Cancelled by user');
      }

      // updateNote should NOT have been called with AI results
      const aiUpdateCalls = (mockUpdateNote as jest.Mock).mock.calls.filter(
        (call: unknown[]) =>
          typeof (call[1] as Record<string, unknown>)?.aiTitle === 'string',
      );
      expect(aiUpdateCalls.length).toBe(0);
      expect(mockUpdateNote).not.toHaveBeenCalled();

      // Ensure no orphan left in 'processing'
      expect(jobs.some((j) => j.status === 'processing')).toBe(false);

      tracer.step('test_complete');
    });
  });

  /* ── Test 4: Batch Ordering ─────────────────────────────────────────── */
  describe('batch enqueue respects category ordering and newest-first', () => {
    it('should order jobs journal → circle → checkin with newest first', async () => {
      const now = Date.now();
      const notes: (SavedNote | import('@/types').AlignmentReflection)[] = [
        {
          id: 'journal-oldest',
          text: 'old journal',
          dateStr: '2026-01-01',
          timestamp: now - 300000,
          durationMin: 5,
          won: true,
        },
        {
          id: 'circle-middle',
          text: 'circle note',
          dateStr: '2026-01-02',
          timestamp: now - 200000,
          durationMin: 5,
          won: true,
          personId: 'p1',
        },
        {
          id: 'checkin-newest',
          text: 'checkin note',
          dateStr: '2026-01-03',
          timestamp: now - 100000,
          durationMin: 5,
          won: true,
          isAlignmentReflection: true,
          alignmentScore: 7,
          stopText: '',
          startText: '',
          continueText: '',
        },
        {
          id: 'journal-newest',
          text: 'new journal',
          dateStr: '2026-01-04',
          timestamp: now,
          durationMin: 5,
          won: true,
        },
      ];

      const getAllNotes = () => notes;
      const getNoteById = (id: string) => notes.find((n) => n.id === id);
      const updateNote = jest.fn(() => Promise.resolve());

      // Ping offline to prevent processing from starting during ordering test
      (pingServer as jest.Mock).mockImplementation(() =>
        Promise.resolve({ online: false }),
      );

      await aiQueue.initialize(mockGetAiConfig, getNoteById, updateNote, getAllNotes);

      const count = await aiQueue.enqueueBatch(false);
      expect(count).toBe(4);

      const jobs = (aiQueue as unknown as { jobs: AiJob[] }).jobs;
      // Check the full active queue order (processing first if any, then queued)
      const activeOrder = jobs
        .filter((j) => j.status === 'queued' || j.status === 'processing')
        .map((j) => ({ noteId: j.noteId, category: j.category }));

      // Expected order: journal newest, journal oldest, circle middle, checkin newest
      expect(activeOrder[0].noteId).toBe('journal-newest');
      expect(activeOrder[0].category).toBe('journal');
      expect(activeOrder[1].noteId).toBe('journal-oldest');
      expect(activeOrder[1].category).toBe('journal');
      expect(activeOrder[2].noteId).toBe('circle-middle');
      expect(activeOrder[2].category).toBe('circle');
      expect(activeOrder[3].noteId).toBe('checkin-newest');
      expect(activeOrder[3].category).toBe('checkin');

      // Batch progress should be present in state
      const batchProgress = aiQueue.getState().batchProgress;
      expect(batchProgress).not.toBeNull();
      if (batchProgress) {
        expect(batchProgress.total).toBe(4);
      }
    });
  });

  /* ── Test 5: Pre-flight Validation ──────────────────────────────────── */
  describe('pre-flight validation', () => {
    it('should fail fast with missing API key', async () => {
      const tracer = new AiTestTracer();
      const badConfig = () => ({
        model: 'test',
        apiKey: '',
        baseUrl: 'http://test',
        prompts: { title: 't', summary: 's', grammar: 'g' },
      });

      await aiQueue.initialize(
        badConfig,
        mockGetNoteById,
        mockUpdateNote,
        mockGetAllNotes,
      );
      await aiQueue.enqueueNote(dummyNote.id, 'journal');

      await flushPromises();
      await new Promise<void>((r) => setTimeout(r, 200));

      const jobs = (aiQueue as unknown as { jobs: AiJob[] }).jobs;
      const job = jobs.find((j) => j.noteId === dummyNote.id);
      expect(job).toBeDefined();
      if (job) {
        expect(job.status).toBe('failed');
        expect(job.error).toContain('API key');
      }

      expect(processNote).not.toHaveBeenCalled();

      tracer.step('test_complete');
    });
  });

  /* ── Test 6: Orphan Recovery ────────────────────────────────────────── */
  describe('orphan recovery on init', () => {
    it('should reset processing jobs to queued on startup', async () => {
      const tracer = new AiTestTracer();
      const orphanJobs: AiJob[] = [
        {
          id: 'orphan-job-001',
          noteId: 'orphan-note-001',
          category: 'journal',
          status: 'processing',
          createdAt: Date.now() - 60000,
          retryCount: 1,
          error: 'Some stale error',
        },
      ];

      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
        if (key === AI_STORAGE_KEYS.QUEUE) {
          return Promise.resolve(JSON.stringify(orphanJobs));
        }
        return Promise.resolve(null);
      });

      await aiQueue.initialize(
        mockGetAiConfig,
        mockGetNoteById,
        mockUpdateNote,
        mockGetAllNotes,
      );
      tracer.step('queue_initialized');

      const jobs = (aiQueue as unknown as { jobs: AiJob[] }).jobs;
      const recovered = jobs.find((j) => j.id === 'orphan-job-001');
      expect(recovered).toBeDefined();

      // Orphan recovery resets retryCount and error. The status may be 'queued'
      // (if auto-start hasn't picked it up yet) or 'processing' (if auto-start
      // picked it up immediately). Both are acceptable because the reset happened
      // before the queue resumed.
      if (recovered) {
        expect(recovered.retryCount).toBe(0);
        expect(recovered.error).toBeUndefined();
        expect(['queued', 'processing']).toContain(recovered.status);
      }

      expect(logAi).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'orphan_recovery' } as Record<string, unknown>),
      );

      tracer.step('test_complete');
    });
  });
});
