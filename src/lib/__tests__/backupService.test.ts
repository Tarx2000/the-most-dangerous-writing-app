import * as BackupService from '../backupService';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { storage } from '@/lib/storage';
import { getAll, run, exec, closeDb, getDb, getCurrentSchemaVersion } from '@/lib/db';
import { aiQueue } from '@/lib/aiQueue';
import { compressionQueue } from '@/lib/compressionQueue';
import JSZip from 'jszip';
import NativeZipModule from 'react-native-zip-archive';
import { NativeModules } from 'react-native';
import { AI_STORAGE_KEYS } from '@/config/ai';

/* ═══════════════════════════════════════════════════════════════════════════
   MOCKS
   ═══════════════════════════════════════════════════════════════════════════ */

jest.mock('@/lib/db', () => ({
    SCHEMA_VERSION_KEY: '__DB_SCHEMA_VERSION__',
    getDb: jest.fn(),
    getAll: jest.fn(),
    run: jest.fn(),
    exec: jest.fn(),
    closeDb: jest.fn(() => Promise.resolve()),
    getCurrentSchemaVersion: jest.fn(() => Promise.resolve(6)),
}));

jest.mock('@/lib/storage', () => ({
    storage: {
        getItem: jest.fn(),
        setItem: jest.fn(),
        getAllKeys: jest.fn(),
        multiGet: jest.fn(),
        multiSet: jest.fn(),
        clearAll: jest.fn(),
    },
}));

jest.mock('@/lib/aiQueue', () => ({
    aiQueue: { pause: jest.fn(() => Promise.resolve()), resume: jest.fn(() => Promise.resolve()) },
}));

jest.mock('@/lib/compressionQueue', () => ({
    compressionQueue: { pause: jest.fn(), resume: jest.fn() },
}));

jest.mock('expo-file-system/legacy', () => ({
    documentDirectory: 'file:///mock/documents/',
    cacheDirectory: 'file:///mock/cache/',
    getInfoAsync: jest.fn(),
    getFreeDiskStorageAsync: jest.fn(),
    writeAsStringAsync: jest.fn(),
    readAsStringAsync: jest.fn(),
    makeDirectoryAsync: jest.fn(() => Promise.resolve()),
    deleteAsync: jest.fn(() => Promise.resolve()),
    copyAsync: jest.fn(() => Promise.resolve()),
    readDirectoryAsync: jest.fn(() => Promise.resolve([])),
    EncodingType: { Base64: 'base64', UTF8: 'utf8' },
}));

jest.mock('expo-sharing', () => ({
    isAvailableAsync: jest.fn(),
    shareAsync: jest.fn(),
}));

jest.mock('expo-document-picker', () => ({
    getDocumentAsync: jest.fn(),
}));

jest.mock('react-native-zip-archive', () => ({
    zip: jest.fn(),
    unzip: jest.fn(),
}));

/* ═══════════════════════════════════════════════════════════════════════════
   IN-MEMORY FAKE DATABASE
   ────────────────────────────────────────────────────────────────────────────
   Mirrors the SQL subset backupService uses: SELECT *, PRAGMA table_info,
   sqlite_master listing, INSERT with ?-params, UPDATE ... WHERE id = ?,
   DELETE FROM. Kept tiny on purpose — db.ts wrappers are tested elsewhere.
   ═══════════════════════════════════════════════════════════════════════════ */

type Row = Record<string, unknown>;
const tables = new Map<string, Row[]>();
const schemas = new Map<string, string[]>();

function seedTable(name: string, rows: Row[]): void {
    tables.set(name, [...rows]);
    schemas.set(name, rows.length > 0 ? Object.keys(rows[0]) : []);
}

function resetFakeDb(): void {
    tables.clear();
    schemas.clear();
}

function wireFakeDb(): void {
    (getAll as jest.Mock).mockImplementation(async (sql: string) => {
        const tableInfo = sql.match(/PRAGMA table_info\((\w+)\)/);
        if (tableInfo) {
            return (schemas.get(tableInfo[1]) ?? []).map((c) => ({ name: c }));
        }
        if (sql.includes('sqlite_master')) {
            return [...tables.keys()].map((n) => ({ name: n }));
        }
        const sel = sql.match(/FROM (\w+)/);
        if (sel) return tables.get(sel[1]) ?? [];
        return [];
    });

    (run as jest.Mock).mockImplementation(async (sql: string, params: unknown[] = []) => {
        const ins = sql.match(/INSERT INTO (\w+) \(([^)]+)\) VALUES/);
        if (ins) {
            const [, table, colsStr] = ins;
            const cols = colsStr.split(',').map((c) => c.trim());
            const row: Row = {};
            cols.forEach((c, i) => {
                row[c] = params[i];
            });
            const target = tables.get(table);
            if (target) target.push(row);
            else tables.set(table, [row]);
            return;
        }
        const del = sql.match(/DELETE FROM (\w+)/);
        if (del) {
            tables.set(del[1], []);
            return;
        }
        const upd = sql.match(/UPDATE (\w+) SET (.+?) WHERE id = \?/);
        if (upd) {
            const [, table, setStr] = upd;
            const assignments = setStr.split(',').map((s) => s.trim().split(' = ?')[0].trim());
            const row = (tables.get(table) ?? []).find((r) => r.id === params[assignments.length]);
            if (row) {
                assignments.forEach((c, i) => {
                    row[c] = params[i];
                });
            }
            return;
        }
    });

    (exec as jest.Mock).mockResolvedValue(undefined);
    (getDb as jest.Mock).mockResolvedValue({ withTransactionAsync: async (fn: () => Promise<void>) => fn() });
    (closeDb as jest.Mock).mockResolvedValue(undefined);
}

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED TEST FIXTURES
   ═══════════════════════════════════════════════════════════════════════════ */

const VLOG_VIDEO_PATH = 'file:///mock/documents/vlogs/vlog-1.mp4';
const VLOG_VIDEO_BYTES = 5 * 1024 * 1024;
const THUMB_PATH = 'file:///mock/documents/vlog_thumbnails/vlog-1.jpg';
const THUMB_BYTES = 2048;
const DB_PATH = 'file:///mock/documents/SQLite/mda_v2.db';

/** path → { exists, size } used by the FileSystem.getInfoAsync mock */
const infoMap = new Map<string, { exists: boolean; size: number }>();

function mockFileInfo(): void {
    infoMap.set(VLOG_VIDEO_PATH, { exists: true, size: VLOG_VIDEO_BYTES });
    infoMap.set(THUMB_PATH, { exists: true, size: THUMB_BYTES });
    infoMap.set(DB_PATH, { exists: true, size: 4096 });
    (FileSystem.getInfoAsync as jest.Mock).mockImplementation(async (path: string) => {
        // Extract basename so the verify dir (different prefix) resolves too
        const base = path.substring(path.lastIndexOf('/') + 1);
        if (infoMap.has(path)) return infoMap.get(path);
        if (path.includes('/mda_backup_verify/') && infoMap.has(`file:///src/${base}`)) {
            return infoMap.get(`file:///src/${base}`);
        }
        const byBase = [...infoMap.entries()].find(([p]) => p.endsWith(`/${base}`));
        if (byBase) return byBase[1];
        return { exists: true, size: 12345 };
    });
}

describe('backupService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetFakeDb();
        wireFakeDb();
        infoMap.clear();
        mockFileInfo();
        (FileSystem.getFreeDiskStorageAsync as jest.Mock).mockResolvedValue(1024 * 1024 * 1024);
        (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
        (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);
        (storage.getAllKeys as jest.Mock).mockResolvedValue([]);
        (storage.multiGet as jest.Mock).mockResolvedValue([]);
        // Reset FileSystem implementations — tests may override them, and
        // jest.clearAllMocks() only clears call history, not implementations.
        (FileSystem.copyAsync as jest.Mock).mockImplementation(() => Promise.resolve());
        (FileSystem.deleteAsync as jest.Mock).mockImplementation(() => Promise.resolve());
        (FileSystem.makeDirectoryAsync as jest.Mock).mockImplementation(() => Promise.resolve());
        (FileSystem.readDirectoryAsync as jest.Mock).mockImplementation(() => Promise.resolve([]));
        (FileSystem.writeAsStringAsync as jest.Mock).mockImplementation(() => Promise.resolve());
        (FileSystem.readAsStringAsync as jest.Mock).mockRejectedValue(new Error('no implementation'));
        // Native zip available by default
        NativeModules.RNZipArchive = {};
        const nativeZipMock = NativeZipModule as unknown as { zip: unknown; unzip: unknown };
        nativeZipMock.zip = jest.fn().mockResolvedValue(undefined);
        nativeZipMock.unzip = jest.fn().mockResolvedValue(undefined);
        (getCurrentSchemaVersion as jest.Mock).mockResolvedValue(6);
    });

    describe('exportBackupZip (native)', () => {
        it('backs up scoped tables, strips secret settings keys, and verifies the ZIP', async () => {
            seedTable('notes', [{ id: 'n1', text: 'Hello' }]);
            seedTable('settings', [
                { key: 'CURRENT_STREAK', value: '3' },
                { key: AI_STORAGE_KEYS.OLLAMA_API_KEY, value: 'sk-secret' },
            ]);
            seedTable('vlogs', [{ id: 'vlog-1', file_path: VLOG_VIDEO_PATH, thumbnail_path: THUMB_PATH }]);
            seedTable('ai_jobs', [{ id: 'j1', note_id: 'n1' }]);

            const onProgress = jest.fn();
            const result = await BackupService.exportBackupZip(['notes', 'vlogs', 'settings'], onProgress);

            expect(result.success).toBe(true);
            expect(result.verification).toBe('ok');
            expect(result.tablesIncluded).toContain('notes');
            expect(result.tablesIncluded).toContain('ai_jobs'); // system tables always included
            expect(result.tablesIncluded).not.toContain('pillars'); // masteries scope not selected
            expect(result.videosIncluded).toBe(1);
            expect(result.thumbnailsIncluded).toBe(1);
            expect(result.warnings.some((w) => w.includes('API key'))).toBe(true);

            // Native copies + zip + share were invoked
            expect(FileSystem.copyAsync).toHaveBeenCalledWith({
                from: VLOG_VIDEO_PATH,
                to: 'file:///mock/cache/mda_backup_temp/vlogs/vlog-1.mp4',
            });
            expect(NativeZipModule.zip).toHaveBeenCalled();
            expect(Sharing.shareAsync).toHaveBeenCalledWith(expect.stringContaining('mda_backup_'), expect.any(Object));

            // The exported metadata must NOT contain the API key
            const metadataWrite = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls.find((call) =>
                call[0].endsWith('backup_metadata.json'),
            );
            expect(metadataWrite).toBeTruthy();
            const metadata = JSON.parse(metadataWrite[1]);
            expect(metadata.backupVersion).toBe(2);
            expect(metadata.schemaVersion).toBe(6);
            expect(
                metadata.sqlite.settings.some((r: { key: string }) => r.key === AI_STORAGE_KEYS.OLLAMA_API_KEY),
            ).toBe(false);
            expect(metadata.sqlite.settings.some((r: { key: string }) => r.key === 'CURRENT_STREAK')).toBe(true);
            expect(metadata.tableManifest.notes.rowCount).toBe(1);
            expect(metadata.fileManifest.vlogs).toHaveLength(1);
            expect(metadata.fileManifest.vlogs[0]).toMatchObject({
                vlogId: 'vlog-1',
                kind: 'video',
                sizeBytes: VLOG_VIDEO_BYTES,
                included: true,
            });
        });

        it('reports missing video files instead of silently dropping them', async () => {
            seedTable('vlogs', [{ id: 'vlog-1', file_path: 'file:///mock/documents/vlogs/gone.mp4' }]);
            infoMap.set('file:///mock/documents/vlogs/gone.mp4', { exists: false, size: 0 });

            const result = await BackupService.exportBackupZip(['vlogs'], jest.fn());

            expect(result.success).toBe(true);
            expect(result.videosIncluded).toBe(0);
            expect(result.videosExcluded).toEqual([{ vlogId: 'vlog-1', reason: 'missing' }]);
            expect(result.warnings.some((w) => w.includes('missing'))).toBe(true);
        });

        it('marks failed native copies as copy_error in the result', async () => {
            seedTable('vlogs', [{ id: 'vlog-1', file_path: VLOG_VIDEO_PATH }]);
            (FileSystem.copyAsync as jest.Mock).mockRejectedValueOnce(new Error('EACCES'));

            const result = await BackupService.exportBackupZip(['vlogs'], jest.fn());

            expect(result.success).toBe(true);
            expect(result.videosIncluded).toBe(0);
            expect(result.videosExcluded).toEqual([{ vlogId: 'vlog-1', reason: 'copy_error' }]);
        });
    });

    describe('exportBackupZip (JS fallback / Expo Go)', () => {
        beforeEach(() => {
            NativeModules.RNZipArchive = undefined;
            const nativeZipMock = NativeZipModule as unknown as { zip: unknown; unzip: unknown };
            nativeZipMock.zip = undefined;
            nativeZipMock.unzip = undefined;
        });

        it('includes small videos and excludes oversized ones with reason too_large', async () => {
            seedTable('vlogs', [
                { id: 'small', file_path: VLOG_VIDEO_PATH },
                { id: 'big', file_path: 'file:///mock/documents/vlogs/big.mp4' },
            ]);
            infoMap.set('file:///mock/documents/vlogs/big.mp4', { exists: true, size: 20 * 1024 * 1024 });

            const fileSystemMock: Record<string, string> = {};
            (FileSystem.writeAsStringAsync as jest.Mock).mockImplementation(async (path, content) => {
                fileSystemMock[path] = content;
            });
            (FileSystem.readAsStringAsync as jest.Mock).mockImplementation(async (path) => {
                if (path in fileSystemMock) return fileSystemMock[path];
                throw new Error(`File not found: ${path}`);
            });
            // The small video must be readable as base64 by the JSZip path
            const videoData = 'dGVzdC12aWRlbw==';
            fileSystemMock[VLOG_VIDEO_PATH] = videoData;

            const result = await BackupService.exportBackupZip(['vlogs'], jest.fn());

            expect(result.success).toBe(true);
            expect(result.videosIncluded).toBe(1);
            expect(result.videosExcluded).toEqual([{ vlogId: 'big', reason: 'too_large' }]);

            // The generated ZIP must contain the small video but NOT the big one
            const zipPath = result.zipPath ?? '';
            const zip = await JSZip.loadAsync(fileSystemMock[zipPath], { base64: true });
            expect(zip.file('vlogs/vlog-1.mp4')).not.toBeNull();
            expect(zip.file('vlogs/big.mp4')).toBeNull();
            const metadataFile = zip.file('backup_metadata.json');
            expect(metadataFile).not.toBeNull();
            const metadataStr = await metadataFile?.async('string');
            expect(metadataStr).toBeDefined();
            const metadata = JSON.parse(metadataStr ?? '{}');
            const bigEntry = metadata.fileManifest.vlogs.find((e: { vlogId: string }) => e.vlogId === 'big');
            expect(bigEntry.included).toBe(false);
            expect(bigEntry.reason).toBe('too_large');
        });
    });

    describe('importBackupZip (native)', () => {
        beforeEach(() => {
            const mockPickedZipPath = 'file:///mock/picked/backup.zip';
            (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
                canceled: false,
                assets: [{ uri: mockPickedZipPath, name: 'backup.zip' }],
            });
        });

        function seedExtractedBackup(metadata: unknown): void {
            const fileSystemMock: Record<string, string> = {};
            (FileSystem.writeAsStringAsync as jest.Mock).mockImplementation(async (path, content) => {
                fileSystemMock[path] = content;
            });
            (FileSystem.readAsStringAsync as jest.Mock).mockImplementation(async (path) => {
                if (path in fileSystemMock) return fileSystemMock[path];
                throw new Error(`File not found: ${path}`);
            });
            (NativeZipModule.unzip as jest.Mock).mockImplementation(async (_src: string, dest: string) => {
                fileSystemMock[`${dest}backup_metadata.json`] = JSON.stringify(metadata);
            });
            (FileSystem.readDirectoryAsync as jest.Mock).mockImplementation(async (path: string) => {
                if (path.includes('mda_restore_temp/vlogs')) return ['vlog-1.mp4'];
                if (path.includes('mda_restore_temp/thumbnails')) return ['vlog-1.jpg'];
                return [];
            });
        }

        it('restores tables, rewrites media paths for this device, keeps the PIN local', async () => {
            seedTable('notes', [{ id: 'old', text: 'Old local note' }]);
            seedTable('vlogs', [{ id: 'old-vlog', file_path: 'file:///old/path.mp4' }]);

            const backupMetadata = {
                backupVersion: 2,
                schemaVersion: 6,
                scopes: ['notes', 'vlogs', 'settings'],
                sqlite: {
                    notes: [{ id: 'restored', text: 'Restored note' }],
                    vlogs: [
                        {
                            id: 'vlog-1',
                            file_path: 'file:///source/device/vlogs/vlog-1.mp4',
                            thumbnail_path: 'file:///source/device/vlog_thumbnails/vlog-1.jpg',
                        },
                    ],
                    settings: [{ key: 'CURRENT_STREAK', value: '9' }],
                },
                asyncStorage: { __DB_SCHEMA_VERSION__: '2', FEATURE_FLAGS: { a: true } },
                fileManifest: {
                    vlogs: [
                        {
                            vlogId: 'vlog-1',
                            entryPath: 'vlogs/vlog-1.mp4',
                            kind: 'video',
                            sizeBytes: VLOG_VIDEO_BYTES,
                            included: true,
                            reason: null,
                        },
                    ],
                    thumbnails: [
                        {
                            vlogId: 'vlog-1',
                            entryPath: 'thumbnails/vlog-1.jpg',
                            kind: 'thumbnail',
                            sizeBytes: THUMB_BYTES,
                            included: true,
                            reason: null,
                        },
                    ],
                },
            };
            seedExtractedBackup(backupMetadata);

            // Local storage: has a PIN + schema version
            (storage.getAllKeys as jest.Mock).mockResolvedValue([
                '@mda_security_pin',
                '__DB_SCHEMA_VERSION__',
                'AI_JOB_QUEUE',
            ]);
            (storage.multiGet as jest.Mock).mockResolvedValue([
                ['@mda_security_pin', '1234'],
                ['__DB_SCHEMA_VERSION__', '"6"'],
                ['AI_JOB_QUEUE', '"[]"'],
            ]);
            (storage.getItem as jest.Mock).mockResolvedValue('6');

            const result = await BackupService.importBackupZip(jest.fn());

            expect(result.success).toBe(true);
            expect(result.verification).toBe('ok');

            // Queues were paused and resumed around the restore
            expect(aiQueue.pause).toHaveBeenCalled();
            expect(aiQueue.resume).toHaveBeenCalled();
            expect(compressionQueue.pause).toHaveBeenCalled();
            expect(compressionQueue.resume).toHaveBeenCalled();

            // Local note table was wiped and the restored note inserted
            const notesRows = tables.get('notes');
            expect(notesRows).toEqual([{ id: 'restored', text: 'Restored note' }]);

            // Vlog path was rewritten to THIS device's sandbox
            const vlogRows = tables.get('vlogs') ?? [];
            expect(vlogRows).toHaveLength(1);
            expect(vlogRows[0].file_path).toBe('file:///mock/documents/vlogs/vlog-1.mp4');
            expect(vlogRows[0].thumbnail_path).toBe('file:///mock/documents/vlog_thumbnails/vlog-1.jpg');

            // AsyncStorage: cleared, backup allowlist written, PIN kept local,
            // schema version forced to the local (current) value
            expect(storage.clearAll).toHaveBeenCalled();
            const multiSetCalls = (storage.multiSet as jest.Mock).mock.calls.map((c) => c[0]);
            const flat = multiSetCalls.flat() as [string, string][];
            expect(flat).toContainEqual(['FEATURE_FLAGS', '{"a":true}']);
            expect(flat).toContainEqual(['@mda_security_pin', '1234']); // local PIN survives
            expect(storage.setItem).toHaveBeenCalledWith('__DB_SCHEMA_VERSION__', '6');

            // Media restored natively (copied, not read into JS)
            expect(FileSystem.copyAsync).toHaveBeenCalledWith({
                from: 'file:///mock/cache/mda_restore_temp/vlogs/vlog-1.mp4',
                to: 'file:///mock/documents/vlogs/vlog-1.mp4',
            });
            expect(FileSystem.copyAsync).toHaveBeenCalledWith({
                from: 'file:///mock/cache/mda_restore_temp/thumbnails/vlog-1.jpg',
                to: 'file:///mock/documents/vlog_thumbnails/vlog-1.jpg',
            });
        });

        it('rejects backups from a NEWER app version before touching any data', async () => {
            seedTable('notes', [{ id: 'keep-me', text: 'Must survive' }]);
            (getCurrentSchemaVersion as jest.Mock).mockResolvedValue(6);

            seedExtractedBackup({
                backupVersion: 2,
                schemaVersion: 7,
                sqlite: { notes: [{ id: 'future', text: 'Future note' }] },
                asyncStorage: {},
                fileManifest: { vlogs: [], thumbnails: [] },
            });
            (storage.getAllKeys as jest.Mock).mockResolvedValue(['@mda_security_pin']);
            (storage.multiGet as jest.Mock).mockResolvedValue([['@mda_security_pin', '1234']]);

            const result = await BackupService.importBackupZip(jest.fn());

            expect(result.success).toBe(false);
            expect(result.error).toContain('newer app version');
            // No data was touched — no snapshot taken, no AsyncStorage writes
            expect(storage.clearAll).not.toHaveBeenCalled();
            expect(tables.get('notes')).toEqual([{ id: 'keep-me', text: 'Must survive' }]);
        });

        it('rejects corrupt backups (missing manifest file) before snapshotting', async () => {
            const backupMetadata = {
                backupVersion: 2,
                schemaVersion: 6,
                sqlite: { notes: [] },
                asyncStorage: {},
                fileManifest: {
                    vlogs: [
                        {
                            vlogId: 'v1',
                            entryPath: 'vlogs/v1.mp4',
                            kind: 'video',
                            sizeBytes: 100,
                            included: true,
                            reason: null,
                        },
                    ],
                    thumbnails: [],
                },
            };
            seedExtractedBackup(backupMetadata);
            // The manifest claims vlogs/v1.mp4 exists, but the extraction dir
            // does not contain it → getInfoAsync returns exists:false for that path
            infoMap.set('file:///mock/cache/mda_restore_temp/vlogs/v1.mp4', { exists: false, size: 0 });

            (storage.getAllKeys as jest.Mock).mockResolvedValue([]);
            const result = await BackupService.importBackupZip(jest.fn());

            expect(result.success).toBe(false);
            expect(result.error).toContain('corrupt');
            expect(storage.clearAll).not.toHaveBeenCalled();
        });

        it('rejects when free space is insufficient', async () => {
            seedExtractedBackup({
                backupVersion: 2,
                schemaVersion: 6,
                sqlite: {},
                asyncStorage: {},
                fileManifest: {
                    vlogs: [
                        {
                            vlogId: 'v1',
                            entryPath: 'vlogs/v1.mp4',
                            kind: 'video',
                            sizeBytes: 10 * 1024 * 1024,
                            included: true,
                            reason: null,
                        },
                    ],
                    thumbnails: [],
                },
            });
            infoMap.set('file:///mock/cache/mda_restore_temp/vlogs/v1.mp4', { exists: true, size: 10 * 1024 * 1024 });
            (FileSystem.getFreeDiskStorageAsync as jest.Mock).mockResolvedValue(1024 * 1024); // 1 MB free

            const result = await BackupService.importBackupZip(jest.fn());

            expect(result.success).toBe(false);
            expect(result.error).toContain('free storage');
            expect(storage.clearAll).not.toHaveBeenCalled();
        });

        it('filters unknown columns from restored rows (older backup on newer schema)', async () => {
            // Current schema has NO `future_col` — the backup rows must not
            // write it, or the INSERT would fail on a real device.
            tables.set('notes', [{ id: 'old', text: 'old' }]);
            schemas.set('notes', ['id', 'text']);
            const backupMetadata = {
                backupVersion: 2,
                schemaVersion: 5,
                sqlite: {
                    notes: [{ id: 'n1', text: 'Hello', future_col: 'DROP TABLE notes' }],
                },
                asyncStorage: {},
                fileManifest: { vlogs: [], thumbnails: [] },
            };
            seedExtractedBackup(backupMetadata);
            (storage.getAllKeys as jest.Mock).mockResolvedValue([]);
            (storage.multiGet as jest.Mock).mockResolvedValue([]);

            const result = await BackupService.importBackupZip(jest.fn());

            expect(result.success).toBe(true);
            // The row was inserted with ONLY columns that exist in the current schema
            expect(tables.get('notes')).toEqual([{ id: 'n1', text: 'Hello' }]);
        });

        it('reports media restore failures as warnings instead of failing the whole import', async () => {
            seedTable('notes', [{ id: 'original', text: 'Original' }]);

            const backupMetadata = {
                backupVersion: 2,
                schemaVersion: 6,
                sqlite: { notes: [{ id: 'restored', text: 'Restored' }] },
                asyncStorage: { theme: 'dark' },
                fileManifest: {
                    vlogs: [
                        {
                            vlogId: 'v1',
                            entryPath: 'vlogs/v1.mp4',
                            kind: 'video',
                            sizeBytes: 100,
                            included: true,
                            reason: null,
                        },
                    ],
                    thumbnails: [],
                },
            };
            seedExtractedBackup(backupMetadata);
            (storage.getAllKeys as jest.Mock).mockResolvedValue([]);
            (storage.multiGet as jest.Mock).mockResolvedValue([]);
            infoMap.set('file:///mock/cache/mda_restore_temp/vlogs/v1.mp4', { exists: true, size: 100 });

            // One media file fails to copy — the import must continue and report it
            (FileSystem.copyAsync as jest.Mock).mockImplementation(async ({ from }: { from: string }) => {
                if (from.includes('mda_restore_temp/vlogs/')) throw new Error('Disk Full Simulation');
            });

            const result = await BackupService.importBackupZip(jest.fn());

            // Non-fatal by design: DB + settings are fully restored, the broken
            // media file is listed in the report so the user sees it.
            expect(result.success).toBe(true);
            expect(result.verification).toBe('warn');
            expect(result.warnings.some((w) => w.includes('v1.mp4'))).toBe(true);
            expect(tables.get('notes')).toEqual([{ id: 'restored', text: 'Restored' }]);
        });

        it('rolls back everything when the DB restore itself fails', async () => {
            seedTable('notes', [{ id: 'original', text: 'Original' }]);
            // Pre-import table snapshot — used to simulate the rollback of the
            // copied DB file back into place.
            const preImportTables = new Map<string, Row[]>();
            for (const [name, rows] of tables) preImportTables.set(name, [...rows]);

            const backupMetadata = {
                backupVersion: 2,
                schemaVersion: 6,
                sqlite: { notes: [{ id: 'restored', text: 'Restored' }] },
                asyncStorage: { theme: 'dark' },
                fileManifest: { vlogs: [], thumbnails: [] },
            };
            seedExtractedBackup(backupMetadata);
            (storage.getAllKeys as jest.Mock).mockResolvedValue([
                '@mda_security_pin',
                '__DB_SCHEMA_VERSION__',
                'theme',
            ]);
            (storage.multiGet as jest.Mock).mockResolvedValue([
                ['@mda_security_pin', '9999'],
                ['__DB_SCHEMA_VERSION__', '"6"'],
                ['theme', '"light"'],
            ]);
            (storage.getItem as jest.Mock).mockResolvedValue('6');

            // The INSERT into `notes` fails — a fatal, mid-restore error.
            // Capture the ORIGINAL implementation so this override can fall
            // through without recursing into itself.
            const originalRunImpl = (run as jest.Mock).getMockImplementation();
            (run as jest.Mock).mockImplementation(async (sql: string, params: unknown[] = []) => {
                if (/INSERT INTO notes/.test(sql)) throw new Error('SQLITE_CORRUPT: table notes is malformed');
                return originalRunImpl ? originalRunImpl(sql, params) : undefined;
            });

            // Simulate the rollback DB-file copy restoring the pre-import content
            const originalCopyImpl = (FileSystem.copyAsync as jest.Mock).getMockImplementation();
            (FileSystem.copyAsync as jest.Mock).mockImplementation(async (opts: { from: string }) => {
                if (opts.from === 'file:///mock/cache/mda_db_rollback.db') {
                    for (const [name, rows] of preImportTables) tables.set(name, [...rows]);
                }
                return originalCopyImpl ? originalCopyImpl(opts) : undefined;
            });

            const result = await BackupService.importBackupZip(jest.fn());

            expect(result.success).toBe(false);
            expect(result.error).toContain('SQLITE_CORRUPT');

            // DB rolled back to the pre-import content
            expect(tables.get('notes')).toEqual([{ id: 'original', text: 'Original' }]);

            // AsyncStorage rolled back including the local PIN
            expect(storage.multiSet).toHaveBeenCalledWith(
                expect.arrayContaining([
                    ['@mda_security_pin', '9999'],
                    ['__DB_SCHEMA_VERSION__', '"6"'],
                    ['theme', '"light"'],
                ]),
            );

            // The DB file itself was restored from the rollback copy
            expect(FileSystem.copyAsync).toHaveBeenCalledWith({
                from: 'file:///mock/cache/mda_db_rollback.db',
                to: 'file:///mock/documents/SQLite/mda_v2.db',
            });

            // Queues were resumed even though the import failed
            expect(aiQueue.resume).toHaveBeenCalled();
            expect(compressionQueue.resume).toHaveBeenCalled();
        });
    });

    describe('importBackupZip (legacy v1 format, JS fallback)', () => {
        beforeEach(() => {
            NativeModules.RNZipArchive = undefined;
            const nativeZipMock = NativeZipModule as unknown as { zip: unknown; unzip: unknown };
            nativeZipMock.zip = undefined;
            nativeZipMock.unzip = undefined;
        });

        it('restores a v1 backup (no manifests, flat basenames)', async () => {
            const mockPickedZipPath = 'file:///mock/picked/legacy.zip';
            (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
                canceled: false,
                assets: [{ uri: mockPickedZipPath, name: 'legacy.zip' }],
            });

            seedTable('notes', [{ id: 'old', text: 'Old' }]);

            // Build a real v1-style ZIP in memory
            const zip = new JSZip();
            zip.file(
                'backup_metadata.json',
                JSON.stringify({
                    backupVersion: 1,
                    timestamp: Date.now(),
                    appVersion: '1.0.0',
                    sqlite: { notes: [{ id: 'legacy-note', text: 'From v1' }] },
                    asyncStorage: { theme: 'dark' },
                }),
            );
            const videoData = 'dGVzdC12aWRlbw=='; // "test-video"
            zip.file('vlogs/legacy.mp4', videoData, { base64: true });
            const base64Zip = await zip.generateAsync({ type: 'base64', compression: 'STORE' });

            const fileSystemMock: Record<string, string> = { [mockPickedZipPath]: base64Zip };
            (FileSystem.readAsStringAsync as jest.Mock).mockImplementation(async (path) => {
                if (path in fileSystemMock) return fileSystemMock[path];
                throw new Error(`File not found: ${path}`);
            });
            (FileSystem.writeAsStringAsync as jest.Mock).mockImplementation(async (path, content) => {
                fileSystemMock[path] = content;
            });
            (storage.getAllKeys as jest.Mock).mockResolvedValue(['@mda_security_pin', '__DB_SCHEMA_VERSION__']);
            (storage.multiGet as jest.Mock).mockResolvedValue([
                ['@mda_security_pin', '1111'],
                ['__DB_SCHEMA_VERSION__', '"6"'],
            ]);
            (storage.getItem as jest.Mock).mockResolvedValue('6');

            const result = await BackupService.importBackupZip(jest.fn());

            expect(result.success).toBe(true);
            // v1 has no schemaVersion → gate passes (0 > current is never true)
            expect(tables.get('notes')).toEqual([{ id: 'legacy-note', text: 'From v1' }]);
            // The video was written into the sandbox via base64
            expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
                'file:///mock/documents/vlogs/legacy.mp4',
                videoData,
                expect.any(Object),
            );
        });
    });
});
