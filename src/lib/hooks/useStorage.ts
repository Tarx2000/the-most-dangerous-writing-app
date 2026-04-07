import { useState, useCallback } from 'react';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SavedNote, Person, VisionBoard, AlignmentReflection, SavedVlog } from '@/types';
import * as FileSystem from 'expo-file-system/legacy';
import { CONFIG } from '@/config';
import {
    DEFAULT_OLLAMA_API_KEY,
    DEFAULT_OLLAMA_BASE_URL,
    DEFAULT_OLLAMA_MODEL,
    DEFAULT_AI_PROMPTS,
    AI_STORAGE_KEYS,
    type AiPrompts,
} from '@/config/ai';

export function useStorage() {
    const [savedNotes, setSavedNotes] = useState<SavedNote[]>([]);
    const [persons, setPersons] = useState<Person[]>([]);
    const [currentStreak, setCurrentStreak] = useState<number>(0);
    const [lastWinDate, setLastWinDate] = useState<string>('');
    const [streakHistory, setStreakHistory] = useState<string[]>([]);

    const [fontIndex, setFontIndex] = useState(0);
    const [sizeIndex, setSizeIndex] = useState(1);
    const [useBiometrics, setUseBiometrics] = useState<boolean>(true);
    const [devMode, setDevMode] = useState<boolean>(false);
    const [visionBoard, setVisionBoard] = useState<VisionBoard | null>(null);
    const [lastReflectionDate, setLastReflectionDate] = useState<number | null>(null);
    /** All saved vlog metadata entries */
    const [savedVlogs, setSavedVlogs] = useState<SavedVlog[]>([]);
    /** Total storage used by vlog files in bytes */
    const [totalVlogStorageBytes, setTotalVlogStorageBytes] = useState<number>(0);

    /* ── AI Configuration State ──────────────────────────────────────── */
    const [aiApiKey, setAiApiKey] = useState<string>(DEFAULT_OLLAMA_API_KEY);
    const [aiBaseUrl, setAiBaseUrl] = useState<string>(DEFAULT_OLLAMA_BASE_URL);
    const [aiModel, setAiModel] = useState<string>(DEFAULT_OLLAMA_MODEL);
    const [aiGrammarModel, setAiGrammarModel] = useState<string>(DEFAULT_OLLAMA_MODEL);
    const [aiPrompts, setAiPrompts] = useState<AiPrompts>({ ...DEFAULT_AI_PROMPTS });

    const loadAllData = useCallback(async () => {
        try {
            const keys = [
                'SAVED_NOTES',
                'SAVED_PERSONS',
                'USER_FONT_IDX',
                'USER_SIZE_IDX',
                'USE_BIOMETRICS',
                'CURRENT_STREAK',
                'LAST_WIN_DATE',
                'STREAK_HISTORY',
                'DEV_MODE',
                'VISION_BOARD',
                'LAST_REFLECTION_DATE',
                'SAVED_VLOGS',
                AI_STORAGE_KEYS.API_KEY,
                AI_STORAGE_KEYS.BASE_URL,
                AI_STORAGE_KEYS.MODEL,
                AI_STORAGE_KEYS.GRAMMAR_MODEL,
                AI_STORAGE_KEYS.PROMPTS,
            ];
            const results = await AsyncStorage.multiGet(keys);
            const data: Record<string, string | null> = Object.fromEntries(results);

            let loadedNotes: SavedNote[] = [];
            if (data['SAVED_NOTES']) {
                loadedNotes = JSON.parse(data['SAVED_NOTES']);

                // Migration: clear stale aiProcessing flags from the old system.
                // Processing state is now derived from the AI Queue, not stored on notes.
                const hadStale = loadedNotes.some(n => n.aiProcessing === true);
                if (hadStale) {
                    loadedNotes = loadedNotes.map(n => n.aiProcessing ? { ...n, aiProcessing: false } : n);
                    await AsyncStorage.setItem('SAVED_NOTES', JSON.stringify(loadedNotes));
                    console.log('[Storage] Cleaned up stale aiProcessing flags');
                }

                setSavedNotes(loadedNotes);
            }
            if (data['SAVED_PERSONS']) setPersons(JSON.parse(data['SAVED_PERSONS']));
            if (data['USER_FONT_IDX'] !== null) {
                const parsed = parseInt(data['USER_FONT_IDX'], 10);
                if (!isNaN(parsed)) setFontIndex(parsed);
            }
            if (data['USER_SIZE_IDX'] !== null) {
                const parsed = parseInt(data['USER_SIZE_IDX'], 10);
                if (!isNaN(parsed)) setSizeIndex(parsed);
            }
            if (data['USE_BIOMETRICS'] !== null) setUseBiometrics(JSON.parse(data['USE_BIOMETRICS']));
            if (data['DEV_MODE'] !== null) setDevMode(JSON.parse(data['DEV_MODE'] || 'false'));
            if (data['CURRENT_STREAK'] !== null) setCurrentStreak(parseInt(data['CURRENT_STREAK'], 10));
            if (data['LAST_WIN_DATE']) setLastWinDate(data['LAST_WIN_DATE']);
            if (data['VISION_BOARD']) setVisionBoard(JSON.parse(data['VISION_BOARD']));
            if (data['LAST_REFLECTION_DATE']) setLastReflectionDate(parseInt(data['LAST_REFLECTION_DATE'], 10));

            // Load saved vlogs and calculate total storage
            if (data['SAVED_VLOGS']) {
                const vlogs: SavedVlog[] = JSON.parse(data['SAVED_VLOGS']);
                setSavedVlogs(vlogs);
                const totalBytes = vlogs.reduce((sum, v) => sum + (v.fileSizeBytes || 0), 0);
                setTotalVlogStorageBytes(totalBytes);
            }

            // Load AI config overrides (falls back to defaults if not set)
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

            // Load or backfill streak history
            let loadedHistory: string[] = [];
            if (data['STREAK_HISTORY']) {
                loadedHistory = JSON.parse(data['STREAK_HISTORY']);
                setStreakHistory(loadedHistory);
            } else {
                // Backfill from existing won notes >= 3min
                const historySet = new Set<string>();
                loadedNotes.forEach(n => {
                    if (n.won && n.durationMin >= 3 && !n.isQuickNote) {
                        const d = new Date(n.timestamp);
                        historySet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
                    }
                });
                loadedHistory = Array.from(historySet);
                setStreakHistory(loadedHistory);
                AsyncStorage.setItem('STREAK_HISTORY', JSON.stringify(loadedHistory));
            }

            // Recalculate streak from history if stored value looks stale
            const storedStreak = data['CURRENT_STREAK'] ? parseInt(data['CURRENT_STREAK'], 10) : 0;
            if (loadedHistory.length > 0 && storedStreak === 0) {
                const histSet = new Set<string>(loadedHistory);
                let recalcStreak = 0;
                const checkDate = new Date();
                for (let i = 0; i < 365; i++) {
                    const key = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
                    if (histSet.has(key)) {
                        recalcStreak++;
                        checkDate.setDate(checkDate.getDate() - 1);
                    } else {
                        break;
                    }
                }
                if (recalcStreak > 0) {
                    setCurrentStreak(recalcStreak);
                    AsyncStorage.setItem('CURRENT_STREAK', recalcStreak.toString());
                }
            }

        } catch (error) {
            console.error('Failed to load storage data', error);
        }
    }, []);

    const savePreferences = async (fIdx: number, sIdx: number) => {
        setFontIndex(fIdx);
        setSizeIndex(sIdx);
        await AsyncStorage.setItem('USER_FONT_IDX', fIdx.toString());
        await AsyncStorage.setItem('USER_SIZE_IDX', sIdx.toString());
    };

    /** Toggle developer/debug mode on or off */
    const toggleDevMode = async () => {
        const newVal = !devMode;
        setDevMode(newVal);
        await AsyncStorage.setItem('DEV_MODE', JSON.stringify(newVal));
    };

    /** Wipe all persisted app data */
    const clearAllData = async () => {
        const allKeys = [
            'SAVED_NOTES', 'SAVED_PERSONS', 'USER_FONT_IDX', 'USER_SIZE_IDX',
            'USE_BIOMETRICS', 'CURRENT_STREAK', 'LAST_WIN_DATE', 'STREAK_HISTORY', 'DEV_MODE',
            'VISION_BOARD', 'LAST_REFLECTION_DATE', 'SAVED_VLOGS'
        ];
        await AsyncStorage.multiRemove(allKeys);
        setSavedNotes([]);
        setPersons([]);
        setCurrentStreak(0);
        setLastWinDate('');
        setStreakHistory([]);
        setFontIndex(0);
        setSizeIndex(1);
        setUseBiometrics(true);
        setDevMode(false);
        setVisionBoard(null);
        setLastReflectionDate(null);
        setSavedVlogs([]);
        setTotalVlogStorageBytes(0);
        // Delete the vlogs directory
        const vlogDir = `${FileSystem.documentDirectory}${CONFIG.VLOG_STORAGE_DIR}`;
        try { await FileSystem.deleteAsync(vlogDir, { idempotent: true }); } catch (_) {}
    };

    const updateBiometricsPref = async (val: boolean) => {
        setUseBiometrics(val);
        await AsyncStorage.setItem('USE_BIOMETRICS', JSON.stringify(val));
    };

    const saveNote = async (note: SavedNote): Promise<{ streakIncreased: boolean; newStreak: number }> => {
        let updatedStreak = currentStreak;
        let streakIncreased = false;
        let newLastWinDate = lastWinDate;
        let newHistory = [...streakHistory];

        // Process streak logic inline
        if (note.won && note.durationMin >= 3 && !note.isQuickNote) {
            const todayStr = new Date().toLocaleDateString();
            const d = new Date();
            const calDateStr = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            if (!newHistory.includes(calDateStr)) {
                newHistory.push(calDateStr);
                setStreakHistory(newHistory);
                await AsyncStorage.setItem('STREAK_HISTORY', JSON.stringify(newHistory));
            }

            if (lastWinDate !== todayStr) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toLocaleDateString();

                if (lastWinDate === yesterdayStr) {
                    updatedStreak += 1;
                    streakIncreased = true;
                } else {
                    updatedStreak = 1;
                    if (currentStreak === 0) streakIncreased = true;
                }

                newLastWinDate = todayStr;
                setCurrentStreak(updatedStreak);
                setLastWinDate(newLastWinDate);
                await AsyncStorage.setItem('CURRENT_STREAK', updatedStreak.toString());
                await AsyncStorage.setItem('LAST_WIN_DATE', newLastWinDate);
            }
        }

        setSavedNotes(prev => {
            const updated = [note, ...prev];
            AsyncStorage.setItem('SAVED_NOTES', JSON.stringify(updated))
                .then(() => DeviceEventEmitter.emit('NOTES_UPDATED'));
            return updated;
        });

        return { streakIncreased, newStreak: updatedStreak };
    };

    const deleteNote = async (id: string) => {
        setSavedNotes(prev => {
            const updated = prev.filter(n => n.id !== id);
            AsyncStorage.setItem('SAVED_NOTES', JSON.stringify(updated))
                .then(() => DeviceEventEmitter.emit('NOTES_UPDATED'));
            return updated;
        });
    };

    /**
     * Update an existing note's fields (e.g. merge AI-generated title, summary, edited text).
     * Merges provided `updates` into the note with matching `id`.
     */
    const updateNote = async (id: string, updates: Partial<SavedNote>) => {
        setSavedNotes(prev => {
            const updatedNotes = prev.map(n =>
                n.id === id ? { ...n, ...updates } : n
            );
            AsyncStorage.setItem('SAVED_NOTES', JSON.stringify(updatedNotes))
                .then(() => DeviceEventEmitter.emit('NOTES_UPDATED'));
            return updatedNotes;
        });
    };

    /** Removes AI generated titles, summaries, and overrides from all notes */
    const clearAllAiMetadata = async () => {
        setSavedNotes(prev => {
            const updatedNotes = prev.map(n => ({
                ...n,
                aiTitle: undefined,
                aiSummary: undefined,
                aiModelUsed: undefined,
            }));
            AsyncStorage.setItem('SAVED_NOTES', JSON.stringify(updatedNotes))
                .then(() => DeviceEventEmitter.emit('NOTES_UPDATED'));
            return updatedNotes;
        });
    };

    const addPerson = async (name: string) => {
        if (name.trim().length === 0) return;
        const newPerson: Person = {
            id: Date.now().toString(),
            name: name.trim(),
            createdAt: Date.now(),
        };
        setPersons(prev => {
            const updated = [newPerson, ...prev];
            AsyncStorage.setItem('SAVED_PERSONS', JSON.stringify(updated));
            return updated;
        });
    };

    const deletePerson = async (id: string) => {
        const updatedPersons = persons.filter(p => p.id !== id);
        setPersons(updatedPersons);

        // Unlink notes
        const updatedNotes = savedNotes.map(n => n.personId === id ? { ...n, personId: undefined } : n);
        setSavedNotes(updatedNotes);

        await AsyncStorage.setItem('SAVED_PERSONS', JSON.stringify(updatedPersons));
        await AsyncStorage.setItem('SAVED_NOTES', JSON.stringify(updatedNotes));
        DeviceEventEmitter.emit('NOTES_UPDATED');
    };

    const updatePerson = async (id: string, updates: Partial<Person>) => {
        const updatedPersons = persons.map(p =>
            p.id === id ? { ...p, ...updates } : p
        );
        setPersons(updatedPersons);
        await AsyncStorage.setItem('SAVED_PERSONS', JSON.stringify(updatedPersons));
    };

    const saveVisionBoard = async (newBoard: VisionBoard) => {
        setVisionBoard(newBoard);
        await AsyncStorage.setItem('VISION_BOARD', JSON.stringify(newBoard));
    };

    const saveAlignmentReflection = async (reflection: AlignmentReflection): Promise<{ streakIncreased: boolean; newStreak: number }> => {
        const result = await saveNote(reflection);
        const now = Date.now();
        setLastReflectionDate(now);
        await AsyncStorage.setItem('LAST_REFLECTION_DATE', now.toString());
        return result;
    };

    const saveVlog = async (vlog: SavedVlog): Promise<{ streakIncreased: boolean; newStreak: number }> => {
        const updated = [vlog, ...savedVlogs];
        setSavedVlogs(updated);
        setTotalVlogStorageBytes(prev => prev + (vlog.fileSizeBytes || 0));
        await AsyncStorage.setItem('SAVED_VLOGS', JSON.stringify(updated));

        // Let's do a simple win update placeholder without replacing history
        let updatedStreak = currentStreak;
        let streakIncreased = false;
        return { streakIncreased, newStreak: updatedStreak };
    };

    const deleteVlog = async (id: string) => {
        const vlog = savedVlogs.find(v => v.id === id);
        if (vlog) {
            try { await FileSystem.deleteAsync(vlog.filePath, { idempotent: true }); } catch (e) {}
            setTotalVlogStorageBytes(prev => Math.max(0, prev - (vlog.fileSizeBytes || 0)));
        }
        const updated = savedVlogs.filter(v => v.id !== id);
        setSavedVlogs(updated);
        await AsyncStorage.setItem('SAVED_VLOGS', JSON.stringify(updated));
    };

    /* ── Setters for AI Settings ─────────────────────────────────────── */
    const saveAiApiKey = async (key: string) => {
        setAiApiKey(key);
        await AsyncStorage.setItem(AI_STORAGE_KEYS.API_KEY, key);
    };

    const saveAiBaseUrl = async (url: string) => {
        setAiBaseUrl(url);
        await AsyncStorage.setItem(AI_STORAGE_KEYS.BASE_URL, url);
    };

    const saveAiModel = async (model: string) => {
        setAiModel(model);
        await AsyncStorage.setItem(AI_STORAGE_KEYS.MODEL, model);
    };

    const saveAiGrammarModel = async (grammarModel: string) => {
        setAiGrammarModel(grammarModel);
        await AsyncStorage.setItem(AI_STORAGE_KEYS.GRAMMAR_MODEL, grammarModel);
    };

    const saveAiPrompts = async (prompts: AiPrompts) => {
        setAiPrompts(prompts);
        await AsyncStorage.setItem(AI_STORAGE_KEYS.PROMPTS, JSON.stringify(prompts));
    };

    return {
        savedNotes,
        persons,
        visionBoard,
        lastReflectionDate,
        currentStreak,
        lastWinDate,
        streakHistory,
        fontIndex,
        sizeIndex,
        useBiometrics,
        devMode,
        loadAllData,
        savePreferences,
        updateBiometricsPref,
        toggleDevMode,
        clearAllData,
        clearAllAiMetadata,
        saveNote,
        deleteNote,
        updateNote, // Added again safely
        addPerson,
        deletePerson,
        updatePerson,
        saveVisionBoard,
        saveAlignmentReflection,
        savedVlogs,
        totalVlogStorageBytes,
        saveVlog,
        deleteVlog,

        // AI specific
        aiApiKey,
        aiBaseUrl,
        aiModel,
        aiGrammarModel,
        aiPrompts,
        saveAiApiKey,
        saveAiBaseUrl,
        saveAiModel,
        saveAiGrammarModel,
        saveAiPrompts,
    };
}
