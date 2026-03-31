export type RootStackParamList = {
    Home: { streakIncreased?: boolean; newStreak?: number } | undefined;
    Start: undefined;
    Writing: {
        timeIndex: number;
        diffIndex: number;
        mode: 'journal' | 'circles';
        personId: string | null;
        isQuickNote?: boolean;
    };
    Library: undefined;
    VisionBoard: undefined;
    AlignmentWriting: {
        alignmentScore: number;
        timeIndex: number;
    };
    /** Vlog recording screen — receives timeIndex for timer duration */
    VlogRecording: {
        timeIndex: number;
    };
};
