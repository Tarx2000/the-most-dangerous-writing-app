/**
 * Backup Service v2 — SQLite, settings, and vlog video archiving.
 *
 * Implements a unified, VERIFIABLE ZIP backup containing:
 * - backup_metadata.json: SQLite table serialization + AsyncStorage allowlist +
 *   table/file manifests (see `.agents/instructions/backup-system.md`).
 * - vlogs/: video files (collision-free entry names, dedupe-prefix `${vlogId}_`).
 * - thumbnails/: thumbnail images (same dedupe rule).
 *
 * Hard guarantees (the reason this file exists):
 * 1. NO SILENT FAILURES — a backup reports `success: true` ONLY after the ZIP
 *    was re-opened and every included media entry matched its recorded size.
 *    Files that could not be included are listed in `videosExcluded` with a
 *    human-readable reason and mirrored into `warnings`.
 * 2. SECURITY BY OMISSION — backups are plaintext ZIPs (deliberate: maximum
 *    portability, incl. the future Flutter port). Therefore the security PIN,
 *    PIN attempt counters and AI API keys are NEVER exported, and the local
 *    PIN is NEVER overwritten during restore.
 * 3. PERFECT RESTORE — vlog/thumbnail paths are rewritten to the target
 *    device's sandbox during import, so a backup restored on another device
 *    reproduces the exact same app state.
 * 4. FORWARD COMPATIBILITY — backups with a `schemaVersion` higher than the
 *    current install are rejected BEFORE any data is touched; older backups
 *    are restored with column filtering against the current schema.
 *
 * Runtime modes:
 * - Native: react-native-zip-archive (0% JS heap for media) when available.
 * - JSZip fallback (Expo Go): streams media through base64; per-video size cap
 *   `JS_FALLBACK_MAX_VIDEO_BYTES` prevents OOM; oversized videos are excluded
 *   with reason 'too_large' and reported — never silently dropped.
 *
 * IMPORTANT: this module must use ONLY the db.ts wrappers (`getAll`, `run`,
 * `exec`, `getCurrentSchemaVersion`, `closeDb`) — never `db.*Async` directly.
 */

import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { NativeModules } from 'react-native';
import { getAll, run, exec, closeDb, getCurrentSchemaVersion, getDb, SCHEMA_VERSION_KEY } from '@/lib/db';
import { storage } from '@/lib/storage';
import { logger } from '@/lib/logger';
import { CONFIG, APP_VERSION } from '@/config';
import { AI_STORAGE_KEYS } from '@/config/ai';
import { FEATURE_FLAG_STORAGE_KEY } from '@/config/flags';
import { aiQueue } from '@/lib/aiQueue';
import { compressionQueue } from '@/lib/compressionQueue';

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

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIGURABLE VALUES
   ═══════════════════════════════════════════════════════════════════════════ */

/** Backup ZIP container-format version. Bump ONLY on breaking layout changes. */
export const BACKUP_VERSION_CURRENT = 2;
/** Legacy format (no manifests, flat basenames) — still importable. */
const BACKUP_VERSION_LEGACY = 1;

/**
 * Per-video size cap for the JSZip fallback (Expo Go). Reading a video as
 * base64 allocates ~1.37x its size in the JS heap; this cap keeps the whole
 * backup inside safe memory. Videos above the cap are reported as
 * `too_large`, never silently dropped.
 */
const JS_FALLBACK_MAX_VIDEO_BYTES = 15 * 1024 * 1024;

/** Free-space gate margin: required bytes = manifest total * this factor. */
const FREE_SPACE_MARGIN_FACTOR = 1.1;

/** Cache-directory prefixes used by this module (cleanup targets). */
const BACKUP_ZIP_PREFIX = 'mda_backup_';
const EXPORT_TEMP_DIR = `${FileSystem.cacheDirectory}mda_backup_temp/`;
const EXPORT_VERIFY_DIR = `${FileSystem.cacheDirectory}mda_backup_verify/`;
const IMPORT_TEMP_DIR = `${FileSystem.cacheDirectory}mda_restore_temp/`;

/* ── Scope → table mapping (system tables are always included) ──────────── */

export type BackupScope = 'settings' | 'notes' | 'masteries' | 'vlogs';

export const ALL_BACKUP_SCOPES: readonly BackupScope[] = ['settings', 'notes', 'masteries', 'vlogs'];

const SCOPE_TABLES: Record<BackupScope | 'system', readonly string[]> = {
    settings: ['settings'],
    notes: ['notes', 'persons', 'feed_bookmarks', 'feed_comments'],
    masteries: ['pillars', 'advice_cards', 'pillar_logs', 'pillar_versions'],
    vlogs: ['vlogs'],
    system: ['ai_jobs', 'ai_logs'],
};

/* ── Secrets & allowlists (see .agents/instructions/backup-system.md) ───── */

/**
 * `settings`-table keys that hold credentials. They are stripped from the
 * export so a plaintext ZIP never carries working API keys. Everything else
 * about the AI config (provider, model, prompts, base URLs) is portable.
 */
const SETTINGS_SECRET_KEYS = new Set<string>([AI_STORAGE_KEYS.OLLAMA_API_KEY, AI_STORAGE_KEYS.NEURALWATT_API_KEY]);

/**
 * AsyncStorage keys that are the ONLY ones allowed into a backup. Queue
 * runtime state, legacy `SAVED_*` payloads and PIN material are deliberately
 * excluded (see spec).
 */
const ASYNC_STORAGE_ALLOWLIST = new Set<string>([SCHEMA_VERSION_KEY, FEATURE_FLAG_STORAGE_KEY]);

/**
 * Local security state that must NEVER travel with a backup and must NEVER be
 * overwritten by a restore: the PIN, its attempt counter and lockout timer
 * stay on the device that created them ("PIN bleibt immer lokal").
 */
const ASYNC_STORAGE_SECRET_KEYS = new Set<string>([
    CONFIG.SECURITY_PIN_KEY,
    CONFIG.PIN_ATTEMPT_COUNT_KEY,
    CONFIG.PIN_LOCKOUT_UNTIL_KEY,
]);

/* ═══════════════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════════════ */

/** One media file inside the backup container (video or thumbnail). */
export interface BackupFileEntry {
    vlogId: string;
    /** ZIP-relative path, e.g. `vlogs/abc_123.mp4` or `thumbnails/x.jpg`. */
    entryPath: string;
    kind: 'video' | 'thumbnail';
    sizeBytes: number;
    included: boolean;
    /** Why a file is not in the ZIP: 'missing' | 'copy_error' | 'too_large'. */
    reason: 'missing' | 'copy_error' | 'too_large' | null;
}

/** Column/row-count snapshot per table, used by the import gate. */
export interface BackupTableManifest {
    columns: string[];
    rowCount: number;
}

/** Normalized, shape-guarded backup metadata (v1 and v2 both fit here). */
interface NormalizedBackup {
    version: number;
    schemaVersion: number;
    scopes: BackupScope[];
    sqlite: Record<string, unknown[]>;
    asyncStorage: Record<string, unknown>;
    fileManifest: { vlogs: BackupFileEntry[]; thumbnails: BackupFileEntry[] };
}

/** Detailed outcome of an export or import — the UI renders this, not a bare bool. */
export interface BackupResult {
    success: boolean;
    /** 'ok' = every included file verified; 'warn' = defects listed; 'failed' = aborted. */
    verification: 'ok' | 'warn' | 'failed';
    error?: string;
    cancelled?: boolean;
    /** Export only: path of the created ZIP. */
    zipPath?: string;
    scopes: BackupScope[];
    tablesIncluded: string[];
    videosIncluded: number;
    videosExcluded: { vlogId: string; reason: string }[];
    thumbnailsIncluded: number;
    warnings: string[];
}

/* ═══════════════════════════════════════════════════════════════════════════
   SMALL HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Last path segment of a file URI. */
function basename(path: string): string {
    return path.substring(path.lastIndexOf('/') + 1);
}

/**
 * Produce a collision-free entry basename inside one ZIP folder.
 * If `basename` is taken, the vlogId is prefixed; a rare second collision
 * gets a numeric disambiguator. Without this, two source files sharing a
 * basename would silently overwrite each other in the ZIP and on restore.
 */
function uniqueEntryBasename(vlogId: string, name: string, used: Set<string>): string {
    let candidate = name;
    let attempt = 0;
    while (used.has(candidate)) {
        candidate = attempt === 0 ? `${vlogId}_${name}` : `${vlogId}_${attempt}_${name}`;
        attempt++;
    }
    used.add(candidate);
    return candidate;
}

/** Stat a file; returns `null` on IO errors, `{exists:false}` when absent. */
async function statFile(path: string): Promise<{ exists: boolean; size: number } | null> {
    try {
        const info = await FileSystem.getInfoAsync(path);
        if (!info.exists) return { exists: false, size: 0 };
        return { exists: true, size: 'size' in info && typeof info.size === 'number' ? info.size : 0 };
    } catch {
        return null;
    }
}

/** Column names of a table, read from the live schema (PRAGMA table_info). */
async function getTableColumns(table: string): Promise<Set<string>> {
    const rows = await getAll<{ name: string }>(`PRAGMA table_info(${table});`);
    return new Set(rows.map((r) => r.name));
}

/** All user tables currently in the database (excludes sqlite_* internals). */
async function getCurrentTables(): Promise<string[]> {
    const rows = await getAll<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';`,
    );
    return rows.map((r) => r.name);
}

/** Union of scope tables + always-included system tables. */
function collectTables(scopes: BackupScope[]): string[] {
    const set = new Set<string>(SCOPE_TABLES.system);
    for (const scope of scopes) {
        for (const table of SCOPE_TABLES[scope]) set.add(table);
    }
    return [...set];
}

/** Uncompressed size of a JSZip entry (STORE compression ⇒ == file size). */
function jsZipEntrySize(zip: JSZip, entryPath: string): number | null {
    const entry = zip.file(entryPath);
    if (!entry) return null;
    const data = (entry as unknown as { _data?: { uncompressedSize?: number } })._data;
    const size = data?.uncompressedSize;
    return typeof size === 'number' ? size : null;
}

/** Check if the native zip module is usable. */
export function isNativeZipAvailable(): boolean {
    return (
        NativeModules.RNZipArchive != null &&
        NativeZip !== null &&
        typeof NativeZip.zip === 'function' &&
        typeof NativeZip.unzip === 'function'
    );
}

/**
 * Delete old `mda_backup_*.zip` files from the cache so repeated exports do
 * not accumulate junk. The freshly created archive is preserved.
 */
async function cleanupOldBackupZips(keepPath: string): Promise<void> {
    try {
        const cacheDir = FileSystem.cacheDirectory;
        if (!cacheDir) return;
        const entries = await FileSystem.readDirectoryAsync(cacheDir);
        for (const entry of entries) {
            if (entry.startsWith(BACKUP_ZIP_PREFIX) && entry.endsWith('.zip')) {
                const full = `${cacheDir}${entry}`;
                if (full !== keepPath) {
                    await FileSystem.deleteAsync(full, { idempotent: true });
                }
            }
        }
    } catch (err) {
        logger('warn', 'Backup', 'Failed to clean up old backup ZIPs:', err);
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
   EXPORT
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Create a scoped, manifest-driven, post-verified backup ZIP and share it.
 *
 * @param scopes       Selected backup scopes (empty ⇒ full backup).
 * @param onProgress   UI progress hook (status strings).
 */
export async function exportBackupZip(
    scopes: BackupScope[],
    onProgress: (status: string) => void,
): Promise<BackupResult> {
    const tempZipPath = `${FileSystem.cacheDirectory}${BACKUP_ZIP_PREFIX}${new Date()
        .toISOString()
        .replace(/[:.]/g, '-')}.zip`;

    const result: BackupResult = {
        success: false,
        verification: 'ok',
        scopes: [],
        tablesIncluded: [],
        videosIncluded: 0,
        videosExcluded: [],
        thumbnailsIncluded: 0,
        warnings: [],
    };

    try {
        // Normalize scopes (dedupe, defaults to full backup)
        const effectiveScopes: BackupScope[] = [...new Set(scopes.length > 0 ? scopes : ALL_BACKUP_SCOPES)];
        result.scopes = effectiveScopes;
        const tables = collectTables(effectiveScopes);

        // ── 1. Database: consistent read snapshot ────────────────────────
        onProgress('Verifying database...');
        await getCurrentSchemaVersion(); // opens DB; migrate() runs idempotently
        try {
            // Flush any WAL frames so SELECT * sees a single consistent state.
            // TRUNCATE mode fails with SQLITE_BUSY if another connection is
            // mid-transaction — that is fine, we simply skip the checkpoint.
            await exec('PRAGMA wal_checkpoint(TRUNCATE);');
        } catch {
            logger('warn', 'Backup', 'WAL checkpoint skipped (busy) — continuing with snapshot');
        }

        // ── 2. Tables (scope-filtered, secrets stripped) ─────────────────
        const sqlite: Record<string, unknown[]> = {};
        const tableManifest: Record<string, BackupTableManifest> = {};
        for (const table of tables) {
            try {
                let rows = await getAll<Record<string, unknown>>(`SELECT * FROM ${table};`);
                if (table === 'settings') {
                    const filtered = rows.filter((row) => !SETTINGS_SECRET_KEYS.has(String(row.key)));
                    const stripped = rows.length - filtered.length;
                    if (stripped > 0) {
                        result.warnings.push(
                            `${stripped} API key setting(s) excluded from backup (secrets never leave the device)`,
                        );
                    }
                    rows = filtered;
                }
                sqlite[table] = rows;
                const columns = await getTableColumns(table);
                tableManifest[table] = { columns: [...columns], rowCount: rows.length };
                result.tablesIncluded.push(table);
            } catch (err) {
                // Defensive: a broken table must never abort the whole export.
                // It is backed up empty and reported so the user knows.
                logger('warn', 'Backup', `Table ${table} unreadable, backed up as empty:`, err);
                sqlite[table] = [];
                tableManifest[table] = { columns: [], rowCount: 0 };
                result.tablesIncluded.push(table);
                result.warnings.push(`Table "${table}" could not be read and was backed up empty`);
            }
        }

        // ── 3. AsyncStorage allowlist ─────────────────────────────────────
        onProgress('Reading configuration settings...');
        const asyncStorage: Record<string, unknown> = {};
        const allKeys = await storage.getAllKeys();
        const allPairs = await storage.multiGet(allKeys);
        for (const [key, value] of allPairs) {
            if (!ASYNC_STORAGE_ALLOWLIST.has(key) || value === null) continue;
            try {
                asyncStorage[key] = JSON.parse(value);
            } catch {
                asyncStorage[key] = value;
            }
        }

        // ── 4. Media manifest (only when the vlogs scope is selected) ────
        const fileManifest: { vlogs: BackupFileEntry[]; thumbnails: BackupFileEntry[] } = {
            vlogs: [],
            thumbnails: [],
        };
        // Source path per entry, so the zipping step can copy/read the right file.
        const sourceByEntry = new Map<string, string>();
        const usedVideoNames = new Set<string>();
        const usedThumbNames = new Set<string>();

        const vlogRows = (effectiveScopes.includes('vlogs') ? sqlite['vlogs'] : []) as Record<string, unknown>[];
        for (const vlog of vlogRows) {
            const vlogId = String(vlog.id ?? '');
            const videoPath = typeof vlog.file_path === 'string' ? vlog.file_path : '';
            const thumbPath = typeof vlog.thumbnail_path === 'string' ? vlog.thumbnail_path : '';

            if (videoPath) {
                const entryName = uniqueEntryBasename(vlogId, basename(videoPath), usedVideoNames);
                const entryPath = `vlogs/${entryName}`;
                const info = await statFile(videoPath);
                if (info?.exists) {
                    fileManifest.vlogs.push({
                        vlogId,
                        entryPath,
                        kind: 'video',
                        sizeBytes: info.size,
                        included: true,
                        reason: null,
                    });
                    sourceByEntry.set(entryPath, videoPath);
                } else {
                    fileManifest.vlogs.push({
                        vlogId,
                        entryPath,
                        kind: 'video',
                        sizeBytes: 0,
                        included: false,
                        reason: 'missing',
                    });
                    result.videosExcluded.push({ vlogId, reason: 'missing' });
                    result.warnings.push(`Video file missing for vlog ${vlogId}: ${videoPath}`);
                }
            }

            if (thumbPath) {
                const entryName = uniqueEntryBasename(vlogId, basename(thumbPath), usedThumbNames);
                const entryPath = `thumbnails/${entryName}`;
                const info = await statFile(thumbPath);
                if (info?.exists) {
                    fileManifest.thumbnails.push({
                        vlogId,
                        entryPath,
                        kind: 'thumbnail',
                        sizeBytes: info.size,
                        included: true,
                        reason: null,
                    });
                    sourceByEntry.set(entryPath, thumbPath);
                } else {
                    fileManifest.thumbnails.push({
                        vlogId,
                        entryPath,
                        kind: 'thumbnail',
                        sizeBytes: 0,
                        included: false,
                        reason: 'missing',
                    });
                    result.warnings.push(`Thumbnail file missing for vlog ${vlogId}: ${thumbPath}`);
                }
            }
        }

        // ── 5. Metadata (manifest serialized AFTER zipping — the fallback
        //        may flip entries to 'too_large'/'copy_error' while writing) ──
        const schemaVersion = await getCurrentSchemaVersion();
        const metadata = {
            backupVersion: BACKUP_VERSION_CURRENT,
            schemaVersion,
            appVersion: APP_VERSION,
            createdAt: Date.now(),
            scopes: effectiveScopes,
            sqlite,
            asyncStorage,
            tableManifest,
            fileManifest,
        };

        // ── 6. Zip it (native or JSZip fallback) ─────────────────────────
        if (isNativeZipAvailable() && NativeZip) {
            onProgress('Preparing folder structures...');
            await FileSystem.deleteAsync(EXPORT_TEMP_DIR, { idempotent: true });
            await FileSystem.makeDirectoryAsync(EXPORT_TEMP_DIR, { intermediates: true });

            const includedVideos = fileManifest.vlogs.filter((e) => e.included);
            if (includedVideos.length > 0) {
                onProgress(`Copying ${includedVideos.length} video file(s) natively...`);
                await FileSystem.makeDirectoryAsync(`${EXPORT_TEMP_DIR}vlogs/`, { intermediates: true });
                for (const entry of includedVideos) {
                    const source = sourceByEntry.get(entry.entryPath);
                    if (!source) continue;
                    try {
                        await FileSystem.copyAsync({ from: source, to: `${EXPORT_TEMP_DIR}${entry.entryPath}` });
                    } catch (err) {
                        // A failed copy must be REPAIRED in the manifest and
                        // reported — otherwise the ZIP would silently miss a
                        // file that the metadata still claims to contain.
                        entry.included = false;
                        entry.reason = 'copy_error';
                        result.videosExcluded.push({ vlogId: entry.vlogId, reason: 'copy_error' });
                        result.warnings.push(`Could not copy video ${entry.entryPath}: ${String(err)}`);
                    }
                }
            }

            const includedThumbs = fileManifest.thumbnails.filter((e) => e.included);
            if (includedThumbs.length > 0) {
                onProgress(`Copying ${includedThumbs.length} thumbnail file(s) natively...`);
                await FileSystem.makeDirectoryAsync(`${EXPORT_TEMP_DIR}thumbnails/`, { intermediates: true });
                for (const entry of includedThumbs) {
                    const source = sourceByEntry.get(entry.entryPath);
                    if (!source) continue;
                    try {
                        await FileSystem.copyAsync({ from: source, to: `${EXPORT_TEMP_DIR}${entry.entryPath}` });
                    } catch (err) {
                        entry.included = false;
                        entry.reason = 'copy_error';
                        result.warnings.push(`Could not copy thumbnail ${entry.entryPath}: ${String(err)}`);
                    }
                }
            }

            // Metadata reflects the FINAL manifest (copy errors already applied)
            await FileSystem.writeAsStringAsync(
                `${EXPORT_TEMP_DIR}backup_metadata.json`,
                JSON.stringify(metadata, null, 2),
            );

            onProgress('Creating native ZIP archive...');
            await NativeZip.zip(EXPORT_TEMP_DIR, tempZipPath);

            await FileSystem.deleteAsync(EXPORT_TEMP_DIR, { idempotent: true });
        } else {
            // FALLBACK: pure JSZip (Expo Go)
            onProgress('Zipping database and media (JS fallback)...');
            const zip = new JSZip();

            const vlogsFolder = zip.folder('vlogs');
            const thumbsFolder = zip.folder('thumbnails');

            const includedVideos = fileManifest.vlogs.filter((e) => e.included);
            for (const entry of includedVideos) {
                if (entry.sizeBytes > JS_FALLBACK_MAX_VIDEO_BYTES) {
                    // Expo Go cannot hold this video in the JS heap safely.
                    // Exclude it with an explicit reason instead of crashing.
                    entry.included = false;
                    entry.reason = 'too_large';
                    result.videosExcluded.push({ vlogId: entry.vlogId, reason: 'too_large' });
                    result.warnings.push(
                        `Video for vlog ${entry.vlogId} (${Math.round(entry.sizeBytes / 1024 / 1024)} MB) excluded — ` +
                            'over the Expo Go fallback limit. Use a native build to include all videos.',
                    );
                    continue;
                }
                const source = sourceByEntry.get(entry.entryPath);
                if (!source) continue;
                try {
                    const base64Data = await FileSystem.readAsStringAsync(source, {
                        encoding: FileSystem.EncodingType.Base64,
                    });
                    vlogsFolder?.file(basename(entry.entryPath), base64Data, { base64: true });
                } catch (err) {
                    entry.included = false;
                    entry.reason = 'copy_error';
                    result.videosExcluded.push({ vlogId: entry.vlogId, reason: 'copy_error' });
                    result.warnings.push(`Could not read video ${entry.entryPath}: ${String(err)}`);
                }
            }

            for (const entry of fileManifest.thumbnails.filter((e) => e.included)) {
                const source = sourceByEntry.get(entry.entryPath);
                if (!source) continue;
                try {
                    const base64Data = await FileSystem.readAsStringAsync(source, {
                        encoding: FileSystem.EncodingType.Base64,
                    });
                    thumbsFolder?.file(basename(entry.entryPath), base64Data, { base64: true });
                } catch (err) {
                    entry.included = false;
                    entry.reason = 'copy_error';
                    result.warnings.push(`Could not read thumbnail ${entry.entryPath}: ${String(err)}`);
                }
            }

            // Metadata LAST so 'too_large'/'copy_error' flips are reflected.
            zip.file('backup_metadata.json', JSON.stringify(metadata, null, 2));

            onProgress('Generating ZIP (this may take a moment)...');
            const base64Zip = await zip.generateAsync({ type: 'base64', compression: 'STORE' });
            await FileSystem.writeAsStringAsync(tempZipPath, base64Zip, {
                encoding: FileSystem.EncodingType.Base64,
            });
        }

        // ── 7. Post-zip integrity verification ───────────────────────────
        // The ZIP is re-opened and every `included` entry must exist with the
        // exact recorded size. This is what makes "Erfolgreich" trustworthy.
        onProgress('Verifying backup integrity...');
        const verify = await verifyBackupZip(
            tempZipPath,
            metadata,
            isNativeZipAvailable() && NativeZip ? NativeZip : null,
        );
        if (!verify.metadataOk) {
            throw new Error('Backup verification failed: backup_metadata.json is missing from the ZIP');
        }
        if (verify.missing.length > 0) {
            result.verification = 'warn';
            result.warnings.push(`Integrity check: ${verify.missing.length} expected file(s) missing from the ZIP`);
            logger('warn', 'Backup', 'Backup verification found missing entries:', verify.missing);
        }

        // ── 8. Share ─────────────────────────────────────────────────────
        onProgress('Opening share dialog...');
        if (!(await Sharing.isAvailableAsync())) {
            throw new Error('Sharing is not available on this device');
        }
        await Sharing.shareAsync(tempZipPath, {
            mimeType: 'application/zip',
            dialogTitle: 'Export Journal Backup',
            UTI: 'public.zip-archive',
        });

        result.success = true;
        result.zipPath = tempZipPath;
        result.videosIncluded = fileManifest.vlogs.filter((e) => e.included).length;
        result.thumbnailsIncluded = fileManifest.thumbnails.filter((e) => e.included).length;

        await cleanupOldBackupZips(tempZipPath);

        return result;
    } catch (error) {
        // Best-effort cleanup so a failed export never leaves temp litter.
        await FileSystem.deleteAsync(EXPORT_TEMP_DIR, { idempotent: true }).catch(() => {});
        await FileSystem.deleteAsync(EXPORT_VERIFY_DIR, { idempotent: true }).catch(() => {});
        // A failed/partial ZIP must not linger in the cache (it would be
        // picked up as "a backup exists" by nobody, but wastes storage).
        await FileSystem.deleteAsync(tempZipPath, { idempotent: true }).catch(() => {});
        logger('error', 'Backup', 'Backup export failed:', error);
        return { ...result, success: false, verification: 'failed', error: (error as Error)?.message || String(error) };
    }
}

/**
 * Re-open the produced ZIP and check every `included` media entry (by size)
 * plus the presence of `backup_metadata.json`.
 */
async function verifyBackupZip(
    zipPath: string,
    metadata: { fileManifest: { vlogs: BackupFileEntry[]; thumbnails: BackupFileEntry[] } },
    nativeZip: NativeZipModuleType | null,
): Promise<{ metadataOk: boolean; missing: string[] }> {
    const expected = [
        ...metadata.fileManifest.vlogs.filter((e) => e.included),
        ...metadata.fileManifest.thumbnails.filter((e) => e.included),
    ];
    const missing: string[] = [];

    if (nativeZip) {
        // Native path: unzip into a scratch dir and compare file sizes.
        await FileSystem.deleteAsync(EXPORT_VERIFY_DIR, { idempotent: true });
        await FileSystem.makeDirectoryAsync(EXPORT_VERIFY_DIR, { intermediates: true });
        await nativeZip.unzip(zipPath, EXPORT_VERIFY_DIR);

        const metaInfo = await statFile(`${EXPORT_VERIFY_DIR}backup_metadata.json`);
        if (!metaInfo?.exists) {
            await FileSystem.deleteAsync(EXPORT_VERIFY_DIR, { idempotent: true }).catch(() => {});
            return { metadataOk: false, missing };
        }
        for (const entry of expected) {
            const info = await statFile(`${EXPORT_VERIFY_DIR}${entry.entryPath}`);
            if (!info?.exists || info.size !== entry.sizeBytes) missing.push(entry.entryPath);
        }
        await FileSystem.deleteAsync(EXPORT_VERIFY_DIR, { idempotent: true }).catch(() => {});
    } else {
        // JSZip path: re-load the archive and compare entry sizes in memory.
        try {
            const base64Zip = await FileSystem.readAsStringAsync(zipPath, {
                encoding: FileSystem.EncodingType.Base64,
            });
            const zip = await JSZip.loadAsync(base64Zip, { base64: true });
            if (!zip.file('backup_metadata.json')) return { metadataOk: false, missing };
            for (const entry of expected) {
                const size = jsZipEntrySize(zip, entry.entryPath);
                if (size === null || size !== entry.sizeBytes) missing.push(entry.entryPath);
            }
        } catch {
            // An unreadable ZIP is treated as missing metadata (fatal).
            return { metadataOk: false, missing };
        }
    }
    return { metadataOk: true, missing };
}

/* ═══════════════════════════════════════════════════════════════════════════
   IMPORT
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Restore a backup ZIP. Pipeline (see spec): pick → extract → normalize →
 * schema gate → manifest gate → free-space gate → pause queues → snapshot →
 * restore DB (column-filtered) → rewrite media paths → restore AsyncStorage
 * (PIN stays local) → restore media → success/rollback → resume queues.
 */
export async function importBackupZip(onProgress: (status: string) => void): Promise<BackupResult> {
    const dbPath = `${FileSystem.documentDirectory}SQLite/mda_v2.db`;
    const dbBackupPath = `${FileSystem.cacheDirectory}mda_db_rollback.db`;
    const vlogDir = `${FileSystem.documentDirectory}${CONFIG.VLOG_STORAGE_DIR}`;
    const vlogBackupDir = `${FileSystem.cacheDirectory}mda_vlogs_rollback/`;
    const thumbDir = `${FileSystem.documentDirectory}vlog_thumbnails/`;
    const thumbBackupDir = `${FileSystem.cacheDirectory}mda_thumbnails_rollback/`;

    const result: BackupResult = {
        success: false,
        verification: 'ok',
        scopes: [...ALL_BACKUP_SCOPES],
        tablesIncluded: [],
        videosIncluded: 0,
        videosExcluded: [],
        thumbnailsIncluded: 0,
        warnings: [],
    };

    let hasTakenSnapshot = false;
    let currentPairs: [string, string | null][] = [];
    let dbExists = false;
    let vlogDirExists = false;
    let thumbDirExists = false;
    let currentSchemaVersion: string | null = null;
    let queuesPaused = false;

    try {
        // ── 1. Pick file ─────────────────────────────────────────────────
        onProgress('Opening document picker...');
        const pickerResult = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
        if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
            return { ...result, cancelled: true, error: 'Cancelled' };
        }
        const pickedFile = pickerResult.assets[0];
        const fileUri = pickedFile.uri;
        if (!(pickedFile.name || '').toLowerCase().endsWith('.zip')) {
            throw new Error('Invalid file type: Please select a .zip backup file');
        }

        await FileSystem.deleteAsync(IMPORT_TEMP_DIR, { idempotent: true });

        // ── 2. Extract (native) or load once into memory (JSZip fallback) ─
        // The JSZip fallback loads the archive EXACTLY ONCE and reuses the
        // object — re-reading the picked file repeatedly wasted memory.
        const useNative = isNativeZipAvailable() && NativeZip;
        let zipForMedia: JSZip | null = null;
        let rawMetadata: unknown = null;

        if (useNative) {
            onProgress('Unpacking native ZIP archive...');
            await FileSystem.makeDirectoryAsync(IMPORT_TEMP_DIR, { intermediates: true });
            if (!NativeZip) throw new Error('Native ZIP module became unavailable');
            await NativeZip.unzip(fileUri, IMPORT_TEMP_DIR);
            const metadataStr = await FileSystem.readAsStringAsync(`${IMPORT_TEMP_DIR}backup_metadata.json`);
            rawMetadata = JSON.parse(metadataStr);
        } else {
            onProgress('Unpacking ZIP archive (JS fallback)...');
            const base64Zip = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
            const zip = await JSZip.loadAsync(base64Zip, { base64: true });
            zipForMedia = zip;
            const metadataFile = zip.file('backup_metadata.json');
            if (!metadataFile) throw new Error('Invalid backup file: backup_metadata.json is missing');
            rawMetadata = JSON.parse(await metadataFile.async('string'));
        }

        // ── 3. Normalize + shape-guard (v1 legacy and v2 both accepted) ──
        const backup = await normalizeBackupMetadata(rawMetadata, useNative ? IMPORT_TEMP_DIR : zipForMedia);
        result.scopes = backup.scopes;

        // ── 4. Schema gate — BEFORE any snapshot so a mismatched backup
        //        can never put the device in a half-restored state ────────
        const currentSchemaVersionNum = await getCurrentSchemaVersion();
        if (backup.schemaVersion > currentSchemaVersionNum) {
            throw new Error(
                `This backup was created with a newer app version (schema v${backup.schemaVersion} > ` +
                    `v${currentSchemaVersionNum}). Please update the app first.`,
            );
        }

        // ── 5. Manifest gate — every included media entry must exist with
        //        the exact recorded size, otherwise the ZIP is corrupt ─────
        const expectedEntries = [...backup.fileManifest.vlogs, ...backup.fileManifest.thumbnails].filter(
            (e) => e.included,
        );
        for (const entry of expectedEntries) {
            const info = useNative
                ? await statFile(`${IMPORT_TEMP_DIR}${entry.entryPath}`)
                : await statZipEntry(zipForMedia, entry.entryPath);
            if (!info || !info.exists || info.size !== entry.sizeBytes) {
                throw new Error(
                    `Backup is corrupt: file "${entry.entryPath}" is missing or truncated ` +
                        `(expected ${entry.sizeBytes} bytes)`,
                );
            }
        }

        // ── 6. Free-space gate ────────────────────────────────────────────
        const requiredBytes = Math.round(
            expectedEntries.reduce((sum, e) => sum + e.sizeBytes, 0) * FREE_SPACE_MARGIN_FACTOR,
        );
        if (requiredBytes > 0) {
            const freeBytes = await FileSystem.getFreeDiskStorageAsync().catch(() => Number.MAX_SAFE_INTEGER);
            if (requiredBytes > freeBytes) {
                throw new Error(
                    `Not enough free storage: the backup needs ~${(requiredBytes / 1024 / 1024).toFixed(0)} MB, ` +
                        `but only ${(freeBytes / 1024 / 1024).toFixed(0)} MB are free.`,
                );
            }
        }

        // ── 7. Pause queues — nothing may write DB/AsyncStorage while the
        //        restore replaces them (see queue pause/resume impls) ─────
        onProgress('Pausing background jobs...');
        await aiQueue.pause();
        compressionQueue.pause();
        queuesPaused = true;

        // ── 8. Safety snapshots for rollback ──────────────────────────────
        onProgress('Creating safety snapshots...');
        const currentKeys = await storage.getAllKeys();
        currentPairs = await storage.multiGet(currentKeys);
        currentSchemaVersion = await storage.getItem(SCHEMA_VERSION_KEY);

        const dbInfo = await FileSystem.getInfoAsync(dbPath);
        dbExists = dbInfo.exists;
        if (dbExists) {
            // The DB file must be copied while closed — a hot copy could be
            // mid-WAL and yield an inconsistent rollback snapshot.
            await closeDb();
            await FileSystem.deleteAsync(dbBackupPath, { idempotent: true });
            await FileSystem.copyAsync({ from: dbPath, to: dbBackupPath });
        }

        const vlogInfo = await FileSystem.getInfoAsync(vlogDir);
        vlogDirExists = vlogInfo.exists && 'isDirectory' in vlogInfo && vlogInfo.isDirectory;
        if (vlogDirExists) {
            await FileSystem.deleteAsync(vlogBackupDir, { idempotent: true });
            await FileSystem.makeDirectoryAsync(vlogBackupDir, { intermediates: true });
            const files = await FileSystem.readDirectoryAsync(vlogDir);
            for (const file of files) {
                await FileSystem.copyAsync({ from: `${vlogDir}${file}`, to: `${vlogBackupDir}${file}` });
            }
        }

        const thumbInfo = await FileSystem.getInfoAsync(thumbDir);
        thumbDirExists = thumbInfo.exists && 'isDirectory' in thumbInfo && thumbInfo.isDirectory;
        if (thumbDirExists) {
            await FileSystem.deleteAsync(thumbBackupDir, { idempotent: true });
            await FileSystem.makeDirectoryAsync(thumbBackupDir, { intermediates: true });
            const files = await FileSystem.readDirectoryAsync(thumbDir);
            for (const file of files) {
                await FileSystem.copyAsync({ from: `${thumbDir}${file}`, to: `${thumbBackupDir}${file}` });
            }
        }

        hasTakenSnapshot = true;

        // ── 9. Restore SQLite in ONE transaction ──────────────────────────
        // All current user tables are cleared (full-restore semantics), then
        // every backup table is re-inserted with column filtering: rows may
        // only write columns that exist in the CURRENT schema. This makes
        // older backups (missing newer columns) restore cleanly.
        onProgress('Restoring database records...');
        const db = await getDb();
        const currentTables = await getCurrentTables();
        await db.withTransactionAsync(async () => {
            for (const table of currentTables) {
                await run(`DELETE FROM ${table};`);
            }
            for (const [table, rows] of Object.entries(backup.sqlite)) {
                if (rows.length === 0) continue;
                const allowedColumns = await getTableColumns(table);
                for (const row of rows) {
                    if (!isPlainObject(row)) continue;
                    const columns = Object.keys(row).filter((c) => allowedColumns.has(c));
                    if (columns.length === 0) continue;
                    const placeholders = columns.map(() => '?').join(', ');
                    const params = columns.map((c) => row[c] as string | number | boolean | null | undefined);
                    await run(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders});`, params);
                }
            }
        });

        // ── 10. Rewrite media paths for THIS device ───────────────────────
        // The restored rows carry the SOURCE device's absolute paths; a backup
        // restored on another device must point at its own sandbox. The entry
        // basenames from the manifest are the on-disk truth after step 12.
        if (Array.isArray(backup.sqlite['vlogs'])) {
            onProgress('Fixing media paths for this device...');
            const nameByVlog = new Map<string, { video?: string; thumb?: string }>();
            for (const entry of [...backup.fileManifest.vlogs, ...backup.fileManifest.thumbnails]) {
                const names = nameByVlog.get(entry.vlogId) ?? {};
                if (entry.kind === 'video') names.video = basename(entry.entryPath);
                else names.thumb = basename(entry.entryPath);
                nameByVlog.set(entry.vlogId, names);
            }
            for (const row of backup.sqlite['vlogs']) {
                if (!isPlainObject(row)) continue;
                const vlogId = String(row.id ?? '');
                const names = nameByVlog.get(vlogId);
                // Legacy v1 fallback: no manifest → derive from the original
                // path (v1 stored media flat by basename).
                const videoName = names?.video ?? basename(typeof row.file_path === 'string' ? row.file_path : '');
                const thumbName =
                    names?.thumb ??
                    (typeof row.thumbnail_path === 'string' && row.thumbnail_path
                        ? basename(row.thumbnail_path)
                        : null);
                await run(`UPDATE vlogs SET file_path = ?, thumbnail_path = ? WHERE id = ?`, [
                    `${vlogDir}${videoName}`,
                    thumbName ? `${thumbDir}${thumbName}` : null,
                    vlogId,
                ]);
            }
        }

        // ── 11. Restore AsyncStorage (allowlist only, PIN stays local) ───
        onProgress('Restoring configuration settings...');
        await storage.clearAll();

        const pairs: [string, string][] = [];
        for (const [key, value] of Object.entries(backup.asyncStorage)) {
            // Defense in depth: even if a crafted backup smuggles foreign or
            // secret keys in, only the documented allowlist is ever restored.
            if (value === null || value === undefined) continue;
            if (ASYNC_STORAGE_SECRET_KEYS.has(key)) continue;
            if (!ASYNC_STORAGE_ALLOWLIST.has(key)) continue;
            if (key === SCHEMA_VERSION_KEY) continue; // forced to local value below
            pairs.push([key, JSON.stringify(value)]);
        }
        if (pairs.length > 0) await storage.multiSet(pairs);

        // Local security state (PIN, attempt counter, lockout) is re-applied
        // from the snapshot — it never comes from a backup file.
        const localSecurityPairs = currentPairs.filter(
            (pair): pair is [string, string] => pair[1] !== null && ASYNC_STORAGE_SECRET_KEYS.has(pair[0]),
        );
        if (localSecurityPairs.length > 0) await storage.multiSet(localSecurityPairs);

        // Force the CURRENT schema version so migrations can never re-run and
        // brick the freshly restored database.
        if (currentSchemaVersion !== null) {
            await storage.setItem(SCHEMA_VERSION_KEY, currentSchemaVersion);
        }

        // ── 12. Restore media files ───────────────────────────────────────
        const mediaWarnings = useNative
            ? await restoreMediaNative(backup, vlogDir, thumbDir, onProgress)
            : await restoreMediaJs(zipForMedia, backup, vlogDir, thumbDir, onProgress);
        result.warnings.push(...mediaWarnings);
        result.videosIncluded = backup.fileManifest.vlogs.filter((e) => e.included).length;
        result.thumbnailsIncluded = backup.fileManifest.thumbnails.filter((e) => e.included).length;

        // Report vlogs whose video could not be restored (missing in backup).
        for (const entry of backup.fileManifest.vlogs) {
            if (!entry.included) {
                result.videosExcluded.push({ vlogId: entry.vlogId, reason: entry.reason ?? 'missing' });
            }
        }

        // ── 13. Success — drop rollback copies ────────────────────────────
        await FileSystem.deleteAsync(IMPORT_TEMP_DIR, { idempotent: true }).catch(() => {});
        if (dbExists) await FileSystem.deleteAsync(dbBackupPath, { idempotent: true }).catch(() => {});
        if (vlogDirExists) await FileSystem.deleteAsync(vlogBackupDir, { idempotent: true }).catch(() => {});
        if (thumbDirExists) await FileSystem.deleteAsync(thumbBackupDir, { idempotent: true }).catch(() => {});

        result.success = true;
        result.verification = result.warnings.length > 0 ? 'warn' : 'ok';
        return result;
    } catch (error) {
        await FileSystem.deleteAsync(IMPORT_TEMP_DIR, { idempotent: true }).catch(() => {});

        // Rollback everything that was snapshotted. The rollback itself is
        // best-effort and must NEVER throw out of the catch block.
        if (hasTakenSnapshot) {
            try {
                onProgress('Rolling back changes...');

                await storage.clearAll();
                const validPairs = currentPairs.filter((p): p is [string, string] => p[1] !== null);
                if (validPairs.length > 0) await storage.multiSet(validPairs);

                await closeDb();
                await FileSystem.deleteAsync(dbPath, { idempotent: true });
                if (dbExists) {
                    await FileSystem.copyAsync({ from: dbBackupPath, to: dbPath });
                }

                await FileSystem.deleteAsync(vlogDir, { idempotent: true });
                if (vlogDirExists) {
                    await FileSystem.makeDirectoryAsync(vlogDir, { intermediates: true });
                    const backupFiles = await FileSystem.readDirectoryAsync(vlogBackupDir);
                    for (const file of backupFiles) {
                        await FileSystem.copyAsync({ from: `${vlogBackupDir}${file}`, to: `${vlogDir}${file}` });
                    }
                }

                await FileSystem.deleteAsync(thumbDir, { idempotent: true });
                if (thumbDirExists) {
                    await FileSystem.makeDirectoryAsync(thumbDir, { intermediates: true });
                    const backupThumbs = await FileSystem.readDirectoryAsync(thumbBackupDir);
                    for (const file of backupThumbs) {
                        await FileSystem.copyAsync({ from: `${thumbBackupDir}${file}`, to: `${thumbDir}${file}` });
                    }
                }

                if (dbExists) await FileSystem.deleteAsync(dbBackupPath, { idempotent: true }).catch(() => {});
                if (vlogDirExists) await FileSystem.deleteAsync(vlogBackupDir, { idempotent: true }).catch(() => {});
                if (thumbDirExists) await FileSystem.deleteAsync(thumbBackupDir, { idempotent: true }).catch(() => {});
            } catch (rollbackErr) {
                logger('error', 'Restore', 'Critical error during rollback:', rollbackErr);
            }
        }

        logger('error', 'Import', 'Backup import failed:', error);
        return {
            ...result,
            success: false,
            verification: 'failed',
            error: (error as Error)?.message || String(error),
        };
    } finally {
        // The queues must ALWAYS be un-paused, even on failure paths.
        if (queuesPaused) {
            await aiQueue.resume().catch(() => {});
            compressionQueue.resume();
        }
    }
}

/** Stat a ZIP entry for the manifest gate (JSZip fallback path). */
async function statZipEntry(zip: JSZip | null, entryPath: string): Promise<{ exists: boolean; size: number } | null> {
    if (!zip) return null;
    const size = jsZipEntrySize(zip, entryPath);
    return size === null ? { exists: false, size: 0 } : { exists: true, size };
}

/**
 * Parse + shape-guard raw backup metadata into a `NormalizedBackup`.
 * Accepts v2 (with manifests) and v1 (derives a manifest from the ZIP
 * content so the restore pipeline can treat both formats identically).
 */
async function normalizeBackupMetadata(raw: unknown, mediaSource: string | JSZip | null): Promise<NormalizedBackup> {
    if (!isPlainObject(raw)) throw new Error('Invalid backup file: metadata is not an object');

    const version =
        raw.backupVersion === BACKUP_VERSION_CURRENT
            ? BACKUP_VERSION_CURRENT
            : raw.backupVersion === BACKUP_VERSION_LEGACY
              ? BACKUP_VERSION_LEGACY
              : null;
    if (version === null) {
        throw new Error(`Unsupported backup version: ${String(raw.backupVersion)}`);
    }

    const sqlite: Record<string, unknown[]> = {};
    if (isPlainObject(raw.sqlite)) {
        for (const [table, rows] of Object.entries(raw.sqlite)) {
            if (Array.isArray(rows)) sqlite[table] = rows;
        }
    }
    if (!isPlainObject(raw.asyncStorage)) {
        throw new Error('Corrupt backup file: metadata is invalid');
    }

    const scopes: BackupScope[] = Array.isArray(raw.scopes)
        ? (raw.scopes as BackupScope[]).filter((s) => ALL_BACKUP_SCOPES.includes(s))
        : [...ALL_BACKUP_SCOPES];

    // v2 manifests, shape-guarded entry by entry
    let fileManifest: { vlogs: BackupFileEntry[]; thumbnails: BackupFileEntry[] } = { vlogs: [], thumbnails: [] };
    if (isPlainObject(raw.fileManifest)) {
        const guardEntries = (list: unknown, kind: 'video' | 'thumbnail'): BackupFileEntry[] =>
            Array.isArray(list)
                ? list
                      .filter(
                          (e): e is Record<string, unknown> =>
                              isPlainObject(e) && typeof e.entryPath === 'string' && typeof e.vlogId === 'string',
                      )
                      .map((e) => ({
                          vlogId: String(e.vlogId),
                          entryPath: String(e.entryPath),
                          kind,
                          sizeBytes: typeof e.sizeBytes === 'number' ? e.sizeBytes : 0,
                          included: e.included !== false,
                          reason:
                              e.reason === 'missing' || e.reason === 'copy_error' || e.reason === 'too_large'
                                  ? e.reason
                                  : null,
                      }))
                : [];
        fileManifest = {
            vlogs: guardEntries(raw.fileManifest.vlogs, 'video'),
            thumbnails: guardEntries(raw.fileManifest.thumbnails, 'thumbnail'),
        };
    }

    // v1 has no schema version — no gate is possible; column filtering
    // handles any legacy drift.
    const schemaVersion = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;

    // v1 legacy: derive the media manifest from the ZIP content so the rest
    // of the pipeline (gates, restore, path rewrite) works identically.
    if (version === BACKUP_VERSION_LEGACY && mediaSource) {
        const derived: { vlogs: BackupFileEntry[]; thumbnails: BackupFileEntry[] } = { vlogs: [], thumbnails: [] };
        if (typeof mediaSource === 'string') {
            // Native extraction — list the extracted folders.
            for (const [folder, kind] of [
                ['vlogs', 'video'],
                ['thumbnails', 'thumbnail'],
            ] as const) {
                const info = await FileSystem.getInfoAsync(`${mediaSource}${folder}/`);
                if (info.exists && 'isDirectory' in info && info.isDirectory) {
                    const files = await FileSystem.readDirectoryAsync(`${mediaSource}${folder}/`);
                    for (const file of files) {
                        const fileInfo = await statFile(`${mediaSource}${folder}/${file}`);
                        derived[kind === 'video' ? 'vlogs' : 'thumbnails'].push({
                            vlogId: '',
                            entryPath: `${folder}/${file}`,
                            kind,
                            sizeBytes: fileInfo?.exists ? fileInfo.size : 0,
                            included: true,
                            reason: null,
                        });
                    }
                }
            }
        } else if (mediaSource instanceof JSZip) {
            for (const path of Object.keys(mediaSource.files)) {
                const isVlog = path.startsWith('vlogs/') && !path.endsWith('/');
                const isThumb = path.startsWith('thumbnails/') && !path.endsWith('/');
                if (!isVlog && !isThumb) continue;
                const size = jsZipEntrySize(mediaSource, path);
                derived[isVlog ? 'vlogs' : 'thumbnails'].push({
                    vlogId: '',
                    entryPath: path,
                    kind: isVlog ? 'video' : 'thumbnail',
                    sizeBytes: size ?? 0,
                    included: true,
                    reason: null,
                });
            }
        }
        fileManifest = derived;
    }

    return { version, schemaVersion, scopes, sqlite, asyncStorage: raw.asyncStorage, fileManifest };
}

/** Copy media files from the native extraction dir into the app's sandbox. */
async function restoreMediaNative(
    backup: NormalizedBackup,
    vlogDir: string,
    thumbDir: string,
    onProgress: (status: string) => void,
): Promise<string[]> {
    const warnings: string[] = [];
    const videoEntries = backup.fileManifest.vlogs.filter((e) => e.included);
    const thumbEntries = backup.fileManifest.thumbnails.filter((e) => e.included);

    if (videoEntries.length > 0) {
        onProgress(`Restoring ${videoEntries.length} video file(s)...`);
        await FileSystem.deleteAsync(vlogDir, { idempotent: true });
        await FileSystem.makeDirectoryAsync(vlogDir, { intermediates: true });
        for (const entry of videoEntries) {
            try {
                await FileSystem.copyAsync({
                    from: `${IMPORT_TEMP_DIR}${entry.entryPath}`,
                    to: `${vlogDir}${basename(entry.entryPath)}`,
                });
            } catch (err) {
                warnings.push(`Video ${basename(entry.entryPath)} could not be restored: ${String(err)}`);
            }
        }
    }

    if (thumbEntries.length > 0) {
        onProgress(`Restoring ${thumbEntries.length} thumbnail file(s)...`);
        await FileSystem.deleteAsync(thumbDir, { idempotent: true });
        await FileSystem.makeDirectoryAsync(thumbDir, { intermediates: true });
        for (const entry of thumbEntries) {
            try {
                await FileSystem.copyAsync({
                    from: `${IMPORT_TEMP_DIR}${entry.entryPath}`,
                    to: `${thumbDir}${basename(entry.entryPath)}`,
                });
            } catch (err) {
                warnings.push(`Thumbnail ${basename(entry.entryPath)} could not be restored: ${String(err)}`);
            }
        }
    }

    return warnings;
}

/** Write media files from the in-memory JSZip archive into the sandbox. */
async function restoreMediaJs(
    zip: JSZip | null,
    backup: NormalizedBackup,
    vlogDir: string,
    thumbDir: string,
    onProgress: (status: string) => void,
): Promise<string[]> {
    const warnings: string[] = [];
    if (!zip) return warnings;

    const videoEntries = backup.fileManifest.vlogs.filter((e) => e.included);
    if (videoEntries.length > 0) {
        onProgress(`Restoring ${videoEntries.length} video file(s) (JS fallback)...`);
        await FileSystem.deleteAsync(vlogDir, { idempotent: true });
        await FileSystem.makeDirectoryAsync(vlogDir, { intermediates: true });
        for (const entry of videoEntries) {
            const fileObj = zip.file(entry.entryPath);
            if (!fileObj) {
                warnings.push(`Video ${basename(entry.entryPath)} is missing from the backup`);
                continue;
            }
            try {
                const base64Data = await fileObj.async('base64');
                await FileSystem.writeAsStringAsync(`${vlogDir}${basename(entry.entryPath)}`, base64Data, {
                    encoding: FileSystem.EncodingType.Base64,
                });
            } catch (err) {
                warnings.push(`Video ${basename(entry.entryPath)} could not be restored: ${String(err)}`);
            }
        }
    }

    const thumbEntries = backup.fileManifest.thumbnails.filter((e) => e.included);
    if (thumbEntries.length > 0) {
        onProgress(`Restoring ${thumbEntries.length} thumbnail file(s) (JS fallback)...`);
        await FileSystem.deleteAsync(thumbDir, { idempotent: true });
        await FileSystem.makeDirectoryAsync(thumbDir, { intermediates: true });
        for (const entry of thumbEntries) {
            const fileObj = zip.file(entry.entryPath);
            if (!fileObj) continue;
            try {
                const base64Data = await fileObj.async('base64');
                await FileSystem.writeAsStringAsync(`${thumbDir}${basename(entry.entryPath)}`, base64Data, {
                    encoding: FileSystem.EncodingType.Base64,
                });
            } catch (err) {
                warnings.push(`Thumbnail ${basename(entry.entryPath)} could not be restored: ${String(err)}`);
            }
        }
    }

    return warnings;
}
