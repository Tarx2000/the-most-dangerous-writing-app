import { Alert, Share } from 'react-native';
import { logger } from '@/lib/logger';
import { storage } from '@/lib/storage';
import { getDb, getAll, run } from '@/lib/db';
import * as FileSystem from 'expo-file-system/legacy';
import {
    getAllNotes, insertNote, deleteAllNotes,
} from '@/lib/repositories/notesRepository';
import {
    getAllPersons, insertPerson, deleteAllPersons,
} from '@/lib/repositories/personsRepository';
import {
    getAllVlogs, insertVlog, deleteAllVlogs,
} from '@/lib/repositories/vlogsRepository';
import {
    getAllSettings, setSetting,
} from '@/lib/repositories/settingsRepository';
import type { SavedNote, Person, SavedVlog, VisionBoard, AlignmentReflection } from '@/types';
import { isAlignmentReflection } from '@/types';
import { generateId, toLocalDateString } from '@/lib/utils';
import { DEFAULT_AI_PROMPTS, AI_STORAGE_KEYS } from '@/config/ai';
import { setGlobalHapticsEnabled } from '@/lib/haptics';
import { mark as perfMark, log as perfLog, setPerfEnabled } from '@/lib/perf';
import { processPendingCompressions } from '@/lib/videoCompressor';

export type Ref<T> = { current: T };
export type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

/* ═══════════════════════════════════════════════════════════════════════════
   SAFE JSON PARSE
   ═══════════════════════════════════════════════════════════════════════════ */

export function safeParse<T>(key: string, raw: string | null | undefined, fallback: T): T {
    if (raw == null) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch (err) {
        logger("warn", "Storage", `Failed to parse key "${key}", using fallback:`, err);
        return fallback;
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
   DATA LOADERS — One per domain, fully typed, testable
   ═══════════════════════════════════════════════════════════════════════════ */

export interface LoadContext {
    setSavedNotes: Setter<SavedNote[]>;
    setPersons: Setter<Person[]>;
    setCurrentStreak: Setter<number>;
    setLastWinDate: Setter<string>;
    setStreakHistory: Setter<string[]>;
    setFontIndex: Setter<number>;
    setSizeIndex: Setter<number>;
    setUseBiometrics: Setter<boolean>;
    setEnableHaptics: Setter<boolean>;
    setLockTimeoutMins: Setter<number>;
    setVlogQuality: Setter<string>;
    setCompressionPreset: Setter<string>;
    setDevMode: Setter<boolean>;
    setDebugLayout: Setter<boolean>;
    setVisionBoard: Setter<VisionBoard | null>;
    setPreferPinAuth: Setter<boolean>;
    setLastReflectionDate: Setter<number | null>;
    setSavedVlogs: Setter<SavedVlog[]>;
    setTotalVlogStorageBytes: Setter<number>;
    setBookmarkedNoteIds: Setter<string[]>;
    setFeedComments: Setter<Record<string, string>>;
    setAutoPlayFeedVideos: Setter<boolean>;
    setAiApiKey: Setter<string>;
    setAiBaseUrl: Setter<string>;
    setAiModel: Setter<string>;
    setAiGrammarModel: Setter<string>;
    setAiPrompts: Setter<import('@/config/ai').AiPrompts>;
    setAutoGenerateSummaries: Setter<boolean>;
}

export async function loadNotes(ctx: LoadContext): Promise<void> {
    const notes = await getAllNotes();
    ctx.setSavedNotes(notes);
}

export async function loadPersons(ctx: LoadContext): Promise<void> {
    const persons = await getAllPersons();
    ctx.setPersons(persons);
}

export async function loadVlogs(ctx: LoadContext): Promise<void> {
    const vlogs = await getAllVlogs();
    ctx.setSavedVlogs(vlogs);
    const totalBytes = vlogs.reduce((sum, v) => sum + (v.fileSizeBytes || 0), 0);
    ctx.setTotalVlogStorageBytes(totalBytes);
}

export async function loadAllData(ctx: LoadContext): Promise<void> {
    perfMark('storage.start');

    await loadNotes(ctx);
    await loadPersons(ctx);

    const allSettings = await getAllSettings();

    /* ── Preferences ─────────────────────────────────────────────────────── */
    const fontIdx = parseInt(allSettings['USER_FONT_IDX'] ?? '0', 10);
    if (!Number.isNaN(fontIdx)) ctx.setFontIndex(fontIdx);

    const sizeIdx = parseInt(allSettings['USER_SIZE_IDX'] ?? '1', 10);
    if (!Number.isNaN(sizeIdx)) ctx.setSizeIndex(sizeIdx);

    ctx.setUseBiometrics(safeParse('USE_BIOMETRICS', allSettings['USE_BIOMETRICS'], true));
    ctx.setEnableHaptics(safeParse('ENABLE_HAPTICS', allSettings['ENABLE_HAPTICS'], true));
    setGlobalHapticsEnabled(safeParse('ENABLE_HAPTICS', allSettings['ENABLE_HAPTICS'], true));

    const lockTimeout = parseInt(allSettings['LOCK_TIMEOUT_MINS'] ?? '3', 10);
    if (!Number.isNaN(lockTimeout)) ctx.setLockTimeoutMins(lockTimeout);

    ctx.setVlogQuality(allSettings['VLOG_QUALITY'] ?? '1080p');
    ctx.setCompressionPreset(allSettings['COMPRESSION_PRESET'] ?? 'balanced');
    ctx.setDevMode(safeParse('DEV_MODE', allSettings['DEV_MODE'], false));
    ctx.setDebugLayout(safeParse('DEBUG_LAYOUT', allSettings['DEBUG_LAYOUT'], false));

    const visionBoard = safeParse<VisionBoard | null>('VISION_BOARD', allSettings['VISION_BOARD'], null);
    ctx.setVisionBoard(visionBoard);

    ctx.setPreferPinAuth(safeParse('PREFER_PIN_AUTH', allSettings['PREFER_PIN_AUTH'], false));

    const lastReflectionDate = parseInt(allSettings['LAST_REFLECTION_DATE'] ?? '', 10);
    if (!Number.isNaN(lastReflectionDate)) ctx.setLastReflectionDate(lastReflectionDate);

    /* ── Streak ──────────────────────────────────────────────────────────── */
    const storedStreak = parseInt(allSettings['CURRENT_STREAK'] ?? '', 10);
    ctx.setCurrentStreak(Number.isNaN(storedStreak) ? 0 : storedStreak);
    ctx.setLastWinDate(allSettings['LAST_WIN_DATE'] ?? '');

    perfMark('storage.critical');

    /* ── Deferred data ──────────────────────────────────────────────────── */
    await loadVlogs(ctx);

    /* ── AI Config ──────────────────────────────────────────────────────── */
    ctx.setAiApiKey(allSettings[AI_STORAGE_KEYS.API_KEY] ?? '');
    ctx.setAiBaseUrl(allSettings[AI_STORAGE_KEYS.BASE_URL] ?? '');
    ctx.setAiModel(allSettings[AI_STORAGE_KEYS.MODEL] ?? '');
    ctx.setAiGrammarModel(allSettings[AI_STORAGE_KEYS.GRAMMAR_MODEL] ?? '');

    const rawPrompts = safeParse<Record<string, string>>(
        'AI_PROMPTS', allSettings[AI_STORAGE_KEYS.PROMPTS], {}
    );
    ctx.setAiPrompts({ ...DEFAULT_AI_PROMPTS, ...rawPrompts });
    ctx.setAutoGenerateSummaries(safeParse('AUTO_GENERATE_SUMMARIES', allSettings['AUTO_GENERATE_SUMMARIES'], true));

    /* ── Feed ───────────────────────────────────────────────────────────── */
    ctx.setBookmarkedNoteIds(safeParse<string[]>('BOOKMARKED_NOTE_IDS', allSettings['BOOKMARKED_NOTE_IDS'], []));
    ctx.setFeedComments(safeParse<Record<string, string>>('FEED_COMMENTS', allSettings['FEED_COMMENTS'], {}));
    ctx.setAutoPlayFeedVideos(safeParse('AUTO_PLAY_FEED_VIDEOS', allSettings['AUTO_PLAY_FEED_VIDEOS'], true));

    /* ── Streak History ──────────────────────────────────────────────────── */
    const rawHistory = safeParse<string[]>('STREAK_HISTORY', allSettings['STREAK_HISTORY'], []);
    if (rawHistory.length > 0) {
        ctx.setStreakHistory(rawHistory);
    } else {
        // Backfill from notes
        const notes = await getAllNotes();
        const historySet = new Set<string>();
        for (const n of notes) {
            if (n.won && n.durationMin >= 3 && !n.isQuickNote) {
                const d = new Date(n.timestamp);
                historySet.add(toLocalDateString(d));
            }
        }
        const backfilled = Array.from(historySet);
        ctx.setStreakHistory(backfilled);
        await setSetting('STREAK_HISTORY', JSON.stringify(backfilled));
    }

    /* ── Recalculate streak if stale ─────────────────────────────────────── */
    const notes = await getAllNotes();
    const noteHistory = new Set<string>();
    for (const n of notes) {
        if (n.won && n.durationMin >= 3 && !n.isQuickNote) {
            const d = new Date(n.timestamp);
            noteHistory.add(toLocalDateString(d));
        }
    }
    if (noteHistory.size > 0 && (storedStreak === 0 || Number.isNaN(storedStreak))) {
        const histSet = new Set<string>(noteHistory);
        let recalcStreak = 0;
        const checkDate = new Date();
        for (let i = 0; i < 365; i++) {
            if (histSet.has(toLocalDateString(checkDate))) {
                recalcStreak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }
        if (recalcStreak > 0) {
            ctx.setCurrentStreak(recalcStreak);
            await setSetting('CURRENT_STREAK', String(recalcStreak));
        }
    }

    perfMark('storage.done');
    perfLog();
}

/* ═══════════════════════════════════════════════════════════════════════════
   CROSS-CUTTING OPERATIONS (using repositories)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * NON-DESTRUCTIVE diagnostic: list every key in AsyncStorage with size.
 * Does NOT delete or write anything. Safe to run repeatedly.
 */
export async function inspectAsyncStorage(): Promise<{ keys: string[]; keySizes: Record<string, number>; maybeJson: Record<string, { length: number; sample: string }> }> {
    const keys = await storage.getAllKeys();
    const allPairs = await storage.multiGet(keys);
    const keySizes: Record<string, number> = {};
    const maybeJson: Record<string, { length: number; sample: string }> = {};

    for (const [key, val] of allPairs) {
        const size = val ? val.length : 0;
        keySizes[key] = size;
        if (val && (val.startsWith('[') || val.startsWith('{'))) {
            try {
                const parsed = JSON.parse(val);
                const length = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
                maybeJson[key] = { length, sample: val.substring(0, 200) };
            } catch {
                maybeJson[key] = { length: 0, sample: val.substring(0, 200) };
            }
        }
    }
    return { keys, keySizes, maybeJson };
}

/**
 * SAFE recovery: attempt to read AsyncStorage WITHOUT wiping SQLite first.
 * NULL values are handled by sanitizeBindParams() in db.ts (sparse-array holes
 * that normalizeParams.reduce() skips, resulting in SQL NULL via sqlite3_clear_bindings).
 * Returns detailed error log if any insertion fails.
 */
export async function safeReMigrateAsyncStorage(): Promise<{ notesRecovered: number; personsRecovered: number; vlogsRecovered: number; skipped: boolean; errors: string[] }> {
    logger('info', 'Migration', 'Starting safe re-migration from AsyncStorage (non-destructive)');

    const rawNotes = await storage.getItem('SAVED_NOTES');
    const rawPersons = await storage.getItem('SAVED_PERSONS');
    const rawVlogs = await storage.getItem('SAVED_VLOGS');

    interface LegacyNote extends SavedNote {
        aiProcessing?: unknown;
    }

    let legacyNotes: LegacyNote[] = [];
    let legacyPersons: Person[] = [];
    let legacyVlogs: SavedVlog[] = [];

    try { if (rawNotes) legacyNotes = JSON.parse(rawNotes); } catch { /**/ }
    try { if (rawPersons) legacyPersons = JSON.parse(rawPersons); } catch { /**/ }
    try { if (rawVlogs) legacyVlogs = JSON.parse(rawVlogs); } catch { /**/ }

    if (legacyNotes.length === 0 && legacyPersons.length === 0 && legacyVlogs.length === 0) {
        return { notesRecovered: 0, personsRecovered: 0, vlogsRecovered: 0, skipped: true, errors: [] };
    }

    const errors: string[] = [];
    let notesRecovered = 0;
    let personsRecovered = 0;
    let vlogsRecovered = 0;

    // INSERT notes with raw SQL and explicit defaults — bypasses any type-guard bugs
    for (const n of legacyNotes) {
        try {
            const safeNote: Record<string, unknown> = (n as unknown) as Record<string, unknown>;
            const rawSummary = safeNote.aiSummary;
            const summaryJson = Array.isArray(rawSummary) ? JSON.stringify(rawSummary) : (rawSummary ? JSON.stringify(rawSummary) : null);
            const alignScore = (n as AlignmentReflection).alignmentScore ?? 0;
            const stopT = (n as AlignmentReflection).stopText ?? '';
            const startT = (n as AlignmentReflection).startText ?? '';
            const contT = (n as AlignmentReflection).continueText ?? '';
            const ts = typeof safeNote.timestamp === 'number' ? safeNote.timestamp : Date.now();

            await run(
                `INSERT INTO notes (id, text, date_str, timestamp, duration_min, won, person_id, is_quick_note, ai_title, ai_summary, ai_model_used, is_alignment_reflection, alignment_score, stop_text, start_text, continue_text)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    (safeNote.id ?? '') as string,
                    (safeNote.text ?? '') as string,
                    (safeNote.dateStr ?? new Date(ts).toISOString()) as string,
                    (typeof safeNote.timestamp === 'number' ? safeNote.timestamp : Date.now()),
                    (typeof safeNote.durationMin === 'number' ? safeNote.durationMin : 0),
                    safeNote.won ? 1 : 0,
                    (safeNote.personId ?? null) as string | null,
                    safeNote.isQuickNote ? 1 : 0,
                    (safeNote.aiTitle ?? null) as string | null,
                    (summaryJson ?? null) as string | null,
                    (safeNote.aiModelUsed ?? null) as string | null,
                    safeNote.isAlignmentReflection ? 1 : 0,
                    safeNote.isAlignmentReflection ? (alignScore ?? 0) : null,
                    safeNote.isAlignmentReflection ? (stopT ?? '') : null,
                    safeNote.isAlignmentReflection ? (startT ?? '') : null,
                    safeNote.isAlignmentReflection ? (contT ?? '') : null,
                ]
            );
            notesRecovered++;
        } catch (err: unknown) {
            const msg = typeof err === 'object' && err !== null && 'message' in err ? String((err as { message: string }).message) : String(err);
            errors.push(`Note ${n.id}: ${msg}`);
        }
    }

    // INSERT persons
    for (const p of legacyPersons) {
        try {
            const safeP: Record<string, unknown> = (p as unknown) as Record<string, unknown>;
            await run(
                `INSERT INTO persons (id, name, created_at, nickname, relationship, birthday, bio, custom_relationships)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    (safeP.id ?? '') as string,
                    (safeP.name ?? '') as string,
                    (typeof safeP.createdAt === 'number' ? safeP.createdAt : Date.now()),
                    (safeP.nickname ?? null) as string | null,
                    (safeP.relationship ?? null) as string | null,
                    (safeP.birthday ?? null) as string | null,
                    (safeP.bio ?? null) as string | null,
                    Array.isArray(safeP.customRelationships) ? JSON.stringify(safeP.customRelationships) : null,
                ]
            );
            personsRecovered++;
        } catch (err: unknown) {
            const msg = typeof err === 'object' && err !== null && 'message' in err ? String((err as { message: string }).message) : String(err);
            errors.push(`Person ${p.id}: ${msg}`);
        }
    }

    // INSERT vlogs
    for (const v of legacyVlogs) {
        try {
            const safeV: Record<string, unknown> = (v as unknown) as Record<string, unknown>;
            await run(
                `INSERT INTO vlogs (id, file_path, date_str, timestamp, duration_sec, file_size_bytes, thumbnail_path, compression_preset, original_file_size_bytes, compression_pending)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    (safeV.id ?? '') as string,
                    (safeV.filePath ?? '') as string,
                    (safeV.dateStr ?? '') as string,
                    (typeof safeV.timestamp === 'number' ? safeV.timestamp : Date.now()),
                    (typeof safeV.durationSec === 'number' ? safeV.durationSec : 0),
                    (typeof safeV.fileSizeBytes === 'number' ? safeV.fileSizeBytes : 0),
                    (safeV.thumbnailPath ?? null) as string | null,
                    (safeV.compressionPreset ?? null) as string | null,
                    (typeof safeV.originalFileSizeBytes === 'number' ? safeV.originalFileSizeBytes : null),
                    safeV.compressionPending ? 1 : 0,
                ]
            );
            vlogsRecovered++;
        } catch (err: unknown) {
            const msg = typeof err === 'object' && err !== null && 'message' in err ? String((err as { message: string }).message) : String(err);
            errors.push(`Vlog ${v.id}: ${msg}`);
        }
    }

    return { notesRecovered, personsRecovered, vlogsRecovered, skipped: false, errors };
}

/**
 * Export ALL AsyncStorage data to a shareable JSON file.
 * This lets users save their data externally so we can troubleshoot
 * migration issues with the actual data structure.
 * Writes to cache dir then uses Share API to let user pick destination.
 * Returns the file URI on success.
 */
export async function exportAsyncStorageToFile(): Promise<{ filePath: string; fileSizeKB: number; keyCount: number }> {
    const keys = await storage.getAllKeys();
    const allPairs = await storage.multiGet(keys);

    const exportData: Record<string, unknown> = {};
    for (const [key, val] of allPairs) {
        if (val === null) {
            exportData[key] = null;
            continue;
        }
        try {
            exportData[key] = JSON.parse(val);
        } catch {
            exportData[key] = val;
        }
    }

    const jsonStr = JSON.stringify(exportData, null, 2);
    const fileName = `asyncstorage_export_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const filePath = FileSystem.cacheDirectory + fileName;

    await FileSystem.writeAsStringAsync(filePath, jsonStr, { encoding: FileSystem.EncodingType.UTF8 });

    const fileInfo = await FileSystem.getInfoAsync(filePath);
    const sizeBytes = fileInfo.exists && 'size' in fileInfo && typeof fileInfo.size === 'number' ? fileInfo.size : jsonStr.length;

    try {
        // On Android, file:// URIs cannot be shared without a FileProvider (requires expo-sharing).
        // Since expo-sharing has peer-dependency conflicts, we share the raw JSON text directly.
        // For ~268 KB this fits comfortably in the intent text field for email/notes/telegram/WhatsApp.
        await Share.share({
            message: jsonStr,
            title: 'AsyncStorage Export',
        });
    } catch (err) {
        logger('warn', 'Export', 'Share dialog failed, file still available at:', filePath, err);
    }

    return { filePath, fileSizeKB: Math.round(sizeBytes / 1024), keyCount: keys.length };
}
