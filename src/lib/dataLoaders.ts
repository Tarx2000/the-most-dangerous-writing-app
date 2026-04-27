import { Alert } from 'react-native';
import { vibrate } from '@/lib/haptics';
import { logger } from '@/lib/logger';
import { storage } from '@/lib/storage';
import { getDb, getAll } from '@/lib/db';
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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   MIGRATION FROM AsyncStorage TO SQLite
   Run once per device. After success, AsyncStorage data keys are cleared.
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

const MIGRATION_DONE_KEY = '__MIGRATED_TO_SQLITE_V2__';

interface LegacyNote extends SavedNote {
    aiProcessing?: unknown;
}

export async function migrateAsyncStorageToSqlite(): Promise<void> {
    const alreadyDone = await storage.getItem(MIGRATION_DONE_KEY);
    if (alreadyDone === 'true') return;

    try {
        const rawNotes = await storage.getItem('SAVED_NOTES');
        const rawPersons = await storage.getItem('SAVED_PERSONS');
        const rawVlogs = await storage.getItem('SAVED_VLOGS');

        // Migrate notes (strip deprecated aiProcessing field inline)
        if (rawNotes) {
            let legacyNotes: LegacyNote[] = [];
            try { legacyNotes = JSON.parse(rawNotes); } catch { /**/ }
            for (const n of legacyNotes) {
                const mutable = n as unknown as Record<string, unknown>;
                delete mutable.aiProcessing;
                await insertNote(mutable as unknown as SavedNote);
            }
        }

        // Migrate persons
        if (rawPersons) {
            let legacyPersons: Person[] = [];
            try { legacyPersons = JSON.parse(rawPersons); } catch { /**/ }
            for (const p of legacyPersons) {
                await insertPerson(p);
            }
        }

        // Migrate vlogs
        if (rawVlogs) {
            let legacyVlogs: SavedVlog[] = [];
            try { legacyVlogs = JSON.parse(rawVlogs); } catch { /**/ }
            for (const v of legacyVlogs) {
                await insertVlog(v);
            }
        }

        // Migrate simple settings
        const simpleSettings = [
            'USER_FONT_IDX', 'USER_SIZE_IDX', 'USE_BIOMETRICS',
            'CURRENT_STREAK', 'LAST_WIN_DATE', 'STREAK_HISTORY',
            'DEV_MODE', 'DEBUG_LAYOUT', 'VISION_BOARD',
            'LAST_REFLECTION_DATE', 'PREFER_PIN_AUTH', 'ENABLE_HAPTICS',
            'LOCK_TIMEOUT_MINS', 'VLOG_QUALITY', 'COMPRESSION_PRESET',
            'SAVED_NOTES', 'SAVED_PERSONS', 'SAVED_VLOGS',
            'BOOKMARKED_NOTE_IDS', 'FEED_COMMENTS', 'AUTO_PLAY_FEED_VIDEOS',
            'AUTO_GENERATE_SUMMARIES',
            AI_STORAGE_KEYS.API_KEY, AI_STORAGE_KEYS.BASE_URL,
            AI_STORAGE_KEYS.MODEL, AI_STORAGE_KEYS.GRAMMAR_MODEL,
            AI_STORAGE_KEYS.PROMPTS,
        ];

        for (const key of simpleSettings) {
            const val = await storage.getItem(key);
            if (val !== null && val !== undefined) {
                await setSetting(key, val);
            }
        }

        await storage.setItem(MIGRATION_DONE_KEY, 'true');
    } catch (err) {
        logger("error", "Migration", "Failed to migrate AsyncStorage to SQLite:", err);
    }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   SAFE JSON PARSE
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

export function safeParse<T>(key: string, raw: string | null | undefined, fallback: T): T {
    if (raw == null) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch (err) {
        logger("warn", "Storage", `Failed to parse key "${key}", using fallback:`, err);
        return fallback;
    }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   DATA LOADERS â€” One per domain, fully typed, testable
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

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

    // Ensure AsyncStorage â†’ SQLite migration has run
    await migrateAsyncStorageToSqlite();

    await loadNotes(ctx);
    await loadPersons(ctx);

    const allSettings = await getAllSettings();

    /* â”€â”€ Preferences â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

    /* â”€â”€ Streak â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    const storedStreak = parseInt(allSettings['CURRENT_STREAK'] ?? '', 10);
    ctx.setCurrentStreak(Number.isNaN(storedStreak) ? 0 : storedStreak);
    ctx.setLastWinDate(allSettings['LAST_WIN_DATE'] ?? '');

    perfMark('storage.critical');

    /* â”€â”€ Deferred data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    await loadVlogs(ctx);

    /* â”€â”€ AI Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    ctx.setAiApiKey(allSettings[AI_STORAGE_KEYS.API_KEY] ?? '');
    ctx.setAiBaseUrl(allSettings[AI_STORAGE_KEYS.BASE_URL] ?? '');
    ctx.setAiModel(allSettings[AI_STORAGE_KEYS.MODEL] ?? '');
    ctx.setAiGrammarModel(allSettings[AI_STORAGE_KEYS.GRAMMAR_MODEL] ?? '');

    const rawPrompts = safeParse<Record<string, string>>(
        'AI_PROMPTS', allSettings[AI_STORAGE_KEYS.PROMPTS], {}
    );
    ctx.setAiPrompts({ ...DEFAULT_AI_PROMPTS, ...rawPrompts });
    ctx.setAutoGenerateSummaries(safeParse('AUTO_GENERATE_SUMMARIES', allSettings['AUTO_GENERATE_SUMMARIES'], true));

    /* â”€â”€ Feed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    ctx.setBookmarkedNoteIds(safeParse<string[]>('BOOKMARKED_NOTE_IDS', allSettings['BOOKMARKED_NOTE_IDS'], []));
    ctx.setFeedComments(safeParse<Record<string, string>>('FEED_COMMENTS', allSettings['FEED_COMMENTS'], {}));
    ctx.setAutoPlayFeedVideos(safeParse('AUTO_PLAY_FEED_VIDEOS', allSettings['AUTO_PLAY_FEED_VIDEOS'], true));

    /* â”€â”€ Streak History â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

    /* â”€â”€ Recalculate streak if stale â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   CROSS-CUTTING OPERATIONS (using repositories)
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

export async function clearAllDataSqlite(): Promise<void> {
    await deleteAllNotes();
    await deleteAllPersons();
    await deleteAllVlogs();
    await (await import('@/lib/repositories/settingsRepository')).deleteAllSettings();
}
