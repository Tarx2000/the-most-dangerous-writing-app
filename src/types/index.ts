/**
 * Pre-defined relationship categories.
 * Users can also add custom ones via the profile edit screen.
 */
export const RELATIONSHIP_OPTIONS = [
    'Friend',
    'Family',
    'Partner',
    'Colleague',
    'Mentor',
    'School Mate',
    'Childhood Friend',
    'Neighbor',
    'Acquaintance',
    'Other',
] as const;

/**
 * Person — Represents a person in the user's Circle.
 *
 * Profile fields are optional: empty fields are hidden on the profile view
 * and only shown when the user fills them in via "Edit Profile".
 */
export interface Person {
    id: string;
    name: string;
    createdAt: number;
    /** Optional display name / alias */
    nickname?: string;
    /** Relationship type (from RELATIONSHIP_OPTIONS or custom) */
    relationship?: string;
    /** Birthday in ISO date string format (YYYY-MM-DD) */
    birthday?: string;
    /** Free-text personal notes / bio about this person */
    bio?: string;
    /** User-defined relationship categories (beyond the pre-defined list) */
    customRelationships?: string[];
}

export interface SavedNote {
    id: string;
    text: string;
    dateStr: string;
    timestamp: number;
    durationMin: number;
    won: boolean;
    personId?: string;
    isQuickNote?: boolean;
    /** AI-generated short headline summarizing the entry (max 8 words) */
    aiTitle?: string;
    /** AI-generated bullet-point summary (2-5 key takeaways) */
    aiSummary?: string[];
    /** The AI model used to generate the summary */
    aiModelUsed?: string;
    /** Discriminator for alignment reflections */
    isAlignmentReflection?: boolean;
}

/** Type guard to check if a note is an AlignmentReflection */
export function isAlignmentReflection(note: SavedNote): note is AlignmentReflection {
    return (note as AlignmentReflection).isAlignmentReflection === true;
}

/** Union type for any note entry */
export type NoteEntry = SavedNote | AlignmentReflection;

export type SortOption = 'newest' | 'oldest' | 'longest' | 'shortest' | 'longest-text';

export interface VisionBoard {
    health: string;
    career: string;
    relationships: string;
    mindset: string;
}

export interface AlignmentReflection extends SavedNote {
    alignmentScore: number;
    stopText: string;
    startText: string;
    continueText: string;
    isAlignmentReflection: true;
}

/**
 * SavedVlog — Represents a recorded video journal entry.
 *
 * The actual video file is stored in the app's private `documentDirectory/vlogs/`
 * directory (invisible to the device gallery). This metadata object is persisted
 * in AsyncStorage for quick listing, calendar display, and playback reference.
 */
export interface SavedVlog {
    id: string;
    /** Absolute path to the video file in the app's private documentDirectory */
    filePath: string;
    /** Human-readable date string for display (e.g. "Mar 31, 2026 01:30 AM") */
    dateStr: string;
    /** Unix timestamp for sorting and calendar day mapping */
    timestamp: number;
    /** Recording duration in seconds */
    durationSec: number;
    /** File size in bytes (for storage usage tracking) */
    fileSizeBytes: number;
    /** Cached thumbnail image path (generated on first view via expo-video-thumbnails) */
    thumbnailPath?: string;
}

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
    action: 'enqueue' | 'start' | 'success' | 'fail' | 'cancel' | 'orphan_recovery' | 'retry';
    /** Which note was involved */
    noteId: string;
    /** Which AI model was used */
    model: string;
    /** Which phase of AI processing */
    phase: 'title' | 'summary' | 'both' | 'batch';
    /** How long the operation took (ms) */
    durationMs?: number;
    /** Error message if applicable */
    error?: string;
}
