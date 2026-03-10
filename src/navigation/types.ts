export type RootStackParamList = {
    Home: undefined;
    Start: undefined;
    Writing: {
        timeIndex: number;
        diffIndex: number;
        mode: 'journal' | 'circles';
        personId: string | null;
    };
    Library: undefined;
};
