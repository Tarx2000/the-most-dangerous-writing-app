import type { AiPrompts } from '@/config/ai';
import type { SavedNote } from '@/types';
import { useState, useEffect, useCallback, useRef } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { aiQueue, AI_QUEUE_EVENT } from '@/lib/aiQueue';
import type { AiQueueState, AiJobCategory } from '@/types';

/** Return type for the hook */
interface UseAiQueueReturn {
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
    /** Initialize the queue manager (call once from HomeScreen) */
    initializeQueue: () => Promise<void>;
}

/** Dependencies the hook needs from the storage layer */
interface UseAiQueueDeps {
    aiApiKey: string;
    aiBaseUrl: string;
    aiModel: string;
    aiPrompts: AiPrompts;
    savedNotes: SavedNote[];
    updateNote: (id: string, updates: Partial<SavedNote>) => Promise<void>;
}

/**
 * React hook for interacting with the AI Queue Manager.
 *
 * @param deps - Storage dependencies (AI config + notes access)
 * @returns Queue state and action functions
 */
export function useAiQueue(deps: UseAiQueueDeps): UseAiQueueReturn {
    const [queueState, setQueueState] = useState<AiQueueState>(aiQueue.getState());

    // Keep queue dependencies up to date
    const depsRef = useRef(deps);
    depsRef.current = deps;

    useEffect(() => {
        aiQueue.updateDependencies(
            () => ({
                apiKey: depsRef.current.aiApiKey,
                baseUrl: depsRef.current.aiBaseUrl,
                model: depsRef.current.aiModel,
                prompts: depsRef.current.aiPrompts,
            }),
            (noteId) => depsRef.current.savedNotes.find((n: SavedNote) => n.id === noteId),
            depsRef.current.updateNote,
            () => depsRef.current.savedNotes,
        );
    }, [deps.aiApiKey, deps.aiBaseUrl, deps.aiModel, deps.savedNotes.length]);

    // Subscribe to queue events
    useEffect(() => {
        const subscription = DeviceEventEmitter.addListener(
            AI_QUEUE_EVENT,
            (state: AiQueueState) => setQueueState(state)
        );

        // Get initial state
        setQueueState(aiQueue.getState());

        return () => subscription.remove();
    }, []);

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
    const enqueueNote = useCallback(
        async (noteId: string, category: AiJobCategory) => {
            await aiQueue.enqueueNote(noteId, category);
        },
        []
    );

    /** Start batch processing */
    const startBatch = useCallback(
        async (forceOverwrite: boolean = false, categoryFilter?: Set<AiJobCategory>) => {
            return await aiQueue.enqueueBatch(forceOverwrite, categoryFilter);
        },
        []
    );

    /** Cancel batch processing */
    const cancelBatch = useCallback(
        async () => {
            await aiQueue.cancelBatch();
        },
        []
    );

    /** Initialize the queue manager with current dependencies */
    const initializeQueue = useCallback(async () => {
        await aiQueue.initialize(
            () => ({
                apiKey: depsRef.current.aiApiKey,
                baseUrl: depsRef.current.aiBaseUrl,
                model: depsRef.current.aiModel,
                prompts: depsRef.current.aiPrompts,
            }),
            (noteId) => depsRef.current.savedNotes.find((n: SavedNote) => n.id === noteId),
            depsRef.current.updateNote,
            () => depsRef.current.savedNotes,
        );
    }, []);

    // Auto-initialize queue immediately if not already initialized
    useEffect(() => {
        if (!aiQueue.isInitialized && deps.savedNotes.length > 0) {
            initializeQueue();
        }
    }, [deps.savedNotes.length, initializeQueue]);

    return {
        queueState,
        isNoteActive,
        isNoteQueued,
        enqueueNote,
        startBatch,
        cancelBatch,
        initializeQueue,
    };
}
