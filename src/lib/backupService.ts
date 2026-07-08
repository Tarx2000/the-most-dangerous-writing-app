/**
 * Backup Service — SQLite, settings, and vlog video archiving.
 *
 * Implements a unified ZIP backup containing:
 * - backup_metadata.json: SQLite tables serialization + AsyncStorage settings keys.
 * - vlogs/: folder containing mp4 files.
 *
 * Optimizations:
 * 1. Native Zipping: Uses react-native-zip-archive when available. It operates at the native OS
 *    layer using FileSystem.copyAsync and native compression, resulting in 0% JS heap usage and
 *    preventing OOM errors for large vlogs.
 * 2. Progress Indicators: Passes callbacks (onProgress) back to the UI to update the loading overlay.
 * 3. JSZip Fallback: Runs in standard Expo Go, but excludes videos if they exceed 15MB to prevent crashes.
 */

import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { NativeModules } from 'react-native';
import { getDb, sanitizeBindParams, closeDb } from '@/lib/db';
import { storage } from '@/lib/storage';
import { logger } from '@/lib/logger';
import { CONFIG, APP_VERSION } from '@/config';

// Safe require for react-native-zip-archive to support Expo Go compatibility
interface NativeZipModuleType {
    zip: (source: string, target: string) => Promise<void>;
    unzip: (source: string, target: string) => Promise<void>;
}
let NativeZip: NativeZipModuleType | null = null;
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    NativeZip = require('react-native-zip-archive');
} catch {
    logger('warn', 'Backup', 'react-native-zip-archive not found, falling back to pure-JSZip');
}

const BACKUP_TABLES = [
    'notes',
    'persons',
    'vlogs',
    'settings',
    'feed_bookmarks',
    'feed_comments',
    'ai_jobs',
    'ai_logs',
    'pillars',
    'advice_cards',
    'pillar_logs',
    'pillar_versions',
];

/** Check if react-native-zip-archive native module is loaded */
export function isNativeZipAvailable(): boolean {
    return (
        NativeModules.RNZipArchive != null &&
        NativeZip !== null &&
        typeof NativeZip.zip === 'function' &&
        typeof NativeZip.unzip === 'function'
    );
}

/**
 * Export database records, settings, and vlogs to a single ZIP with progress reporting.
 */
export async function exportBackupZip(
    onProgress: (status: string) => void,
): Promise<{ success: boolean; filePath?: string; error?: string; vlogsExcluded?: boolean }> {
    const tempDir = `${FileSystem.cacheDirectory}mda_backup_temp/`;
    const tempZipPath = `${FileSystem.cacheDirectory}mda_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;

    try {
        onProgress('Verifying database...');
        const db = await getDb();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sqliteData: Record<string, any[]> = {};

        // 1. Fetch SQLite tables
        for (const table of BACKUP_TABLES) {
            try {
                const rows = await db.getAllAsync(`SELECT * FROM ${table};`);
                sqliteData[table] = rows;
            } catch (err) {
                logger('error', 'Backup', `Failed to query table ${table}:`, err);
                sqliteData[table] = [];
            }
        }

        // 2. Fetch AsyncStorage settings
        onProgress('Reading configuration settings...');
        const keys = await storage.getAllKeys();
        const allPairs = await storage.multiGet(keys);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const asyncStorageData: Record<string, any> = {};

        for (const [key, val] of allPairs) {
            if (val === null) {
                asyncStorageData[key] = null;
                continue;
            }
            try {
                asyncStorageData[key] = JSON.parse(val);
            } catch {
                asyncStorageData[key] = val;
            }
        }

        // 3. Assemble Metadata
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const metadata: any = {
            backupVersion: 1,
            timestamp: Date.now(),
            appVersion: APP_VERSION,
            sqlite: sqliteData,
            asyncStorage: asyncStorageData,
            vlogsExcluded: false,
        };

        const vlogRows = sqliteData['vlogs'] || [];

        // Scan for valid thumbnail paths
        const validThumbnails: { filePath: string; fileName: string }[] = [];
        for (const vlog of vlogRows) {
            const thumbnailPath = vlog.thumbnail_path;
            if (!thumbnailPath) continue;

            try {
                const info = await FileSystem.getInfoAsync(thumbnailPath);
                if (info.exists) {
                    validThumbnails.push({
                        filePath: thumbnailPath,
                        fileName: thumbnailPath.substring(thumbnailPath.lastIndexOf('/') + 1),
                    });
                }
            } catch {
                // Ignore error
            }
        }

        // 4. Perform Zipping (Native or Fallback)
        if (isNativeZipAvailable() && NativeZip) {
            onProgress('Preparing folder structures...');
            // Clean temp directory if it somehow exists
            await FileSystem.deleteAsync(tempDir, { idempotent: true });
            await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });

            // Write metadata file
            await FileSystem.writeAsStringAsync(tempDir + 'backup_metadata.json', JSON.stringify(metadata, null, 2));

            // Copy vlog video files natively (zero JS heap memory used)
            if (vlogRows.length > 0) {
                onProgress(`Copying ${vlogRows.length} video file(s) natively...`);
                const tempVlogsDir = `${tempDir}vlogs/`;
                await FileSystem.makeDirectoryAsync(tempVlogsDir, { intermediates: true });

                for (const vlog of vlogRows) {
                    const filePath = vlog.file_path;
                    if (!filePath) continue;

                    try {
                        const info = await FileSystem.getInfoAsync(filePath);
                        if (info.exists) {
                            const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
                            await FileSystem.copyAsync({
                                from: filePath,
                                to: `${tempVlogsDir}${fileName}`,
                            });
                        }
                    } catch (vlogErr) {
                        logger('warn', 'Backup', `Could not copy video file natively: ${filePath}`, vlogErr);
                    }
                }
            }

            // Copy vlog thumbnail files natively
            if (validThumbnails.length > 0) {
                onProgress(`Copying ${validThumbnails.length} thumbnail file(s) natively...`);
                const tempThumbnailsDir = `${tempDir}thumbnails/`;
                await FileSystem.makeDirectoryAsync(tempThumbnailsDir, { intermediates: true });

                for (const thumb of validThumbnails) {
                    try {
                        await FileSystem.copyAsync({
                            from: thumb.filePath,
                            to: `${tempThumbnailsDir}${thumb.fileName}`,
                        });
                    } catch (thumbErr) {
                        logger('warn', 'Backup', `Could not copy thumbnail file natively: ${thumb.filePath}`, thumbErr);
                    }
                }
            }

            onProgress('Creating native ZIP archive...');
            await NativeZip.zip(tempDir, tempZipPath);

            // Clean up temporary files
            onProgress('Cleaning up temporary directories...');
            await FileSystem.deleteAsync(tempDir, { idempotent: true });
        } else {
            // FALLBACK: Pure JSZip (Expo Go)
            onProgress('Calculating video sizes (JS Fallback)...');
            let totalVlogBytes = 0;
            const validVlogs: { filePath: string; fileName: string }[] = [];

            for (const vlog of vlogRows) {
                const filePath = vlog.file_path;
                if (!filePath) continue;

                try {
                    const info = await FileSystem.getInfoAsync(filePath);
                    if (info.exists && 'size' in info && typeof info.size === 'number') {
                        totalVlogBytes += info.size;
                        validVlogs.push({
                            filePath,
                            fileName: filePath.substring(filePath.lastIndexOf('/') + 1),
                        });
                    }
                } catch {
                    // Ignore error
                }
            }

            // Exclude videos if they exceed 15MB to prevent JS memory crashes
            const OOM_LIMIT_BYTES = 15 * 1024 * 1024;
            const excludeVideos = totalVlogBytes > OOM_LIMIT_BYTES;

            const zip = new JSZip();

            if (excludeVideos) {
                logger('warn', 'Backup', `Excluding videos from backup: ${totalVlogBytes} bytes exceeds 15MB limit`);
                metadata.vlogsExcluded = true;
                onProgress('Zipping database (excluding videos over 15MB)...');
            } else {
                onProgress(`Zipping database + ${validVlogs.length} small video(s)...`);
                const vlogsFolder = zip.folder('vlogs');

                for (const vlog of validVlogs) {
                    try {
                        const base64Data = await FileSystem.readAsStringAsync(vlog.filePath, {
                            encoding: FileSystem.EncodingType.Base64,
                        });
                        if (vlogsFolder) {
                            vlogsFolder.file(vlog.fileName, base64Data, { base64: true });
                        }
                    } catch (err) {
                        logger('warn', 'Backup', `JSZip failed to read file: ${vlog.filePath}`, err);
                    }
                }
            }

            // Always zip vlog thumbnails (they are very small and won't cause OOM)
            if (validThumbnails.length > 0) {
                onProgress(`Zipping ${validThumbnails.length} thumbnail(s)...`);
                const thumbnailsFolder = zip.folder('thumbnails');
                for (const thumb of validThumbnails) {
                    try {
                        const base64Data = await FileSystem.readAsStringAsync(thumb.filePath, {
                            encoding: FileSystem.EncodingType.Base64,
                        });
                        if (thumbnailsFolder) {
                            thumbnailsFolder.file(thumb.fileName, base64Data, { base64: true });
                        }
                    } catch (err) {
                        logger('warn', 'Backup', `JSZip failed to read thumbnail: ${thumb.filePath}`, err);
                    }
                }
            }

            zip.file('backup_metadata.json', JSON.stringify(metadata, null, 2));

            // Generate zip file with STORE compression (fast, low memory)
            const base64Zip = await zip.generateAsync({ type: 'base64', compression: 'STORE' });
            await FileSystem.writeAsStringAsync(tempZipPath, base64Zip, {
                encoding: FileSystem.EncodingType.Base64,
            });
        }

        // 5. Share backup file
        onProgress('Opening share dialog...');
        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(tempZipPath, {
                mimeType: 'application/zip',
                dialogTitle: 'Export Journal Backup',
                UTI: 'public.zip-archive',
            });
        } else {
            throw new Error('Sharing is not available on this device');
        }

        return {
            success: true,
            filePath: tempZipPath,
            vlogsExcluded: !isNativeZipAvailable() && metadata.vlogsExcluded,
        };
    } catch (error) {
        // Ensure tempDir cleanup on error
        try {
            await FileSystem.deleteAsync(tempDir, { idempotent: true });
        } catch {
            // Ignore error
        }
        logger('error', 'Backup', 'Backup export failed:', error);
        return { success: false, error: (error as Error)?.message || String(error) };
    }
}

/**
 * Import and restore SQLite database, settings, and vlogs from a picked ZIP.
 */
export async function importBackupZip(
    onProgress: (status: string) => void,
): Promise<{ success: boolean; error?: string }> {
    const tempDir = `${FileSystem.cacheDirectory}mda_restore_temp/`;
    const dbPath = `${FileSystem.documentDirectory}SQLite/mda_v2.db`;
    const dbBackupPath = `${FileSystem.cacheDirectory}mda_db_rollback.db`;
    const vlogDir = `${FileSystem.documentDirectory}${CONFIG.VLOG_STORAGE_DIR}`;
    const vlogBackupDir = `${FileSystem.cacheDirectory}mda_vlogs_rollback/`;
    const thumbDir = `${FileSystem.documentDirectory}vlog_thumbnails/`;
    const thumbBackupDir = `${FileSystem.cacheDirectory}mda_thumbnails_rollback/`;

    let hasTakenSnapshot = false;
    let currentPairs: [string, string | null][] = [];
    let dbExists = false;
    let vlogDirExists = false;
    let thumbDirExists = false;
    let currentSchemaVersion: string | null = null;

    try {
        // 1. Pick file
        onProgress('Opening document picker...');
        const pickerResult = await DocumentPicker.getDocumentAsync({
            type: '*/*',
            copyToCacheDirectory: true,
        });

        if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
            return { success: false, error: 'Cancelled' };
        }

        const pickedFile = pickerResult.assets[0];
        const fileUri = pickedFile.uri;
        const fileNameLower = (pickedFile.name || '').toLowerCase();

        if (!fileNameLower.endsWith('.zip')) {
            throw new Error('Invalid file type: Please select a .zip backup file');
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let metadata: any = null;

        // Clean restore directory
        await FileSystem.deleteAsync(tempDir, { idempotent: true });

        // 2. Unzip & Extract Metadata (Native or Fallback)
        if (isNativeZipAvailable() && NativeZip) {
            onProgress('Unpacking native ZIP archive...');
            await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });
            await NativeZip.unzip(fileUri, tempDir);

            // Read metadata file
            onProgress('Reading database metadata...');
            const metadataStr = await FileSystem.readAsStringAsync(`${tempDir}backup_metadata.json`);
            metadata = JSON.parse(metadataStr);
        } else {
            // FALLBACK: Pure JSZip (Expo Go)
            onProgress('Unpacking ZIP archive (JS Fallback)...');
            const base64Zip = await FileSystem.readAsStringAsync(fileUri, {
                encoding: FileSystem.EncodingType.Base64,
            });

            const zip = await JSZip.loadAsync(base64Zip, { base64: true });

            // Extract & Validate Metadata
            const metadataFile = zip.file('backup_metadata.json');
            if (!metadataFile) {
                throw new Error('Invalid backup file: backup_metadata.json is missing');
            }

            const metadataStr = await metadataFile.async('string');
            metadata = JSON.parse(metadataStr);
        }

        if (!metadata || !metadata.sqlite || !metadata.asyncStorage || !metadata.backupVersion) {
            throw new Error('Corrupt backup file: metadata is invalid');
        }

        // 2.5. Create safety snapshots for rollback before modifying anything
        onProgress('Creating safety snapshots...');

        // Save current AsyncStorage keys & values
        const currentKeys = await storage.getAllKeys();
        currentPairs = await storage.multiGet(currentKeys);

        // Keep current schema version specifically to prevent migration bricking
        const schemaVersionKey = '__DB_SCHEMA_VERSION__';
        currentSchemaVersion = await storage.getItem(schemaVersionKey);

        // Backup SQLite Database file
        const dbInfo = await FileSystem.getInfoAsync(dbPath);
        dbExists = dbInfo.exists;
        if (dbExists) {
            await closeDb();
            await FileSystem.deleteAsync(dbBackupPath, { idempotent: true });
            await FileSystem.copyAsync({
                from: dbPath,
                to: dbBackupPath,
            });
        }

        // Backup Vlogs Folder
        const vlogInfo = await FileSystem.getInfoAsync(vlogDir);
        vlogDirExists = vlogInfo.exists && 'isDirectory' in vlogInfo && vlogInfo.isDirectory;
        if (vlogDirExists) {
            await FileSystem.deleteAsync(vlogBackupDir, { idempotent: true });
            await FileSystem.makeDirectoryAsync(vlogBackupDir, { intermediates: true });
            const files = await FileSystem.readDirectoryAsync(vlogDir);
            for (const file of files) {
                await FileSystem.copyAsync({
                    from: `${vlogDir}${file}`,
                    to: `${vlogBackupDir}${file}`,
                });
            }
        }

        // Backup Thumbnails Folder
        const thumbInfo = await FileSystem.getInfoAsync(thumbDir);
        thumbDirExists = thumbInfo.exists && 'isDirectory' in thumbInfo && thumbInfo.isDirectory;
        if (thumbDirExists) {
            await FileSystem.deleteAsync(thumbBackupDir, { idempotent: true });
            await FileSystem.makeDirectoryAsync(thumbBackupDir, { intermediates: true });
            const files = await FileSystem.readDirectoryAsync(thumbDir);
            for (const file of files) {
                await FileSystem.copyAsync({
                    from: `${thumbDir}${file}`,
                    to: `${thumbBackupDir}${file}`,
                });
            }
        }

        hasTakenSnapshot = true;

        // 3. Overwrite SQLite database in a single transaction
        onProgress('Restoring database records...');
        const db = await getDb();

        await db.withTransactionAsync(async () => {
            // Clear current database tables
            for (const table of BACKUP_TABLES) {
                await db.execAsync(`DELETE FROM ${table};`);
            }

            // Restore SQLite Tables dynamically
            const sqlite = metadata.sqlite;
            for (const table of BACKUP_TABLES) {
                const rows = sqlite[table];
                if (!rows || rows.length === 0) continue;

                // Build insert statement dynamically based on row keys to handle schema flexibility
                const firstRow = rows[0];
                const columns = Object.keys(firstRow);
                const placeholders = columns.map(() => '?').join(', ');
                const insertSql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders});`;

                for (const row of rows) {
                    const params = columns.map((col) => row[col]);
                    // SQLite bridge bug mitigation (Android null/undefined converter)
                    const sanitized = sanitizeBindParams(params) as (string | number | boolean | null)[];
                    await db.runAsync(insertSql, sanitized);
                }
            }
        });

        // 4. Restore AsyncStorage Settings
        onProgress('Restoring configuration settings...');
        await storage.clearAll();

        const asyncStorage = metadata.asyncStorage;
        const keys = Object.keys(asyncStorage);
        const pairs: [string, string][] = [];

        for (const key of keys) {
            const val = asyncStorage[key];
            if (val === null) continue;

            const stringVal = JSON.stringify(val);
            pairs.push([key, stringVal]);
        }

        if (pairs.length > 0) {
            await storage.multiSet(pairs);
        }

        // Restore current schema version to prevent migration mismatch / DB bricking
        if (currentSchemaVersion !== null) {
            await storage.setItem(schemaVersionKey, currentSchemaVersion);
        }

        // 5. Restore Vlog Video Files (Native or Fallback)
        await FileSystem.deleteAsync(vlogDir, { idempotent: true });
        await FileSystem.makeDirectoryAsync(vlogDir, { intermediates: true });

        if (isNativeZipAvailable() && NativeZip) {
            const tempVlogsDir = `${tempDir}vlogs/`;
            const vlogsDirInfo = await FileSystem.getInfoAsync(tempVlogsDir);

            if (vlogsDirInfo.exists) {
                onProgress('Restoring video files natively...');
                const files = await FileSystem.readDirectoryAsync(tempVlogsDir);
                for (const file of files) {
                    await FileSystem.copyAsync({
                        from: `${tempVlogsDir}${file}`,
                        to: `${vlogDir}${file}`,
                    });
                }
            }

            // Restore thumbnail files natively
            const tempThumbsDir = `${tempDir}thumbnails/`;
            const thumbsDirInfo = await FileSystem.getInfoAsync(tempThumbsDir);

            if (thumbsDirInfo.exists) {
                onProgress('Restoring thumbnail files natively...');
                await FileSystem.deleteAsync(thumbDir, { idempotent: true });
                await FileSystem.makeDirectoryAsync(thumbDir, { intermediates: true });
                const files = await FileSystem.readDirectoryAsync(tempThumbsDir);
                for (const file of files) {
                    await FileSystem.copyAsync({
                        from: `${tempThumbsDir}${file}`,
                        to: `${thumbDir}${file}`,
                    });
                }
            }

            // Cleanup native temp restore directory
            onProgress('Cleaning up temporary files...');
            await FileSystem.deleteAsync(tempDir, { idempotent: true });
        } else {
            // JSZip Fallback Restoration
            const zip = await JSZip.loadAsync(
                await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 }),
                { base64: true },
            );

            const vlogFiles = Object.keys(zip.files).filter((path) => path.startsWith('vlogs/') && !path.endsWith('/'));

            if (vlogFiles.length > 0) {
                onProgress(`Restoring ${vlogFiles.length} video file(s) (JS Fallback)...`);
                for (const path of vlogFiles) {
                    const fileObj = zip.file(path);
                    if (fileObj) {
                        const fileName = path.substring(path.lastIndexOf('/') + 1);
                        const base64Data = await fileObj.async('base64');
                        await FileSystem.writeAsStringAsync(`${vlogDir}${fileName}`, base64Data, {
                            encoding: FileSystem.EncodingType.Base64,
                        });
                    }
                }
            }

            const thumbFiles = Object.keys(zip.files).filter(
                (path) => path.startsWith('thumbnails/') && !path.endsWith('/'),
            );

            if (thumbFiles.length > 0) {
                onProgress(`Restoring ${thumbFiles.length} thumbnail file(s) (JS Fallback)...`);
                await FileSystem.deleteAsync(thumbDir, { idempotent: true });
                await FileSystem.makeDirectoryAsync(thumbDir, { intermediates: true });
                for (const path of thumbFiles) {
                    const fileObj = zip.file(path);
                    if (fileObj) {
                        const fileName = path.substring(path.lastIndexOf('/') + 1);
                        const base64Data = await fileObj.async('base64');
                        await FileSystem.writeAsStringAsync(`${thumbDir}${fileName}`, base64Data, {
                            encoding: FileSystem.EncodingType.Base64,
                        });
                    }
                }
            }
        }

        // Successful import: clean up rollback safety copies
        if (dbExists) {
            await FileSystem.deleteAsync(dbBackupPath, { idempotent: true });
        }
        if (vlogDirExists) {
            await FileSystem.deleteAsync(vlogBackupDir, { idempotent: true });
        }
        if (thumbDirExists) {
            await FileSystem.deleteAsync(thumbBackupDir, { idempotent: true });
        }

        return { success: true };
    } catch (error) {
        // Ensure cleanup of tempDir
        try {
            await FileSystem.deleteAsync(tempDir, { idempotent: true });
        } catch {
            // Ignore error
        }

        // Rollback snapshot if taken
        if (hasTakenSnapshot) {
            try {
                onProgress('Rolling back changes...');

                // Rollback AsyncStorage settings
                await storage.clearAll();
                const validPairs: [string, string][] = currentPairs.filter((p): p is [string, string] => p[1] !== null);
                if (validPairs.length > 0) {
                    await storage.multiSet(validPairs);
                }

                // Rollback SQLite DB file
                await closeDb();
                await FileSystem.deleteAsync(dbPath, { idempotent: true });
                if (dbExists) {
                    await FileSystem.copyAsync({
                        from: dbBackupPath,
                        to: dbPath,
                    });
                }

                // Rollback Vlog files
                await FileSystem.deleteAsync(vlogDir, { idempotent: true });
                if (vlogDirExists) {
                    await FileSystem.makeDirectoryAsync(vlogDir, { intermediates: true });
                    const backupFiles = await FileSystem.readDirectoryAsync(vlogBackupDir);
                    for (const file of backupFiles) {
                        await FileSystem.copyAsync({
                            from: `${vlogBackupDir}${file}`,
                            to: `${vlogDir}${file}`,
                        });
                    }
                }

                // Rollback Thumbnail files
                await FileSystem.deleteAsync(thumbDir, { idempotent: true });
                if (thumbDirExists) {
                    await FileSystem.makeDirectoryAsync(thumbDir, { intermediates: true });
                    const backupThumbs = await FileSystem.readDirectoryAsync(thumbBackupDir);
                    for (const file of backupThumbs) {
                        await FileSystem.copyAsync({
                            from: `${thumbBackupDir}${file}`,
                            to: `${thumbDir}${file}`,
                        });
                    }
                }

                // Cleanup rollback temporary files
                if (dbExists) {
                    await FileSystem.deleteAsync(dbBackupPath, { idempotent: true });
                }
                if (vlogDirExists) {
                    await FileSystem.deleteAsync(vlogBackupDir, { idempotent: true });
                }
                if (thumbDirExists) {
                    await FileSystem.deleteAsync(thumbBackupDir, { idempotent: true });
                }
            } catch (rollbackErr) {
                logger('error', 'Restore', 'Critical error during rollback:', rollbackErr);
            }
        }

        logger('error', 'Import', 'Backup import failed:', error);
        return { success: false, error: (error as Error)?.message || String(error) };
    }
}
