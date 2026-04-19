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
 * All CRUD operations are extracted into src/lib/storageOps.ts for
 * testability and maintainability. This file owns state, refs, context
 * wiring, and the provider tree.
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
import { SavedNote, Person, VisionBoard, AlignmentReflection, SavedVlog } from '@/types';
import { DEFAULT_AI_PROMPTS, AI_STORAGE_KEYS, type AiPrompts } from '@/config/ai';
import {
    createNotesOps,
    createPersonsOps,
    createVlogOps,
    createFeedOps,
    createPreferencesOps,
    createAiConfigOps,
    createCrossCuttingOps,
    loadAllData as loadAllDataFromOps,
} from '@/lib/storageOps';
import { processPendingCompressions } from '@/lib/videoCompressor';

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
    enableHaptics: boolean;
    lockTimeoutMins: number;
    vlogQuality: string;
    compressionPreset: string;
    devMode: boolean;
    debugLayout: boolean;
    visionBoard: VisionBoard | null;
    lastReflectionDate: number | null;
    preferPinAuth: boolean;
    savePreferences: (fIdx: number, sIdx: number) => Promise<void>;
    updateBiometricsPref: (val: boolean) => Promise<void>;
    updateHapticsPref: (val: boolean) => Promise<void>;
    updateLockTimeout: (mins: number) => Promise<void>;
    updateVlogQuality: (q: string) => Promise<void>;
    updateCompressionPreset: (preset: string) => Promise<void>;
    toggleDevMode: () => Promise<void>;
    toggleDebugLayout: () => Promise<void>;
    saveVisionBoard: (board: VisionBoard) => Promise<void>;
    updatePreferPinAuth: (val: boolean) => Promise<void>;
}

/** AI Configuration — almost never changes */
interface AiConfigContextType {
    aiApiKey: string;
    aiBaseUrl: string;
    aiModel: string;
    aiGrammarModel: string;
    aiPrompts: AiPrompts;
    autoGenerateSummaries: boolean;
    saveAiApiKey: (key: string) => Promise<void>;
    saveAiBaseUrl: (url: string) => Promise<void>;
    saveAiModel: (model: string) => Promise<void>;
    saveAiGrammarModel: (model: string) => Promise<void>;
    saveAiPrompts: (prompts: AiPrompts) => Promise<void>;
    updateAutoGenerateSummaries: (val: boolean) => Promise<void>;
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
    cleanupOrphanedVlogs: () => Promise<number>;
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
    /* ── State ────────────────────────────────────────────────────── */
    const [savedNotes, setSavedNotes] = useState<SavedNote[]>([]);
    const [persons, setPersons] = useState<Person[]>([]);
    const [currentStreak, setCurrentStreak] = useState<number>(0);
    const [lastWinDate, setLastWinDate] = useState<string>('');
    const [streakHistory, setStreakHistory] = useState<string[]>([]);
    const [fontIndex, setFontIndex] = useState(0);
    const [sizeIndex, setSizeIndex] = useState(1);
    const [useBiometrics, setUseBiometrics] = useState<boolean>(true);
    const [enableHaptics, setEnableHaptics] = useState<boolean>(true);
    const [lockTimeoutMins, setLockTimeoutMins] = useState<number>(3);
    const [vlogQuality, setVlogQuality] = useState<string>('1080p');
    const [compressionPreset, setCompressionPreset] = useState<string>('balanced');
    const [devMode, setDevMode] = useState<boolean>(false);
    const [debugLayout, setDebugLayout] = useState<boolean>(false);
    const [visionBoard, setVisionBoard] = useState<VisionBoard | null>(null);
    const [lastReflectionDate, setLastReflectionDate] = useState<number | null>(null);
    const [preferPinAuth, setPreferPinAuth] = useState<boolean>(false);
    const [savedVlogs, setSavedVlogs] = useState<SavedVlog[]>([]);
    const [totalVlogStorageBytes, setTotalVlogStorageBytes] = useState<number>(0);
    const [bookmarkedNoteIds, setBookmarkedNoteIds] = useState<string[]>([]);
    const [feedComments, setFeedComments] = useState<Record<string, string>>({});
    const [autoPlayFeedVideos, setAutoPlayFeedVideos] = useState<boolean>(true);
    const [aiApiKey, setAiApiKey] = useState<string>(DEFAULT_AI_PROMPTS.title ? '' : '');
    const [aiBaseUrl, setAiBaseUrl] = useState<string>('');
    const [aiModel, setAiModel] = useState<string>('');
    const [aiGrammarModel, setAiGrammarModel] = useState<string>('');
    const [aiPrompts, setAiPrompts] = useState<AiPrompts>({ ...DEFAULT_AI_PROMPTS });
    const [autoGenerateSummaries, setAutoGenerateSummaries] = useState<boolean>(true);

    /* ── Refs (fresh-read pattern) ─────────────────────────────────── */
    const savedNotesRef = useRef(savedNotes); savedNotesRef.current = savedNotes;
    const personsRef = useRef(persons); personsRef.current = persons;
    const currentStreakRef = useRef(currentStreak); currentStreakRef.current = currentStreak;
    const lastWinDateRef = useRef(lastWinDate); lastWinDateRef.current = lastWinDate;
    const streakHistoryRef = useRef(streakHistory); streakHistoryRef.current = streakHistory;
    const savedVlogsRef = useRef(savedVlogs); savedVlogsRef.current = savedVlogs;
    const fontIndexRef = useRef(fontIndex); fontIndexRef.current = fontIndex;
    const sizeIndexRef = useRef(sizeIndex); sizeIndexRef.current = sizeIndex;
    const useBiometricsRef = useRef(useBiometrics); useBiometricsRef.current = useBiometrics;
    const enableHapticsRef = useRef(enableHaptics); enableHapticsRef.current = enableHaptics;
    const lockTimeoutMinsRef = useRef(lockTimeoutMins); lockTimeoutMinsRef.current = lockTimeoutMins;
    const vlogQualityRef = useRef(vlogQuality); vlogQualityRef.current = vlogQuality;
    const compressionPresetRef = useRef(compressionPreset); compressionPresetRef.current = compressionPreset;
    const devModeRef = useRef(devMode); devModeRef.current = devMode;
    const debugLayoutRef = useRef(debugLayout); debugLayoutRef.current = debugLayout;
    const visionBoardRef = useRef(visionBoard); visionBoardRef.current = visionBoard;
    const preferPinAuthRef = useRef(preferPinAuth); preferPinAuthRef.current = preferPinAuth;
    const bookmarkedNoteIdsRef = useRef(bookmarkedNoteIds); bookmarkedNoteIdsRef.current = bookmarkedNoteIds;
    const feedCommentsRef = useRef(feedComments); feedCommentsRef.current = feedComments;
    const aiApiKeyRef = useRef(aiApiKey); aiApiKeyRef.current = aiApiKey;
    const aiBaseUrlRef = useRef(aiBaseUrl); aiBaseUrlRef.current = aiBaseUrl;
    const aiModelRef = useRef(aiModel); aiModelRef.current = aiModel;
    const aiGrammarModelRef = useRef(aiGrammarModel); aiGrammarModelRef.current = aiGrammarModel;
    const aiPromptsRef = useRef(aiPrompts); aiPromptsRef.current = aiPrompts;
    const autoGenerateSummariesRef = useRef(autoGenerateSummaries); autoGenerateSummariesRef.current = autoGenerateSummaries;
    const autoPlayFeedVideosRef = useRef(autoPlayFeedVideos); autoPlayFeedVideosRef.current = autoPlayFeedVideos;
    const totalVlogStorageBytesRef = useRef(totalVlogStorageBytes); totalVlogStorageBytesRef.current = totalVlogStorageBytes;

    /* ── Operation factories ──────────────────────────────────────── */
    const notesOps = useMemo(() => createNotesOps(
        savedNotesRef, setSavedNotes,
        currentStreakRef, setCurrentStreak,
        lastWinDateRef, setLastWinDate,
        streakHistoryRef, setStreakHistory,
    ), []);

    const personsOps = useMemo(() => createPersonsOps(
        personsRef, setPersons,
        savedNotesRef, setSavedNotes,
    ), []);

    const vlogOps = useMemo(() => createVlogOps(
        savedVlogsRef, setSavedVlogs,
        totalVlogStorageBytesRef, setTotalVlogStorageBytes,
        currentStreakRef,
    ), []);

    const feedOps = useMemo(() => createFeedOps(
        bookmarkedNoteIdsRef, setBookmarkedNoteIds,
        feedCommentsRef, setFeedComments,
        autoPlayFeedVideosRef, setAutoPlayFeedVideos,
    ), []);

    const preferencesOps = useMemo(() => createPreferencesOps(
        {
            fontIndex: fontIndexRef, sizeIndex: sizeIndexRef,
            useBiometrics: useBiometricsRef, enableHaptics: enableHapticsRef,
            lockTimeoutMins: lockTimeoutMinsRef, vlogQuality: vlogQualityRef,
            compressionPreset: compressionPresetRef, devMode: devModeRef,
            debugLayout: debugLayoutRef, visionBoard: visionBoardRef,
            preferPinAuth: preferPinAuthRef,
        },
        {
            setFontIndex, setSizeIndex, setUseBiometrics, setEnableHaptics,
            setLockTimeoutMins, setVlogQuality, setCompressionPreset,
            setDevMode, setDebugLayout, setVisionBoard, setPreferPinAuth,
        },
    ), []);

    const aiConfigOps = useMemo(() => createAiConfigOps(
        {
            aiApiKey: aiApiKeyRef, aiBaseUrl: aiBaseUrlRef,
            aiModel: aiModelRef, aiGrammarModel: aiGrammarModelRef,
            aiPrompts: aiPromptsRef, autoGenerateSummaries: autoGenerateSummariesRef,
        },
        {
            setAiApiKey, setAiBaseUrl, setAiModel, setAiGrammarModel,
            setAiPrompts, setAutoGenerateSummaries,
        },
    ), []);

    /* ── Load data ────────────────────────────────────────────────── */
    const loadAllData = useCallback(async () => {
        await loadAllDataFromOps(
            {
                savedNotes: savedNotesRef, persons: personsRef,
                currentStreak: currentStreakRef, lastWinDate: lastWinDateRef,
                streakHistory: streakHistoryRef, fontIndex: fontIndexRef,
                sizeIndex: sizeIndexRef, useBiometrics: useBiometricsRef,
                enableHaptics: enableHapticsRef, lockTimeoutMins: lockTimeoutMinsRef,
                vlogQuality: vlogQualityRef, compressionPreset: compressionPresetRef,
                devMode: devModeRef, debugLayout: debugLayoutRef,
                visionBoard: visionBoardRef, preferPinAuth: preferPinAuthRef,
                savedVlogs: savedVlogsRef, totalVlogStorageBytes: totalVlogStorageBytesRef,
                bookmarkedNoteIds: bookmarkedNoteIdsRef, feedComments: feedCommentsRef,
                autoPlayFeedVideos: autoPlayFeedVideosRef,
                aiApiKey: aiApiKeyRef, aiBaseUrl: aiBaseUrlRef,
                aiModel: aiModelRef, aiGrammarModel: aiGrammarModelRef,
                aiPrompts: aiPromptsRef, autoGenerateSummaries: autoGenerateSummariesRef,
            },
            {
                setSavedNotes, setPersons, setCurrentStreak, setLastWinDate,
                setStreakHistory, setFontIndex, setSizeIndex, setUseBiometrics,
                setEnableHaptics, setLockTimeoutMins, setVlogQuality, setCompressionPreset,
                setDevMode, setDebugLayout, setVisionBoard, setPreferPinAuth,
                setSavedVlogs, setTotalVlogStorageBytes,
                setBookmarkedNoteIds, setFeedComments, setAutoPlayFeedVideos,
                setAiApiKey, setAiBaseUrl, setAiModel, setAiGrammarModel,
                setAiPrompts, setAutoGenerateSummaries, setLastReflectionDate,
            },
        );
    }, []);

    useEffect(() => { loadAllData(); }, [loadAllData]);

    /* ── Cross-cutting ops ─────────────────────────────────────────── */
    const crossCuttingOps = useMemo(() => createCrossCuttingOps(notesOps,
        {
            savedNotes: savedNotesRef, persons: personsRef,
            currentStreak: currentStreakRef, lastWinDate: lastWinDateRef,
            streakHistory: streakHistoryRef, fontIndex: fontIndexRef,
            sizeIndex: sizeIndexRef, useBiometrics: useBiometricsRef,
            devMode: devModeRef, debugLayout: debugLayoutRef,
            visionBoard: visionBoardRef, savedVlogs: savedVlogsRef,
            totalVlogStorageBytes: totalVlogStorageBytesRef,
            bookmarkedNoteIds: bookmarkedNoteIdsRef, feedComments: feedCommentsRef,
            autoPlayFeedVideos: autoPlayFeedVideosRef,
        },
        {
            setSavedNotes, setPersons, setCurrentStreak, setLastWinDate,
            setStreakHistory, setFontIndex, setSizeIndex, setUseBiometrics,
            setDevMode, setDebugLayout, setVisionBoard, setLastReflectionDate,
            setSavedVlogs, setTotalVlogStorageBytes,
            setBookmarkedNoteIds, setFeedComments, setAutoPlayFeedVideos,
        },
    ), [notesOps]);

    /* ── Pending compressions on startup ──────────────────────────── */
    useEffect(() => {
        const timer = setTimeout(async () => {
            try {
                const processed = await processPendingCompressions(vlogOps.updateVlog);
                if (processed > 0) {
                    console.log(`[Startup] Processed ${processed} pending compression(s)`);
                    const freshVlogs = savedVlogsRef.current;
                    const newTotal = freshVlogs.reduce((sum, v) => sum + (v.fileSizeBytes || 0), 0);
                    setTotalVlogStorageBytes(newTotal);
                    totalVlogStorageBytesRef.current = newTotal;
                }
            } catch (error) {
                console.error('[Startup] Failed to process pending compressions:', error);
            }
        }, 2000);
        return () => clearTimeout(timer);
    }, [vlogOps.updateVlog]);

    /* ── Vlog storage summary (cross-domain) ──────────────────────── */
    const getStorageSummary = useCallback(() => ({
        vlogCount: savedVlogsRef.current.length,
        vlogBytes: savedVlogsRef.current.reduce((sum, v) => sum + (v.fileSizeBytes || 0), 0),
        noteCount: savedNotesRef.current.length,
        personCount: personsRef.current.length,
    }), []);

    /* ══════════════════════════════════════════════════════════════════════
       MEMOIZED CONTEXT VALUES
       ══════════════════════════════════════════════════════════════════════ */

    const notesValue = useMemo<NotesContextType>(() => ({
        savedNotes, ...notesOps,
    }), [savedNotes, notesOps]);

    const personsValue = useMemo<PersonsContextType>(() => ({
        persons, ...personsOps,
    }), [persons, personsOps]);

    const streakValue = useMemo<StreakContextType>(() => ({
        currentStreak, lastWinDate, streakHistory,
    }), [currentStreak, lastWinDate, streakHistory]);

    const preferencesValue = useMemo<PreferencesContextType>(() => ({
        fontIndex, sizeIndex, useBiometrics, enableHaptics, lockTimeoutMins, vlogQuality, compressionPreset, devMode, debugLayout, visionBoard, lastReflectionDate, preferPinAuth,
        ...preferencesOps,
    }), [fontIndex, sizeIndex, useBiometrics, enableHaptics, lockTimeoutMins, vlogQuality, compressionPreset, devMode, debugLayout, visionBoard, lastReflectionDate, preferPinAuth, preferencesOps]);

    const aiConfigValue = useMemo<AiConfigContextType>(() => ({
        aiApiKey, aiBaseUrl, aiModel, aiGrammarModel, aiPrompts, autoGenerateSummaries,
        ...aiConfigOps,
    }), [aiApiKey, aiBaseUrl, aiModel, aiGrammarModel, aiPrompts, autoGenerateSummaries, aiConfigOps]);

    const feedValue = useMemo<FeedContextType>(() => ({
        bookmarkedNoteIds, feedComments, autoPlayFeedVideos,
        ...feedOps,
    }), [bookmarkedNoteIds, feedComments, autoPlayFeedVideos, feedOps]);

    const vlogValue = useMemo<VlogContextType>(() => ({
        savedVlogs, totalVlogStorageBytes,
        saveVlog: vlogOps.saveVlog,
        deleteVlog: vlogOps.deleteVlog,
        updateVlog: vlogOps.updateVlog,
        cleanupOrphanedVlogs: vlogOps.cleanupOrphanedVlogs,
        getStorageSummary,
    }), [savedVlogs, totalVlogStorageBytes, vlogOps, getStorageSummary]);

    const actionsValue = useMemo<StorageActionsContextType>(() => ({
        ...crossCuttingOps, loadAllData,
    }), [crossCuttingOps, loadAllData]);

    /* ══════════════════════════════════════════════════════════════════════
       PROVIDER TREE
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
   DOMAIN-SPECIFIC HOOKS
   ═══════════════════════════════════════════════════════════════════════════ */

export function useNotes(): NotesContextType {
    const ctx = useContext(NotesContext);
    if (!ctx) throw new Error('useNotes must be used within StorageProvider');
    return ctx;
}

export function usePersons(): PersonsContextType {
    const ctx = useContext(PersonsContext);
    if (!ctx) throw new Error('usePersons must be used within StorageProvider');
    return ctx;
}

export function useStreak(): StreakContextType {
    const ctx = useContext(StreakContext);
    if (!ctx) throw new Error('useStreak must be used within StorageProvider');
    return ctx;
}

export function usePreferences(): PreferencesContextType {
    const ctx = useContext(PreferencesContext);
    if (!ctx) throw new Error('usePreferences must be used within StorageProvider');
    return ctx;
}

export function useAiConfig(): AiConfigContextType {
    const ctx = useContext(AiConfigContext);
    if (!ctx) throw new Error('useAiConfig must be used within StorageProvider');
    return ctx;
}

export function useFeedData(): FeedContextType {
    const ctx = useContext(FeedContext);
    if (!ctx) throw new Error('useFeedData must be used within StorageProvider');
    return ctx;
}

export function useVlogs(): VlogContextType {
    const ctx = useContext(VlogContext);
    if (!ctx) throw new Error('useVlogs must be used within StorageProvider');
    return ctx;
}

export function useStorageActions(): StorageActionsContextType {
    const ctx = useContext(StorageActionsContext);
    if (!ctx) throw new Error('useStorageActions must be used within StorageProvider');
    return ctx;
}

/* ═══════════════════════════════════════════════════════════════════════════
   @deprecated useStorage() — DO NOT USE in new code.
   ═══════════════════════════════════════════════════════════════════════════ */

/** @deprecated Use domain-specific hooks (useNotes, usePersons, etc.) instead. */
export function useStorage() {
    if (__DEV__) {
        console.warn('[useStorage] Deprecated: This hook subscribes to ALL contexts and causes mass re-renders. Use domain-specific hooks instead (useNotes, usePersons, useStreak, etc.).');
    }
    const notes = useNotes();
    const persons = usePersons();
    const streak = useStreak();
    const preferences = usePreferences();
    const aiConfig = useAiConfig();
    const feedData = useFeedData();
    const vlogs = useVlogs();
    const actions = useStorageActions();

    return {
        ...notes, ...persons, ...streak, ...preferences,
        ...aiConfig, ...feedData, ...vlogs, ...actions,
    };
}