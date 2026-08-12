/**
 * CompressionQueueProvider — Single-Instance Compression Queue Context
 *
 * Eliminates the issue of multiple screens each subscribing to
 * DeviceEventEmitter and calling updateDependencies on the same singleton.
 *
 * This provider creates ONE subscription and exposes the queue state +
 * actions via context. All screens consume from this single source.
 *
 * Must be nested inside StorageProvider (uses useVlogs for updateVlog).
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { compressionQueue, COMPRESSION_QUEUE_EVENT } from '@/lib/compressionQueue';
import { useVlogs } from '@/lib/hooks/useStorage';
import type { CompressionQueueState } from '@/types';

/* ── Context Type ──────────────────────────────────────────────────────── */

interface CompressionQueueContextType {
    /** Current state of the compression queue */
    compressionState: CompressionQueueState;
    /** Check if a vlog is actively being compressed */
    isVlogActive: (vlogId: string) => boolean;
    /** Check if a vlog is waiting in the queue */
    isVlogQueued: (vlogId: string) => boolean;
    /** Check if a vlog has any active job (queued or processing) */
    isVlogInQueue: (vlogId: string) => boolean;
    /** Get the active job for a specific vlog */
    getJobForVlog: (vlogId: string) => CompressionQueueState['jobs'][number] | undefined;
    /** Enqueue a vlog for compression */
    enqueueVlog: (vlogId: string, filePath: string, presetId: string) => Promise<void>;
    /** Cancel a queued job (active jobs cannot be cancelled) */
    cancelJob: (jobId: string) => Promise<void>;
    /** Retry a failed or cancelled job */
    retryJob: (jobId: string) => Promise<void>;
    /** Clear all queued and failed jobs */
    clearPending: () => Promise<void>;
    /** Count of active or pending jobs */
    activeCount: number;
}

const CompressionQueueContext = createContext<CompressionQueueContextType | null>(null);

/* ── Provider ──────────────────────────────────────────────────────────── */

export const CompressionQueueProvider = ({ children }: { children: ReactNode }) => {
    const { updateVlog } = useVlogs();
    const [compressionState, setCompressionState] = useState<CompressionQueueState>(compressionQueue.getState());

    const queueInitedRef = useRef(false);
    const updateVlogRef = useRef(updateVlog);
    updateVlogRef.current = updateVlog;

    // Update queue dependencies when storage context refreshes
    useEffect(() => {
        compressionQueue.updateDependencies((id, patch) => updateVlogRef.current(id, patch));
    }, [updateVlog]);

    // Single event subscription for the entire app
    useEffect(() => {
        const subscription = DeviceEventEmitter.addListener(COMPRESSION_QUEUE_EVENT, (state: CompressionQueueState) =>
            setCompressionState(state),
        );
        setCompressionState(compressionQueue.getState());
        return () => subscription.remove();
    }, []);

    // Auto-initialize once storage has the vlog update function
    useEffect(() => {
        if (!queueInitedRef.current && !compressionQueue.isInitialized) {
            queueInitedRef.current = true;
            // Queue init must never crash startup (e.g. corrupt persisted jobs).
            compressionQueue
                .initialize((id, patch) => updateVlogRef.current(id, patch))
                .catch((err) => {
                    console.warn('[CompressionQueue] initialize failed:', err);
                });
        }
    }, [updateVlog]);

    const isVlogActive = useCallback((vlogId: string) => compressionQueue.isVlogActive(vlogId), []);

    const isVlogQueued = useCallback((vlogId: string) => compressionQueue.isVlogQueued(vlogId), []);

    const isVlogInQueue = useCallback((vlogId: string) => compressionQueue.isVlogInQueue(vlogId), []);

    const getJobForVlog = useCallback((vlogId: string) => compressionQueue.getJobForVlog(vlogId), []);

    const enqueueVlog = useCallback(async (vlogId: string, filePath: string, presetId: string) => {
        await compressionQueue.enqueue(vlogId, filePath, presetId);
    }, []);

    const cancelJob = useCallback(async (jobId: string) => {
        await compressionQueue.cancelJob(jobId);
    }, []);

    const retryJob = useCallback(async (jobId: string) => {
        await compressionQueue.retryJob(jobId);
    }, []);

    const clearPending = useCallback(async () => {
        await compressionQueue.clearPending();
    }, []);

    const value = React.useMemo<CompressionQueueContextType>(
        () => ({
            compressionState,
            isVlogActive,
            isVlogQueued,
            isVlogInQueue,
            getJobForVlog,
            enqueueVlog,
            cancelJob,
            retryJob,
            clearPending,
            activeCount: compressionQueue.getActiveCount(),
        }),
        [
            compressionState,
            isVlogActive,
            isVlogQueued,
            isVlogInQueue,
            getJobForVlog,
            enqueueVlog,
            cancelJob,
            retryJob,
            clearPending,
        ],
    );

    return <CompressionQueueContext.Provider value={value}>{children}</CompressionQueueContext.Provider>;
};

/* ── Hook ──────────────────────────────────────────────────────────────── */

/** Access the centralized Compression Queue state + actions. */
export function useCompressionQueueContext(): CompressionQueueContextType {
    const ctx = useContext(CompressionQueueContext);
    if (!ctx) throw new Error('useCompressionQueueContext must be used within CompressionQueueProvider');
    return ctx;
}
