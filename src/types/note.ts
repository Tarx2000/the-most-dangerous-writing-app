import type { AlignmentReflection } from './alignment';

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

/** Union type for any note entry */
export type NoteEntry = SavedNote | AlignmentReflection;

export type SortOption = 'newest' | 'oldest' | 'longest' | 'shortest' | 'longest-text';
