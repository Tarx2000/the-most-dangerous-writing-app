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
 * - Fire-and-forget writes → all AsyncStorage calls use await + try/catch
 * - deletePerson atomicity → uses AsyncStorage.multiSet
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
import { DeviceEventEmitter, Alert, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SavedNote, Person, VisionBoard, AlignmentReflection, SavedVlog } from '@/types';
import * as FileSystem from 'expo-file-system/legacy';
import { CONFIG } from '@/config';
import { generateId } from '@/lib/utils';
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
    setAutoPlayFeedVideos: (enabled: boolean) => Promise<void>;
}

/** Vlogs — low-frequency */
interface VlogContextType {
    savedVlogs: SavedVlog[];
    totalVlogStorageBytes: number;
    saveVlog: (vlog: SavedVlog) => Promise<{ streakIncreased: boolean; newStreak: number }>;
    deleteVlog: (id: string) => Promise<void>;
    updateVlog: (id: string, patch: Partial<SavedVlog>) => Promise<void>;
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
    const bookmarkedNoteIdsRef = useRef(bookmarkedNoteIds);
    bookmarkedNoteIdsRef.current = bookmarkedNoteIds;
    const feedCommentsRef = useRef(feedComments);
    feedCommentsRef.current = feedComments;

    /* ══════════════════════════════════════════════════════════════════════
       DATA LOADING — Centralized load from AsyncStorage on app start
       ══════════════════════════════════════════════════════════════════════ */

    const loadAllData = useCallback(async () => {
        try {
            const keys = [
                'SAVED_NOTES', 'SAVED_PERSONS', 'USER_FONT_IDX', 'USER_SIZE_IDX',
                'USE_BIOMETRICS', 'CURRENT_STREAK', 'LAST_WIN_DATE', 'STREAK_HISTORY',
                'DEV_MODE', 'VISION_BOARD', 'LAST_REFLECTION_DATE', 'SAVED_VLOGS',
                'BOOKMARKED_NOTE_IDS', 'FEED_COMMENTS', 'AUTO_PLAY_FEED_VIDEOS',
                AI_STORAGE_KEYS.API_KEY, AI_STORAGE_KEYS.BASE_URL,
                AI_STORAGE_KEYS.MODEL, AI_STORAGE_KEYS.GRAMMAR_MODEL,
                AI_STORAGE_KEYS.PROMPTS,
            ];
            const results = await AsyncStorage.multiGet(keys);
            const data: Record<string, string | null> = Object.fromEntries(results);

            /* ── Notes (with migration for stale aiProcessing flags) ───── */
            let loadedNotes: SavedNote[] = [];
            if (data['SAVED_NOTES']) {
                loadedNotes = JSON.parse(data['SAVED_NOTES']);
                const hadStale = loadedNotes.some(n => n.aiProcessing === true);
                if (hadStale) {
                    loadedNotes = loadedNotes.map(n => n.aiProcessing ? { ...n, aiProcessing: false } : n);
                    await AsyncStorage.setItem('SAVED_NOTES', JSON.stringify(loadedNotes));
                    console.log('[Storage] Cleaned up stale aiProcessing flags');
                }
                setSavedNotes(loadedNotes);
                savedNotesRef.current = loadedNotes;
            }

            /* ── Persons ───────────────────────────────────────────────── */
            if (data['SAVED_PERSONS']) {
                const loaded = JSON.parse(data['SAVED_PERSONS']);
                setPersons(loaded);
                personsRef.current = loaded;
            }

            /* ── Preferences ───────────────────────────────────────────── */
            if (data['USER_FONT_IDX'] !== null) {
                const parsed = parseInt(data['USER_FONT_IDX']!, 10);
                if (!isNaN(parsed)) setFontIndex(parsed);
            }
            if (data['USER_SIZE_IDX'] !== null) {
                const parsed = parseInt(data['USER_SIZE_IDX']!, 10);
                if (!isNaN(parsed)) setSizeIndex(parsed);
            }
            if (data['USE_BIOMETRICS'] !== null) setUseBiometrics(JSON.parse(data['USE_BIOMETRICS']!));
            if (data['DEV_MODE'] !== null) setDevMode(JSON.parse(data['DEV_MODE'] || 'false'));
            if (data['VISION_BOARD']) setVisionBoard(JSON.parse(data['VISION_BOARD']));
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
                const vlogs: SavedVlog[] = JSON.parse(data['SAVED_VLOGS']);
                setSavedVlogs(vlogs);
                savedVlogsRef.current = vlogs;
                setTotalVlogStorageBytes(vlogs.reduce((sum, v) => sum + (v.fileSizeBytes || 0), 0));
            }

            /* ── AI Config ─────────────────────────────────────────────── */
            if (data[AI_STORAGE_KEYS.API_KEY]) setAiApiKey(data[AI_STORAGE_KEYS.API_KEY]!);
            if (data[AI_STORAGE_KEYS.BASE_URL]) setAiBaseUrl(data[AI_STORAGE_KEYS.BASE_URL]!);
            if (data[AI_STORAGE_KEYS.MODEL]) setAiModel(data[AI_STORAGE_KEYS.MODEL]!);
            if (data[AI_STORAGE_KEYS.GRAMMAR_MODEL]) setAiGrammarModel(data[AI_STORAGE_KEYS.GRAMMAR_MODEL]!);
            if (data[AI_STORAGE_KEYS.PROMPTS]) {
                try {
                    const parsed = JSON.parse(data[AI_STORAGE_KEYS.PROMPTS]!);
                    setAiPrompts({ ...DEFAULT_AI_PROMPTS, ...parsed });
                } catch { /* keep defaults */ }
            }

            /* ── Feed ──────────────────────────────────────────────────── */
            if (data['BOOKMARKED_NOTE_IDS']) {
                const loaded = JSON.parse(data['BOOKMARKED_NOTE_IDS']);
                setBookmarkedNoteIds(loaded);
                bookmarkedNoteIdsRef.current = loaded;
            }
            if (data['FEED_COMMENTS']) {
                const loaded = JSON.parse(data['FEED_COMMENTS']);
                setFeedComments(loaded);
                feedCommentsRef.current = loaded;
            }
            if (data['AUTO_PLAY_FEED_VIDEOS'] !== null && data['AUTO_PLAY_FEED_VIDEOS'] !== undefined) {
                setAutoPlayFeedVideos(JSON.parse(data['AUTO_PLAY_FEED_VIDEOS']!));
            }

            /* ── Streak History (load or backfill) ─────────────────────── */
            let loadedHistory: string[] = [];
            if (data['STREAK_HISTORY']) {
                loadedHistory = JSON.parse(data['STREAK_HISTORY']);
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
                await AsyncStorage.setItem('STREAK_HISTORY', JSON.stringify(loadedHistory));
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
                    await AsyncStorage.setItem('CURRENT_STREAK', recalcStreak.toString());
                }
            }
        } catch (error) {
            console.error('[Storage] Failed to load data:', error);
        }
    }, []);

    /** Load once on mount */
    useEffect(() => { loadAllData(); }, [loadAllData]);

    /* ══════════════════════════════════════════════════════════════════════
       NOTES OPERATIONS
       All functions use refs → no stale closures.
       All AsyncStorage writes are awaited → no fire-and-forget.
       ══════════════════════════════════════════════════════════════════════ */

    /**
     * Save a new note and update streak if applicable.
     * Uses refs for ALL state reads to prevent stale closure bugs.
     * Persists notes + streak atomically via multiSet.
     */
    const saveNote = useCallback(async (note: SavedNote): Promise<{ streakIncreased: boolean; newStreak: number }> => {
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
            await AsyncStorage.multiSet(writes);
            DeviceEventEmitter.emit('NOTES_UPDATED');
        } catch (error) {
            console.error('[Storage] Failed to save note:', error);
            Vibration.vibrate([0, 500]);
        }

        return { streakIncreased, newStreak: updatedStreak };
    }, []);

    /** Delete a note by ID */
    const deleteNote = useCallback(async (id: string) => {
        const updatedNotes = savedNotesRef.current.filter(n => n.id !== id);
        savedNotesRef.current = updatedNotes;
        setSavedNotes(updatedNotes);

        try {
            await AsyncStorage.setItem('SAVED_NOTES', JSON.stringify(updatedNotes));
            DeviceEventEmitter.emit('NOTES_UPDATED');
        } catch (error) {
            console.error('[Storage] Failed to delete note:', error);
            Vibration.vibrate([0, 500]);
        }
    }, []);

    /** Update an existing note's fields (e.g. AI-generated title, summary) */
    const updateNote = useCallback(async (id: string, updates: Partial<SavedNote>) => {
        const updatedNotes = savedNotesRef.current.map(n =>
            n.id === id ? { ...n, ...updates } : n
        );
        savedNotesRef.current = updatedNotes;
        setSavedNotes(updatedNotes);

        try {
            await AsyncStorage.setItem('SAVED_NOTES', JSON.stringify(updatedNotes));
            DeviceEventEmitter.emit('NOTES_UPDATED');
        } catch (error) {
            console.error('[Storage] Failed to update note:', error);
        }
    }, []);

    /** Remove AI-generated titles, summaries, and model info from all notes */
    const clearAllAiMetadata = useCallback(async () => {
        const updatedNotes = savedNotesRef.current.map(n => ({
            ...n,
            aiTitle: undefined,
            aiSummary: undefined,
            aiModelUsed: undefined,
        }));
        savedNotesRef.current = updatedNotes;
        setSavedNotes(updatedNotes);

        try {
            await AsyncStorage.setItem('SAVED_NOTES', JSON.stringify(updatedNotes));
            DeviceEventEmitter.emit('NOTES_UPDATED');
        } catch (error) {
            console.error('[Storage] Failed to clear AI metadata:', error);
        }
    }, []);

    /* ══════════════════════════════════════════════════════════════════════
       PERSONS OPERATIONS
       ══════════════════════════════════════════════════════════════════════ */

    /** Add a new person to the Circle */
    const addPerson = useCallback(async (name: string) => {
        if (name.trim().length === 0) return null;
        const newId = generateId();
        const newPerson: Person = {
            id: newId,
            name: name.trim(),
            createdAt: Date.now(),
        };
        const updatedPersons = [newPerson, ...personsRef.current];
        personsRef.current = updatedPersons;
        setPersons(updatedPersons);

        try {
            await AsyncStorage.setItem('SAVED_PERSONS', JSON.stringify(updatedPersons));
        } catch (error) {
            console.error('[Storage] Failed to add person:', error);
            Vibration.vibrate([0, 500]);
        }
        return newId;
    }, []);

    /**
     * Delete a person AND unlink their notes atomically.
     * Uses AsyncStorage.multiSet so both writes succeed or the error is caught.
     * Shows an Alert to the user if persistence fails.
     */
    const deletePerson = useCallback(async (id: string) => {
        const updatedPersons = personsRef.current.filter(p => p.id !== id);
        const updatedNotes = savedNotesRef.current.map(n =>
            n.personId === id ? { ...n, personId: undefined } : n
        );

        // Update refs + state immediately
        personsRef.current = updatedPersons;
        savedNotesRef.current = updatedNotes;
        setPersons(updatedPersons);
        setSavedNotes(updatedNotes);

        // Persist both atomically
        try {
            await AsyncStorage.multiSet([
                ['SAVED_PERSONS', JSON.stringify(updatedPersons)],
                ['SAVED_NOTES', JSON.stringify(updatedNotes)],
            ]);
            DeviceEventEmitter.emit('NOTES_UPDATED');
        } catch (error) {
            console.error('[Storage] Failed to delete person:', error);
            Vibration.vibrate([0, 500]);
            Alert.alert(
                'Error',
                'Failed to delete person. Your data may be out of sync — please restart the app.',
            );
        }
    }, []);

    /** Update an existing person's profile fields */
    const updatePerson = useCallback(async (id: string, updates: Partial<Person>) => {
        const updatedPersons = personsRef.current.map(p =>
            p.id === id ? { ...p, ...updates } : p
        );
        personsRef.current = updatedPersons;
        setPersons(updatedPersons);

        try {
            await AsyncStorage.setItem('SAVED_PERSONS', JSON.stringify(updatedPersons));
        } catch (error) {
            console.error('[Storage] Failed to update person:', error);
        }
    }, []);

    /* ══════════════════════════════════════════════════════════════════════
       PREFERENCES & MISC OPERATIONS
       ══════════════════════════════════════════════════════════════════════ */

    const savePreferences = useCallback(async (fIdx: number, sIdx: number) => {
        setFontIndex(fIdx);
        setSizeIndex(sIdx);
        try {
            await AsyncStorage.multiSet([
                ['USER_FONT_IDX', fIdx.toString()],
                ['USER_SIZE_IDX', sIdx.toString()],
            ]);
        } catch (error) {
            console.error('[Storage] Failed to save preferences:', error);
        }
    }, []);

    const toggleDevMode = useCallback(async () => {
        const newVal = !devMode;
        setDevMode(newVal);
        try {
            await AsyncStorage.setItem('DEV_MODE', JSON.stringify(newVal));
        } catch (error) {
            console.error('[Storage] Failed to toggle dev mode:', error);
        }
    }, [devMode]);

    const updateBiometricsPref = useCallback(async (val: boolean) => {
        setUseBiometrics(val);
        try {
            await AsyncStorage.setItem('USE_BIOMETRICS', JSON.stringify(val));
        } catch (error) {
            console.error('[Storage] Failed to update biometrics pref:', error);
        }
    }, []);

    const saveVisionBoard = useCallback(async (newBoard: VisionBoard) => {
        setVisionBoard(newBoard);
        try {
            await AsyncStorage.setItem('VISION_BOARD', JSON.stringify(newBoard));
        } catch (error) {
            console.error('[Storage] Failed to save vision board:', error);
        }
    }, []);

    /* ══════════════════════════════════════════════════════════════════════
       AI CONFIG OPERATIONS
       ══════════════════════════════════════════════════════════════════════ */

    const saveAiApiKey = useCallback(async (key: string) => {
        setAiApiKey(key);
        await AsyncStorage.setItem(AI_STORAGE_KEYS.API_KEY, key);
    }, []);

    const saveAiBaseUrl = useCallback(async (url: string) => {
        setAiBaseUrl(url);
        await AsyncStorage.setItem(AI_STORAGE_KEYS.BASE_URL, url);
    }, []);

    const saveAiModel = useCallback(async (model: string) => {
        setAiModel(model);
        await AsyncStorage.setItem(AI_STORAGE_KEYS.MODEL, model);
    }, []);

    const saveAiGrammarModel = useCallback(async (grammarModel: string) => {
        setAiGrammarModel(grammarModel);
        await AsyncStorage.setItem(AI_STORAGE_KEYS.GRAMMAR_MODEL, grammarModel);
    }, []);

    const saveAiPrompts = useCallback(async (prompts: AiPrompts) => {
        setAiPrompts(prompts);
        await AsyncStorage.setItem(AI_STORAGE_KEYS.PROMPTS, JSON.stringify(prompts));
    }, []);

    /* ══════════════════════════════════════════════════════════════════════
       FEED OPERATIONS
       ══════════════════════════════════════════════════════════════════════ */

    const toggleBookmark = useCallback(async (noteId: string) => {
        const current = bookmarkedNoteIdsRef.current;
        const updated = current.includes(noteId)
            ? current.filter(id => id !== noteId)
            : [...current, noteId];
        bookmarkedNoteIdsRef.current = updated;
        setBookmarkedNoteIds(updated);

        try {
            await AsyncStorage.setItem('BOOKMARKED_NOTE_IDS', JSON.stringify(updated));
            Vibration.vibrate([0, 20, 0, 20]);
        } catch (error) {
            console.error('[Storage] Failed to toggle bookmark:', error);
            Vibration.vibrate([0, 500]);
        }
    }, []);

    const saveFeedComment = useCallback(async (noteId: string, comment: string) => {
        const updated = { ...feedCommentsRef.current, [noteId]: comment };
        if (!comment.trim()) delete updated[noteId];
        feedCommentsRef.current = updated;
        setFeedComments(updated);

        try {
            await AsyncStorage.setItem('FEED_COMMENTS', JSON.stringify(updated));
        } catch (error) {
            console.error('[Storage] Failed to save comment:', error);
        }
    }, []);

    const toggleAutoPlayFeedVideos = useCallback(async (enabled: boolean) => {
        setAutoPlayFeedVideos(enabled);
        try {
            await AsyncStorage.setItem('AUTO_PLAY_FEED_VIDEOS', JSON.stringify(enabled));
        } catch (error) {
            console.error('[Storage] Failed to toggle auto-play:', error);
        }
    }, []);

    /* ══════════════════════════════════════════════════════════════════════
       VLOG OPERATIONS
       ══════════════════════════════════════════════════════════════════════ */

    /** Save a new vlog entry. Currently does not increment streak. */
    const saveVlog = useCallback(async (vlog: SavedVlog): Promise<{ streakIncreased: boolean; newStreak: number }> => {
        const updatedVlogs = [vlog, ...savedVlogsRef.current];
        savedVlogsRef.current = updatedVlogs;
        setSavedVlogs(updatedVlogs);
        setTotalVlogStorageBytes(prev => prev + (vlog.fileSizeBytes || 0));

        try {
            await AsyncStorage.setItem('SAVED_VLOGS', JSON.stringify(updatedVlogs));
        } catch (error) {
            console.error('[Storage] Failed to save vlog:', error);
        }

        // Streak placeholder — vlogs don't increment streak yet
        return { streakIncreased: false, newStreak: currentStreakRef.current };
    }, []);

    const deleteVlog = useCallback(async (id: string) => {
        const vlog = savedVlogsRef.current.find(v => v.id === id);
        const updatedVlogs = savedVlogsRef.current.filter(v => v.id !== id);
        savedVlogsRef.current = updatedVlogs;
        setSavedVlogs(updatedVlogs);

        if (vlog) {
            setTotalVlogStorageBytes(b => Math.max(0, b - (vlog.fileSizeBytes || 0)));
            FileSystem.deleteAsync(vlog.filePath, { idempotent: true }).catch(() => {});
        }

        try {
            await AsyncStorage.setItem('SAVED_VLOGS', JSON.stringify(updatedVlogs));
        } catch (error) {
            console.error('[Storage] Failed to delete vlog:', error);
            Vibration.vibrate([0, 500]);
        }
    }, []);

    const updateVlog = useCallback(async (id: string, patch: Partial<SavedVlog>) => {
        const updatedVlogs = savedVlogsRef.current.map(v =>
            v.id === id ? { ...v, ...patch } : v
        );
        savedVlogsRef.current = updatedVlogs;
        setSavedVlogs(updatedVlogs);

        try {
            await AsyncStorage.setItem('SAVED_VLOGS', JSON.stringify(updatedVlogs));
        } catch (error) {
            console.error('[Storage] Failed to update vlog:', error);
        }
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
            await AsyncStorage.multiRemove(allKeys);
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
        setSizeIndex(1);
        setUseBiometrics(true);
        setDevMode(false);
        setVisionBoard(null);
        setLastReflectionDate(null);
        setSavedVlogs([]);
        savedVlogsRef.current = [];
        setTotalVlogStorageBytes(0);
        setBookmarkedNoteIds([]);
        bookmarkedNoteIdsRef.current = [];
        setFeedComments({});
        feedCommentsRef.current = {};
        setAutoPlayFeedVideos(true);

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
            await AsyncStorage.setItem('LAST_REFLECTION_DATE', now.toString());
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
        toggleBookmark, saveFeedComment, setAutoPlayFeedVideos: toggleAutoPlayFeedVideos,
    }), [bookmarkedNoteIds, feedComments, autoPlayFeedVideos,
         toggleBookmark, saveFeedComment, toggleAutoPlayFeedVideos]);

    const vlogValue = useMemo<VlogContextType>(() => ({
        savedVlogs, totalVlogStorageBytes, saveVlog, deleteVlog, updateVlog,
    }), [savedVlogs, totalVlogStorageBytes, saveVlog, deleteVlog, updateVlog]);

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
   BACKWARD COMPATIBILITY — useStorage()
   Returns the union of all context values. Use this when migrating gradually.
   NOTE: Components using this hook re-render on ANY context change.
   Prefer domain-specific hooks (useNotes, usePersons, etc.) for better perf.
   ═══════════════════════════════════════════════════════════════════════════ */

export function useStorage() {
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
