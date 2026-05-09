/**
 * useStorage hook source-code contract tests.
 *
 * Since @testing-library/react-native has a react-test-renderer version conflict,
 * these tests verify the source code patterns directly by reading the file.
 * This catches regressions like:
 * - Domain contexts being removed or renamed
 * - Refs not being wired to setters
 * - Hooks not being exported
 * - Optimistic update patterns being broken
 */

import * as fs from 'fs';
import * as path from 'path';

const SOURCE = fs.readFileSync(
    path.resolve(__dirname, '../hooks/useStorage.tsx'),
    'utf-8',
);

describe('useStorage source code contracts', () => {
    describe('domain contexts and providers', () => {
        it('exports 8 domain contexts', () => {
            expect(SOURCE).toContain('const NotesContext = createContext');
            expect(SOURCE).toContain('const PersonsContext = createContext');
            expect(SOURCE).toContain('const StreakContext = createContext');
            expect(SOURCE).toContain('const PreferencesContext = createContext');
            expect(SOURCE).toContain('const AiConfigContext = createContext');
            expect(SOURCE).toContain('const FeedContext = createContext');
            expect(SOURCE).toContain('const VlogContext = createContext');
            expect(SOURCE).toContain('const StorageActionsContext = createContext');
        });

        it('exports 8 domain hooks', () => {
            expect(SOURCE).toContain('export function useNotes()');
            expect(SOURCE).toContain('export function usePersons()');
            expect(SOURCE).toContain('export function useStreak()');
            expect(SOURCE).toContain('export function usePreferences()');
            expect(SOURCE).toContain('export function useAiConfig()');
            expect(SOURCE).toContain('export function useFeedData()');
            expect(SOURCE).toContain('export function useVlogs()');
            expect(SOURCE).toContain('export function useStorageActions()');
        });

        it('has useStorage convenience hook combining all 8 domains', () => {
            const useStorageFn = SOURCE.match(/export function useStorage\(\)[\s\S]*?\n\}/)?.[0];
            expect(useStorageFn).toBeDefined();
            expect(useStorageFn).toContain('useNotes()');
            expect(useStorageFn).toContain('usePersons()');
            expect(useStorageFn).toContain('useStreak()');
            expect(useStorageFn).toContain('usePreferences()');
            expect(useStorageFn).toContain('useAiConfig()');
            expect(useStorageFn).toContain('useFeedData()');
            expect(useStorageFn).toContain('useVlogs()');
            expect(useStorageFn).toContain('useStorageActions()');
        });
    });

    describe('StorageProvider', () => {
        it('exists and wraps children with all providers', () => {
            expect(SOURCE).toContain('export const StorageProvider');
            expect(SOURCE).toContain('<NotesContext.Provider');
            expect(SOURCE).toContain('<PersonsContext.Provider');
            expect(SOURCE).toContain('<StreakContext.Provider');
            expect(SOURCE).toContain('<PreferencesContext.Provider');
            expect(SOURCE).toContain('<AiConfigContext.Provider');
            expect(SOURCE).toContain('<FeedContext.Provider');
            expect(SOURCE).toContain('<VlogContext.Provider');
            expect(SOURCE).toContain('<StorageActionsContext.Provider');
        });

        it('has loadAllData function inside the provider', () => {
            const providerBody = SOURCE.match(/export const StorageProvider[\s\S]*?\n\};/)?.[0];
            expect(providerBody).toBeDefined();
            expect(providerBody).toContain('const loadAllData');
        });

        it('uses useEffect for loading data on mount', () => {
            const providerBody = SOURCE.match(/export const StorageProvider[\s\S]*?\n\};/)?.[0];
            expect(providerBody).toBeDefined();
            expect(providerBody).toContain('useEffect(() => { loadAllData(); }, [loadAllData]);');
        });

        it('has crossCuttingOps with refs', () => {
            const providerBody = SOURCE.match(/export const StorageProvider[\s\S]*?\n\};/)?.[0];
            expect(providerBody).toBeDefined();
            expect(providerBody).toContain('const crossCuttingOps');
            expect(providerBody).toContain('createCrossCuttingOps(');
            expect(providerBody).toContain('notesRef: savedNotesRef');
            expect(providerBody).toContain('personsRef: personsRef');
            expect(providerBody).toContain('savedVlogsRef: savedVlogsRef');
        });

        it('has getStorageSummary returning vlogCount, vlogBytes, noteCount, personCount', () => {
            const getStorageSummaryFn = SOURCE.match(/const getStorageSummary[\s\S]*?\}\), \[\]\);/)?.[0];
            expect(getStorageSummaryFn).toBeDefined();
            expect(getStorageSummaryFn).toContain('vlogCount');
            expect(getStorageSummaryFn).toContain('vlogBytes');
            expect(getStorageSummaryFn).toContain('noteCount');
            expect(getStorageSummaryFn).toContain('personCount');
        });
    });

    describe('refs for stale-closure safety', () => {
        it('has savedNotesRef', () => {
            expect(SOURCE).toContain('const savedNotesRef = useRef(savedNotes)');
        });

        it('has personsRef', () => {
            expect(SOURCE).toContain('const personsRef = useRef(persons)');
        });

        it('has savedVlogsRef', () => {
            expect(SOURCE).toContain('const savedVlogsRef = useRef(savedVlogs)');
        });

        it('wires every state variable to a ref', () => {
            expect(SOURCE).toContain('const savedNotesRef = useRef(savedNotes)');
            expect(SOURCE).toContain('const personsRef = useRef(persons)');
            expect(SOURCE).toContain('const currentStreakRef = useRef(currentStreak)');
            expect(SOURCE).toContain('const lastWinDateRef = useRef(lastWinDate)');
            expect(SOURCE).toContain('const streakHistoryRef = useRef(streakHistory)');
            expect(SOURCE).toContain('const fontIndexRef = useRef(fontIndex)');
            expect(SOURCE).toContain('const sizeIndexRef = useRef(sizeIndex)');
            expect(SOURCE).toContain('const useBiometricsRef = useRef(useBiometrics)');
            expect(SOURCE).toContain('const enableHapticsRef = useRef(enableHaptics)');
            expect(SOURCE).toContain('const lockTimeoutMinsRef = useRef(lockTimeoutMins)');
            expect(SOURCE).toContain('const vlogQualityRef = useRef(vlogQuality)');
            expect(SOURCE).toContain('const compressionPresetRef = useRef(compressionPreset)');
            expect(SOURCE).toContain('const devModeRef = useRef(devMode)');
            expect(SOURCE).toContain('const debugLayoutRef = useRef(debugLayout)');
            expect(SOURCE).toContain('const visionBoardRef = useRef(visionBoard)');
            expect(SOURCE).toContain('const preferPinAuthRef = useRef(preferPinAuth)');
            expect(SOURCE).toContain('const bookmarkedNoteIdsRef = useRef(bookmarkedNoteIds)');
            expect(SOURCE).toContain('const feedCommentsRef = useRef(feedComments)');
            expect(SOURCE).toContain('const aiApiKeyRef = useRef(aiApiKey)');
            expect(SOURCE).toContain('const aiBaseUrlRef = useRef(aiBaseUrl)');
            expect(SOURCE).toContain('const aiModelRef = useRef(aiModel)');
            expect(SOURCE).toContain('const aiGrammarModelRef = useRef(aiGrammarModel)');
            expect(SOURCE).toContain('const aiPromptsRef = useRef(aiPrompts)');
            expect(SOURCE).toContain('const autoGenerateSummariesRef = useRef(autoGenerateSummaries)');
            expect(SOURCE).toContain('const aiFavoriteModelsRef = useRef(aiFavoriteModels)');
            expect(SOURCE).toContain('const autoPlayFeedVideosRef = useRef(autoPlayFeedVideos)');
            expect(SOURCE).toContain('const totalVlogStorageBytesRef = useRef(totalVlogStorageBytes)');
        });
    });

    describe('optimistic update patterns', () => {
        it('passes refs and setters to notesOps factory', () => {
            const notesOpsSection = SOURCE.substring(
                SOURCE.indexOf('const notesOps = useMemo'),
                SOURCE.indexOf('const personsOps = useMemo')
            );
            expect(notesOpsSection).toContain('savedNotesRef');
            expect(notesOpsSection).toContain('setSavedNotes');
            expect(notesOpsSection).toContain('currentStreakRef');
            expect(notesOpsSection).toContain('setCurrentStreak');
        });

        it('passes refs and setters to personsOps factory', () => {
            const personsOpsSection = SOURCE.substring(
                SOURCE.indexOf('const personsOps = useMemo'),
                SOURCE.indexOf('const vlogOps = useMemo')
            );
            expect(personsOpsSection).toContain('personsRef');
            expect(personsOpsSection).toContain('setPersons');
            expect(personsOpsSection).toContain('savedNotesRef');
            expect(personsOpsSection).toContain('setSavedNotes');
        });

        it('passes refs and setters to vlogOps factory', () => {
            const vlogOpsSection = SOURCE.substring(
                SOURCE.indexOf('const vlogOps = useMemo'),
                SOURCE.indexOf('const feedOps = useMemo')
            );
            expect(vlogOpsSection).toContain('savedVlogsRef');
            expect(vlogOpsSection).toContain('setSavedVlogs');
            expect(vlogOpsSection).toContain('totalVlogStorageBytesRef');
            expect(vlogOpsSection).toContain('setTotalVlogStorageBytes');
        });

        it('reattachOrphanVlogs updates both state and ref after async load', () => {
            const reattachFn = SOURCE.match(/reattachOrphanVlogs:[\s\S]*?return result;/)?.[0];
            expect(reattachFn).toBeDefined();
            expect(reattachFn).toContain('setSavedVlogs(fresh)');
            expect(reattachFn).toContain('savedVlogsRef.current = fresh');
            expect(reattachFn).toContain('setTotalVlogStorageBytes(totalBytes)');
            expect(reattachFn).toContain('totalVlogStorageBytesRef.current = totalBytes');
        });
    });

    describe('rollback infrastructure', () => {
        it('syncs ref.current immediately after setState in reattachOrphanVlogs', () => {
            const reattachFn = SOURCE.match(/reattachOrphanVlogs:[\s\S]*?return result;/)?.[0];
            expect(reattachFn).toBeDefined();
            expect(reattachFn).toContain('savedVlogsRef.current = fresh');
            expect(reattachFn).toContain('totalVlogStorageBytesRef.current = totalBytes');
        });
    });
});
