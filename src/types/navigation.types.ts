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
};
