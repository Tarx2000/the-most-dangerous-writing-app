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
    /** Short entry (≤ TWEET_THRESHOLD words) — no AI, no streak, no timer */
    isTweet?: boolean;
    /** AI-generated short headline summarizing the entry (max 8 words) */
    aiTitle?: string;
    /** AI-generated bullet-point summary (2-5 key takeaways) */
    aiSummary?: string[];
    /** The AI model used to generate the summary */
    aiModelUsed?: string;
    /** Discriminator for alignment reflections */
    isAlignmentReflection?: boolean;
    /** Reference to a custom Pillar this note is a reflection for */
    pillarId?: string;
    /** Reference to a Life Advice card this note is a reflection for */
    adviceId?: string;
    /** The numeric Pillar value logged during this reflection session */
    pillarValue?: number;
    /** The version of the Mastery rules active when this reflection was written */
    pillarVersion?: number;
}

/** Union type for any note entry */
export type NoteEntry = SavedNote | AlignmentReflection;

export type SortOption = 'newest' | 'oldest' | 'longest' | 'shortest' | 'longest-text';
