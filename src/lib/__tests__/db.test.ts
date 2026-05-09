jest.mock('expo-sqlite', () => ({
    openDatabaseAsync: jest.fn(),
}));

jest.mock('@/lib/storage', () => ({
    storage: {
        getItem: jest.fn(),
        setItem: jest.fn(),
    },
}));

import { openDatabaseAsync } from 'expo-sqlite';
import { storage } from '@/lib/storage';
import { getDb, closeDb, run, getAll, getFirst } from '@/lib/db';
import type { SQLiteDatabase } from 'expo-sqlite';

describe('db', () => {
    function createMockDb(): SQLiteDatabase & { [K: string]: jest.Mock } {
        return {
            withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => await fn()),
            execAsync: jest.fn().mockResolvedValue(undefined),
            runAsync: jest.fn().mockResolvedValue(undefined),
            getAllAsync: jest.fn().mockResolvedValue([]),
            closeAsync: jest.fn().mockResolvedValue(undefined),
        } as unknown as SQLiteDatabase & { [K: string]: jest.Mock };
    }

    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(async () => {
        await closeDb();
    });

    it('getDb returns singleton', async () => {
        const mockDb = createMockDb();
        (openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);
        (storage.getItem as jest.Mock).mockResolvedValue('2');

        const db1 = await getDb();
        const db2 = await getDb();

        expect(db1).toBe(db2);
        expect(openDatabaseAsync).toHaveBeenCalledTimes(1);
        expect(openDatabaseAsync).toHaveBeenCalledWith('mda_v2.db');
    });

    it('getDb returns the same promise when called concurrently before resolve', async () => {
        const mockDb = createMockDb();
        let resolveOpen: (db: SQLiteDatabase & { [K: string]: jest.Mock }) => void = () => {};
        const openPromise = new Promise<SQLiteDatabase & { [K: string]: jest.Mock }>((res) => {
            resolveOpen = res;
        });
        (openDatabaseAsync as jest.Mock).mockReturnValue(openPromise);
        (storage.getItem as jest.Mock).mockResolvedValue('2');

        const p1 = getDb();
        const p2 = getDb();

        // In an async function, returning a promise wraps it in a new Promise.resolve(),
        // so p1 and p2 are not identity-equal. The real invariant is that openDatabaseAsync
        // is only called once and both promises resolve to the same database.
        resolveOpen(mockDb);

        const db1 = await p1;
        const db2 = await p2;
        expect(db1).toBe(db2);
        expect(openDatabaseAsync).toHaveBeenCalledTimes(1);
    });

    it('closeDb closes and resets state', async () => {
        const mockDb = createMockDb();
        (openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);
        (storage.getItem as jest.Mock).mockResolvedValue('2');

        await getDb();
        await closeDb();

        expect(mockDb.closeAsync).toHaveBeenCalledTimes(1);

        const mockDb2 = createMockDb();
        (openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb2);
        await getDb();
        expect(openDatabaseAsync).toHaveBeenCalledTimes(2);
    });

    it('migrations: when storage version is 0, both migrations run', async () => {
        const mockDb = createMockDb();
        (openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);
        (storage.getItem as jest.Mock).mockResolvedValue(null);

        await getDb();

        expect(mockDb.withTransactionAsync).toHaveBeenCalledTimes(2);
        expect(mockDb.execAsync).toHaveBeenCalledTimes(10);
        expect(storage.setItem).toHaveBeenCalledWith('__DB_SCHEMA_VERSION__', '1');
        expect(storage.setItem).toHaveBeenCalledWith('__DB_SCHEMA_VERSION__', '2');
    });

    it('migrations: when storage version is 1, only migration 2 runs', async () => {
        const mockDb = createMockDb();
        (openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);
        (storage.getItem as jest.Mock).mockResolvedValue('1');

        await getDb();

        expect(mockDb.withTransactionAsync).toHaveBeenCalledTimes(1);
        expect(mockDb.execAsync).toHaveBeenCalledTimes(2);
        expect(storage.setItem).toHaveBeenCalledWith('__DB_SCHEMA_VERSION__', '2');
    });

    it('migrations: when storage version is 2, none run', async () => {
        const mockDb = createMockDb();
        (openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);
        (storage.getItem as jest.Mock).mockResolvedValue('2');

        await getDb();

        expect(mockDb.withTransactionAsync).not.toHaveBeenCalled();
        expect(mockDb.execAsync).not.toHaveBeenCalled();
        expect(storage.setItem).not.toHaveBeenCalled();
    });

    it('sanitizeBindParams preserves strings/numbers and converts null to holes', async () => {
        const mockDb = createMockDb();
        (openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);
        (storage.getItem as jest.Mock).mockResolvedValue('2');

        await run('SELECT ?, ?, ?', ['hello', null, 42]);

        const passedParams = (mockDb.runAsync as jest.Mock).mock.calls[0][1];
        expect(passedParams[0]).toBe('hello');
        expect(passedParams[1]).toBeUndefined();
        expect(1 in passedParams).toBe(false); // sparse hole
        expect(passedParams[2]).toBe(42);
    });

    it('sanitizeBindParams handles undefined input', async () => {
        const mockDb = createMockDb();
        (openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);
        (storage.getItem as jest.Mock).mockResolvedValue('2');

        await run('SELECT 1');

        expect(mockDb.runAsync).toHaveBeenCalledWith('SELECT 1', []);
    });

    it('run delegates to mocked db with sanitized params', async () => {
        const mockDb = createMockDb();
        (openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);
        (storage.getItem as jest.Mock).mockResolvedValue('2');

        await run('INSERT INTO notes (id) VALUES (?)', ['id1']);

        expect(mockDb.runAsync).toHaveBeenCalledWith('INSERT INTO notes (id) VALUES (?)', ['id1']);
    });

    it('getAll delegates to mocked db with sanitized params and returns rows', async () => {
        const mockDb = createMockDb();
        (mockDb.getAllAsync as jest.Mock).mockResolvedValue([{ id: '1' }, { id: '2' }]);
        (openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);
        (storage.getItem as jest.Mock).mockResolvedValue('2');

        const rows = await getAll('SELECT * FROM notes');

        expect(mockDb.getAllAsync).toHaveBeenCalledWith('SELECT * FROM notes', []);
        expect(rows).toEqual([{ id: '1' }, { id: '2' }]);
    });

    it('getFirst delegates to mocked db with sanitized params and returns first row', async () => {
        const mockDb = createMockDb();
        (mockDb.getAllAsync as jest.Mock).mockResolvedValue([{ id: '1' }]);
        (openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);
        (storage.getItem as jest.Mock).mockResolvedValue('2');

        const row = await getFirst('SELECT * FROM notes WHERE id = ?', ['id1']);

        expect(mockDb.getAllAsync).toHaveBeenCalledWith('SELECT * FROM notes WHERE id = ?', ['id1']);
        expect(row).toEqual({ id: '1' });
    });

    it('getFirst returns undefined for empty results', async () => {
        const mockDb = createMockDb();
        (mockDb.getAllAsync as jest.Mock).mockResolvedValue([]);
        (openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);
        (storage.getItem as jest.Mock).mockResolvedValue('2');

        const row = await getFirst('SELECT * FROM notes WHERE id = ?', ['missing']);

        expect(row).toBeUndefined();
    });
});
