export interface Person {
    id: string;
    name: string;
    createdAt: number;
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
