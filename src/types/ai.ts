/* ── AI Queue Types ──────────────────────────────────────────────────── */

/** Category for batch ordering: Journals → Circles → Check-ins */
export type AiJobCategory = 'journal' | 'circle' | 'checkin';

/** A single AI processing job in the queue */
export interface AiJob {
    /** Unique job identifier */
    id: string;
    /** The note ID to process */
    noteId: string;
    /** Category for batch ordering */
    category: AiJobCategory;
    /** Current job status */
    status: 'queued' | 'processing' | 'done' | 'failed';
    /** When the job was created */
    createdAt: number;
    /** When processing started */
    startedAt?: number;
    /** When processing completed */
    completedAt?: number;
    /** Error message if failed */
    error?: string;
    /** How many times this job has been retried */
    retryCount: number;
}

/** Live state of the AI Queue — exposed to UI via useAiQueue hook */
export interface AiQueueState {
    /** Is the queue processor currently active? */
    isProcessing: boolean;
    /** Which job is running right now? */
    currentJob: AiJob | null;
    /** How many jobs are waiting in the queue? */
    pendingCount: number;
    /** Batch progress (null if not a batch run) */
    batchProgress: { current: number; total: number } | null;
    /** Which category is currently being processed? */
    currentCategory: AiJobCategory | null;
    /** Is the AI server reachable? */
    serverOnline: boolean | null;
    /** Most recent error that caused the server to go offline, if any */
    lastError?: string;
    /** All jobs currently in the queue (for the AI status panel) */
    jobs: AiJob[];
}

/** Structured log entry for AI operations */
export interface AiLogEntry {
    /** When the event occurred */
    timestamp: number;
    /** What happened */
    action: 'enqueue' | 'start' | 'success' | 'fail' | 'cancel' | 'orphan_recovery' | 'retry' | 'timeout' | 'stall_recovery' | 'init' | 'config';
    /** Which note was involved */
    noteId: string;
    /** Which AI model was used */
    model: string;
    /** Which phase of AI processing */
    phase: 'title' | 'summary' | 'both';
    /** How long the operation took (ms) */
    durationMs?: number;
    /** Error message if applicable */
    error?: string;
}
