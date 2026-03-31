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
    /** Post-writing AI review screen — enriches a saved note with AI title, summary, grammar */
    PostWriting: {
        noteId: string;
        /** Forward streak params to Home when closing */
        streakIncreased?: boolean;
        newStreak?: number;
    };
};
