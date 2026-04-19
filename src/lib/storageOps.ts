/**
 * Storage Operations — Extracted CRUD functions for useStorage.
 *
 * Each function accepts refs and setters as parameters, following the
 * "fresh-read pattern" (refs for reads, setters for writes). This lets
 * the provider stay thin while operations remain fully testable.
 *
 * All functions use refs → no stale closures.
 * All storage writes are awaited → no fire-and-forget.
 * All state changes include rollback on storage failure.
 */

import React from 'react';
import { Alert, Vibration } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { storage } from '@/lib/storage';
import { CONFIG } from '@/config';
import { generateId, toLocalDateString } from '@/lib/utils';
import { cleanupOrphanedVlogs as cleanupOrphanFiles } from '@/lib/storageManager';
import { DEFAULT_AI_PROMPTS, AI_STORAGE_KEYS, type AiPrompts } from '@/config/ai';
import { setGlobalHapticsEnabled } from '@/lib/haptics';
import { processPendingCompressions } from '@/lib/videoCompressor';
import { mark as perfMark, log as perfLog, setPerfEnabled } from '@/lib/perf';
import type { SavedNote, Person, VisionBoard, AlignmentReflection, SavedVlog } from '@/types';

/* ── Type helpers for ref+setter pairs ──────────────────────────────────── */

type Ref<T> = { current: T };
type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

/* ═══════════════════════════════════════════════════════════════════════════
   NOTES OPERATIONS
   ═══════════════════════════════════════════════════════════════════════════ */

export function createNotesOps(
    notesRef: Ref<SavedNote[]>,
    setNotes: Setter<SavedNote[]>,
    currentStreakRef: Ref<number>,
    setCurrentStreak: Setter<number>,
    lastWinDateRef: Ref<string>,
    setLastWinDate: Setter<string>,
    streakHistoryRef: Ref<string[]>,
    setStreakHistory: Setter<string[]>,
) {
    const saveNote = async (note: SavedNote): Promise<{ streakIncreased: boolean; newStreak: number }> => {
        const prevNotes = notesRef.current;
        const prevStreak = currentStreakRef.current;
        const prevLastWinDate = lastWinDateRef.current;
        const prevHistory = [...streakHistoryRef.current];

        let updatedStreak = currentStreakRef.current;
        let streakIncreased = false;
        let newLastWinDate = lastWinDateRef.current;
        let newHistory = [...streakHistoryRef.current];

        if (note.won && note.durationMin >= 3 && !note.isQuickNote) {
            const now = new Date();
            const todayStr = toLocalDateString(now);

            if (!newHistory.includes(todayStr)) {
                newHistory.push(todayStr);
            }

            if (newLastWinDate !== todayStr) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = toLocalDateString(yesterday);

                if (newLastWinDate === yesterdayStr) {
                    updatedStreak += 1;
                    streakIncreased = true;
                } else {
                    updatedStreak = 1;
                    if (currentStreakRef.current === 0) streakIncreased = true;
                }
                newLastWinDate = todayStr;
            }

            currentStreakRef.current = updatedStreak;
            lastWinDateRef.current = newLastWinDate;
            streakHistoryRef.current = newHistory;
            setCurrentStreak(updatedStreak);
            setLastWinDate(newLastWinDate);
            setStreakHistory(newHistory);
        }

        const updatedNotes = [note, ...notesRef.current];
        notesRef.current = updatedNotes;
        setNotes(updatedNotes);

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
            notesRef.current = prevNotes;
            setNotes(prevNotes);
            currentStreakRef.current = prevStreak;
            setCurrentStreak(prevStreak);
            lastWinDateRef.current = prevLastWinDate;
            setLastWinDate(prevLastWinDate);
            streakHistoryRef.current = prevHistory;
            setStreakHistory(prevHistory);
        }

        return { streakIncreased, newStreak: updatedStreak };
    };

    const deleteNote = async (id: string) => {
        const prevNotes = notesRef.current;
        const updatedNotes = prevNotes.filter(n => n.id !== id);
        notesRef.current = updatedNotes;
        setNotes(updatedNotes);

        try {
            await storage.setItem('SAVED_NOTES', JSON.stringify(updatedNotes));
        } catch (error) {
            console.error('[Storage] Failed to delete note:', error);
            Vibration.vibrate([0, 500]);
            notesRef.current = prevNotes;
            setNotes(prevNotes);
        }
    };

    const updateNote = async (id: string, updates: Partial<SavedNote>) => {
        const prevNotes = notesRef.current;
        const updatedNotes = prevNotes.map(n =>
            n.id === id ? { ...n, ...updates } : n
        );
        notesRef.current = updatedNotes;
        setNotes(updatedNotes);

        try {
            await storage.setItem('SAVED_NOTES', JSON.stringify(updatedNotes));
        } catch (error) {
            console.error('[Storage] Failed to update note:', error);
            notesRef.current = prevNotes;
            setNotes(prevNotes);
        }
    };

    const clearAllAiMetadata = async () => {
        const prevNotes = notesRef.current;
        const updatedNotes = prevNotes.map(n => ({
            ...n,
            aiTitle: undefined,
            aiSummary: undefined,
            aiModelUsed: undefined,
        }));
        notesRef.current = updatedNotes;
        setNotes(updatedNotes);

        try {
            await storage.setItem('SAVED_NOTES', JSON.stringify(updatedNotes));
        } catch (error) {
            console.error('[Storage] Failed to clear AI metadata:', error);
            notesRef.current = prevNotes;
            setNotes(prevNotes);
        }
    };

    return { saveNote, deleteNote, updateNote, clearAllAiMetadata };
}

/* ═══════════════════════════════════════════════════════════════════════════
   PERSONS OPERATIONS
   ═══════════════════════════════════════════════════════════════════════════ */

export function createPersonsOps(
    personsRef: Ref<Person[]>,
    setPersons: Setter<Person[]>,
    notesRef: Ref<SavedNote[]>,
    setNotes: Setter<SavedNote[]>,
) {
    const addPerson = async (name: string): Promise<string | null> => {
        if (name.trim().length === 0) return null;
        const prevPersons = personsRef.current;
        const newId = generateId();
        const newPerson: Person = { id: newId, name: name.trim(), createdAt: Date.now() };
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
    };

    const deletePerson = async (id: string) => {
        const prevPersons = personsRef.current;
        const prevNotes = notesRef.current;
        const updatedPersons = prevPersons.filter(p => p.id !== id);
        const updatedNotes = prevNotes.map(n =>
            n.personId === id ? { ...n, personId: undefined } : n
        );

        personsRef.current = updatedPersons;
        notesRef.current = updatedNotes;
        setPersons(updatedPersons);
        setNotes(updatedNotes);

        try {
            await storage.multiSet([
                ['SAVED_PERSONS', JSON.stringify(updatedPersons)],
                ['SAVED_NOTES', JSON.stringify(updatedNotes)],
            ]);
        } catch (error) {
            console.error('[Storage] Failed to delete person:', error);
            personsRef.current = prevPersons;
            notesRef.current = prevNotes;
            setPersons(prevPersons);
            setNotes(prevNotes);
            Vibration.vibrate([0, 500]);
            Alert.alert('Error', 'Failed to delete person. Please try again.');
        }
    };

    const updatePerson = async (id: string, updates: Partial<Person>) => {
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
    };

    return { addPerson, deletePerson, updatePerson };
}

/* ═══════════════════════════════════════════════════════════════════════════
   VLOG OPERATIONS
   ═══════════════════════════════════════════════════════════════════════════ */

export function createVlogOps(
    vlogsRef: Ref<SavedVlog[]>,
    setVlogs: Setter<SavedVlog[]>,
    totalBytesRef: Ref<number>,
    setTotalBytes: Setter<number>,
    currentStreakRef: Ref<number>,
) {
    const saveVlog = async (vlog: SavedVlog): Promise<{ streakIncreased: boolean; newStreak: number }> => {
        const prevVlogs = vlogsRef.current;
        const prevBytes = totalBytesRef.current;
        const updatedVlogs = [vlog, ...prevVlogs];
        vlogsRef.current = updatedVlogs;
        setVlogs(updatedVlogs);
        const newBytes = prevBytes + (vlog.fileSizeBytes || 0);
        setTotalBytes(newBytes);
        totalBytesRef.current = newBytes;

        try {
            await storage.setItem('SAVED_VLOGS', JSON.stringify(updatedVlogs));
        } catch (error) {
            console.error('[Storage] Failed to save vlog:', error);
            vlogsRef.current = prevVlogs;
            setVlogs(prevVlogs);
            setTotalBytes(prevBytes);
            totalBytesRef.current = prevBytes;
        }

        return { streakIncreased: false, newStreak: currentStreakRef.current };
    };

    const deleteVlog = async (id: string) => {
        const prevVlogs = vlogsRef.current;
        const vlog = prevVlogs.find(v => v.id === id);
        const updatedVlogs = prevVlogs.filter(v => v.id !== id);
        vlogsRef.current = updatedVlogs;
        setVlogs(updatedVlogs);

        const prevBytes = totalBytesRef.current;
        if (vlog) {
            const newBytes = Math.max(0, prevBytes - (vlog.fileSizeBytes || 0));
            setTotalBytes(newBytes);
            totalBytesRef.current = newBytes;
            FileSystem.deleteAsync(vlog.filePath, { idempotent: true }).catch(() => {});
        }

        try {
            await storage.setItem('SAVED_VLOGS', JSON.stringify(updatedVlogs));
        } catch (error) {
            console.error('[Storage] Failed to delete vlog:', error);
            vlogsRef.current = prevVlogs;
            setVlogs(prevVlogs);
            setTotalBytes(prevBytes);
            totalBytesRef.current = prevBytes;
            Vibration.vibrate([0, 500]);
        }
    };

    const updateVlog = async (id: string, patch: Partial<SavedVlog>) => {
        const prevVlogs = vlogsRef.current;
        const updatedVlogs = prevVlogs.map(v =>
            v.id === id ? { ...v, ...patch } : v
        );
        vlogsRef.current = updatedVlogs;
        setVlogs(updatedVlogs);

        try {
            await storage.setItem('SAVED_VLOGS', JSON.stringify(updatedVlogs));
        } catch (error) {
            console.error('[Storage] Failed to update vlog:', error);
            vlogsRef.current = prevVlogs;
            setVlogs(prevVlogs);
        }
    };

    const cleanupOrphanedVlogs = async (): Promise<number> => {
        const knownPaths = new Set(vlogsRef.current.map(v => v.filePath));
        return cleanupOrphanFiles(knownPaths);
    };

    const getStorageSummary = () => ({
        vlogCount: vlogsRef.current.length,
        vlogBytes: vlogsRef.current.reduce((sum, v) => sum + (v.fileSizeBytes || 0), 0),
        noteCount: 0, // filled in by provider which has access to notesRef
        personCount: 0, // filled in by provider which has access to personsRef
    });

    return { saveVlog, deleteVlog, updateVlog, cleanupOrphanedVlogs, getStorageSummary };
}

/* ═══════════════════════════════════════════════════════════════════════════
   FEED OPERATIONS
   ═══════════════════════════════════════════════════════════════════════════ */

export function createFeedOps(
    bookmarksRef: Ref<string[]>,
    setBookmarks: Setter<string[]>,
    commentsRef: Ref<Record<string, string>>,
    setComments: Setter<Record<string, string>>,
    autoPlayRef: Ref<boolean>,
    setAutoPlay: Setter<boolean>,
) {
    const toggleBookmark = async (noteId: string) => {
        const prev = bookmarksRef.current;
        const updated = prev.includes(noteId)
            ? prev.filter(id => id !== noteId)
            : [...prev, noteId];
        bookmarksRef.current = updated;
        setBookmarks(updated);

        try {
            await storage.setItem('BOOKMARKED_NOTE_IDS', JSON.stringify(updated));
            Vibration.vibrate([0, 20, 0, 20]);
        } catch (error) {
            console.error('[Storage] Failed to toggle bookmark:', error);
            bookmarksRef.current = prev;
            setBookmarks(prev);
            Vibration.vibrate([0, 500]);
        }
    };

    const saveFeedComment = async (noteId: string, comment: string) => {
        const prev = commentsRef.current;
        const updated = { ...prev, [noteId]: comment };
        if (!comment.trim()) delete updated[noteId];
        commentsRef.current = updated;
        setComments(updated);

        try {
            await storage.setItem('FEED_COMMENTS', JSON.stringify(updated));
        } catch (error) {
            console.error('[Storage] Failed to save comment:', error);
            commentsRef.current = prev;
            setComments(prev);
        }
    };

    const toggleAutoPlayFeedVideos = async (enabled: boolean) => {
        const prev = autoPlayRef.current;
        setAutoPlay(enabled);
        autoPlayRef.current = enabled;
        try {
            await storage.setItem('AUTO_PLAY_FEED_VIDEOS', JSON.stringify(enabled));
        } catch (error) {
            console.error('[Storage] Failed to toggle auto-play:', error);
            setAutoPlay(prev);
            autoPlayRef.current = prev;
        }
    };

    return { toggleBookmark, saveFeedComment, toggleAutoPlayFeedVideos };
}

/* ═══════════════════════════════════════════════════════════════════════════
   PREFERENCES OPERATIONS
   ═══════════════════════════════════════════════════════════════════════════ */

export function createPreferencesOps(
    refs: {
        fontIndex: Ref<number>;
        sizeIndex: Ref<number>;
        useBiometrics: Ref<boolean>;
        enableHaptics: Ref<boolean>;
        lockTimeoutMins: Ref<number>;
        vlogQuality: Ref<string>;
        compressionPreset: Ref<string>;
        devMode: Ref<boolean>;
        debugLayout: Ref<boolean>;
        visionBoard: Ref<VisionBoard | null>;
        preferPinAuth: Ref<boolean>;
    },
    setters: {
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
    },
) {
    const savePreferences = async (fIdx: number, sIdx: number) => {
        const prevFont = refs.fontIndex.current;
        const prevSize = refs.sizeIndex.current;
        setters.setFontIndex(fIdx);
        setters.setSizeIndex(sIdx);
        try {
            await storage.multiSet([
                ['USER_FONT_IDX', fIdx.toString()],
                ['USER_SIZE_IDX', sIdx.toString()],
            ]);
        } catch (error) {
            console.error('[Storage] Failed to save preferences:', error);
            setters.setFontIndex(prevFont);
            setters.setSizeIndex(prevSize);
            refs.fontIndex.current = prevFont;
            refs.sizeIndex.current = prevSize;
        }
    };

    const updateBiometricsPref = async (val: boolean) => {
        const prev = refs.useBiometrics.current;
        setters.setUseBiometrics(val);
        refs.useBiometrics.current = val;
        try { await storage.setItem('USE_BIOMETRICS', JSON.stringify(val)); }
        catch (error) {
            console.error('[Storage] Failed to update biometrics pref:', error);
            setters.setUseBiometrics(prev);
            refs.useBiometrics.current = prev;
        }
    };

    const updateHapticsPref = async (val: boolean) => {
        const prev = refs.enableHaptics.current;
        setters.setEnableHaptics(val);
        refs.enableHaptics.current = val;
        setGlobalHapticsEnabled(val);
        try { await storage.setItem('ENABLE_HAPTICS', JSON.stringify(val)); }
        catch (error) {
            setters.setEnableHaptics(prev);
            refs.enableHaptics.current = prev;
            setGlobalHapticsEnabled(prev);
        }
    };

    const updateLockTimeout = async (mins: number) => {
        const prev = refs.lockTimeoutMins.current;
        setters.setLockTimeoutMins(mins);
        refs.lockTimeoutMins.current = mins;
        try { await storage.setItem('LOCK_TIMEOUT_MINS', mins.toString()); }
        catch (error) { setters.setLockTimeoutMins(prev); refs.lockTimeoutMins.current = prev; }
    };

    const updateVlogQuality = async (q: string) => {
        const prev = refs.vlogQuality.current;
        setters.setVlogQuality(q);
        refs.vlogQuality.current = q;
        try { await storage.setItem('VLOG_QUALITY', q); }
        catch (error) { setters.setVlogQuality(prev); refs.vlogQuality.current = prev; }
    };

    const updateCompressionPreset = async (preset: string) => {
        const prev = refs.compressionPreset.current;
        setters.setCompressionPreset(preset);
        refs.compressionPreset.current = preset;
        try { await storage.setItem('COMPRESSION_PRESET', preset); }
        catch (error) { setters.setCompressionPreset(prev); refs.compressionPreset.current = prev; }
    };

    const toggleDevMode = async () => {
        const prevVal = refs.devMode.current;
        const newVal = !prevVal;
        setters.setDevMode(newVal);
        setPerfEnabled(newVal);
        try { await storage.setItem('DEV_MODE', JSON.stringify(newVal)); }
        catch (error) {
            console.error('[Storage] Failed to toggle dev mode:', error);
            setters.setDevMode(prevVal);
        }
    };

    const toggleDebugLayout = async () => {
        const prevVal = refs.debugLayout.current;
        const newVal = !prevVal;
        setters.setDebugLayout(newVal);
        try { await storage.setItem('DEBUG_LAYOUT', JSON.stringify(newVal)); }
        catch (error) {
            console.error('[Storage] Failed to toggle debug layout:', error);
            setters.setDebugLayout(prevVal);
        }
    };

    const saveVisionBoard = async (newBoard: VisionBoard) => {
        const prev = refs.visionBoard.current;
        setters.setVisionBoard(newBoard);
        refs.visionBoard.current = newBoard;
        try { await storage.setItem('VISION_BOARD', JSON.stringify(newBoard)); }
        catch (error) {
            console.error('[Storage] Failed to save vision board:', error);
            setters.setVisionBoard(prev);
            refs.visionBoard.current = prev;
        }
    };

    const updatePreferPinAuth = async (val: boolean) => {
        const prev = refs.preferPinAuth.current;
        setters.setPreferPinAuth(val);
        refs.preferPinAuth.current = val;
        try { await storage.setItem('PREFER_PIN_AUTH', JSON.stringify(val)); }
        catch (error) {
            console.error('[Storage] Failed to update prefer PIN auth:', error);
            setters.setPreferPinAuth(prev);
            refs.preferPinAuth.current = prev;
        }
    };

    return {
        savePreferences, updateBiometricsPref, updateHapticsPref, updateLockTimeout,
        updateVlogQuality, updateCompressionPreset, toggleDevMode, toggleDebugLayout,
        saveVisionBoard, updatePreferPinAuth,
    };
}

/* ═══════════════════════════════════════════════════════════════════════════
   AI CONFIG OPERATIONS
   ═══════════════════════════════════════════════════════════════════════════ */

export function createAiConfigOps(
    refs: {
        aiApiKey: Ref<string>;
        aiBaseUrl: Ref<string>;
        aiModel: Ref<string>;
        aiGrammarModel: Ref<string>;
        aiPrompts: Ref<AiPrompts>;
        autoGenerateSummaries: Ref<boolean>;
    },
    setters: {
        setAiApiKey: Setter<string>;
        setAiBaseUrl: Setter<string>;
        setAiModel: Setter<string>;
        setAiGrammarModel: Setter<string>;
        setAiPrompts: Setter<AiPrompts>;
        setAutoGenerateSummaries: Setter<boolean>;
    },
) {
    const saveAiApiKey = async (key: string) => {
        const prev = refs.aiApiKey.current;
        setters.setAiApiKey(key);
        refs.aiApiKey.current = key;
        try { await storage.setItem(AI_STORAGE_KEYS.API_KEY, key); }
        catch (error) {
            console.error('[Storage] Failed to save AI API key:', error);
            setters.setAiApiKey(prev);
            refs.aiApiKey.current = prev;
        }
    };

    const saveAiBaseUrl = async (url: string) => {
        const prev = refs.aiBaseUrl.current;
        setters.setAiBaseUrl(url);
        refs.aiBaseUrl.current = url;
        try { await storage.setItem(AI_STORAGE_KEYS.BASE_URL, url); }
        catch (error) {
            console.error('[Storage] Failed to save AI base URL:', error);
            setters.setAiBaseUrl(prev);
            refs.aiBaseUrl.current = prev;
        }
    };

    const saveAiModel = async (model: string) => {
        const prev = refs.aiModel.current;
        setters.setAiModel(model);
        refs.aiModel.current = model;
        try { await storage.setItem(AI_STORAGE_KEYS.MODEL, model); }
        catch (error) {
            console.error('[Storage] Failed to save AI model:', error);
            setters.setAiModel(prev);
            refs.aiModel.current = prev;
        }
    };

    const saveAiGrammarModel = async (grammarModel: string) => {
        const prev = refs.aiGrammarModel.current;
        setters.setAiGrammarModel(grammarModel);
        refs.aiGrammarModel.current = grammarModel;
        try { await storage.setItem(AI_STORAGE_KEYS.GRAMMAR_MODEL, grammarModel); }
        catch (error) {
            console.error('[Storage] Failed to save AI grammar model:', error);
            setters.setAiGrammarModel(prev);
            refs.aiGrammarModel.current = prev;
        }
    };

    const saveAiPrompts = async (prompts: AiPrompts) => {
        const prev = refs.aiPrompts.current;
        setters.setAiPrompts(prompts);
        refs.aiPrompts.current = prompts;
        try { await storage.setItem(AI_STORAGE_KEYS.PROMPTS, JSON.stringify(prompts)); }
        catch (error) {
            console.error('[Storage] Failed to save AI prompts:', error);
            setters.setAiPrompts(prev);
            refs.aiPrompts.current = prev;
        }
    };

    const updateAutoGenerateSummaries = async (val: boolean) => {
        const prev = refs.autoGenerateSummaries.current;
        setters.setAutoGenerateSummaries(val);
        refs.autoGenerateSummaries.current = val;
        try { await storage.setItem('AUTO_GENERATE_SUMMARIES', JSON.stringify(val)); }
        catch (error) { setters.setAutoGenerateSummaries(prev); refs.autoGenerateSummaries.current = prev; }
    };

    return { saveAiApiKey, saveAiBaseUrl, saveAiModel, saveAiGrammarModel, saveAiPrompts, updateAutoGenerateSummaries };
}

/* ═══════════════════════════════════════════════════════════════════════════
   DATA LOADING
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Safe JSON parse with per-key error isolation.
 * Returns fallback on parse failure, logs a warning.
 */
export function safeParse<T extends unknown>(key: string, raw: string | null | undefined, fallback: T): T {
    if (raw == null) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch (err) {
        console.warn(`[Storage] Failed to parse key "${key}", using fallback:`, err);
        return fallback;
    }
}

/**
 * Load all data from AsyncStorage into state.
 * Accepts all refs and setters so it can populate them without
 * being tightly coupled to the provider's internal structure.
 */
export async function loadAllData(
    refs: Record<string, any>,
    setters: Record<string, any>,
) {
    perfMark('storage.start');

    const criticalKeys = [
        'SAVED_NOTES', 'SAVED_PERSONS', 'USER_FONT_IDX', 'USER_SIZE_IDX',
        'USE_BIOMETRICS', 'CURRENT_STREAK', 'LAST_WIN_DATE', 'STREAK_HISTORY',
        'DEV_MODE', 'DEBUG_LAYOUT', 'VISION_BOARD', 'LAST_REFLECTION_DATE',
        'PREFER_PIN_AUTH', 'ENABLE_HAPTICS', 'LOCK_TIMEOUT_MINS',
    ];
    const deferredKeys = [
        'VLOG_QUALITY', 'COMPRESSION_PRESET', 'SAVED_VLOGS',
        'BOOKMARKED_NOTE_IDS', 'FEED_COMMENTS', 'AUTO_PLAY_FEED_VIDEOS',
        'AUTO_GENERATE_SUMMARIES',
        AI_STORAGE_KEYS.API_KEY, AI_STORAGE_KEYS.BASE_URL,
        AI_STORAGE_KEYS.MODEL, AI_STORAGE_KEYS.GRAMMAR_MODEL,
        AI_STORAGE_KEYS.PROMPTS,
    ];
    const allKeys = [...criticalKeys, ...deferredKeys];
    const results = await storage.multiGet(allKeys);
    const data: Record<string, string | null> = Object.fromEntries(results);

    /* ── Notes (with migration to strip deprecated aiProcessing field) ── */
    let loadedNotes: SavedNote[] = [];
    if (data['SAVED_NOTES']) {
        loadedNotes = safeParse<SavedNote[]>('SAVED_NOTES', data['SAVED_NOTES'], []);
        const hadStale = loadedNotes.some((n) => 'aiProcessing' in (n as unknown as Record<string, unknown>));
        if (hadStale) {
            loadedNotes = loadedNotes.map(note => {
                const { aiProcessing, ...rest } = note as SavedNote & { aiProcessing?: unknown };
                return rest as SavedNote;
            });
            await storage.setItem('SAVED_NOTES', JSON.stringify(loadedNotes));
            console.log('[Storage] Stripped deprecated aiProcessing fields from notes');
        }
        setters.setSavedNotes(loadedNotes);
        refs.savedNotes.current = loadedNotes;
    }

    /* ── Persons ───────────────────────────────────────────────── */
    if (data['SAVED_PERSONS']) {
        const loaded = safeParse<Person[]>('SAVED_PERSONS', data['SAVED_PERSONS'], []);
        setters.setPersons(loaded);
        refs.persons.current = loaded;
    }

    /* ── Preferences ───────────────────────────────────────────── */
    if (data['USER_FONT_IDX'] !== null) {
        const parsed = parseInt(data['USER_FONT_IDX']!, 10);
        if (!isNaN(parsed)) { setters.setFontIndex(parsed); refs.fontIndex.current = parsed; }
    }
    if (data['USER_SIZE_IDX'] !== null) {
        const parsed = parseInt(data['USER_SIZE_IDX']!, 10);
        if (!isNaN(parsed)) { setters.setSizeIndex(parsed); refs.sizeIndex.current = parsed; }
    }
    if (data['USE_BIOMETRICS'] !== null) {
        const val = safeParse('USE_BIOMETRICS', data['USE_BIOMETRICS'], false);
        setters.setUseBiometrics(val);
        refs.useBiometrics.current = val;
    }
    if (data['ENABLE_HAPTICS'] !== null) {
        const val = safeParse('ENABLE_HAPTICS', data['ENABLE_HAPTICS'], true);
        setters.setEnableHaptics(val);
        refs.enableHaptics.current = val;
        setGlobalHapticsEnabled(val);
    }
    if (data['LOCK_TIMEOUT_MINS'] !== null) {
        const val = parseInt(data['LOCK_TIMEOUT_MINS']!, 10);
        if (!isNaN(val)) { setters.setLockTimeoutMins(val); refs.lockTimeoutMins.current = val; }
    }
    if (data['VLOG_QUALITY'] !== null) {
        setters.setVlogQuality(data['VLOG_QUALITY']!);
        refs.vlogQuality.current = data['VLOG_QUALITY']!;
    }
    if (data['COMPRESSION_PRESET'] !== null && data['COMPRESSION_PRESET'] !== undefined) {
        setters.setCompressionPreset(data['COMPRESSION_PRESET']!);
        refs.compressionPreset.current = data['COMPRESSION_PRESET']!;
    }
    if (data['DEV_MODE'] !== null) {
        const val = safeParse('DEV_MODE', data['DEV_MODE'] || 'false', false);
        setters.setDevMode(val);
        refs.devMode.current = val;
        setPerfEnabled(val);
    }
    if (data['DEBUG_LAYOUT'] !== null) {
        const val = safeParse('DEBUG_LAYOUT', data['DEBUG_LAYOUT'] || 'false', false);
        setters.setDebugLayout(val);
        refs.debugLayout.current = val;
    }
    if (data['VISION_BOARD']) {
        const val = safeParse<VisionBoard>('VISION_BOARD', data['VISION_BOARD'], { health: '', career: '', relationships: '', mindset: '' });
        setters.setVisionBoard(val);
        refs.visionBoard.current = val;
    }
    if (data['LAST_REFLECTION_DATE']) setters.setLastReflectionDate(parseInt(data['LAST_REFLECTION_DATE']!, 10));
    if (data['PREFER_PIN_AUTH'] !== null) {
        const val = safeParse('PREFER_PIN_AUTH', data['PREFER_PIN_AUTH'], false);
        setters.setPreferPinAuth(val);
        refs.preferPinAuth.current = val;
    }

    /* ── Streak ────────────────────────────────────────────────── */
    if (data['CURRENT_STREAK'] !== null) {
        const val = parseInt(data['CURRENT_STREAK']!, 10);
        setters.setCurrentStreak(val);
        refs.currentStreak.current = val;
    }
    if (data['LAST_WIN_DATE']) {
        setters.setLastWinDate(data['LAST_WIN_DATE']!);
        refs.lastWinDate.current = data['LAST_WIN_DATE']!;
    }

    /* ── Yield before deferred data ────────────────────────────── */
    perfMark('storage.critical');
    await new Promise<void>(resolve => { requestAnimationFrame(() => resolve()); });
    perfMark('storage.deferred');

    /* ── Vlogs ─────────────────────────────────────────────────── */
    if (data['SAVED_VLOGS']) {
        const vlogs = safeParse<SavedVlog[]>('SAVED_VLOGS', data['SAVED_VLOGS'], []);
        setters.setSavedVlogs(vlogs);
        refs.savedVlogs.current = vlogs;
        const totalBytes = vlogs.reduce((sum, v) => sum + (v.fileSizeBytes || 0), 0);
        setters.setTotalVlogStorageBytes(totalBytes);
        refs.totalVlogStorageBytes.current = totalBytes;
    }

    /* ── AI Config ─────────────────────────────────────────────── */
    if (data[AI_STORAGE_KEYS.API_KEY]) {
        setters.setAiApiKey(data[AI_STORAGE_KEYS.API_KEY]!);
        refs.aiApiKey.current = data[AI_STORAGE_KEYS.API_KEY]!;
    }
    if (data[AI_STORAGE_KEYS.BASE_URL]) {
        setters.setAiBaseUrl(data[AI_STORAGE_KEYS.BASE_URL]!);
        refs.aiBaseUrl.current = data[AI_STORAGE_KEYS.BASE_URL]!;
    }
    if (data[AI_STORAGE_KEYS.MODEL]) {
        setters.setAiModel(data[AI_STORAGE_KEYS.MODEL]!);
        refs.aiModel.current = data[AI_STORAGE_KEYS.MODEL]!;
    }
    if (data[AI_STORAGE_KEYS.GRAMMAR_MODEL]) {
        setters.setAiGrammarModel(data[AI_STORAGE_KEYS.GRAMMAR_MODEL]!);
        refs.aiGrammarModel.current = data[AI_STORAGE_KEYS.GRAMMAR_MODEL]!;
    }
    if (data[AI_STORAGE_KEYS.PROMPTS]) {
        const parsed = safeParse<Record<string, string>>('AI_PROMPTS', data[AI_STORAGE_KEYS.PROMPTS], {});
        const merged = { ...DEFAULT_AI_PROMPTS, ...parsed };
        setters.setAiPrompts(merged);
        refs.aiPrompts.current = merged;
    }
    if (data['AUTO_GENERATE_SUMMARIES'] !== null) {
        const val = safeParse('AUTO_GENERATE_SUMMARIES', data['AUTO_GENERATE_SUMMARIES'], true);
        setters.setAutoGenerateSummaries(val);
        refs.autoGenerateSummaries.current = val;
    }

    /* ── Feed ──────────────────────────────────────────────────── */
    if (data['BOOKMARKED_NOTE_IDS']) {
        const loaded = safeParse<string[]>('BOOKMARKED_NOTE_IDS', data['BOOKMARKED_NOTE_IDS'], []);
        setters.setBookmarkedNoteIds(loaded);
        refs.bookmarkedNoteIds.current = loaded;
    }
    if (data['FEED_COMMENTS']) {
        const loaded = safeParse<Record<string, string>>('FEED_COMMENTS', data['FEED_COMMENTS'], {});
        setters.setFeedComments(loaded);
        refs.feedComments.current = loaded;
    }
    if (data['AUTO_PLAY_FEED_VIDEOS'] !== null && data['AUTO_PLAY_FEED_VIDEOS'] !== undefined) {
        const val = safeParse('AUTO_PLAY_FEED_VIDEOS', data['AUTO_PLAY_FEED_VIDEOS'], true);
        setters.setAutoPlayFeedVideos(val);
        refs.autoPlayFeedVideos.current = val;
    }

    /* ── Streak History (load or backfill) ─────────────────────── */
    let loadedHistory: string[] = [];
    if (data['STREAK_HISTORY']) {
        loadedHistory = safeParse<string[]>('STREAK_HISTORY', data['STREAK_HISTORY'], []);
        setters.setStreakHistory(loadedHistory);
        refs.streakHistory.current = loadedHistory;
    } else {
        const historySet = new Set<string>();
        loadedNotes.forEach(n => {
            if (n.won && n.durationMin >= 3 && !n.isQuickNote) {
                const d = new Date(n.timestamp);
                historySet.add(toLocalDateString(d));
            }
        });
        loadedHistory = Array.from(historySet);
        setters.setStreakHistory(loadedHistory);
        refs.streakHistory.current = loadedHistory;
        await storage.setItem('STREAK_HISTORY', JSON.stringify(loadedHistory));
    }

    /* ── Recalculate streak if stored value is stale ───────────── */
    const storedStreak = data['CURRENT_STREAK'] ? parseInt(data['CURRENT_STREAK']!, 10) : 0;
    if (loadedHistory.length > 0 && storedStreak === 0) {
        const histSet = new Set<string>(loadedHistory);
        let recalcStreak = 0;
        const checkDate = new Date();
        for (let i = 0; i < 365; i++) {
            const key = toLocalDateString(checkDate);
            if (histSet.has(key)) {
                recalcStreak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }
        if (recalcStreak > 0) {
            setters.setCurrentStreak(recalcStreak);
            refs.currentStreak.current = recalcStreak;
            await storage.setItem('CURRENT_STREAK', recalcStreak.toString());
        }
    }
    perfMark('storage.done');
    perfLog();
}

/* ═══════════════════════════════════════════════════════════════════════════
   CROSS-CUTTING OPERATIONS
   ═══════════════════════════════════════════════════════════════════════════ */

export function createCrossCuttingOps(
    notesOps: ReturnType<typeof createNotesOps>,
    refs: Record<string, any>,
    setters: Record<string, any>,
) {
    const clearAllData = async () => {
        const allKeys = [
            'SAVED_NOTES', 'SAVED_PERSONS', 'USER_FONT_IDX', 'USER_SIZE_IDX',
            'USE_BIOMETRICS', 'CURRENT_STREAK', 'LAST_WIN_DATE', 'STREAK_HISTORY',
            'DEV_MODE', 'DEBUG_LAYOUT', 'VISION_BOARD', 'LAST_REFLECTION_DATE', 'SAVED_VLOGS',
            'BOOKMARKED_NOTE_IDS', 'FEED_COMMENTS', 'AUTO_PLAY_FEED_VIDEOS',
            AI_STORAGE_KEYS.API_KEY, AI_STORAGE_KEYS.BASE_URL,
            AI_STORAGE_KEYS.MODEL, AI_STORAGE_KEYS.GRAMMAR_MODEL,
            AI_STORAGE_KEYS.PROMPTS, AI_STORAGE_KEYS.QUEUE, AI_STORAGE_KEYS.LOG,
        ];

        try {
            await storage.multiRemove(allKeys);
        } catch (error) {
            console.error('[Storage] Failed to clear data:', error);
            throw error;
        }

        setters.setSavedNotes([]);
        refs.savedNotes.current = [];
        setters.setPersons([]);
        refs.persons.current = [];
        setters.setCurrentStreak(0);
        refs.currentStreak.current = 0;
        setters.setLastWinDate('');
        refs.lastWinDate.current = '';
        setters.setStreakHistory([]);
        refs.streakHistory.current = [];
        setters.setFontIndex(0);
        refs.fontIndex.current = 0;
        setters.setSizeIndex(1);
        refs.sizeIndex.current = 1;
        setters.setUseBiometrics(true);
        refs.useBiometrics.current = true;
        setters.setDevMode(false);
        setters.setDebugLayout(false);
        setters.setVisionBoard(null);
        refs.visionBoard.current = null;
        setters.setLastReflectionDate(null);
        setters.setSavedVlogs([]);
        refs.savedVlogs.current = [];
        setters.setTotalVlogStorageBytes(0);
        refs.totalVlogStorageBytes.current = 0;
        setters.setBookmarkedNoteIds([]);
        refs.bookmarkedNoteIds.current = [];
        setters.setFeedComments({});
        refs.feedComments.current = {};
        setters.setAutoPlayFeedVideos(true);
        refs.autoPlayFeedVideos.current = true;
        setters.setAiApiKey('');
        refs.aiApiKey.current = '';
        setters.setAiBaseUrl('');
        refs.aiBaseUrl.current = '';
        setters.setAiModel('');
        refs.aiModel.current = '';
        setters.setAiGrammarModel('');
        refs.aiGrammarModel.current = '';
        setters.setAiPrompts({ ...DEFAULT_AI_PROMPTS });
        refs.aiPrompts.current = { ...DEFAULT_AI_PROMPTS };
        setters.setAutoGenerateSummaries(true);
        refs.autoGenerateSummaries.current = true;

        const vlogDir = `${FileSystem.documentDirectory}${CONFIG.VLOG_STORAGE_DIR}`;
        try { await FileSystem.deleteAsync(vlogDir, { idempotent: true }); } catch (_) {}
    };

    const saveAlignmentReflection = async (
        reflection: AlignmentReflection
    ): Promise<{ streakIncreased: boolean; newStreak: number }> => {
        const result = await notesOps.saveNote(reflection);
        const now = Date.now();
        setters.setLastReflectionDate(now);
        try { await storage.setItem('LAST_REFLECTION_DATE', now.toString()); }
        catch (error) { console.error('[Storage] Failed to save reflection date:', error); }
        return result;
    };

    return { clearAllData, saveAlignmentReflection };
}