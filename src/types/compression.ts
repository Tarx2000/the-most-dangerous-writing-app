/**
 * Compression Queue Types — Live tracking for background video compression.
 *
 * Mirrors the AI queue pattern (AiJob / AiQueueState) so the UI can
 * display consistent progress bars, troubleshoot failures, and cancel
 * or retry jobs.
 */

/** A single video compression job tracked by the queue */
export interface CompressionJob {
    /** Unique job identifier */
    id: string;
    /** The vlog ID being compressed */
    vlogId: string;
    /** Absolute path to the video file */
    filePath: string;
    /** Current status in the queue */
    status: 'queued' | 'processing' | 'done' | 'failed' | 'cancelled';
    /** Compression preset ID applied */
    presetId: string;
    /** Progress 0.0 → 1.0 (updated during processing) */
    progress: number;
    /** When the job was created */
    createdAt: number;
    /** When processing started */
    startedAt?: number;
    /** When processing completed or failed */
    completedAt?: number;
    /** Human-readable error if failed */
    error?: string;
    /** How many times this job has been retried */
    retryCount: number;
}

/** Live state of the compression queue — exposed to UI via context */
export interface CompressionQueueState {
    /** Is the compressor currently active? */
    isProcessing: boolean;
    /** Which job is running right now? */
    currentJob: CompressionJob | null;
    /** How many jobs are waiting or processing? */
    pendingCount: number;
    /** All active jobs (queued + processing + failed) for the UI panel */
    jobs: CompressionJob[];
}
