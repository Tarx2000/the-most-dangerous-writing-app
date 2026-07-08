import * as BackupService from '../backupService';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { storage } from '@/lib/storage';
import { getDb } from '@/lib/db';
import JSZip from 'jszip';
import NativeZipModule from 'react-native-zip-archive';
import { NativeModules } from 'react-native';

// 1. Mocks
jest.mock('expo-sqlite', () => ({
    openDatabaseAsync: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
    getDb: jest.fn(),
    sanitizeBindParams: jest.fn((params) => params || []),
    closeDb: jest.fn(() => Promise.resolve()),
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

jest.mock('expo-file-system/legacy', () => ({
    documentDirectory: 'file:///mock/documents/',
    cacheDirectory: 'file:///mock/cache/',
    getInfoAsync: jest.fn(),
    writeAsStringAsync: jest.fn(),
    readAsStringAsync: jest.fn(),
    makeDirectoryAsync: jest.fn(),
    deleteAsync: jest.fn(),
    copyAsync: jest.fn(),
    readDirectoryAsync: jest.fn(),
    EncodingType: {
        Base64: 'base64',
        UTF8: 'utf8',
    },
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

describe('backupService', () => {
    let mockDb: {
        getAllAsync: jest.Mock;
        withTransactionAsync: jest.Mock;
        execAsync: jest.Mock;
        runAsync: jest.Mock;
    };
    let fileSystemMock: Record<string, string>;

    beforeEach(() => {
        jest.clearAllMocks();
        fileSystemMock = {};

        // Mock database instance
        mockDb = {
            getAllAsync: jest.fn().mockResolvedValue([]),
            withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => await fn()),
            execAsync: jest.fn().mockResolvedValue(undefined),
            runAsync: jest.fn().mockResolvedValue(undefined),
        };

        (getDb as jest.Mock).mockResolvedValue(mockDb);

        // Standard FileSystem mock implementation simulating in-memory reading/writing
        (FileSystem.writeAsStringAsync as jest.Mock).mockImplementation(async (path, content) => {
            fileSystemMock[path] = content;
        });

        (FileSystem.readAsStringAsync as jest.Mock).mockImplementation(async (path) => {
            if (path in fileSystemMock) return fileSystemMock[path];
            throw new Error(`File not found: ${path}`);
        });

        (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
        (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);

        // Ensure native zip is available by default
        NativeModules.RNZipArchive = {};
        const nativeZipMock = NativeZipModule as unknown as { zip: unknown; unzip: unknown };
        nativeZipMock.zip = jest.fn().mockResolvedValue(undefined);
        nativeZipMock.unzip = jest.fn().mockResolvedValue(undefined);
    });

    describe('exportBackupZip (Native)', () => {
        it('should successfully copy files natively, native zip, and share the ZIP without using JSZip', async () => {
            // Mock database records
            mockDb.getAllAsync.mockImplementation(async (sql: string) => {
                if (sql.includes('FROM notes')) {
                    return [{ id: 'note-1', text: 'Journal 1', timestamp: 111 }];
                }
                if (sql.includes('FROM vlogs')) {
                    return [
                        {
                            id: 'vlog-1',
                            file_path: 'file:///mock/documents/vlogs/vlog-1.mp4',
                            thumbnail_path: 'file:///mock/documents/vlog_thumbnails/vlog-1.jpg',
                        },
                    ];
                }
                return [];
            });

            // Mock AsyncStorage keys
            (storage.getAllKeys as jest.Mock).mockResolvedValue(['theme']);
            (storage.multiGet as jest.Mock).mockResolvedValue([['theme', '"dark"']]);

            const onProgress = jest.fn();
            const result = await BackupService.exportBackupZip(onProgress);

            expect(result.success).toBe(true);
            expect(result.vlogsExcluded).toBe(false);
            expect(result.filePath).toContain('file:///mock/cache/mda_backup_');

            // Verify progress callbacks was invoked
            expect(onProgress).toHaveBeenCalledWith('Verifying database...');
            expect(onProgress).toHaveBeenCalledWith('Copying 1 video file(s) natively...');
            expect(onProgress).toHaveBeenCalledWith('Copying 1 thumbnail file(s) natively...');
            expect(onProgress).toHaveBeenCalledWith('Creating native ZIP archive...');

            // Verify native copy of vlog video was called
            expect(FileSystem.copyAsync).toHaveBeenCalledWith({
                from: 'file:///mock/documents/vlogs/vlog-1.mp4',
                to: 'file:///mock/cache/mda_backup_temp/vlogs/vlog-1.mp4',
            });
            // Verify native copy of vlog thumbnail was called
            expect(FileSystem.copyAsync).toHaveBeenCalledWith({
                from: 'file:///mock/documents/vlog_thumbnails/vlog-1.jpg',
                to: 'file:///mock/cache/mda_backup_temp/thumbnails/vlog-1.jpg',
            });
            expect(FileSystem.readAsStringAsync).not.toHaveBeenCalledWith(
                'file:///mock/documents/vlogs/vlog-1.mp4',
                expect.any(Object),
            );

            // Verify native zip was called
            expect(NativeZipModule.zip).toHaveBeenCalledWith('file:///mock/cache/mda_backup_temp/', result.filePath);

            // Verify sharing was called
            expect(Sharing.shareAsync).toHaveBeenCalledWith(result.filePath, expect.any(Object));
        });
    });

    describe('exportBackupZip (JS Fallback - Expo Go)', () => {
        beforeEach(() => {
            // Disable native zip to force fallback
            NativeModules.RNZipArchive = undefined;
            const nativeZipMock = NativeZipModule as unknown as { zip: unknown; unzip: unknown };
            nativeZipMock.zip = undefined;
            nativeZipMock.unzip = undefined;
        });

        it('should zip small videos in memory if total size <= 15MB', async () => {
            mockDb.getAllAsync.mockImplementation(async (sql: string) => {
                if (sql.includes('FROM notes')) {
                    return [{ id: 'note-1', text: 'Journal 1' }];
                }
                if (sql.includes('FROM vlogs')) {
                    return [{ id: 'vlog-1', file_path: 'file:///mock/documents/vlogs/vlog-1.mp4' }];
                }
                return [];
            });

            // Mock small video file details
            (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 5 * 1024 * 1024 }); // 5MB
            const videoData = 'dGVzdC12aWRlbw==';
            fileSystemMock['file:///mock/documents/vlogs/vlog-1.mp4'] = videoData;

            const onProgress = jest.fn();
            const result = await BackupService.exportBackupZip(onProgress);

            expect(result.success).toBe(true);
            expect(result.vlogsExcluded).toBe(false);
            expect(onProgress).toHaveBeenCalledWith('Zipping database + 1 small video(s)...');

            // Verify file was read as Base64 in JS fallback
            expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith(
                'file:///mock/documents/vlogs/vlog-1.mp4',
                expect.objectContaining({ encoding: 'base64' }),
            );

            // Verify video is inside generated ZIP
            const zipPath = result.filePath ?? '';
            const generatedZipBase64 = fileSystemMock[zipPath];
            const unpackedZip = await JSZip.loadAsync(generatedZipBase64, { base64: true });
            expect(unpackedZip.file('vlogs/vlog-1.mp4')).not.toBeNull();
        });

        it('should exclude videos if total size > 15MB and note it in metadata', async () => {
            mockDb.getAllAsync.mockImplementation(async (sql: string) => {
                if (sql.includes('FROM notes')) {
                    return [{ id: 'note-1', text: 'Journal 1' }];
                }
                if (sql.includes('FROM vlogs')) {
                    return [{ id: 'vlog-1', file_path: 'file:///mock/documents/vlogs/vlog-1.mp4' }];
                }
                return [];
            });

            // Mock large video file details (e.g. 20MB)
            (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 20 * 1024 * 1024 }); // 20MB

            const onProgress = jest.fn();
            const result = await BackupService.exportBackupZip(onProgress);

            expect(result.success).toBe(true);
            expect(result.vlogsExcluded).toBe(true);
            expect(onProgress).toHaveBeenCalledWith('Zipping database (excluding videos over 15MB)...');

            // Verify video file was NOT read into memory
            expect(FileSystem.readAsStringAsync).not.toHaveBeenCalledWith(
                'file:///mock/documents/vlogs/vlog-1.mp4',
                expect.any(Object),
            );

            // Verify video is missing and metadata excluded flag is set to true
            const zipPath = result.filePath ?? '';
            const generatedZipBase64 = fileSystemMock[zipPath];
            const unpackedZip = await JSZip.loadAsync(generatedZipBase64, { base64: true });
            expect(unpackedZip.file('vlogs/vlog-1.mp4')).toBeNull();

            const metadataFile = unpackedZip.file('backup_metadata.json');
            expect(metadataFile).not.toBeNull();
            const metadataStr = (await metadataFile?.async('string')) ?? '{}';
            const metadata = JSON.parse(metadataStr);
            expect(metadata.vlogsExcluded).toBe(true);
        });
    });

    describe('importBackupZip (Native)', () => {
        it('should extract ZIP natively and copy vlog files natively without loading them in JS', async () => {
            // Mock DocumentPicker
            const mockPickedZipPath = 'file:///mock/picked/backup.zip';
            (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
                canceled: false,
                assets: [{ uri: mockPickedZipPath, name: 'backup.zip' }],
            });

            // Mock extracted files
            const mockMetadata = {
                backupVersion: 1,
                timestamp: Date.now(),
                appVersion: '1.5.8',
                sqlite: {
                    notes: [{ id: 'note-1', text: 'Restored note' }],
                    vlogs: [
                        {
                            id: 'vlog-1',
                            file_path: 'file:///mock/documents/vlogs/vlog-1.mp4',
                            thumbnail_path: 'file:///mock/documents/vlog_thumbnails/vlog-1.jpg',
                        },
                    ],
                },
                asyncStorage: { theme: 'dark' },
            };
            fileSystemMock['file:///mock/cache/mda_restore_temp/backup_metadata.json'] = JSON.stringify(mockMetadata);

            // Mock readDirectory to list the extracted vlog files and thumbnails
            (FileSystem.readDirectoryAsync as jest.Mock).mockImplementation(async (path) => {
                if (path.includes('vlogs/')) return ['vlog-1.mp4'];
                if (path.includes('thumbnails/')) return ['vlog-1.jpg'];
                return [];
            });
            (FileSystem.getInfoAsync as jest.Mock).mockImplementation(async () => {
                return { exists: true, isDirectory: true };
            });

            const onProgress = jest.fn();
            const result = await BackupService.importBackupZip(onProgress);

            expect(result.success).toBe(true);
            expect(onProgress).toHaveBeenCalledWith('Unpacking native ZIP archive...');
            expect(onProgress).toHaveBeenCalledWith('Restoring video files natively...');
            expect(onProgress).toHaveBeenCalledWith('Restoring thumbnail files natively...');

            // Verify native unzip called
            expect(NativeZipModule.unzip).toHaveBeenCalledWith(
                mockPickedZipPath,
                'file:///mock/cache/mda_restore_temp/',
            );

            // Verify files copied natively
            expect(FileSystem.copyAsync).toHaveBeenCalledWith({
                from: 'file:///mock/cache/mda_restore_temp/vlogs/vlog-1.mp4',
                to: 'file:///mock/documents/vlogs/vlog-1.mp4',
            });
            expect(FileSystem.copyAsync).toHaveBeenCalledWith({
                from: 'file:///mock/cache/mda_restore_temp/thumbnails/vlog-1.jpg',
                to: 'file:///mock/documents/vlog_thumbnails/vlog-1.jpg',
            });
            expect(FileSystem.readAsStringAsync).not.toHaveBeenCalledWith(
                expect.stringContaining('vlogs/vlog-1.mp4'),
                expect.any(Object),
            );
        });

        it('should roll back to original state if vlog restoration throws an error', async () => {
            // Mock DocumentPicker
            const mockPickedZipPath = 'file:///mock/picked/backup.zip';
            (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
                canceled: false,
                assets: [{ uri: mockPickedZipPath, name: 'backup.zip' }],
            });

            // Mock initial state
            (storage.getAllKeys as jest.Mock).mockResolvedValue(['theme', '__DB_SCHEMA_VERSION__']);
            (storage.multiGet as jest.Mock).mockResolvedValue([
                ['theme', '"dark"'],
                ['__DB_SCHEMA_VERSION__', '"6"'],
            ]);
            (storage.getItem as jest.Mock).mockResolvedValue('6');

            // Mock extracted files
            const mockMetadata = {
                backupVersion: 1,
                timestamp: Date.now(),
                appVersion: '1.5.8',
                sqlite: {
                    notes: [{ id: 'note-1', text: 'Restored note' }],
                    vlogs: [{ id: 'vlog-1', file_path: 'file:///mock/documents/vlogs/vlog-1.mp4' }],
                },
                asyncStorage: { theme: 'light' },
            };
            fileSystemMock['file:///mock/cache/mda_restore_temp/backup_metadata.json'] = JSON.stringify(mockMetadata);

            // Mock readDirectory to list the extracted files
            (FileSystem.readDirectoryAsync as jest.Mock).mockImplementation(async (path) => {
                if (path.includes('vlogs/')) return ['vlog-1.mp4'];
                return [];
            });
            (FileSystem.getInfoAsync as jest.Mock).mockImplementation(async () => {
                return { exists: true, isDirectory: true };
            });

            // Make copyAsync fail during restoration of the vlogs (which happens after snapshotting)
            (FileSystem.copyAsync as jest.Mock).mockImplementation(async ({ from }) => {
                if (from.includes('mda_restore_temp/vlogs/')) {
                    throw new Error('Disk Full Simulation');
                }
            });

            const onProgress = jest.fn();
            const result = await BackupService.importBackupZip(onProgress);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Disk Full Simulation');

            // Verify rollback occurred:
            // 1. AsyncStorage was cleared and restored with original pairs
            expect(storage.clearAll).toHaveBeenCalled();
            expect(storage.multiSet).toHaveBeenCalledWith(
                expect.arrayContaining([
                    ['theme', '"dark"'],
                    ['__DB_SCHEMA_VERSION__', '"6"'],
                ]),
            );

            // 2. Original DB file was restored from dbBackupPath
            expect(FileSystem.copyAsync).toHaveBeenCalledWith({
                from: 'file:///mock/cache/mda_db_rollback.db',
                to: 'file:///mock/documents/SQLite/mda_v2.db',
            });
        });

        it('should preserve database migration schema version __DB_SCHEMA_VERSION__', async () => {
            // Mock DocumentPicker
            const mockPickedZipPath = 'file:///mock/picked/backup.zip';
            (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
                canceled: false,
                assets: [{ uri: mockPickedZipPath, name: 'backup.zip' }],
            });

            // Mock current schema version is 6
            (storage.getAllKeys as jest.Mock).mockResolvedValue(['__DB_SCHEMA_VERSION__']);
            (storage.multiGet as jest.Mock).mockResolvedValue([['__DB_SCHEMA_VERSION__', '"6"']]);
            (storage.getItem as jest.Mock).mockImplementation(async (key) => {
                if (key === '__DB_SCHEMA_VERSION__') return '6';
                return null;
            });

            // Mock backup contains schema version 2 in asyncStorage metadata
            const mockMetadata = {
                backupVersion: 1,
                timestamp: Date.now(),
                appVersion: '1.5.8',
                sqlite: {},
                asyncStorage: {
                    theme: 'dark',
                    __DB_SCHEMA_VERSION__: '2', // Older version in backup
                },
            };
            fileSystemMock['file:///mock/cache/mda_restore_temp/backup_metadata.json'] = JSON.stringify(mockMetadata);

            // Mock no vlogs in backup
            (FileSystem.getInfoAsync as jest.Mock).mockImplementation(async (path) => {
                if (path.includes('SQLite/mda_v2.db')) return { exists: true };
                return { exists: false };
            });

            const onProgress = jest.fn();
            const result = await BackupService.importBackupZip(onProgress);

            expect(result.success).toBe(true);

            // Verify that __DB_SCHEMA_VERSION__ is preserved and written as 6 (current) instead of 2 (backup)
            expect(storage.setItem).toHaveBeenCalledWith('__DB_SCHEMA_VERSION__', '6');
        });
    });
});
