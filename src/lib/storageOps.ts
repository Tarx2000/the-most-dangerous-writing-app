/**
 * Storage Operations â€” CRUD functions backed by SQLite (expo-sqlite).
 *
 * Each function accepts refs and setters for immediate optimistic UI updates,
 * then persists to SQLite. On failure, state is rolled back.
 *
 * NOTE: This file replaces the old AsyncStorage-backed storageOps.ts.
 *       All heavy data (notes, persons, vlogs) now lives in SQLite.
 *       Settings and lightweight flags remain in AsyncStorage for quick
 *       startup reads (until first DB load completes).
 */

import React from 'react';
import { Alert } from 'react-native';
import { vibrate } from '@/lib/haptics';
import { logger } from '@/lib/logger';
import * as FileSystem from 'expo-file-system/legacy';
import { CONFIG, isTweet as isTweetWordCount } from '@/config';
import { generateId, toLocalDateString } from '@/lib/utils';
import { cleanupOrphanedVlogs as cleanupOrphanFiles } from '@/lib/storageManager';
import { AI_STORAGE_KEYS, type AiPrompts } from '@/config/ai';
import { setGlobalHapticsEnabled } from '@/lib/haptics';
import { setPerfEnabled } from '@/lib/perf';
import {
    insertNote,
    deleteNote as repoDeleteNote,
    updateNote as repoUpdateNote,
    clearAllAiMetadata as repoClearAllAiMetadata,
    deleteAllNotes,
} from '@/lib/repositories/notesRepository';
import {
    insertPerson,
    deletePerson as repoDeletePerson,
    updatePerson as repoUpdatePerson,
    deleteAllPersons,
} from '@/lib/repositories/personsRepository';
import {
    insertVlog,
    deleteVlog as repoDeleteVlog,
    updateVlog as repoUpdateVlog,
    deleteAllVlogs,
} from '@/lib/repositories/vlogsRepository';
import { setSetting } from '@/lib/repositories/settingsRepository';
import type { SavedNote, Person, VisionBoard, AlignmentReflection, SavedVlog } from '@/types';

export type Ref<T> = { current: T };
export type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   NOTES OPERATIONS
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

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
        const prevNotes = [...notesRef.current];
        const prevStreak = currentStreakRef.current;
        const prevLastWinDate = lastWinDateRef.current;
        const prevHistory = [...streakHistoryRef.current];

        // Auto-classify as tweet if word count <= threshold
        const wordCount = note.text.trim().split(/\s+/).filter(Boolean).length;
        const isTweetEntry = isTweetWordCount(wordCount);
        if (isTweetEntry) {
            note.isTweet = true;
        }

        let updatedStreak = prevStreak;
        let streakIncreased = false;
        let newLastWinDate = prevLastWinDate;
        const newHistory = [...prevHistory];

        if (note.won && note.durationMin >= 3 && !note.isQuickNote && !note.isTweet) {
            const todayStr = toLocalDateString(new Date());
            if (!newHistory.includes(todayStr)) newHistory.push(todayStr);

            if (newLastWinDate !== todayStr) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = toLocalDateString(yesterday);
                if (newLastWinDate === yesterdayStr) {
                    updatedStreak += 1;
                    streakIncreased = true;
                } else {
                    updatedStreak = 1;
                    if (prevStreak === 0) streakIncreased = true;
                }
                newLastWinDate = todayStr;
            }
        }

        // Optimistic UI update
        const updatedNotes = [note, ...prevNotes];
        notesRef.current = updatedNotes;
        setNotes(updatedNotes);
        currentStreakRef.current = updatedStreak;
        lastWinDateRef.current = newLastWinDate;
        streakHistoryRef.current = newHistory;
        setCurrentStreak(updatedStreak);
        setLastWinDate(newLastWinDate);
        setStreakHistory(newHistory);

        try {
            await insertNote(note);
            if (note.won && note.durationMin >= 3 && !note.isQuickNote && !note.isTweet) {
                await Promise.all([
                    setSetting('CURRENT_STREAK', String(updatedStreak)),
                    setSetting('LAST_WIN_DATE', newLastWinDate),
                    setSetting('STREAK_HISTORY', JSON.stringify(newHistory)),
                ]);
            }
        } catch (error) {
            logger('error', 'Storage', 'Failed to save note:', error);
            vibrate([0, 500]);
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
        const prevNotes = [...notesRef.current];
        const updatedNotes = prevNotes.filter((n) => n.id !== id);
        notesRef.current = updatedNotes;
        setNotes(updatedNotes);

        try {
            await repoDeleteNote(id);
        } catch (error) {
            logger('error', 'Storage', 'Failed to delete note:', error);
            vibrate([0, 500]);
            notesRef.current = prevNotes;
            setNotes(prevNotes);
        }
    };

    const updateNote = async (id: string, updates: Partial<SavedNote>) => {
        const prevNotes = [...notesRef.current];
        const updatedNotes = prevNotes.map((n) => (n.id === id ? { ...n, ...updates } : n));
        notesRef.current = updatedNotes;
        setNotes(updatedNotes);

        try {
            await repoUpdateNote(id, updates);
        } catch (error) {
            logger('error', 'Storage', 'Failed to update note:', error);
            notesRef.current = prevNotes;
            setNotes(prevNotes);
        }
    };

    const clearAllAiMetadata = async () => {
        const prevNotes = [...notesRef.current];
        const updatedNotes = prevNotes.map((n) => ({
            ...n,
            aiTitle: undefined,
            aiSummary: undefined,
            aiModelUsed: undefined,
        }));
        notesRef.current = updatedNotes;
        setNotes(updatedNotes);

        try {
            await repoClearAllAiMetadata();
        } catch (error) {
            logger('error', 'Storage', 'Failed to clear AI metadata:', error);
            notesRef.current = prevNotes;
            setNotes(prevNotes);
        }
    };

    return { saveNote, deleteNote, updateNote, clearAllAiMetadata };
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   PERSONS OPERATIONS
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

export function createPersonsOps(
    personsRef: Ref<Person[]>,
    setPersons: Setter<Person[]>,
    notesRef: Ref<SavedNote[]>,
    setNotes: Setter<SavedNote[]>,
) {
    const addPerson = async (name: string): Promise<string | null> => {
        if (name.trim().length === 0) return null;
        const prevPersons = [...personsRef.current];
        const newId = generateId();
        const newPerson: Person = { id: newId, name: name.trim(), createdAt: Date.now() };
        const updatedPersons = [newPerson, ...prevPersons];
        personsRef.current = updatedPersons;
        setPersons(updatedPersons);

        try {
            await insertPerson(newPerson);
        } catch (error) {
            logger('error', 'Storage', 'Failed to add person:', error);
            vibrate([0, 500]);
            personsRef.current = prevPersons;
            setPersons(prevPersons);
        }
        return newId;
    };

    const deletePerson = async (id: string) => {
        const prevPersons = [...personsRef.current];
        const prevNotes = [...notesRef.current];
        const updatedPersons = prevPersons.filter((p) => p.id !== id);
        const updatedNotes = prevNotes.map((n) => (n.personId === id ? { ...n, personId: undefined } : n));

        personsRef.current = updatedPersons;
        notesRef.current = updatedNotes;
        setPersons(updatedPersons);
        setNotes(updatedNotes);

        try {
            await repoDeletePerson(id);
        } catch (error) {
            logger('error', 'Storage', 'Failed to delete person:', error);
            personsRef.current = prevPersons;
            notesRef.current = prevNotes;
            setPersons(prevPersons);
            setNotes(prevNotes);
            vibrate([0, 500]);
            Alert.alert('Error', 'Failed to delete person. Please try again.');
        }
    };

    const updatePerson = async (id: string, updates: Partial<Person>) => {
        const prevPersons = [...personsRef.current];
        const updatedPersons = prevPersons.map((p) => (p.id === id ? { ...p, ...updates } : p));
        personsRef.current = updatedPersons;
        setPersons(updatedPersons);

        try {
            await repoUpdatePerson(id, updates);
        } catch (error) {
            logger('error', 'Storage', 'Failed to update person:', error);
            personsRef.current = prevPersons;
            setPersons(prevPersons);
        }
    };

    return { addPerson, deletePerson, updatePerson };
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   VLOG OPERATIONS
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

export function createVlogOps(
    vlogsRef: Ref<SavedVlog[]>,
    setVlogs: Setter<SavedVlog[]>,
    totalBytesRef: Ref<number>,
    setTotalBytes: Setter<number>,
    currentStreakRef: Ref<number>,
) {
    const saveVlog = async (vlog: SavedVlog): Promise<{ streakIncreased: boolean; newStreak: number }> => {
        const prevVlogs = [...vlogsRef.current];
        const prevBytes = totalBytesRef.current;
        const updatedVlogs = [vlog, ...prevVlogs];
        vlogsRef.current = updatedVlogs;
        setVlogs(updatedVlogs);
        const newBytes = prevBytes + (vlog.fileSizeBytes || 0);
        totalBytesRef.current = newBytes;
        setTotalBytes(newBytes);

        logger(
            'info',
            'Vlog',
            `Saving vlog ${vlog.id} (${(vlog.fileSizeBytes / 1024 / 1024).toFixed(1)} MB, ${vlog.durationSec}s)`,
        );

        try {
            await insertVlog(vlog);
            logger('info', 'Vlog', `Vlog ${vlog.id} saved successfully`);
        } catch (error) {
            logger('error', 'Storage', 'Failed to save vlog:', error);
            vlogsRef.current = prevVlogs;
            setVlogs(prevVlogs);
            totalBytesRef.current = prevBytes;
            setTotalBytes(prevBytes);
            logger('warn', 'Vlog', `Rolled back vlog save for ${vlog.id}`);
        }

        return { streakIncreased: false, newStreak: currentStreakRef.current };
    };

    const deleteVlog = async (id: string) => {
        const prevVlogs = [...vlogsRef.current];
        const vlog = prevVlogs.find((v) => v.id === id);
        const updatedVlogs = prevVlogs.filter((v) => v.id !== id);
        vlogsRef.current = updatedVlogs;
        setVlogs(updatedVlogs);
        const prevBytes = totalBytesRef.current;

        logger(
            'info',
            'Vlog',
            `Deleting vlog ${id}${vlog ? ` (${(vlog.fileSizeBytes / 1024 / 1024).toFixed(1)} MB)` : ''}`,
        );

        if (vlog) {
            const newBytes = Math.max(0, prevBytes - (vlog.fileSizeBytes || 0));
            setTotalBytes(newBytes);
            totalBytesRef.current = newBytes;
            logger(
                'info',
                'Vlog',
                `Freed ${((vlog.fileSizeBytes || 0) / 1024 / 1024).toFixed(1)} MB, new total ${(newBytes / 1024 / 1024).toFixed(1)} MB`,
            );
            FileSystem.deleteAsync(vlog.filePath, { idempotent: true }).then(
                () => logger('info', 'Vlog', `Deleted vlog file ${vlog.filePath}`),
                (err: Error) => logger('warn', 'Storage', 'Failed to delete vlog file:', err),
            );
        }

        try {
            await repoDeleteVlog(id);
            logger('info', 'Vlog', `Vlog ${id} deleted from DB successfully`);
        } catch (error) {
            logger('error', 'Storage', 'Failed to delete vlog:', error);
            vlogsRef.current = prevVlogs;
            setVlogs(prevVlogs);
            setTotalBytes(prevBytes);
            totalBytesRef.current = prevBytes;
            logger('warn', 'Vlog', `Rolled back vlog delete for ${id}`);
            vibrate([0, 500]);
        }
    };

    const updateVlog = async (id: string, patch: Partial<SavedVlog>) => {
        const prevVlogs = [...vlogsRef.current];
        const oldVlog = prevVlogs.find((v) => v.id === id);
        const updatedVlogs = prevVlogs.map((v) => (v.id === id ? { ...v, ...patch } : v));
        vlogsRef.current = updatedVlogs;
        setVlogs(updatedVlogs);

        // Recalculate total vlog storage if fileSize changed
        let delta = 0;
        if (oldVlog && patch.fileSizeBytes !== undefined) {
            const prevBytes = totalBytesRef.current;
            delta = patch.fileSizeBytes - (oldVlog.fileSizeBytes || 0);
            const newBytes = Math.max(0, prevBytes + delta);
            totalBytesRef.current = newBytes;
            setTotalBytes(newBytes);
            logger(
                'info',
                'Vlog',
                `Updating vlog ${id} size: ${((oldVlog.fileSizeBytes || 0) / 1024 / 1024).toFixed(1)} MB → ${(patch.fileSizeBytes / 1024 / 1024).toFixed(1)} MB (delta ${(delta / 1024 / 1024).toFixed(1)} MB)`,
            );
        }

        try {
            await repoUpdateVlog(id, patch);
            logger('info', 'Vlog', `Vlog ${id} updated successfully — ${Object.keys(patch).join(', ')}`);
        } catch (error) {
            logger('error', 'Storage', 'Failed to update vlog:', error);
            vlogsRef.current = prevVlogs;
            setVlogs(prevVlogs);

            // Also rollback totalBytes if we changed it
            if (oldVlog && patch.fileSizeBytes !== undefined) {
                const prevBytes = totalBytesRef.current;
                const newBytes = Math.max(0, prevBytes - delta);
                totalBytesRef.current = newBytes;
                setTotalBytes(newBytes);
                logger('warn', 'Vlog', `Rolled back size update for vlog ${id}`);
            }
            throw error;
        }
    };

    const cleanupOrphanedVlogs = async (): Promise<number> => {
        const knownPaths = new Set(vlogsRef.current.map((v) => v.filePath));
        return cleanupOrphanFiles(knownPaths);
    };

    const getStorageSummary = () => ({
        vlogCount: vlogsRef.current.length,
        vlogBytes: vlogsRef.current.reduce((sum, v) => sum + (v.fileSizeBytes || 0), 0),
        noteCount: 0,
        personCount: 0,
    });

    return { saveVlog, deleteVlog, updateVlog, cleanupOrphanedVlogs, getStorageSummary };
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   FEED OPERATIONS
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

export function createFeedOps(
    bookmarksRef: Ref<string[]>,
    setBookmarks: Setter<string[]>,
    commentsRef: Ref<Record<string, string>>,
    setComments: Setter<Record<string, string>>,
    autoPlayRef: Ref<boolean>,
    setAutoPlay: Setter<boolean>,
) {
    const toggleBookmark = async (noteId: string) => {
        const prev = [...bookmarksRef.current];
        const updated = prev.includes(noteId) ? prev.filter((id) => id !== noteId) : [...prev, noteId];
        bookmarksRef.current = updated;
        setBookmarks(updated);

        try {
            await setSetting('BOOKMARKED_NOTE_IDS', JSON.stringify(updated));
            vibrate([0, 20, 0, 20]);
        } catch (error) {
            logger('error', 'Storage', 'Failed to toggle bookmark:', error);
            bookmarksRef.current = prev;
            setBookmarks(prev);
            vibrate([0, 500]);
        }
    };

    const saveFeedComment = async (noteId: string, comment: string) => {
        const prev = commentsRef.current;
        let updated: Record<string, string>;
        if (!comment.trim()) {
            updated = Object.fromEntries(Object.entries(prev).filter(([key]) => key !== noteId));
        } else {
            updated = { ...prev, [noteId]: comment };
        }
        commentsRef.current = updated;
        setComments(updated);

        try {
            await setSetting('FEED_COMMENTS', JSON.stringify(updated));
        } catch (error) {
            logger('error', 'Storage', 'Failed to save comment:', error);
            commentsRef.current = prev;
            setComments(prev);
        }
    };

    const toggleAutoPlayFeedVideos = async (enabled: boolean) => {
        const prev = autoPlayRef.current;
        setAutoPlay(enabled);
        autoPlayRef.current = enabled;
        try {
            await setSetting('AUTO_PLAY_FEED_VIDEOS', JSON.stringify(enabled));
        } catch (error) {
            logger('error', 'Storage', 'Failed to toggle auto-play:', error);
            setAutoPlay(prev);
            autoPlayRef.current = prev;
        }
    };

    return { toggleBookmark, saveFeedComment, toggleAutoPlayFeedVideos };
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   PREFERENCES OPERATIONS
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

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
        logMode: Ref<boolean>;
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
        setLogMode: Setter<boolean>;
    },
) {
    const savePreferences = async (fIdx: number, sIdx: number) => {
        const prevFont = refs.fontIndex.current;
        const prevSize = refs.sizeIndex.current;
        setters.setFontIndex(fIdx);
        setters.setSizeIndex(sIdx);
        refs.fontIndex.current = fIdx;
        refs.sizeIndex.current = sIdx;
        try {
            await setSetting('USER_FONT_IDX', String(fIdx));
            await setSetting('USER_SIZE_IDX', String(sIdx));
        } catch (error) {
            logger('error', 'Storage', 'Failed to save preferences:', error);
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
        try {
            await setSetting('USE_BIOMETRICS', JSON.stringify(val));
        } catch (error) {
            logger('error', 'Storage', 'Failed to update biometrics pref:', error);
            setters.setUseBiometrics(prev);
            refs.useBiometrics.current = prev;
        }
    };

    const updateHapticsPref = async (val: boolean) => {
        const prev = refs.enableHaptics.current;
        setters.setEnableHaptics(val);
        refs.enableHaptics.current = val;
        setGlobalHapticsEnabled(val);
        try {
            await setSetting('ENABLE_HAPTICS', JSON.stringify(val));
        } catch {
            setters.setEnableHaptics(prev);
            refs.enableHaptics.current = prev;
            setGlobalHapticsEnabled(prev);
        }
    };

    const updateLockTimeout = async (mins: number) => {
        const prev = refs.lockTimeoutMins.current;
        setters.setLockTimeoutMins(mins);
        refs.lockTimeoutMins.current = mins;
        try {
            await setSetting('LOCK_TIMEOUT_MINS', String(mins));
        } catch {
            setters.setLockTimeoutMins(prev);
            refs.lockTimeoutMins.current = prev;
        }
    };

    const updateVlogQuality = async (q: string) => {
        const prev = refs.vlogQuality.current;
        setters.setVlogQuality(q);
        refs.vlogQuality.current = q;
        try {
            await setSetting('VLOG_QUALITY', q);
        } catch (err) {
            logger('error', 'Storage', 'Failed to save vlog quality:', err);
            setters.setVlogQuality(prev);
            refs.vlogQuality.current = prev;
        }
    };

    const updateCompressionPreset = async (preset: string) => {
        const prev = refs.compressionPreset.current;
        setters.setCompressionPreset(preset);
        refs.compressionPreset.current = preset;
        try {
            await setSetting('COMPRESSION_PRESET', preset);
        } catch (err) {
            logger('error', 'Storage', 'Failed to save compression preset:', err);
            setters.setCompressionPreset(prev);
            refs.compressionPreset.current = prev;
        }
    };

    const toggleDevMode = async () => {
        const prevVal = refs.devMode.current;
        const newVal = !prevVal;
        setters.setDevMode(newVal);
        refs.devMode.current = newVal;
        setPerfEnabled(newVal);
        try {
            await setSetting('DEV_MODE', JSON.stringify(newVal));
        } catch (error) {
            logger('error', 'Storage', 'Failed to toggle dev mode:', error);
            setters.setDevMode(prevVal);
            refs.devMode.current = prevVal;
        }
    };

    const toggleDebugLayout = async () => {
        const prevVal = refs.debugLayout.current;
        const newVal = !prevVal;
        setters.setDebugLayout(newVal);
        refs.debugLayout.current = newVal;
        try {
            await setSetting('DEBUG_LAYOUT', JSON.stringify(newVal));
        } catch (error) {
            logger('error', 'Storage', 'Failed to toggle debug layout:', error);
            setters.setDebugLayout(prevVal);
            refs.debugLayout.current = prevVal;
        }
    };

    const saveVisionBoard = async (newBoard: VisionBoard) => {
        const prev = refs.visionBoard.current;
        setters.setVisionBoard(newBoard);
        refs.visionBoard.current = newBoard;
        try {
            await setSetting('VISION_BOARD', JSON.stringify(newBoard));
        } catch (error) {
            logger('error', 'Storage', 'Failed to save vision board:', error);
            setters.setVisionBoard(prev);
            refs.visionBoard.current = prev;
        }
    };

    const updatePreferPinAuth = async (val: boolean) => {
        const prev = refs.preferPinAuth.current;
        setters.setPreferPinAuth(val);
        refs.preferPinAuth.current = val;
        try {
            await setSetting('PREFER_PIN_AUTH', JSON.stringify(val));
        } catch (error) {
            logger('error', 'Storage', 'Failed to update prefer PIN auth:', error);
            setters.setPreferPinAuth(prev);
            refs.preferPinAuth.current = prev;
        }
    };

    const toggleLogMode = async () => {
        const prevVal = refs.logMode.current;
        const newVal = !prevVal;
        setters.setLogMode(newVal);
        refs.logMode.current = newVal;
        try {
            await setSetting('LOG_MODE', JSON.stringify(newVal));
        } catch (error) {
            logger('error', 'Storage', 'Failed to toggle log mode:', error);
            setters.setLogMode(prevVal);
            refs.logMode.current = prevVal;
        }
    };

    return {
        savePreferences,
        updateBiometricsPref,
        updateHapticsPref,
        updateLockTimeout,
        updateVlogQuality,
        updateCompressionPreset,
        toggleDevMode,
        toggleDebugLayout,
        saveVisionBoard,
        updatePreferPinAuth,
        toggleLogMode,
    };
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   AI CONFIG OPERATIONS
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

export function createAiConfigOps(
    refs: {
        aiApiKey: Ref<string>;
        aiBaseUrl: Ref<string>;
        aiModel: Ref<string>;
        aiGrammarModel: Ref<string>;
        aiPrompts: Ref<AiPrompts>;
        autoGenerateSummaries: Ref<boolean>;
        aiFavoriteModels: Ref<string[]>;
    },
    setters: {
        setAiApiKey: Setter<string>;
        setAiBaseUrl: Setter<string>;
        setAiModel: Setter<string>;
        setAiGrammarModel: Setter<string>;
        setAiPrompts: Setter<AiPrompts>;
        setAutoGenerateSummaries: Setter<boolean>;
        setAiFavoriteModels: Setter<string[]>;
    },
) {
    const saveAiApiKey = async (key: string) => {
        const prev = refs.aiApiKey.current;
        setters.setAiApiKey(key);
        refs.aiApiKey.current = key;
        try {
            await setSetting(AI_STORAGE_KEYS.API_KEY, key);
        } catch (error) {
            logger('error', 'Storage', 'Failed to save AI API key:', error);
            setters.setAiApiKey(prev);
            refs.aiApiKey.current = prev;
        }
    };

    const saveAiBaseUrl = async (url: string) => {
        const prev = refs.aiBaseUrl.current;
        setters.setAiBaseUrl(url);
        refs.aiBaseUrl.current = url;
        try {
            await setSetting(AI_STORAGE_KEYS.BASE_URL, url);
        } catch (error) {
            logger('error', 'Storage', 'Failed to save AI base URL:', error);
            setters.setAiBaseUrl(prev);
            refs.aiBaseUrl.current = prev;
        }
    };

    const saveAiModel = async (model: string) => {
        const prev = refs.aiModel.current;
        setters.setAiModel(model);
        refs.aiModel.current = model;
        try {
            await setSetting(AI_STORAGE_KEYS.MODEL, model);
        } catch (error) {
            logger('error', 'Storage', 'Failed to save AI model:', error);
            setters.setAiModel(prev);
            refs.aiModel.current = prev;
        }
    };

    const saveAiGrammarModel = async (grammarModel: string) => {
        const prev = refs.aiGrammarModel.current;
        setters.setAiGrammarModel(grammarModel);
        refs.aiGrammarModel.current = grammarModel;
        try {
            await setSetting(AI_STORAGE_KEYS.GRAMMAR_MODEL, grammarModel);
        } catch (error) {
            logger('error', 'Storage', 'Failed to save AI grammar model:', error);
            setters.setAiGrammarModel(prev);
            refs.aiGrammarModel.current = prev;
        }
    };

    const saveAiPrompts = async (prompts: AiPrompts) => {
        const prev = refs.aiPrompts.current;
        setters.setAiPrompts(prompts);
        refs.aiPrompts.current = prompts;
        try {
            await setSetting(AI_STORAGE_KEYS.PROMPTS, JSON.stringify(prompts));
        } catch (error) {
            logger('error', 'Storage', 'Failed to save AI prompts:', error);
            setters.setAiPrompts(prev);
            refs.aiPrompts.current = prev;
        }
    };

    const updateAutoGenerateSummaries = async (val: boolean) => {
        const prev = refs.autoGenerateSummaries.current;
        setters.setAutoGenerateSummaries(val);
        refs.autoGenerateSummaries.current = val;
        try {
            await setSetting('AUTO_GENERATE_SUMMARIES', JSON.stringify(val));
        } catch {
            setters.setAutoGenerateSummaries(prev);
            refs.autoGenerateSummaries.current = prev;
        }
    };

    const saveAiFavoriteModels = async (models: string[]) => {
        const prev = refs.aiFavoriteModels.current;
        setters.setAiFavoriteModels(models);
        refs.aiFavoriteModels.current = models;
        try {
            await setSetting(AI_STORAGE_KEYS.FAVORITE_MODELS, JSON.stringify(models));
        } catch (error) {
            logger('error', 'Storage', 'Failed to save AI favorite models:', error);
            setters.setAiFavoriteModels(prev);
            refs.aiFavoriteModels.current = prev;
        }
    };

    return {
        saveAiApiKey,
        saveAiBaseUrl,
        saveAiModel,
        saveAiGrammarModel,
        saveAiPrompts,
        updateAutoGenerateSummaries,
        saveAiFavoriteModels,
    };
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   CROSS-CUTTING OPERATIONS
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

export function createCrossCuttingOps(
    notesOps: ReturnType<typeof createNotesOps>,
    refs: {
        notesRef: Ref<SavedNote[]>;
        personsRef: Ref<Person[]>;
        currentStreakRef: Ref<number>;
        lastWinDateRef: Ref<string>;
        streakHistoryRef: Ref<string[]>;
        fontIndexRef: Ref<number>;
        sizeIndexRef: Ref<number>;
        useBiometricsRef: Ref<boolean>;
        devModeRef: Ref<boolean>;
        debugLayoutRef: Ref<boolean>;
        visionBoardRef: Ref<VisionBoard | null>;
        savedVlogsRef: Ref<SavedVlog[]>;
        totalVlogStorageBytesRef: Ref<number>;
        bookmarkedNoteIdsRef: Ref<string[]>;
        feedCommentsRef: Ref<Record<string, string>>;
        autoPlayFeedVideosRef: Ref<boolean>;
    },
    setters: {
        setSavedNotes: Setter<SavedNote[]>;
        setPersons: Setter<Person[]>;
        setCurrentStreak: Setter<number>;
        setLastWinDate: Setter<string>;
        setStreakHistory: Setter<string[]>;
        setFontIndex: Setter<number>;
        setSizeIndex: Setter<number>;
        setUseBiometrics: Setter<boolean>;
        setDevMode: Setter<boolean>;
        setDebugLayout: Setter<boolean>;
        setVisionBoard: Setter<VisionBoard | null>;
        setLastReflectionDate: Setter<number | null>;
        setSavedVlogs: Setter<SavedVlog[]>;
        setTotalVlogStorageBytes: Setter<number>;
        setBookmarkedNoteIds: Setter<string[]>;
        setFeedComments: Setter<Record<string, string>>;
        setAutoPlayFeedVideos: Setter<boolean>;
    },
) {
    const clearAllData = async () => {
        await deleteAllNotes();
        await deleteAllPersons();
        await deleteAllVlogs();
        await (await import('@/lib/repositories/settingsRepository')).deleteAllSettings();

        // Also clean local files
        const vlogDir = `${FileSystem.documentDirectory}${CONFIG.VLOG_STORAGE_DIR}`;
        try {
            await FileSystem.deleteAsync(vlogDir, { idempotent: true });
        } catch (err) {
            logger('warn', 'Storage', 'Failed to delete vlog directory:', err);
        }

        refs.notesRef.current = [];
        setters.setSavedNotes([]);
        refs.personsRef.current = [];
        setters.setPersons([]);
        refs.currentStreakRef.current = 0;
        setters.setCurrentStreak(0);
        refs.lastWinDateRef.current = '';
        setters.setLastWinDate('');
        refs.streakHistoryRef.current = [];
        setters.setStreakHistory([]);
        refs.fontIndexRef.current = 0;
        setters.setFontIndex(0);
        refs.sizeIndexRef.current = 1;
        setters.setSizeIndex(1);
        refs.useBiometricsRef.current = true;
        setters.setUseBiometrics(true);
        refs.devModeRef.current = false;
        setters.setDevMode(false);
        refs.debugLayoutRef.current = false;
        setters.setDebugLayout(false);
        refs.visionBoardRef.current = null;
        setters.setVisionBoard(null);
        refs.savedVlogsRef.current = [];
        setters.setSavedVlogs([]);
        refs.totalVlogStorageBytesRef.current = 0;
        setters.setTotalVlogStorageBytes(0);
        refs.bookmarkedNoteIdsRef.current = [];
        setters.setBookmarkedNoteIds([]);
        refs.feedCommentsRef.current = {};
        setters.setFeedComments({});
        refs.autoPlayFeedVideosRef.current = true;
        setters.setAutoPlayFeedVideos(true);
    };

    const saveAlignmentReflection = async (
        reflection: AlignmentReflection,
    ): Promise<{ streakIncreased: boolean; newStreak: number }> => {
        const result = await notesOps.saveNote(reflection);
        const now = Date.now();
        setters.setLastReflectionDate(now);
        try {
            await setSetting('LAST_REFLECTION_DATE', String(now));
        } catch (error) {
            logger('error', 'Storage', 'Failed to save reflection date:', error);
        }
        return result;
    };

    return { clearAllData, saveAlignmentReflection };
}

// Re-export safeParse for backwards compat with existing
