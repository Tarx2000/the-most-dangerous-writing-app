/**
 * AiQueueProvider — Single-Instance AI Queue Context
 *
 * Eliminates the issue of 4 separate useAiQueue() instances (HomeScreen,
 * StartScreen, LibraryScreen, PostWritingScreen) each subscribing to
 * DeviceEventEmitter and calling updateDependencies on the same singleton.
 *
 * This provider creates ONE subscription and exposes the queue state +
 * actions via context. All screens consume from this single source.
 *
 * Must be nested inside StorageProvider (uses useNotes + useAiConfig).
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { aiQueue, AI_QUEUE_EVENT } from '@/lib/aiQueue';
import { useNotes } from '@/lib/hooks/useStorage';
import { useAiConfig } from '@/lib/hooks/useStorage';
import type { AiQueueState, AiJobCategory } from '@/types';

/* ── Context Type ──────────────────────────────────────────────────────── */

interface AiQueueContextType {
    /** Current state of the AI queue */
    queueState: AiQueueState;
    /** Check if a specific note is actively processing */
    isNoteActive: (noteId: string) => boolean;
    /** Check if a specific note is waiting in the queue */
    isNoteQueued: (noteId: string) => boolean;
    /** Enqueue a single note for AI processing */
    enqueueNote: (noteId: string, category: AiJobCategory) => Promise<void>;
    /** Start batch processing all unprocessed notes */
    startBatch: (forceOverwrite?: boolean) => Promise<number>;
    /** Cancel the current batch (finishes current job) */
    cancelBatch: () => Promise<void>;
    /** Initialize the queue manager (call once on app startup) */
    initializeQueue: () => Promise<void>;
}

const AiQueueContext = createContext<AiQueueContextType | null>(null);

/* ── Provider ──────────────────────────────────────────────────────────── */

export const AiQueueProvider = ({ children }: { children: ReactNode }) => {
    const { savedNotes, updateNote } = useNotes();
    const { aiApiKey, aiBaseUrl, aiModel, aiPrompts } = useAiConfig();
    const [queueState, setQueueState] = useState<AiQueueState>(aiQueue.getState());

    // Keep a ref so callbacks always see the latest deps without re-creating
    const depsRef = useRef({ aiApiKey, aiBaseUrl, aiModel, aiPrompts, savedNotes, updateNote });
    depsRef.current = { aiApiKey, aiBaseUrl, aiModel, aiPrompts, savedNotes, updateNote };

    // Update queue dependencies when AI config or notes change
    useEffect(() => {
        aiQueue.updateDependencies(
            () => ({
                apiKey: depsRef.current.aiApiKey,
                baseUrl: depsRef.current.aiBaseUrl,
                model: depsRef.current.aiModel,
                prompts: depsRef.current.aiPrompts,
            }),
            (noteId) => depsRef.current.savedNotes.find(n => n.id === noteId),
            depsRef.current.updateNote,
            () => depsRef.current.savedNotes,
        );
    }, [aiApiKey, aiBaseUrl, aiModel, savedNotes.length]);

    // Single event subscription for the entire app
    useEffect(() => {
        const subscription = DeviceEventEmitter.addListener(
            AI_QUEUE_EVENT,
            (state: AiQueueState) => setQueueState(state)
        );
        setQueueState(aiQueue.getState());
        return () => subscription.remove();
    }, []);

    // Auto-initialize queue when notes are available
    const queueInitedRef = useRef(false);
    useEffect(() => {
        if (savedNotes.length > 0 && !queueInitedRef.current && !aiQueue.isInitialized) {
            queueInitedRef.current = true;
            initializeQueue();
        }
    }, [savedNotes.length]);

    /** Check if a specific note is actively processing */
    const isNoteActive = useCallback(
        (noteId: string) => aiQueue.isNoteActive(noteId),
        []
    );

    /** Check if a specific note is queued */
    const isNoteQueued = useCallback(
        (noteId: string) => aiQueue.isNoteQueued(noteId),
        []
    );

    /** Enqueue a single note */
    const enqueueNote = useCallback(async (noteId: string, category: AiJobCategory) => {
        await aiQueue.enqueueNote(noteId, category);
    }, []);

    /** Start batch processing */
    const startBatch = useCallback(async (forceOverwrite: boolean = false) => {
        return await aiQueue.enqueueBatch(forceOverwrite);
    }, []);

    /** Cancel batch processing */
    const cancelBatch = useCallback(async () => {
        await aiQueue.cancelBatch();
    }, []);

    /** Initialize the queue manager with current dependencies */
    const initializeQueue = useCallback(async () => {
        await aiQueue.initialize(
            () => ({
                apiKey: depsRef.current.aiApiKey,
                baseUrl: depsRef.current.aiBaseUrl,
                model: depsRef.current.aiModel,
                prompts: depsRef.current.aiPrompts,
            }),
            (noteId) => depsRef.current.savedNotes.find(n => n.id === noteId),
            depsRef.current.updateNote,
            () => depsRef.current.savedNotes,
        );
    }, []);

    const value = React.useMemo<AiQueueContextType>(() => ({
        queueState,
        isNoteActive,
        isNoteQueued,
        enqueueNote,
        startBatch,
        cancelBatch,
        initializeQueue,
    }), [queueState, isNoteActive, isNoteQueued, enqueueNote, startBatch, cancelBatch, initializeQueue]);

    return (
        <AiQueueContext.Provider value={value}>
            {children}
        </AiQueueContext.Provider>
    );
};

/* ── Hook ──────────────────────────────────────────────────────────────── */

/**
 * Access the centralized AI Queue state + actions.
 * Must be used within AiQueueProvider (nested inside StorageProvider).
 */
export function useAiQueueContext(): AiQueueContextType {
    const ctx = useContext(AiQueueContext);
    if (!ctx) throw new Error('useAiQueueContext must be used within AiQueueProvider');
    return ctx;
}
