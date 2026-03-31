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
}

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
}
