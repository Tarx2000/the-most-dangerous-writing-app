export type RootStackParamList = {
    Home: { streakIncreased?: boolean; newStreak?: number } | undefined;
    Start: { streakIncreased?: boolean; newStreak?: number } | undefined;
    Writing: {
        timeIndex: number;
        diffIndex: number;
        mode: 'journal' | 'circles';
        personId: string | null;
        isQuickNote?: boolean;
        isTweet?: boolean;
        buttonLayout?: { x: number; y: number; width: number; height: number };
    };
    Library: undefined;
    PillarsDashboard: undefined;
    PillarDetail: { pillarId: string };
    Sandbox: undefined;
    AlignmentWriting: {
        alignmentScore?: number;
        isWeekly?: boolean;
        timeIndex: number;
        buttonLayout?: { x: number; y: number; width: number; height: number };
    };
    /** Vlog recording screen — receives timeIndex for timer duration */
    VlogRecording: {
        timeIndex: number;
        isQuickVideo?: boolean;
        buttonLayout?: { x: number; y: number; width: number; height: number };
    };
    /** Post-writing AI review screen — enriches a saved note with AI title, summary, grammar */
    PostWriting: {
        noteId: string;
        /** Forward streak params to Home when closing */
        streakIncreased?: boolean;
        newStreak?: number;
    };
};
