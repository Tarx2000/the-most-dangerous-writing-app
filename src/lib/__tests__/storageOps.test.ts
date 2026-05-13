// Mock expo-sqlite before any imports touch it
jest.mock('expo-sqlite', () => ({
    openDatabaseAsync: jest.fn(() => Promise.resolve({
        withTransactionAsync: jest.fn((fn) => fn()),
        execAsync: jest.fn(() => Promise.resolve()),
        runAsync: jest.fn(() => Promise.resolve()),
        getAllAsync: jest.fn(() => Promise.resolve([])),
        closeAsync: jest.fn(() => Promise.resolve()),
    })),
}));

// Mock expo-sqlite before any imports touch it
jest.mock('expo-sqlite', () => ({
    openDatabaseAsync: jest.fn(() => Promise.resolve({
        withTransactionAsync: jest.fn((fn) => fn()),
        execAsync: jest.fn(() => Promise.resolve()),
        runAsync: jest.fn(() => Promise.resolve()),
        getAllAsync: jest.fn(() => Promise.resolve([])),
        closeAsync: jest.fn(() => Promise.resolve()),
    })),
}));

// Mock repository layer so SQLite DB calls are no-ops in unit tests
jest.mock('@/lib/repositories/notesRepository', () => ({
    insertNote: jest.fn(() => Promise.resolve()),
    deleteNote: jest.fn(() => Promise.resolve()),
    updateNote: jest.fn(() => Promise.resolve()),
    clearAllAiMetadata: jest.fn(() => Promise.resolve()),
    getAllNotes: jest.fn(() => Promise.resolve([])),
    deleteAllNotes: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/lib/repositories/personsRepository', () => ({
    insertPerson: jest.fn(() => Promise.resolve()),
    deletePerson: jest.fn(() => Promise.resolve()),
    updatePerson: jest.fn(() => Promise.resolve()),
    getAllPersons: jest.fn(() => Promise.resolve([])),
    deleteAllPersons: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/lib/repositories/vlogsRepository', () => ({
    insertVlog: jest.fn(() => Promise.resolve()),
    deleteVlog: jest.fn(() => Promise.resolve()),
    updateVlog: jest.fn(() => Promise.resolve()),
    getAllVlogs: jest.fn(() => Promise.resolve([])),
    deleteAllVlogs: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/lib/repositories/settingsRepository', () => ({
    setSetting: jest.fn(() => Promise.resolve()),
    getSetting: jest.fn(() => Promise.resolve(undefined)),
    getAllSettings: jest.fn(() => Promise.resolve({})),
    deleteAllSettings: jest.fn(() => Promise.resolve()),
}));

import { createNotesOps, createPersonsOps, createFeedOps } from '../storageOps';
import { safeParse } from '../dataLoaders';
import { Person, SavedNote } from '@/types';

type Ref<T> = { current: T };
type Setter<T> = (val: T | ((prev: T) => T)) => void;
import {
    insertNote as repoInsertNote,
} from '@/lib/repositories/notesRepository';
import {
    insertPerson as repoInsertPerson,
    deletePerson as repoDeletePerson,
    updatePerson as repoUpdatePerson,
} from '@/lib/repositories/personsRepository';

// Mock storage
jest.mock('../storage', () => ({
    storage: {
        setItem: jest.fn(() => Promise.resolve()),
        multiSet: jest.fn(() => Promise.resolve()),
        getItem: jest.fn(() => Promise.resolve(null)),
        multiGet: jest.fn(() => Promise.resolve([])),
    },
}));

// Mock haptics
jest.mock('../haptics', () => ({
    setGlobalHapticsEnabled: jest.fn(),
    vibrate: jest.fn(),
}));

// Mock perf
jest.mock('../perf', () => ({
    mark: jest.fn(),
    log: jest.fn(),
}));

// Mock videoCompressor
jest.mock('../videoCompressor', () => ({
    processPendingCompressions: jest.fn(() => Promise.resolve(0)),
}));

// Mock FileSystem
jest.mock('expo-file-system/legacy', () => ({
    documentDirectory: '/mock/documents/',
    getInfoAsync: jest.fn(),
    deleteAsync: jest.fn(),
}));



describe('safeParse', () => {
    it('should return fallback for null input', () => {
        expect(safeParse('key', null, [])).toEqual([]);
    });

    it('should return fallback for undefined input', () => {
        expect(safeParse('key', undefined, [])).toEqual([]);
    });

    it('should parse valid JSON', () => {
        expect(safeParse('key', '[1,2,3]', [])).toEqual([1, 2, 3]);
    });

    it('should return fallback for invalid JSON', () => {
        expect(safeParse('key', 'not json', [])).toEqual([]);
    });
});

describe('createNotesOps', () => {
    // Helper to create mock ref+setter pairs
    function mockRef<T>(initial: T): { current: T } {
        return { current: initial };
    }

    function mockSetter<T>(ref: { current: T }): jest.Mock {
        return jest.fn((val: T | ((prev: T) => T)) => {
            if (typeof val === 'function') {
                ref.current = (val as (prev: T) => T)(ref.current);
            } else {
                ref.current = val;
            }
        });
    }

    let notesRef: Ref<SavedNote[]>;
    let setNotes: jest.Mock;
    let streakRef: { current: number };
    let setCurrentStreak: jest.Mock;
    let lastWinDateRef: { current: string };
    let setLastWinDate: jest.Mock;
    let historyRef: { current: string[] };
    let setStreakHistory: jest.Mock;
    let ops: ReturnType<typeof createNotesOps>;

    beforeEach(() => {
        jest.clearAllMocks();
        notesRef = mockRef([]);
        setNotes = mockSetter(notesRef);
        streakRef = mockRef(0);
        setCurrentStreak = mockSetter(streakRef);
        lastWinDateRef = mockRef('');
        setLastWinDate = mockSetter(lastWinDateRef);
        historyRef = mockRef([]);
        setStreakHistory = mockSetter(historyRef);

        ops = createNotesOps(
            notesRef, setNotes as unknown as Setter<SavedNote[]>,
            streakRef, setCurrentStreak as unknown as Setter<number>,
            lastWinDateRef, setLastWinDate as unknown as Setter<string>,
            historyRef, setStreakHistory as unknown as Setter<string[]>,
        );
    });

    describe('saveNote', () => {
        it('should add a note to the notes array', async () => {
            const note = { id: 'test1', text: 'Hello', dateStr: '2026-01-01', timestamp: Date.now(), durationMin: 5, won: true };
            await ops.saveNote(note);
            expect(notesRef.current).toHaveLength(1);
            expect(notesRef.current[0].id).toBe('test1');
        });

        it('should not increment streak for quick notes', async () => {
            const note = { id: 'q1', text: 'Quick', dateStr: '2026-01-01', timestamp: Date.now(), durationMin: 0, won: true, isQuickNote: true };
            const result = await ops.saveNote(note);
            expect(result.streakIncreased).toBe(false);
            expect(streakRef.current).toBe(0);
        });

        it('should increment streak for won sessions >= 3 minutes', async () => {
            const note = { id: 'n1', text: 'This is a very long journal entry with many words so that it exceeds the tweet threshold and does not get auto classified as a tweet during the save operation which would then exclude it from streak counting logic entirely which we do not want here', dateStr: '2026-01-01', timestamp: Date.now(), durationMin: 5, won: true };
            await ops.saveNote(note);
            expect(streakRef.current).toBeGreaterThanOrEqual(1);
        });

        it('should rollback on storage failure', async () => {
            (repoInsertNote as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
            const note = { id: 'fail1', text: 'Will fail', dateStr: '2026-01-01', timestamp: Date.now(), durationMin: 5, won: true };
            await ops.saveNote(note);
            // Notes should be rolled back to empty
            expect(notesRef.current).toHaveLength(0);
        });
    });

    describe('deleteNote', () => {
        it('should remove a note by ID', async () => {
            const note = { id: 'del1', text: 'Bye', dateStr: '2026-01-01', timestamp: Date.now(), durationMin: 5, won: true };
            await ops.saveNote(note);
            await ops.deleteNote('del1');
            expect(notesRef.current).toHaveLength(0);
        });
    });

    describe('updateNote', () => {
        it('should update a note with partial fields', async () => {
            const note = { id: 'upd1', text: 'Original', dateStr: '2026-01-01', timestamp: Date.now(), durationMin: 5, won: true };
            await ops.saveNote(note);
            await ops.updateNote('upd1', { aiTitle: 'AI Title' });
            expect(notesRef.current[0].aiTitle).toBe('AI Title');
            expect(notesRef.current[0].text).toBe('Original');
        });
    });

    describe('clearAllAiMetadata', () => {
        it('should remove AI fields from all notes', async () => {
            const note = {
                id: 'ai1', text: 'Content', dateStr: '2026-01-01', timestamp: Date.now(),
                durationMin: 5, won: true, aiTitle: 'Title', aiSummary: ['S'], aiModelUsed: 'model',
            };
            await ops.saveNote(note);
            await ops.clearAllAiMetadata();
            expect(notesRef.current[0].aiTitle).toBeUndefined();
            expect(notesRef.current[0].aiSummary).toBeUndefined();
            expect(notesRef.current[0].aiModelUsed).toBeUndefined();
        });
    });
});

describe('createPersonsOps', () => {
    let personsRef: Ref<Person[]>;
    let setPersons: jest.Mock;
    let notesRef: Ref<SavedNote[]>;
    let setNotes: jest.Mock;
    let ops: ReturnType<typeof createPersonsOps>;

    beforeEach(() => {
        jest.clearAllMocks();
        personsRef = { current: [] };
        setPersons = jest.fn((val: Person[] | ((prev: Person[]) => Person[])) => { personsRef.current = typeof val === 'function' ? val(personsRef.current) : val; });
        notesRef = { current: [] };
        setNotes = jest.fn((val: SavedNote[] | ((prev: SavedNote[]) => SavedNote[])) => { notesRef.current = typeof val === 'function' ? val(notesRef.current) : val; });

        ops = createPersonsOps(personsRef, setPersons as unknown as Setter<Person[]>, notesRef, setNotes as unknown as Setter<SavedNote[]>);
    });

    describe('addPerson', () => {
        it('should create a person with the given name', async () => {
            const id = await ops.addPerson('Alice');
            expect(id).toBeTruthy();
            expect(personsRef.current).toHaveLength(1);
            expect(personsRef.current[0].name).toBe('Alice');
        });

        it('should return null for empty names', async () => {
            const id = await ops.addPerson('  ');
            expect(id).toBeNull();
            expect(personsRef.current).toHaveLength(0);
        });

        it('should trim whitespace from names', async () => {
            await ops.addPerson('  Bob  ');
            expect(personsRef.current[0].name).toBe('Bob');
        });

        it('should rollback on storage failure', async () => {
            (repoInsertPerson as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
            const id = await ops.addPerson('Alice');
            expect(id).toBeTruthy(); // function still returns id even though storage failed
            // State should have been rolled back
            expect(personsRef.current).toHaveLength(0);
            expect(setPersons).toHaveBeenLastCalledWith([]);
        });
    });

    describe('deletePerson', () => {
        it('should remove person and unlink their notes', async () => {
            const personId = (await ops.addPerson('Carol')) as string;
            notesRef.current = [{ id: 'n1', personId, text: 'Test', dateStr: '2026-01-01', timestamp: Date.now(), durationMin: 5, won: true }];
            setNotes.mockClear();

            await ops.deletePerson(personId);
            expect(personsRef.current).toHaveLength(0);
            expect(notesRef.current[0].personId).toBeUndefined();
        });

        it('should rollback on storage failure', async () => {
            const personId = (await ops.addPerson('Carol')) as string;
            notesRef.current = [{ id: 'n1', personId, text: 'Test', dateStr: '2026-01-01', timestamp: Date.now(), durationMin: 5, won: true }];

            (repoDeletePerson as jest.Mock).mockRejectedValueOnce(new Error('disk full'));

            await ops.deletePerson(personId);
            // Both persons and notes should be rolled back
            expect(personsRef.current).toHaveLength(1);
            expect(personsRef.current[0].name).toBe('Carol');
            expect(notesRef.current[0].personId).toBe(personId);
        });
    });

    describe('updatePerson', () => {
        it('should update a person with partial fields', async () => {
            const personId = (await ops.addPerson('Carol')) as string;
            await ops.updatePerson(personId, { relationship: 'Friend' });
            expect(personsRef.current[0].relationship).toBe('Friend');
            expect(personsRef.current[0].name).toBe('Carol');
        });

        it('should rollback on storage failure', async () => {
            const personId = (await ops.addPerson('Carol')) as string;
            (repoUpdatePerson as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
            await ops.updatePerson(personId, { relationship: 'Friend' });
            expect(personsRef.current[0].relationship).toBeUndefined();
            expect(personsRef.current[0].name).toBe('Carol');
        });
    });
});

describe('createFeedOps', () => {
    let bookmarksRef: { current: string[] };
    let setBookmarks: jest.Mock;
    let commentsRef: { current: Record<string, string> };
    let setComments: jest.Mock;
    let autoPlayRef: { current: boolean };
    let setAutoPlay: jest.Mock;
    let ops: ReturnType<typeof createFeedOps>;

    beforeEach(() => {
        jest.clearAllMocks();
        bookmarksRef = { current: [] };
        setBookmarks = jest.fn();
        commentsRef = { current: {} };
        setComments = jest.fn();
        autoPlayRef = { current: true };
        setAutoPlay = jest.fn();

        ops = createFeedOps(
            bookmarksRef, setBookmarks as unknown as Setter<string[]>,
            commentsRef, setComments as unknown as Setter<Record<string, string>>,
            autoPlayRef, setAutoPlay as unknown as Setter<boolean>,
        );
    });

    describe('toggleBookmark', () => {
        it('should add a bookmark', async () => {
            await ops.toggleBookmark('note1');
            expect(bookmarksRef.current).toContain('note1');
        });

        it('should remove an existing bookmark', async () => {
            bookmarksRef.current = ['note1'];
            await ops.toggleBookmark('note1');
            expect(bookmarksRef.current).not.toContain('note1');
        });
    });

    describe('saveFeedComment', () => {
        it('should save a comment for a note', async () => {
            await ops.saveFeedComment('note1', 'Great entry!');
            expect(commentsRef.current['note1']).toBe('Great entry!');
        });

        it('should remove comment when text is empty', async () => {
            commentsRef.current = { note1: 'old comment' };
            await ops.saveFeedComment('note1', '  ');
            expect(commentsRef.current['note1']).toBeUndefined();
        });
    });

    describe('toggleAutoPlayFeedVideos', () => {
        it('should toggle auto play state', async () => {
            await ops.toggleAutoPlayFeedVideos(false);
            expect(autoPlayRef.current).toBe(false);
        });
    });
});
