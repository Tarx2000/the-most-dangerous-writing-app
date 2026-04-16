/**
 * aiQueue tests — Unit tests for the AI Queue Manager singleton.
 *
 * The singleton retains state between tests, so we carefully reset it
 * in afterEach. We also mock all native/service dependencies.
 */

import { AI_STORAGE_KEYS } from '@/config/ai';

// Mock storage adapter
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  multiSet: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

// Mock react-native
jest.mock('react-native', () => ({
  DeviceEventEmitter: {
    emit: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

// Mock aiService — processNote hangs by default to prevent auto-completion
let processNoteResolve: (value: any) => void;
jest.mock('@/lib/aiService', () => ({
  processNote: jest.fn(() => new Promise(r => { processNoteResolve = r; })),
  pingServer: jest.fn(() => Promise.resolve({ online: true })),
  isServerPersistentlyOffline: jest.fn(() => false),
}));

// Mock aiLogger
jest.mock('@/lib/aiLogger', () => ({
  logAi: jest.fn(() => Promise.resolve()),
}));

import { DeviceEventEmitter } from 'react-native';
import { aiQueue } from '@/lib/aiQueue';
import { processNote, pingServer } from '@/lib/aiService';

describe('AiQueueManager', () => {
  const mockGetAiConfig = () => ({ model: 'test-model', apiKey: 'key', baseUrl: 'http://test', prompts: { title: 't', summary: 's', grammar: 'g' } });
  const mockGetNoteById = (id: string) => ({ id, text: 'Test note content', dateStr: '2026-01-01', timestamp: Date.now(), durationMin: 5, won: true });
  const mockUpdateNote = jest.fn(() => Promise.resolve());
  const mockGetAllNotes = () => [
    { id: 'n1', text: 'Note 1', dateStr: '2026-01-01', timestamp: Date.now(), durationMin: 5, won: true },
    { id: 'n2', text: 'Note 2', dateStr: '2026-01-02', timestamp: Date.now(), durationMin: 10, won: true, aiTitle: 'Existing', aiSummary: ['S'], aiModelUsed: 'model' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset singleton state fully
    aiQueue.shutdown();
  });

  const initQueue = () => aiQueue.initialize(mockGetAiConfig, mockGetNoteById, mockUpdateNote, mockGetAllNotes);

  describe('isInitialized', () => {
    it('should be false before initialization', () => {
      expect(aiQueue.isInitialized).toBe(false);
    });

    it('should be true after initialization', async () => {
      await initQueue();
      expect(aiQueue.isInitialized).toBe(true);
    });
  });

  describe('isNoteActive / isNoteQueued', () => {
    it('should return false for unknown notes', async () => {
      await initQueue();
      expect(aiQueue.isNoteActive('nonexistent')).toBe(false);
      expect(aiQueue.isNoteQueued('nonexistent')).toBe(false);
    });
  });

  describe('getState', () => {
    it('should return valid state shape', async () => {
      await initQueue();
      const state = aiQueue.getState();
      expect(state).toHaveProperty('isProcessing');
      expect(state).toHaveProperty('currentJob');
      expect(state).toHaveProperty('pendingCount');
      expect(state).toHaveProperty('batchProgress');
      expect(state).toHaveProperty('currentCategory');
      expect(state).toHaveProperty('serverOnline');
      expect(state).toHaveProperty('jobs');
      expect(Array.isArray(state.jobs)).toBe(true);
    });
  });

  describe('enqueueNote', () => {
    it('should add a job and report it in state', async () => {
      await initQueue();
      await aiQueue.enqueueNote('n1', 'journal');
      // Job may be processing (since processNote hangs), check it's known
      const state = aiQueue.getState();
      const isInQueue = aiQueue.isNoteActive('n1') || aiQueue.isNoteQueued('n1');
      expect(isInQueue).toBe(true);
      expect(DeviceEventEmitter.emit).toHaveBeenCalled();
    });

    it('should skip duplicates', async () => {
      await initQueue();
      await aiQueue.enqueueNote('n1', 'journal');
      // First enqueue already started processing; try again
      await aiQueue.enqueueNote('n1', 'journal');
      // Should not double-enqueue — the note is already in processing
      const state = aiQueue.getState();
      const matchingJobs = state.jobs.filter(j => j.noteId === 'n1');
      expect(matchingJobs.length).toBeLessThanOrEqual(1);
    });

    it('should complete a job and save AI results', async () => {
      await initQueue();
      await aiQueue.enqueueNote('n1', 'journal');
      // Resolve the hanging processNote promise
      processNoteResolve({ title: 'AI Title', summary: ['Point 1'] });
      // Wait for async processing to complete
      await new Promise(r => setTimeout(r, 200));
      expect(mockUpdateNote).toHaveBeenCalledWith('n1', expect.objectContaining({
        aiTitle: 'AI Title',
        aiSummary: ['Point 1'],
      }));
    });
  });

  describe('enqueueBatch', () => {
    it('should only enqueue notes without AI data by default', async () => {
      await initQueue();
      const count = await aiQueue.enqueueBatch(false);
      // n1 has no AI title, n2 has all AI data — so only n1 should be enqueued
      expect(count).toBe(1);
    });

    it('should enqueue all notes with forceOverwrite', async () => {
      await initQueue();
      // Resolve any pending jobs from previous test
      try { processNoteResolve({ title: 'T', summary: [] }); } catch (_) {}
      await new Promise(r => setTimeout(r, 100));
      await aiQueue.cancelBatch();

      const count = await aiQueue.enqueueBatch(true);
      expect(count).toBe(2);
    });
  });

  describe('cancelBatch', () => {
    it('should cancel pending batch jobs', async () => {
      await initQueue();
      await aiQueue.enqueueBatch(true);
      await aiQueue.cancelBatch();
      const state = aiQueue.getState();
      expect(state.pendingCount).toBe(0);
    });
  });
});