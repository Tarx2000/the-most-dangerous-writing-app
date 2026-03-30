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
