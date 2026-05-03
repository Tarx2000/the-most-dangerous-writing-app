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
import { aiQueue, AI_QUEUE_EVENT, AI_JOB_FAILED_EVENT, AI_JOB_TIMEOUT_EVENT } from '@/lib/aiQueue';
import { resetConnectionState } from '@/lib/aiService';
import { useNotes, useAiConfig, usePersons } from '@/lib/hooks/useStorage';
import type { AiQueueState, AiJobCategory } from '@/types';

/* ── User-Facing Notification Type ────────────────────────────────────── */

export interface AiFailureNotification {
    /** Unique ID for this notification */
    id: string;
    /** Which note failed */
    noteId: string;
    /** Human-readable error message */
    message: string;
    /** When the failure occurred */
    timestamp: number;
    /** Whether this was a hard timeout (vs a retry-exhaustion failure) */
    isTimeout: boolean;
    /** Whether the failure is permanent (config error, max retries) */
    isPermanent: boolean;
}

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
    /** Start batch processing, optionally filtered by category */
    startBatch: (forceOverwrite?: boolean, categoryFilter?: Set<AiJobCategory>) => Promise<number>;
    /** Cancel the current batch (finishes current job) */
    cancelBatch: () => Promise<void>;
    /** Initialize the queue manager (call once on app startup) */
    initializeQueue: () => Promise<void>;
    /** Recent failure notifications for user display (toast/snackbar) */
    failureNotifications: AiFailureNotification[];
    /** Dismiss a failure notification by ID */
    dismissNotification: (id: string) => void;
    /** Clear all failure notifications */
    clearAllNotifications: () => void;
}

const AiQueueContext = createContext<AiQueueContextType | null>(null);

/* ── Provider ──────────────────────────────────────────────────────────── */

export const AiQueueProvider = ({ children }: { children: ReactNode }) => {
    const { savedNotes, updateNote } = useNotes();
    const { aiApiKey, aiBaseUrl, aiModel, aiGrammarModel, aiPrompts } = useAiConfig();
    const { persons } = usePersons();
    const [queueState, setQueueState] = useState<AiQueueState>(aiQueue.getState());
    const [failureNotifications, setFailureNotifications] = useState<AiFailureNotification[]>([]);

    const queueInitedRef = useRef(false);

    // Keep a ref so callbacks always see the latest deps without re-creating
    const depsRef = useRef({ aiApiKey, aiBaseUrl, aiModel, aiGrammarModel, aiPrompts, savedNotes, updateNote, persons });
    depsRef.current = { aiApiKey, aiBaseUrl, aiModel, aiGrammarModel, aiPrompts, savedNotes, updateNote, persons };

    // Update queue dependencies when AI config or notes change
    useEffect(() => {
        aiQueue.updateDependencies(
            () => ({
                apiKey: depsRef.current.aiApiKey,
                baseUrl: depsRef.current.aiBaseUrl,
                model: depsRef.current.aiModel,
                grammarModel: depsRef.current.aiGrammarModel,
                prompts: depsRef.current.aiPrompts,
            }),
            (noteId) => depsRef.current.savedNotes.find(n => n.id === noteId),
            depsRef.current.updateNote,
            () => depsRef.current.savedNotes,
            (personId) => depsRef.current.persons.find(p => p.id === personId)
        );
    }, [aiApiKey, aiBaseUrl, aiModel, aiGrammarModel, aiPrompts, savedNotes.length, persons.length]);

    // Reset connection health when AI config changes so stale offline state
    // doesn't carry over to a new key / endpoint.
    useEffect(() => {
        resetConnectionState();
    }, [aiApiKey, aiBaseUrl, aiModel]);

    // Single event subscription for the entire app — queue state updates
    useEffect(() => {
        const subscription = DeviceEventEmitter.addListener(
            AI_QUEUE_EVENT,
            (state: AiQueueState) => setQueueState(state)
        );
        setQueueState(aiQueue.getState());
        return () => subscription.remove();
    }, []);

    // Listen for permanent job failures — show user notification
    useEffect(() => {
        const sub = DeviceEventEmitter.addListener(
            AI_JOB_FAILED_EVENT,
            (payload: { noteId: string; error: string; permanent?: boolean }) => {
                const notif: AiFailureNotification = {
                    id: `fail-${payload.noteId}-${Date.now()}`,
                    noteId: payload.noteId,
                    message: payload.error || 'AI processing failed after multiple attempts.',
                    timestamp: Date.now(),
                    isTimeout: false,
                    isPermanent: payload.permanent || false,
                };
                setFailureNotifications(prev => [...prev.slice(-4), notif]); // Keep last 5
            }
        );
        return () => sub.remove();
    }, []);

    // Listen for job timeouts — show user notification
    useEffect(() => {
        const sub = DeviceEventEmitter.addListener(
            AI_JOB_TIMEOUT_EVENT,
            (payload: { noteId: string; durationMs: number; reason: string }) => {
                const notif: AiFailureNotification = {
                    id: `timeout-${payload.noteId}-${Date.now()}`,
                    noteId: payload.noteId,
                    message: payload.reason || `AI processing timed out after ${Math.round(payload.durationMs / 1000)}s.`,
                    timestamp: Date.now(),
                    isTimeout: true,
                    isPermanent: true,
                };
                setFailureNotifications(prev => [...prev.slice(-4), notif]); // Keep last 5
            }
        );
        return () => sub.remove();
    }, []);

    // Remove shutdown on unmount — singleton queue must survive component lifecycles.
    // Strict Mode double-mount would otherwise wipe all jobs.
    // Cleanup happens only on explicit app termination (not implemented).

    /** Initialize the queue manager with current dependencies */
    const initializeQueue = useCallback(async () => {
        await aiQueue.initialize(
            () => ({
                apiKey: depsRef.current.aiApiKey,
                baseUrl: depsRef.current.aiBaseUrl,
                model: depsRef.current.aiModel,
                grammarModel: depsRef.current.aiGrammarModel,
                prompts: depsRef.current.aiPrompts,
            }),
            (noteId) => depsRef.current.savedNotes.find(n => n.id === noteId),
            depsRef.current.updateNote,
            () => depsRef.current.savedNotes,
            (personId) => depsRef.current.persons.find(p => p.id === personId)
        );
    }, []);

    // Auto-initialize once storage has hydrated (indicated by non-empty config or notes)
    const configReady = aiApiKey !== '' || aiBaseUrl !== '' || savedNotes.length > 0;
    useEffect(() => {
        if (!queueInitedRef.current && !aiQueue.isInitialized && configReady) {
            queueInitedRef.current = true;
            initializeQueue();
        }
    }, [initializeQueue, configReady]);

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
    const startBatch = useCallback(async (forceOverwrite: boolean = false, categoryFilter?: Set<AiJobCategory>) => {
        return await aiQueue.enqueueBatch(forceOverwrite, categoryFilter);
    }, []);

    /** Cancel batch processing */
    const cancelBatch = useCallback(async () => {
        await aiQueue.cancelBatch();
    }, []);

    /** Dismiss a single notification */
    const dismissNotification = useCallback((id: string) => {
        setFailureNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    /** Clear all notifications */
    const clearAllNotifications = useCallback(() => {
        setFailureNotifications([]);
    }, []);

    const value = React.useMemo<AiQueueContextType>(() => ({
        queueState,
        isNoteActive,
        isNoteQueued,
        enqueueNote,
        startBatch,
        cancelBatch,
        initializeQueue,
        failureNotifications,
        dismissNotification,
        clearAllNotifications,
    }), [queueState, isNoteActive, isNoteQueued, enqueueNote, startBatch, cancelBatch, initializeQueue, failureNotifications, dismissNotification, clearAllNotifications]);

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