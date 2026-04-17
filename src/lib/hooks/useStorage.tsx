/**
 * useStorage — Split-Context State Management
 *
 * Architecture:
 * Instead of one monolithic context (which re-renders EVERY consumer on ANY
 * state change), state is split into domain-specific contexts. Each context
 * value is memoized so subscribers only re-render when THEIR slice changes.
 *
 * Contexts:
 * - NotesContext     — savedNotes + CRUD operations
 * - PersonsContext   — persons + CRUD operations
 * - StreakContext     — currentStreak, lastWinDate, streakHistory (read-mostly)
 * - PreferencesContext — fonts, sizes, biometrics, devMode, visionBoard
 * - AiConfigContext  — AI API key, base URL, model, prompts + setters
 * - FeedContext      — bookmarks, comments, auto-play + setters
 * - VlogContext      — savedVlogs, storage stats + CRUD operations
 * - StorageActionsContext — cross-cutting: clearAllData, loadAllData
 *
 * Fixes applied:
 * - Stale closures → all functions use refs for fresh state reads
 * - Fire-and-forget writes → all storage calls use await + try/catch
 * - deletePerson atomicity → uses storage.multiSet
 * - clearAllData completeness → includes feed keys (excludes AI settings)
 * - ID collisions → uses generateId() instead of Date.now()
 * - Error feedback → Alert.alert for critical failures
 */

import {
    useState,
    useCallback,
    useMemo,
    useRef,
    createContext,
    useContext,
    useEffect,
    type ReactNode,
} from 'react';
import { Alert, Vibration } from 'react-native';
import { storage } from '@/lib/storage';
import { SavedNote, Person, VisionBoard, AlignmentReflection, SavedVlog } from '@/types';
import * as FileSystem from 'expo-file-system/legacy';
import { CONFIG } from '@/config';
import { generateId } from '@/lib/utils';
import { cleanupOrphanedVlogs as cleanupOrphanFiles, formatStorageSize } from '@/lib/storageManager';
import {
    DEFAULT_OLLAMA_API_KEY,
    DEFAULT_OLLAMA_BASE_URL,
    DEFAULT_OLLAMA_MODEL,
    DEFAULT_AI_PROMPTS,
    AI_STORAGE_KEYS,
    type AiPrompts,
} from '@/config/ai';

/* ═══════════════════════════════════════════════════════════════════════════
   CONTEXT TYPE DEFINITIONS
   ═══════════════════════════════════════════════════════════════════════════ */

/** Notes domain — high-frequency updates (AI processing, saves, deletes) */
interface NotesContextType {
    savedNotes: SavedNote[];
    saveNote: (note: SavedNote) => Promise<{ streakIncreased: boolean; newStreak: number }>;
    deleteNote: (id: string) => Promise<void>;
    updateNote: (id: string, updates: Partial<SavedNote>) => Promise<void>;
    clearAllAiMetadata: () => Promise<void>;
}

/** Persons domain — low-frequency updates */
interface PersonsContextType {
    persons: Person[];
    addPerson: (name: string) => Promise<string | null>;
    deletePerson: (id: string) => Promise<void>;
    updatePerson: (id: string, updates: Partial<Person>) => Promise<void>;
}

/** Streak domain — updated only on successful note saves */
interface StreakContextType {
    currentStreak: number;
    lastWinDate: string;
    streakHistory: string[];
}

/** Preferences — very low-frequency (settings changes) */
interface PreferencesContextType {
    fontIndex: number;
    sizeIndex: number;
    useBiometrics: boolean;
    devMode: boolean;
    visionBoard: VisionBoard | null;
    lastReflectionDate: number | null;
    savePreferences: (fIdx: number, sIdx: number) => Promise<void>;
    updateBiometricsPref: (val: boolean) => Promise<void>;
    toggleDevMode: () => Promise<void>;
    saveVisionBoard: (board: VisionBoard) => Promise<void>;
}

/** AI Configuration — almost never changes */
interface AiConfigContextType {
    aiApiKey: string;
    aiBaseUrl: string;
    aiModel: string;
    aiGrammarModel: string;
    aiPrompts: AiPrompts;
    saveAiApiKey: (key: string) => Promise<void>;
    saveAiBaseUrl: (url: string) => Promise<void>;
    saveAiModel: (model: string) => Promise<void>;
    saveAiGrammarModel: (model: string) => Promise<void>;
    saveAiPrompts: (prompts: AiPrompts) => Promise<void>;
}

/** Feed features — medium-frequency (bookmark toggles, comments) */
interface FeedContextType {
    bookmarkedNoteIds: string[];
    feedComments: Record<string, string>;
    autoPlayFeedVideos: boolean;
    toggleBookmark: (noteId: string) => Promise<void>;
    saveFeedComment: (noteId: string, comment: string) => Promise<void>;
    toggleAutoPlayFeedVideos: (enabled: boolean) => Promise<void>;
}

/** Vlogs — low-frequency */
interface VlogContextType {
    savedVlogs: SavedVlog[];
    totalVlogStorageBytes: number;
    saveVlog: (vlog: SavedVlog) => Promise<{ streakIncreased: boolean; newStreak: number }>;
    deleteVlog: (id: string) => Promise<void>;
    updateVlog: (id: string, patch: Partial<SavedVlog>) => Promise<void>;
    /** Clean up orphaned vlog files on disk that have no metadata entry */
    cleanupOrphanedVlogs: () => Promise<number>;
    /** Get a summary of storage usage across all domains */
    getStorageSummary: () => { vlogCount: number; vlogBytes: number; noteCount: number; personCount: number };
}

/** Cross-cutting storage operations */
interface StorageActionsContextType {
    clearAllData: () => Promise<void>;
    saveAlignmentReflection: (reflection: AlignmentReflection) => Promise<{ streakIncreased: boolean; newStreak: number }>;
    loadAllData: () => Promise<void>;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONTEXT CREATION
   ═══════════════════════════════════════════════════════════════════════════ */

const NotesContext = createContext<NotesContextType | null>(null);
const PersonsContext = createContext<PersonsContextType | null>(null);
const StreakContext = createContext<StreakContextType | null>(null);
const PreferencesContext = createContext<PreferencesContextType | null>(null);
const AiConfigContext = createContext<AiConfigContextType | null>(null);
const FeedContext = createContext<FeedContextType | null>(null);
const VlogContext = createContext<VlogContextType | null>(null);
const StorageActionsContext = createContext<StorageActionsContextType | null>(null);

/* ═══════════════════════════════════════════════════════════════════════════
   STORAGE PROVIDER
   ═══════════════════════════════════════════════════════════════════════════ */

export const StorageProvider = ({ children }: { children: ReactNode }) => {
    /* ── State: Notes ──────────────────────────────────────────────────── */
    const [savedNotes, setSavedNotes] = useState<SavedNote[]>([]);

    /* ── State: Persons ────────────────────────────────────────────────── */
    const [persons, setPersons] = useState<Person[]>([]);

    /* ── State: Streak ─────────────────────────────────────────────────── */
    const [currentStreak, setCurrentStreak] = useState<number>(0);
    const [lastWinDate, setLastWinDate] = useState<string>('');
    const [streakHistory, setStreakHistory] = useState<string[]>([]);

    /* ── State: Preferences ────────────────────────────────────────────── */
    const [fontIndex, setFontIndex] = useState(0);
    const [sizeIndex, setSizeIndex] = useState(1);
    const [useBiometrics, setUseBiometrics] = useState<boolean>(true);
    const [devMode, setDevMode] = useState<boolean>(false);
    const [visionBoard, setVisionBoard] = useState<VisionBoard | null>(null);
    const [lastReflectionDate, setLastReflectionDate] = useState<number | null>(null);

    /* ── State: Vlogs ──────────────────────────────────────────────────── */
    const [savedVlogs, setSavedVlogs] = useState<SavedVlog[]>([]);
    const [totalVlogStorageBytes, setTotalVlogStorageBytes] = useState<number>(0);

    /* ── State: Feed ───────────────────────────────────────────────────── */
    const [bookmarkedNoteIds, setBookmarkedNoteIds] = useState<string[]>([]);
    const [feedComments, setFeedComments] = useState<Record<string, string>>({});
    const [autoPlayFeedVideos, setAutoPlayFeedVideos] = useState<boolean>(true);

    /* ── State: AI Config ──────────────────────────────────────────────── */
    const [aiApiKey, setAiApiKey] = useState<string>(DEFAULT_OLLAMA_API_KEY);
    const [aiBaseUrl, setAiBaseUrl] = useState<string>(DEFAULT_OLLAMA_BASE_URL);
    const [aiModel, setAiModel] = useState<string>(DEFAULT_OLLAMA_MODEL);
    const [aiGrammarModel, setAiGrammarModel] = useState<string>(DEFAULT_OLLAMA_MODEL);
    const [aiPrompts, setAiPrompts] = useState<AiPrompts>({ ...DEFAULT_AI_PROMPTS });

    /* ══════════════════════════════════════════════════════════════════════
       REFS — Fresh-read pattern to eliminate stale closures.
       Each ref mirrors its corresponding state. Functions read refs instead
       of closing over state, so they always see the latest value even if
       React hasn't re-rendered yet.
       ══════════════════════════════════════════════════════════════════════ */
    const savedNotesRef = useRef(savedNotes);
    savedNotesRef.current = savedNotes;
    const personsRef = useRef(persons);
    personsRef.current = persons;
    const currentStreakRef = useRef(currentStreak);
    currentStreakRef.current = currentStreak;
    const lastWinDateRef = useRef(lastWinDate);
    lastWinDateRef.current = lastWinDate;
    const streakHistoryRef = useRef(streakHistory);
    streakHistoryRef.current = streakHistory;
    const savedVlogsRef = useRef(savedVlogs);
    savedVlogsRef.current = savedVlogs;
    const devModeRef = useRef(devMode);
    devModeRef.current = devMode;
    const bookmarkedNoteIdsRef = useRef(bookmarkedNoteIds);
    bookmarkedNoteIdsRef.current = bookmarkedNoteIds;
    const feedCommentsRef = useRef(feedComments);
    feedCommentsRef.current = feedComments;
    const fontIndexRef = useRef(fontIndex);
    fontIndexRef.current = fontIndex;
    const sizeIndexRef = useRef(sizeIndex);
    sizeIndexRef.current = sizeIndex;
    const useBiometricsRef = useRef(useBiometrics);
    useBiometricsRef.current = useBiometrics;
    const visionBoardRef = useRef(visionBoard);
    visionBoardRef.current = visionBoard;
    const aiApiKeyRef = useRef(aiApiKey);
    aiApiKeyRef.current = aiApiKey;
    const aiBaseUrlRef = useRef(aiBaseUrl);
    aiBaseUrlRef.current = aiBaseUrl;
    const aiModelRef = useRef(aiModel);
    aiModelRef.current = aiModel;
    const aiGrammarModelRef = useRef(aiGrammarModel);
    aiGrammarModelRef.current = aiGrammarModel;
    const aiPromptsRef = useRef(aiPrompts);
    aiPromptsRef.current = aiPrompts;
    const autoPlayFeedVideosRef = useRef(autoPlayFeedVideos);
    autoPlayFeedVideosRef.current = autoPlayFeedVideos;
    const totalVlogStorageBytesRef = useRef(totalVlogStorageBytes);
    totalVlogStorageBytesRef.current = totalVlogStorageBytes;

    /* ══════════════════════════════════════════════════════════════════════
       DATA LOADING — Centralized load from storage on app start
       ══════════════════════════════════════════════════════════════════════ */

    /**
     * Safely parse JSON from AsyncStorage. Returns fallback on parse error.
     * Logs a warning so corrupted keys are discoverable without crashing the app.
     */
    const safeParse = <T extends unknown>(key: string, raw: string | null | undefined, fallback: T): T => {
        if (raw == null) return fallback;
        try {
            return JSON.parse(raw) as T;
        } catch (err) {
            console.warn(`[Storage] Failed to parse key "${key}", using fallback:`, err);
            return fallback;
        }
    };

    const loadAllData = useCallback(async () => {
        const keys = [
            'SAVED_NOTES', 'SAVED_PERSONS', 'USER_FONT_IDX', 'USER_SIZE_IDX',
            'USE_BIOMETRICS', 'CURRENT_STREAK', 'LAST_WIN_DATE', 'STREAK_HISTORY',
            'DEV_MODE', 'VISION_BOARD', 'LAST_REFLECTION_DATE', 'SAVED_VLOGS',
            'BOOKMARKED_NOTE_IDS', 'FEED_COMMENTS', 'AUTO_PLAY_FEED_VIDEOS',
            AI_STORAGE_KEYS.API_KEY, AI_STORAGE_KEYS.BASE_URL,
            AI_STORAGE_KEYS.MODEL, AI_STORAGE_KEYS.GRAMMAR_MODEL,
            AI_STORAGE_KEYS.PROMPTS,
        ];
        const results = await storage.multiGet(keys);
        const data: Record<string, string | null> = Object.fromEntries(results);

        /* ── Notes (with migration to strip deprecated aiProcessing field) ── */
        let loadedNotes: SavedNote[] = [];
        if (data['SAVED_NOTES']) {
            loadedNotes = safeParse<SavedNote[]>('SAVED_NOTES', data['SAVED_NOTES'], []);
            const hadStale = (loadedNotes as any[]).some((n: any) => 'aiProcessing' in n);
            if (hadStale) {
                loadedNotes = (loadedNotes as any[]).map(({ aiProcessing: _, ...rest }: any) => rest) as SavedNote[];
                await storage.setItem('SAVED_NOTES', JSON.stringify(loadedNotes));
                console.log('[Storage] Stripped deprecated aiProcessing fields from notes');
            }
            setSavedNotes(loadedNotes);
            savedNotesRef.current = loadedNotes;
        }

        /* ── Persons ───────────────────────────────────────────────── */
        if (data['SAVED_PERSONS']) {
            const loaded = safeParse<Person[]>('SAVED_PERSONS', data['SAVED_PERSONS'], []);
            setPersons(loaded);
            personsRef.current = loaded;
        }

        /* ── Preferences ───────────────────────────────────────────── */
        if (data['USER_FONT_IDX'] !== null) {
            const parsed = parseInt(data['USER_FONT_IDX']!, 10);
            if (!isNaN(parsed)) { setFontIndex(parsed); fontIndexRef.current = parsed; }
        }
        if (data['USER_SIZE_IDX'] !== null) {
            const parsed = parseInt(data['USER_SIZE_IDX']!, 10);
            if (!isNaN(parsed)) { setSizeIndex(parsed); sizeIndexRef.current = parsed; }
        }
        if (data['USE_BIOMETRICS'] !== null) {
            const val = safeParse('USE_BIOMETRICS', data['USE_BIOMETRICS'], false);
            setUseBiometrics(val);
            useBiometricsRef.current = val;
        }
        if (data['DEV_MODE'] !== null) {
            const val = safeParse('DEV_MODE', data['DEV_MODE'] || 'false', false);
            setDevMode(val);
            devModeRef.current = val;
        }
        if (data['VISION_BOARD']) {
            const val = safeParse<VisionBoard>('VISION_BOARD', data['VISION_BOARD'], { health: '', career: '', relationships: '', mindset: '' });
            setVisionBoard(val);
            visionBoardRef.current = val;
        }
        if (data['LAST_REFLECTION_DATE']) setLastReflectionDate(parseInt(data['LAST_REFLECTION_DATE']!, 10));

        /* ── Streak ────────────────────────────────────────────────── */
        if (data['CURRENT_STREAK'] !== null) {
            const val = parseInt(data['CURRENT_STREAK']!, 10);
            setCurrentStreak(val);
            currentStreakRef.current = val;
        }
        if (data['LAST_WIN_DATE']) {
            setLastWinDate(data['LAST_WIN_DATE']!);
            lastWinDateRef.current = data['LAST_WIN_DATE']!;
        }

        /* ── Vlogs ─────────────────────────────────────────────────── */
        if (data['SAVED_VLOGS']) {
            const vlogs = safeParse<SavedVlog[]>('SAVED_VLOGS', data['SAVED_VLOGS'], []);
            setSavedVlogs(vlogs);
            savedVlogsRef.current = vlogs;
            const totalBytes = vlogs.reduce((sum, v) => sum + (v.fileSizeBytes || 0), 0);
            setTotalVlogStorageBytes(totalBytes);
            totalVlogStorageBytesRef.current = totalBytes;
        }

        /* ── AI Config ─────────────────────────────────────────────── */
        if (data[AI_STORAGE_KEYS.API_KEY]) {
            setAiApiKey(data[AI_STORAGE_KEYS.API_KEY]!);
            aiApiKeyRef.current = data[AI_STORAGE_KEYS.API_KEY]!;
        }
        if (data[AI_STORAGE_KEYS.BASE_URL]) {
            setAiBaseUrl(data[AI_STORAGE_KEYS.BASE_URL]!);
            aiBaseUrlRef.current = data[AI_STORAGE_KEYS.BASE_URL]!;
        }
        if (data[AI_STORAGE_KEYS.MODEL]) {
            setAiModel(data[AI_STORAGE_KEYS.MODEL]!);
            aiModelRef.current = data[AI_STORAGE_KEYS.MODEL]!;
        }
        if (data[AI_STORAGE_KEYS.GRAMMAR_MODEL]) {
            setAiGrammarModel(data[AI_STORAGE_KEYS.GRAMMAR_MODEL]!);
            aiGrammarModelRef.current = data[AI_STORAGE_KEYS.GRAMMAR_MODEL]!;
        }
        if (data[AI_STORAGE_KEYS.PROMPTS]) {
            const parsed = safeParse<Record<string, string>>('AI_PROMPTS', data[AI_STORAGE_KEYS.PROMPTS], {});
            const merged = { ...DEFAULT_AI_PROMPTS, ...parsed };
            setAiPrompts(merged);
            aiPromptsRef.current = merged;
        }

        /* ── Feed ──────────────────────────────────────────────────── */
        if (data['BOOKMARKED_NOTE_IDS']) {
            const loaded = safeParse<string[]>('BOOKMARKED_NOTE_IDS', data['BOOKMARKED_NOTE_IDS'], []);
            setBookmarkedNoteIds(loaded);
            bookmarkedNoteIdsRef.current = loaded;
        }
        if (data['FEED_COMMENTS']) {
            const loaded = safeParse<Record<string, string>>('FEED_COMMENTS', data['FEED_COMMENTS'], {});
            setFeedComments(loaded);
            feedCommentsRef.current = loaded;
        }
        if (data['AUTO_PLAY_FEED_VIDEOS'] !== null && data['AUTO_PLAY_FEED_VIDEOS'] !== undefined) {
            const val = safeParse('AUTO_PLAY_FEED_VIDEOS', data['AUTO_PLAY_FEED_VIDEOS'], true);
            setAutoPlayFeedVideos(val);
            autoPlayFeedVideosRef.current = val;
        }

        /* ── Streak History (load or backfill) ─────────────────────── */
        let loadedHistory: string[] = [];
        if (data['STREAK_HISTORY']) {
            loadedHistory = safeParse<string[]>('STREAK_HISTORY', data['STREAK_HISTORY'], []);
            setStreakHistory(loadedHistory);
            streakHistoryRef.current = loadedHistory;
        } else {
            const historySet = new Set<string>();
            loadedNotes.forEach(n => {
                if (n.won && n.durationMin >= 3 && !n.isQuickNote) {
                    const d = new Date(n.timestamp);
                    historySet.add(d.toISOString().slice(0, 10));
                }
            });
            loadedHistory = Array.from(historySet);
            setStreakHistory(loadedHistory);
            streakHistoryRef.current = loadedHistory;
            await storage.setItem('STREAK_HISTORY', JSON.stringify(loadedHistory));
        }

        /* ── Recalculate streak if stored value is stale ───────────── */
        const storedStreak = data['CURRENT_STREAK'] ? parseInt(data['CURRENT_STREAK']!, 10) : 0;
        if (loadedHistory.length > 0 && storedStreak === 0) {
            const histSet = new Set<string>(loadedHistory);
            let recalcStreak = 0;
            const checkDate = new Date();
            for (let i = 0; i < 365; i++) {
                const key = checkDate.toISOString().slice(0, 10);
                if (histSet.has(key)) {
                    recalcStreak++;
                    checkDate.setDate(checkDate.getDate() - 1);
                } else {
                    break;
                }
            }
            if (recalcStreak > 0) {
                setCurrentStreak(recalcStreak);
                currentStreakRef.current = recalcStreak;
                await storage.setItem('CURRENT_STREAK', recalcStreak.toString());
            }
        }
    }, []);

    /** Load once on mount */
    useEffect(() => { loadAllData(); }, [loadAllData]);

    /* ══════════════════════════════════════════════════════════════════════
       NOTES OPERATIONS
       All functions use refs → no stale closures.
       All storage writes are awaited → no fire-and-forget.
       ══════════════════════════════════════════════════════════════════════ */

    /**
     * Save a new note and update streak if applicable.
     * Uses refs for ALL state reads to prevent stale closure bugs.
     * Persists notes + streak atomically via multiSet.
     * On storage failure, rolls back all in-memory state changes.
     */
    const saveNote = useCallback(async (note: SavedNote): Promise<{ streakIncreased: boolean; newStreak: number }> => {
        // Snapshot current state for rollback
        const prevNotes = savedNotesRef.current;
        const prevStreak = currentStreakRef.current;
        const prevLastWinDate = lastWinDateRef.current;
        const prevHistory = [...streakHistoryRef.current];

        // Read current values from refs (always fresh)
        let updatedStreak = currentStreakRef.current;
        let streakIncreased = false;
        let newLastWinDate = lastWinDateRef.current;
        let newHistory = [...streakHistoryRef.current];

        // ── Streak logic ──
        if (note.won && note.durationMin >= 3 && !note.isQuickNote) {
            const todayStr = new Date().toISOString().slice(0, 10);
            const calDateStr = todayStr;

            if (!newHistory.includes(calDateStr)) {
                newHistory.push(calDateStr);
            }

            if (newLastWinDate !== todayStr) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toISOString().slice(0, 10);

                if (newLastWinDate === yesterdayStr) {
                    updatedStreak += 1;
                    streakIncreased = true;
                } else {
                    updatedStreak = 1;
                    if (currentStreakRef.current === 0) streakIncreased = true;
                }
                newLastWinDate = todayStr;
            }

            // Update refs immediately so rapid saves see fresh values
            currentStreakRef.current = updatedStreak;
            lastWinDateRef.current = newLastWinDate;
            streakHistoryRef.current = newHistory;

            // Update React state
            setCurrentStreak(updatedStreak);
            setLastWinDate(newLastWinDate);
            setStreakHistory(newHistory);
        }

        // Compute updated notes array
        const updatedNotes = [note, ...savedNotesRef.current];
        savedNotesRef.current = updatedNotes;
        setSavedNotes(updatedNotes);

        // ── Persist atomically ──
        try {
            const writes: [string, string][] = [
                ['SAVED_NOTES', JSON.stringify(updatedNotes)],
            ];
            if (note.won && note.durationMin >= 3 && !note.isQuickNote) {
                writes.push(
                    ['CURRENT_STREAK', updatedStreak.toString()],
                    ['LAST_WIN_DATE', newLastWinDate],
                    ['STREAK_HISTORY', JSON.stringify(newHistory)],
                );
            }
            await storage.multiSet(writes);
        } catch (error) {
            console.error('[Storage] Failed to save note:', error);
            Vibration.vibrate([0, 500]);
            // Rollback all state changes
            savedNotesRef.current = prevNotes;
            setSavedNotes(prevNotes);
            currentStreakRef.current = prevStreak;
            setCurrentStreak(prevStreak);
            lastWinDateRef.current = prevLastWinDate;
            setLastWinDate(prevLastWinDate);
            streakHistoryRef.current = prevHistory;
            setStreakHistory(prevHistory);
        }

        return { streakIncreased, newStreak: updatedStreak };
    }, []);

    /** Delete a note by ID */
    const deleteNote = useCallback(async (id: string) => {
        const prevNotes = savedNotesRef.current;
        const updatedNotes = prevNotes.filter(n => n.id !== id);
        savedNotesRef.current = updatedNotes;
        setSavedNotes(updatedNotes);

        try {
            await storage.setItem('SAVED_NOTES', JSON.stringify(updatedNotes));
        } catch (error) {
            console.error('[Storage] Failed to delete note:', error);
            Vibration.vibrate([0, 500]);
            savedNotesRef.current = prevNotes;
            setSavedNotes(prevNotes);
        }
    }, []);

    /** Update an existing note's fields (e.g. AI-generated title, summary) */
    const updateNote = useCallback(async (id: string, updates: Partial<SavedNote>) => {
        const prevNotes = savedNotesRef.current;
        const updatedNotes = prevNotes.map(n =>
            n.id === id ? { ...n, ...updates } : n
        );
        savedNotesRef.current = updatedNotes;
        setSavedNotes(updatedNotes);

        try {
            await storage.setItem('SAVED_NOTES', JSON.stringify(updatedNotes));
        } catch (error) {
            console.error('[Storage] Failed to update note:', error);
            savedNotesRef.current = prevNotes;
            setSavedNotes(prevNotes);
        }
    }, []);

    /** Remove AI-generated titles, summaries, and model info from all notes */
    const clearAllAiMetadata = useCallback(async () => {
        const prevNotes = savedNotesRef.current;
        const updatedNotes = prevNotes.map(n => ({
            ...n,
            aiTitle: undefined,
            aiSummary: undefined,
            aiModelUsed: undefined,
        }));
        savedNotesRef.current = updatedNotes;
        setSavedNotes(updatedNotes);

        try {
            await storage.setItem('SAVED_NOTES', JSON.stringify(updatedNotes));
        } catch (error) {
            console.error('[Storage] Failed to clear AI metadata:', error);
            savedNotesRef.current = prevNotes;
            setSavedNotes(prevNotes);
        }
    }, []);

    /* ══════════════════════════════════════════════════════════════════════
       PERSONS OPERATIONS
       ══════════════════════════════════════════════════════════════════════ */

    /** Add a new person to the Circle */
    const addPerson = useCallback(async (name: string) => {
        if (name.trim().length === 0) return null;
        const prevPersons = personsRef.current;
        const newId = generateId();
        const newPerson: Person = {
            id: newId,
            name: name.trim(),
            createdAt: Date.now(),
        };
        const updatedPersons = [newPerson, ...prevPersons];
        personsRef.current = updatedPersons;
        setPersons(updatedPersons);

        try {
            await storage.setItem('SAVED_PERSONS', JSON.stringify(updatedPersons));
        } catch (error) {
            console.error('[Storage] Failed to add person:', error);
            Vibration.vibrate([0, 500]);
            personsRef.current = prevPersons;
            setPersons(prevPersons);
        }
        return newId;
    }, []);

    /**
     * Delete a person AND unlink their notes atomically.
     * Uses storage.multiSet so both writes succeed or the error is caught.
     * Shows an Alert to the user if persistence fails.
     */
    const deletePerson = useCallback(async (id: string) => {
        const prevPersons = personsRef.current;
        const prevNotes = savedNotesRef.current;
        const updatedPersons = prevPersons.filter(p => p.id !== id);
        const updatedNotes = prevNotes.map(n =>
            n.personId === id ? { ...n, personId: undefined } : n
        );

        // Update refs + state immediately
        personsRef.current = updatedPersons;
        savedNotesRef.current = updatedNotes;
        setPersons(updatedPersons);
        setSavedNotes(updatedNotes);

        // Persist both atomically
        try {
            await storage.multiSet([
                ['SAVED_PERSONS', JSON.stringify(updatedPersons)],
                ['SAVED_NOTES', JSON.stringify(updatedNotes)],
            ]);
        } catch (error) {
            console.error('[Storage] Failed to delete person:', error);
            // Rollback state
            personsRef.current = prevPersons;
            savedNotesRef.current = prevNotes;
            setPersons(prevPersons);
            setSavedNotes(prevNotes);
            Vibration.vibrate([0, 500]);
            Alert.alert(
                'Error',
                'Failed to delete person. Please try again.',
            );
        }
    }, []);

    /** Update an existing person's profile fields */
    const updatePerson = useCallback(async (id: string, updates: Partial<Person>) => {
        const prevPersons = personsRef.current;
        const updatedPersons = prevPersons.map(p =>
            p.id === id ? { ...p, ...updates } : p
        );
        personsRef.current = updatedPersons;
        setPersons(updatedPersons);

        try {
            await storage.setItem('SAVED_PERSONS', JSON.stringify(updatedPersons));
        } catch (error) {
            console.error('[Storage] Failed to update person:', error);
            personsRef.current = prevPersons;
            setPersons(prevPersons);
        }
    }, []);

    /* ══════════════════════════════════════════════════════════════════════
       PREFERENCES & MISC OPERATIONS
       ══════════════════════════════════════════════════════════════════════ */

    const savePreferences = useCallback(async (fIdx: number, sIdx: number) => {
        const prevFont = fontIndexRef.current;
        const prevSize = sizeIndexRef.current;
        setFontIndex(fIdx);
        setSizeIndex(sIdx);
        try {
            await storage.multiSet([
                ['USER_FONT_IDX', fIdx.toString()],
                ['USER_SIZE_IDX', sIdx.toString()],
            ]);
        } catch (error) {
            console.error('[Storage] Failed to save preferences:', error);
            setFontIndex(prevFont);
            setSizeIndex(prevSize);
            fontIndexRef.current = prevFont;
            sizeIndexRef.current = prevSize;
        }
    }, []);

    const toggleDevMode = useCallback(async () => {
        const prevVal = devModeRef.current;
        const newVal = !prevVal;
        setDevMode(newVal);
        try {
            await storage.setItem('DEV_MODE', JSON.stringify(newVal));
        } catch (error) {
            console.error('[Storage] Failed to toggle dev mode:', error);
            setDevMode(prevVal);
        }
    }, []);

    const updateBiometricsPref = useCallback(async (val: boolean) => {
        const prev = useBiometricsRef.current;
        setUseBiometrics(val);
        useBiometricsRef.current = val;
        try {
            await storage.setItem('USE_BIOMETRICS', JSON.stringify(val));
        } catch (error) {
            console.error('[Storage] Failed to update biometrics pref:', error);
            setUseBiometrics(prev);
            useBiometricsRef.current = prev;
        }
    }, []);

    const saveVisionBoard = useCallback(async (newBoard: VisionBoard) => {
        const prev = visionBoardRef.current;
        setVisionBoard(newBoard);
        visionBoardRef.current = newBoard;
        try {
            await storage.setItem('VISION_BOARD', JSON.stringify(newBoard));
        } catch (error) {
            console.error('[Storage] Failed to save vision board:', error);
            setVisionBoard(prev);
            visionBoardRef.current = prev;
        }
    }, []);

    /* ══════════════════════════════════════════════════════════════════════
       AI CONFIG OPERATIONS
       ══════════════════════════════════════════════════════════════════════ */

    const saveAiApiKey = useCallback(async (key: string) => {
        const prev = aiApiKeyRef.current;
        setAiApiKey(key);
        aiApiKeyRef.current = key;
        try {
            await storage.setItem(AI_STORAGE_KEYS.API_KEY, key);
        } catch (error) {
            console.error('[Storage] Failed to save AI API key:', error);
            setAiApiKey(prev);
            aiApiKeyRef.current = prev;
        }
    }, []);

    const saveAiBaseUrl = useCallback(async (url: string) => {
        const prev = aiBaseUrlRef.current;
        setAiBaseUrl(url);
        aiBaseUrlRef.current = url;
        try {
            await storage.setItem(AI_STORAGE_KEYS.BASE_URL, url);
        } catch (error) {
            console.error('[Storage] Failed to save AI base URL:', error);
            setAiBaseUrl(prev);
            aiBaseUrlRef.current = prev;
        }
    }, []);

    const saveAiModel = useCallback(async (model: string) => {
        const prev = aiModelRef.current;
        setAiModel(model);
        aiModelRef.current = model;
        try {
            await storage.setItem(AI_STORAGE_KEYS.MODEL, model);
        } catch (error) {
            console.error('[Storage] Failed to save AI model:', error);
            setAiModel(prev);
            aiModelRef.current = prev;
        }
    }, []);

    const saveAiGrammarModel = useCallback(async (grammarModel: string) => {
        const prev = aiGrammarModelRef.current;
        setAiGrammarModel(grammarModel);
        aiGrammarModelRef.current = grammarModel;
        try {
            await storage.setItem(AI_STORAGE_KEYS.GRAMMAR_MODEL, grammarModel);
        } catch (error) {
            console.error('[Storage] Failed to save AI grammar model:', error);
            setAiGrammarModel(prev);
            aiGrammarModelRef.current = prev;
        }
    }, []);

    const saveAiPrompts = useCallback(async (prompts: AiPrompts) => {
        const prev = aiPromptsRef.current;
        setAiPrompts(prompts);
        aiPromptsRef.current = prompts;
        try {
            await storage.setItem(AI_STORAGE_KEYS.PROMPTS, JSON.stringify(prompts));
        } catch (error) {
            console.error('[Storage] Failed to save AI prompts:', error);
            setAiPrompts(prev);
            aiPromptsRef.current = prev;
        }
    }, []);

    /* ══════════════════════════════════════════════════════════════════════
       FEED OPERATIONS
       ══════════════════════════════════════════════════════════════════════ */

    const toggleBookmark = useCallback(async (noteId: string) => {
        const prev = bookmarkedNoteIdsRef.current;
        const updated = prev.includes(noteId)
            ? prev.filter(id => id !== noteId)
            : [...prev, noteId];
        bookmarkedNoteIdsRef.current = updated;
        setBookmarkedNoteIds(updated);

        try {
            await storage.setItem('BOOKMARKED_NOTE_IDS', JSON.stringify(updated));
            Vibration.vibrate([0, 20, 0, 20]);
        } catch (error) {
            console.error('[Storage] Failed to toggle bookmark:', error);
            bookmarkedNoteIdsRef.current = prev;
            setBookmarkedNoteIds(prev);
            Vibration.vibrate([0, 500]);
        }
    }, []);

    const saveFeedComment = useCallback(async (noteId: string, comment: string) => {
        const prev = feedCommentsRef.current;
        const updated = { ...prev, [noteId]: comment };
        if (!comment.trim()) delete updated[noteId];
        feedCommentsRef.current = updated;
        setFeedComments(updated);

        try {
            await storage.setItem('FEED_COMMENTS', JSON.stringify(updated));
        } catch (error) {
            console.error('[Storage] Failed to save comment:', error);
            feedCommentsRef.current = prev;
            setFeedComments(prev);
        }
    }, []);

    const toggleAutoPlayFeedVideos = useCallback(async (enabled: boolean) => {
        const prev = autoPlayFeedVideosRef.current;
        setAutoPlayFeedVideos(enabled);
        autoPlayFeedVideosRef.current = enabled;
        try {
            await storage.setItem('AUTO_PLAY_FEED_VIDEOS', JSON.stringify(enabled));
        } catch (error) {
            console.error('[Storage] Failed to toggle auto-play:', error);
            setAutoPlayFeedVideos(prev);
            autoPlayFeedVideosRef.current = prev;
        }
    }, []);

    /* ══════════════════════════════════════════════════════════════════════
       VLOG OPERATIONS
       ══════════════════════════════════════════════════════════════════════ */

    /** Save a new vlog entry. Currently does not increment streak. */
    const saveVlog = useCallback(async (vlog: SavedVlog): Promise<{ streakIncreased: boolean; newStreak: number }> => {
        const prevVlogs = savedVlogsRef.current;
        const prevBytes = totalVlogStorageBytesRef.current;
        const updatedVlogs = [vlog, ...prevVlogs];
        savedVlogsRef.current = updatedVlogs;
        setSavedVlogs(updatedVlogs);
        const newBytes = prevBytes + (vlog.fileSizeBytes || 0);
        setTotalVlogStorageBytes(newBytes);
        totalVlogStorageBytesRef.current = newBytes;

        try {
            await storage.setItem('SAVED_VLOGS', JSON.stringify(updatedVlogs));
        } catch (error) {
            console.error('[Storage] Failed to save vlog:', error);
            savedVlogsRef.current = prevVlogs;
            setSavedVlogs(prevVlogs);
            setTotalVlogStorageBytes(prevBytes);
            totalVlogStorageBytesRef.current = prevBytes;
        }

        // Streak placeholder — vlogs don't increment streak yet
        return { streakIncreased: false, newStreak: currentStreakRef.current };
    }, []);

    const deleteVlog = useCallback(async (id: string) => {
        const prevVlogs = savedVlogsRef.current;
        const vlog = prevVlogs.find(v => v.id === id);
        const updatedVlogs = prevVlogs.filter(v => v.id !== id);
        savedVlogsRef.current = updatedVlogs;
        setSavedVlogs(updatedVlogs);

        const prevBytes = totalVlogStorageBytesRef.current;
        if (vlog) {
            const newBytes = Math.max(0, prevBytes - (vlog.fileSizeBytes || 0));
            setTotalVlogStorageBytes(newBytes);
            totalVlogStorageBytesRef.current = newBytes;
            FileSystem.deleteAsync(vlog.filePath, { idempotent: true }).catch(() => {});
        }

        try {
            await storage.setItem('SAVED_VLOGS', JSON.stringify(updatedVlogs));
        } catch (error) {
            console.error('[Storage] Failed to delete vlog:', error);
            savedVlogsRef.current = prevVlogs;
            setSavedVlogs(prevVlogs);
            setTotalVlogStorageBytes(prevBytes);
            totalVlogStorageBytesRef.current = prevBytes;
            Vibration.vibrate([0, 500]);
        }
    }, []);

    const updateVlog = useCallback(async (id: string, patch: Partial<SavedVlog>) => {
        const prevVlogs = savedVlogsRef.current;
        const updatedVlogs = prevVlogs.map(v =>
            v.id === id ? { ...v, ...patch } : v
        );
        savedVlogsRef.current = updatedVlogs;
        setSavedVlogs(updatedVlogs);

        try {
            await storage.setItem('SAVED_VLOGS', JSON.stringify(updatedVlogs));
        } catch (error) {
            console.error('[Storage] Failed to update vlog:', error);
            savedVlogsRef.current = prevVlogs;
            setSavedVlogs(prevVlogs);
        }
    }, []);

    /** Clean up orphaned vlog files on disk that have no metadata entry */
    const cleanupOrphanedVlogs = useCallback(async (): Promise<number> => {
        const knownPaths = new Set(savedVlogsRef.current.map(v => v.filePath));
        return cleanupOrphanFiles(knownPaths);
    }, []);

    /** Get storage usage summary (tracking only — never auto-deletes) */
    const getStorageSummary = useCallback((): { vlogCount: number; vlogBytes: number; noteCount: number; personCount: number } => {
        return {
            vlogCount: savedVlogsRef.current.length,
            vlogBytes: savedVlogsRef.current.reduce((sum, v) => sum + (v.fileSizeBytes || 0), 0),
            noteCount: savedNotesRef.current.length,
            personCount: personsRef.current.length,
        };
    }, []);

    /* ══════════════════════════════════════════════════════════════════════
       CROSS-CUTTING OPERATIONS
       ══════════════════════════════════════════════════════════════════════ */

    /**
     * Wipe all persisted app data EXCEPT AI settings.
     * AI settings (API key, model, prompts) are intentionally preserved
     * so the user doesn't lose their configuration.
     */
    const clearAllData = useCallback(async () => {
        const allKeys = [
            'SAVED_NOTES', 'SAVED_PERSONS', 'USER_FONT_IDX', 'USER_SIZE_IDX',
            'USE_BIOMETRICS', 'CURRENT_STREAK', 'LAST_WIN_DATE', 'STREAK_HISTORY',
            'DEV_MODE', 'VISION_BOARD', 'LAST_REFLECTION_DATE', 'SAVED_VLOGS',
            'BOOKMARKED_NOTE_IDS', 'FEED_COMMENTS', 'AUTO_PLAY_FEED_VIDEOS',
        ];

        try {
            await storage.multiRemove(allKeys);
        } catch (error) {
            console.error('[Storage] Failed to clear data:', error);
        }

        // Reset all in-memory state
        setSavedNotes([]);
        savedNotesRef.current = [];
        setPersons([]);
        personsRef.current = [];
        setCurrentStreak(0);
        currentStreakRef.current = 0;
        setLastWinDate('');
        lastWinDateRef.current = '';
        setStreakHistory([]);
        streakHistoryRef.current = [];
        setFontIndex(0);
        fontIndexRef.current = 0;
        setSizeIndex(1);
        sizeIndexRef.current = 1;
        setUseBiometrics(true);
        useBiometricsRef.current = true;
        setDevMode(false);
        setVisionBoard(null);
        visionBoardRef.current = null;
        setLastReflectionDate(null);
        setSavedVlogs([]);
        savedVlogsRef.current = [];
        setTotalVlogStorageBytes(0);
        totalVlogStorageBytesRef.current = 0;
        setBookmarkedNoteIds([]);
        bookmarkedNoteIdsRef.current = [];
        setFeedComments({});
        feedCommentsRef.current = {};
        setAutoPlayFeedVideos(true);
        autoPlayFeedVideosRef.current = true;

        // Delete vlogs directory
        const vlogDir = `${FileSystem.documentDirectory}${CONFIG.VLOG_STORAGE_DIR}`;
        try { await FileSystem.deleteAsync(vlogDir, { idempotent: true }); } catch (_) {}
    }, []);

    /** Save an alignment reflection (calls saveNote + updates reflection date) */
    const saveAlignmentReflection = useCallback(async (
        reflection: AlignmentReflection
    ): Promise<{ streakIncreased: boolean; newStreak: number }> => {
        const result = await saveNote(reflection);
        const now = Date.now();
        setLastReflectionDate(now);

        try {
            await storage.setItem('LAST_REFLECTION_DATE', now.toString());
        } catch (error) {
            console.error('[Storage] Failed to save reflection date:', error);
        }

        return result;
    }, [saveNote]);

    /* ══════════════════════════════════════════════════════════════════════
       MEMOIZED CONTEXT VALUES
       Each value only creates a new reference when its specific deps change.
       Functions with [] deps are permanently stable references.
       ══════════════════════════════════════════════════════════════════════ */

    const notesValue = useMemo<NotesContextType>(() => ({
        savedNotes, saveNote, deleteNote, updateNote, clearAllAiMetadata,
    }), [savedNotes, saveNote, deleteNote, updateNote, clearAllAiMetadata]);

    const personsValue = useMemo<PersonsContextType>(() => ({
        persons, addPerson, deletePerson, updatePerson,
    }), [persons, addPerson, deletePerson, updatePerson]);

    const streakValue = useMemo<StreakContextType>(() => ({
        currentStreak, lastWinDate, streakHistory,
    }), [currentStreak, lastWinDate, streakHistory]);

    const preferencesValue = useMemo<PreferencesContextType>(() => ({
        fontIndex, sizeIndex, useBiometrics, devMode, visionBoard, lastReflectionDate,
        savePreferences, updateBiometricsPref, toggleDevMode, saveVisionBoard,
    }), [fontIndex, sizeIndex, useBiometrics, devMode, visionBoard, lastReflectionDate,
         savePreferences, updateBiometricsPref, toggleDevMode, saveVisionBoard]);

    const aiConfigValue = useMemo<AiConfigContextType>(() => ({
        aiApiKey, aiBaseUrl, aiModel, aiGrammarModel, aiPrompts,
        saveAiApiKey, saveAiBaseUrl, saveAiModel, saveAiGrammarModel, saveAiPrompts,
    }), [aiApiKey, aiBaseUrl, aiModel, aiGrammarModel, aiPrompts,
         saveAiApiKey, saveAiBaseUrl, saveAiModel, saveAiGrammarModel, saveAiPrompts]);

    const feedValue = useMemo<FeedContextType>(() => ({
        bookmarkedNoteIds, feedComments, autoPlayFeedVideos,
        toggleBookmark, saveFeedComment, toggleAutoPlayFeedVideos,
    }), [bookmarkedNoteIds, feedComments, autoPlayFeedVideos,
         toggleBookmark, saveFeedComment, toggleAutoPlayFeedVideos]);

    const vlogValue = useMemo<VlogContextType>(() => ({
        savedVlogs, totalVlogStorageBytes, saveVlog, deleteVlog, updateVlog, cleanupOrphanedVlogs, getStorageSummary,
    }), [savedVlogs, totalVlogStorageBytes, saveVlog, deleteVlog, updateVlog, cleanupOrphanedVlogs, getStorageSummary]);

    const actionsValue = useMemo<StorageActionsContextType>(() => ({
        clearAllData, saveAlignmentReflection, loadAllData,
    }), [clearAllData, saveAlignmentReflection, loadAllData]);

    /* ══════════════════════════════════════════════════════════════════════
       PROVIDER TREE — Each context wraps the next
       ══════════════════════════════════════════════════════════════════════ */

    return (
        <NotesContext.Provider value={notesValue}>
        <PersonsContext.Provider value={personsValue}>
        <StreakContext.Provider value={streakValue}>
        <PreferencesContext.Provider value={preferencesValue}>
        <AiConfigContext.Provider value={aiConfigValue}>
        <FeedContext.Provider value={feedValue}>
        <VlogContext.Provider value={vlogValue}>
        <StorageActionsContext.Provider value={actionsValue}>
            {children}
        </StorageActionsContext.Provider>
        </VlogContext.Provider>
        </FeedContext.Provider>
        </AiConfigContext.Provider>
        </PreferencesContext.Provider>
        </StreakContext.Provider>
        </PersonsContext.Provider>
        </NotesContext.Provider>
    );
};

/* ═══════════════════════════════════════════════════════════════════════════
   DOMAIN-SPECIFIC HOOKS — Use these for targeted subscriptions
   Components only re-render when THEIR specific context changes.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Subscribe to notes state + operations only */
export function useNotes(): NotesContextType {
    const ctx = useContext(NotesContext);
    if (!ctx) throw new Error('useNotes must be used within StorageProvider');
    return ctx;
}

/** Subscribe to persons state + operations only */
export function usePersons(): PersonsContextType {
    const ctx = useContext(PersonsContext);
    if (!ctx) throw new Error('usePersons must be used within StorageProvider');
    return ctx;
}

/** Subscribe to streak state only (read-mostly) */
export function useStreak(): StreakContextType {
    const ctx = useContext(StreakContext);
    if (!ctx) throw new Error('useStreak must be used within StorageProvider');
    return ctx;
}

/** Subscribe to preferences state + setters only */
export function usePreferences(): PreferencesContextType {
    const ctx = useContext(PreferencesContext);
    if (!ctx) throw new Error('usePreferences must be used within StorageProvider');
    return ctx;
}

/** Subscribe to AI configuration state + setters only */
export function useAiConfig(): AiConfigContextType {
    const ctx = useContext(AiConfigContext);
    if (!ctx) throw new Error('useAiConfig must be used within StorageProvider');
    return ctx;
}

/** Subscribe to feed features (bookmarks, comments, auto-play) only */
export function useFeedData(): FeedContextType {
    const ctx = useContext(FeedContext);
    if (!ctx) throw new Error('useFeedData must be used within StorageProvider');
    return ctx;
}

/** Subscribe to vlog state + operations only */
export function useVlogs(): VlogContextType {
    const ctx = useContext(VlogContext);
    if (!ctx) throw new Error('useVlogs must be used within StorageProvider');
    return ctx;
}

/** Subscribe to cross-cutting storage actions */
export function useStorageActions(): StorageActionsContextType {
    const ctx = useContext(StorageActionsContext);
    if (!ctx) throw new Error('useStorageActions must be used within StorageProvider');
    return ctx;
}

/* ═══════════════════════════════════════════════════════════════════════════
   @deprecated useStorage() — DO NOT USE in new code.
   This hook merges ALL 8 context values, causing re-renders on ANY state change.
   Use domain-specific hooks instead: useNotes, usePersons, useStreak, etc.
   Will be removed in a future release.
   ═══════════════════════════════════════════════════════════════════════════ */

/** @deprecated Use domain-specific hooks (useNotes, usePersons, etc.) instead. */
export function useStorage() {
    if (__DEV__) {
        console.warn('[useStorage] Deprecated: This hook subscribes to ALL contexts and causes mass re-renders. Use domain-specific hooks instead (useNotes, usePersons, useStreak, etc.).');
    }
    const notes = useNotes();
    const persons = usePersons();
    const streak = useStreak();
    const prefs = usePreferences();
    const aiConfig = useAiConfig();
    const feed = useFeedData();
    const vlogs = useVlogs();
    const actions = useStorageActions();

    return {
        ...notes,
        ...persons,
        ...streak,
        ...prefs,
        ...aiConfig,
        ...feed,
        ...vlogs,
        ...actions,
    };
}
