import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, Alert, Platform } from 'react-native';
import { vibrate } from '@/lib/haptics';
import * as FileSystem from 'expo-file-system/legacy';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation.types';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { commonStyles } from '@/styles/commonStyles';
import { theme } from '@/styles/theme';
import { CONFIG } from '@/config';
import { DEFAULT_AI_PROMPTS, type AiPrompts } from '@/config/ai';
import {
    FEATURE_FLAG_METADATA,
    DEFAULT_FEATURE_FLAGS,
    type FeatureFlags,
} from '@/config/flags';
import { getFeatureFlags, updateFeatureFlag, persistFeatureFlags } from '@/lib/featureFlags';
import type { SavedNote, Person, SavedVlog, AiQueueState, AiLogEntry } from '@/types';
import { startConsoleCapture, stopConsoleCapture, getCapturedLogs, clearCapturedLogs, type CapturedLog } from '@/lib/consoleCapture';

/** File system entry as displayed in the dev tools explorer */
interface FileSystemEntry {
    name: string;
    exists: boolean;
    isDirectory: boolean;
    size: number;
    modificationTime?: number;
    uri: string;
}

type DeveloperToolsPanelProps = {
    notes: { savedNotes: SavedNote[]; clearAllAiMetadata: () => Promise<void> };
    personsHook: { persons: Person[] };
    streak: { currentStreak: number; lastWinDate: string; streakHistory: string[] };
    preferences: { devMode: boolean; debugLayout: boolean; logMode: boolean; fontIndex: number; sizeIndex: number; toggleDevMode: () => Promise<void>; toggleDebugLayout: () => Promise<void>; toggleLogMode: () => Promise<void> };
    aiConfig: { aiPrompts: AiPrompts; saveAiPrompts: (prompts: AiPrompts) => Promise<void> };
    vlogs: { savedVlogs: SavedVlog[]; totalVlogStorageBytes: number };
    storageActions: {
        clearAllData: () => Promise<void>;
        inspectAsyncStorage: () => Promise<{ keys: string[]; keySizes: Record<string, number>; maybeJson: Record<string, { length: number; sample: string }> }>;
        safeReMigrateAsyncStorage: () => Promise<{ notesRecovered: number; personsRecovered: number; vlogsRecovered: number; skipped: boolean; errors: string[] }>;
        exportAsyncStorageToFile: () => Promise<{ filePath: string; fileSizeKB: number; keyCount: number }>;
        scanOrphanVlogs: () => Promise<{ orphans: { fileName: string; fileSizeBytes: number; modDate: string }[] }>;
        reattachOrphanVlogs: () => Promise<{ reattached: number; failed: number }>;
    };
    queueState: AiQueueState;
    devModeUnlocked: boolean;
    setNewStreakParam: (val: number) => void;
    setShowStreakPopup: (val: boolean) => void;
    setShowSettings: (val: boolean) => void;
    setShowBenchmarkModal: (val: boolean) => void;
    loadAiLog: () => Promise<void>;
    showAiLog: boolean;
    setShowAiLog: (val: boolean) => void;
    aiLogEntries: AiLogEntry[];
    setAiLogEntries: (val: AiLogEntry[]) => void;
    clearAiLog: () => Promise<void>;
};

const FeatureFlagsSection: React.FC = () => {
    const [flags, setFlags] = React.useState<FeatureFlags>(getFeatureFlags());
    const handleToggle = async (key: keyof FeatureFlags) => {
        vibrate(15);
        const next = { ...flags, [key]: !flags[key] };
        setFlags(next);
        updateFeatureFlag(key, !flags[key] as never);
        await persistFeatureFlags();
    };
    return (
        <View style={{ backgroundColor: theme.colors.glassSurfaceLow, borderRadius: theme.borderRadius.sm, padding: 12, marginTop: 10 }}>
            <Text style={{ color: theme.colors.gold, fontSize: 12, fontWeight: 'bold', marginBottom: 10 }}>🎛️ Feature Flags</Text>
            {(Object.keys(DEFAULT_FEATURE_FLAGS) as (keyof FeatureFlags)[]).map((key) => (
                <AnimatedScaleButton
                    key={key}
                    style={[commonStyles.devToolBtn, { backgroundColor: flags[key] ? theme.colors.successBorder : theme.colors.glassBackground, marginBottom: 8 }]}
                    onPress={() => handleToggle(key)}
                >
                    <View style={commonStyles.devToolIconBox}>
                        <MaterialCommunityIcons name={flags[key] ? 'check-circle' : 'circle-outline'} size={16} color={flags[key] ? theme.colors.green : theme.colors.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[commonStyles.devToolBtnText, { color: flags[key] ? theme.colors.green : theme.colors.textMuted }]}>
                            {FEATURE_FLAG_METADATA[key].label}
                        </Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 11 }} numberOfLines={2}>
                            {FEATURE_FLAG_METADATA[key].description}
                        </Text>
                    </View>
                </AnimatedScaleButton>
            ))}
        </View>
    );
};

/**
 * DeveloperToolsPanel — Debug/dev settings panel.
 * Provides dev mode toggle, storage info, AI log viewer, editable prompts,
 * app lock controls, and live console capture.
 * All interactive elements use AnimatedScaleButton for consistency.
 */
export const DeveloperToolsPanel: React.FC<DeveloperToolsPanelProps> = ({
    notes,
    personsHook,
    streak,
    preferences,
    aiConfig,
    vlogs,
    storageActions,
    queueState,
    devModeUnlocked,
    setNewStreakParam,
    setShowStreakPopup,
    setShowSettings,
    setShowBenchmarkModal,
    loadAiLog,
    showAiLog,
    setShowAiLog,
    aiLogEntries,
    setAiLogEntries,
    clearAiLog,
}) => {
    const titlePromptRef = useRef(aiConfig.aiPrompts.title || DEFAULT_AI_PROMPTS.title);
    const summaryPromptRef = useRef(aiConfig.aiPrompts.summary || DEFAULT_AI_PROMPTS.summary);
    const grammarPromptRef = useRef(aiConfig.aiPrompts.grammar || DEFAULT_AI_PROMPTS.grammar);
    const relationshipTitlePromptRef = useRef(aiConfig.aiPrompts.relationshipTitle || DEFAULT_AI_PROMPTS.relationshipTitle);
    const relationshipSummaryPromptRef = useRef(aiConfig.aiPrompts.relationshipSummary || DEFAULT_AI_PROMPTS.relationshipSummary);

    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

    const [showFileSystem, setShowFileSystem] = useState(false);
    const [currentPath, setCurrentPath] = useState(FileSystem.documentDirectory || '');
    const [fileSystemData, setFileSystemData] = useState<FileSystemEntry[]>([]);
    const [fileSystemLoading, setFileSystemLoading] = useState(false);
    const [viewingFile, setViewingFile] = useState<{ name: string, content: string } | null>(null);

    // --- Console log capture state ---
    const [consoleLogs, setConsoleLogs] = useState<CapturedLog[]>([]);
    const [showConsoleLogs] = useState(false);
    const consoleRefreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);

    // Start/stop console capture when devMode toggles
    useEffect(() => {
        if (preferences.devMode) {
            startConsoleCapture();
        } else {
            stopConsoleCapture();
            clearCapturedLogs();
            setConsoleLogs([]);
        }
        return () => {
            stopConsoleCapture();
            if (consoleRefreshInterval.current) clearInterval(consoleRefreshInterval.current);
        };
    }, [preferences.devMode]);

    // Auto-refresh console logs when viewer is open
    useEffect(() => {
        if (showConsoleLogs && preferences.devMode) {
            consoleRefreshInterval.current = setInterval(() => {
                setConsoleLogs(getCapturedLogs());
            }, 1000);
        } else if (consoleRefreshInterval.current) {
            clearInterval(consoleRefreshInterval.current);
            consoleRefreshInterval.current = null;
        }
        return () => {
            if (consoleRefreshInterval.current) clearInterval(consoleRefreshInterval.current);
        };
    }, [showConsoleLogs, preferences.devMode]);

    const refreshConsoleLogs = useCallback(() => {
        setConsoleLogs(getCapturedLogs());
    }, []);

    const handleClearConsoleLogs = useCallback(() => {
        clearCapturedLogs();
        setConsoleLogs([]);
    }, []);

    const loadFileSystemData = async (path = currentPath) => {
        setFileSystemLoading(true);
        setCurrentPath(path);
        try {
            if (!path) return;
            const items = await FileSystem.readDirectoryAsync(path);
            const data = await Promise.all(items.map(async (item) => {
                const info = await FileSystem.getInfoAsync(path + item);
                const size = info.exists && 'size' in info && typeof info.size === 'number' ? info.size : 0;
                return { name: item, ...info, size };
            }));
            setFileSystemData(data.sort((a, b) => b.size - a.size));
        } catch (e) {
            console.warn('Failed to load FS:', e);
        } finally {
            setFileSystemLoading(false);
        }
    };

    if (!devModeUnlocked) return null;

    return (
        <View style={{ backgroundColor: preferences.devMode ? theme.colors.goldBorderLight : theme.colors.glassBackground, borderRadius: theme.borderRadius.md, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: preferences.devMode ? theme.colors.goldBorder : theme.colors.glassBorder, marginTop: 10 }}>
            <Text style={[commonStyles.settingsLabel, { marginTop: 0, color: preferences.devMode ? theme.colors.gold : theme.colors.textPrimary, fontSize: 16 }]}>🛠 Developer Tools</Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginBottom: 15 }}>Debug features for testing</Text>

            {/* Dev Mode Toggle */}
            <AnimatedScaleButton
                style={[commonStyles.closeVersionBtn, { backgroundColor: preferences.devMode ? theme.colors.goldFillMedium : theme.colors.glassHighlight, marginTop: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                onPress={() => {
                    vibrate(preferences.devMode ? [0, 100, 50, 100] : [0, 50, 100, 50, 100, 150]);
                    preferences.toggleDevMode();
                }}
            >
                <Text style={[commonStyles.closeVersionBtnText, preferences.devMode && { color: theme.colors.gold }]}>Dev Mode</Text>
                <Text style={{ color: preferences.devMode ? theme.colors.gold : theme.colors.textMuted, fontSize: 13, fontWeight: 'bold' }}>{preferences.devMode ? 'ON' : 'OFF'}</Text>
            </AnimatedScaleButton>

            {/* Log Mode Toggle */}
            <AnimatedScaleButton
                style={[commonStyles.closeVersionBtn, { backgroundColor: preferences.logMode ? theme.colors.goldFillMedium : theme.colors.glassHighlight, marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                onPress={() => {
                    vibrate(15);
                    preferences.toggleLogMode();
                }}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <MaterialCommunityIcons name="format-list-text" size={16} color={preferences.logMode ? theme.colors.gold : theme.colors.textMuted} />
                    <Text style={[commonStyles.closeVersionBtnText, preferences.logMode && { color: theme.colors.gold }]}>Verbose Logging</Text>
                </View>
                <Text style={{ color: preferences.logMode ? theme.colors.gold : theme.colors.textMuted, fontSize: 13, fontWeight: 'bold' }}>{preferences.logMode ? 'ON' : 'OFF'}</Text>
            </AnimatedScaleButton>

            {/* Dev Actions */}
            {preferences.devMode && (
                <View style={{ marginTop: 15, gap: 10 }}>
                    <AnimatedScaleButton
                        style={[commonStyles.devToolBtn, { backgroundColor: theme.colors.goldTint }]}
                        onPress={() => {
                            setNewStreakParam(streak.currentStreak || 1);
                            setShowStreakPopup(true);
                            setShowSettings(false);
                        }}
                    >
                        <View style={commonStyles.devToolIconBox}>
                            <MaterialCommunityIcons name="trophy-outline" size={16} color={theme.colors.gold} />
                        </View>
                        <Text style={[commonStyles.devToolBtnText, { color: theme.colors.gold }]}>Simulate Streak Popup</Text>
                    </AnimatedScaleButton>

                    <AnimatedScaleButton
                        style={[commonStyles.devToolBtn, { backgroundColor: theme.colors.successBorder }]}
                        onPress={() => setShowBenchmarkModal(true)}
                    >
                        <View style={commonStyles.devToolIconBox}>
                            <MaterialCommunityIcons name="lightning-bolt" size={16} color={theme.colors.green} />
                        </View>
                        <Text style={[commonStyles.devToolBtnText, { color: theme.colors.green }]}>Run AI Benchmark</Text>
                    </AnimatedScaleButton>

                    <AnimatedScaleButton
                        style={[commonStyles.devToolBtn, { backgroundColor: theme.colors.dangerFill }]}
                        onPress={() => {
                            storageActions.clearAllData();
                            setShowSettings(false);
                        }}
                    >
                        <View style={commonStyles.devToolIconBox}>
                            <MaterialCommunityIcons name="trash-can-outline" size={16} color={theme.colors.danger} />
                        </View>
                        <Text style={[commonStyles.devToolBtnText, { color: theme.colors.danger }]}>Clear All Data</Text>
                    </AnimatedScaleButton>

                    <AnimatedScaleButton
                        style={[commonStyles.devToolBtn, { backgroundColor: theme.colors.infoFill }]}
                        onPress={async () => {
                            vibrate(50);
                            try {
                                const result = await storageActions.inspectAsyncStorage();
                                const jsonList = Object.entries(result.maybeJson)
                                    .map(([k, v]) => `• ${k}: ${v.length} items (${v.sample.substring(0, 80)}...)`)
                                    .join('\n');
                                const otherKeys = result.keys
                                    .filter(k => !result.maybeJson[k])
                                    .map(k => `• ${k}: ${result.keySizes[k] || 0} bytes`)
                                    .join('\n');
                                Alert.alert(
                                    'AsyncStorage Inspector',
                                    `Total keys: ${result.keys.length}\n\nJSON-like data:\n${jsonList || 'None'}\n\nOther keys:\n${otherKeys || 'None'}`
                                );
                            } catch (err) {
                                Alert.alert('Inspector Error', String(err));
                            }
                        }}
                    >
                        <View style={commonStyles.devToolIconBox}>
                            <MaterialCommunityIcons name="magnify" size={16} color={theme.colors.devBlue} />
                        </View>
                        <Text style={[commonStyles.devToolBtnText, { color: theme.colors.devBlue }]}>Inspect AsyncStorage (Safe)</Text>
                    </AnimatedScaleButton>

                    <AnimatedScaleButton
                        style={[commonStyles.devToolBtn, { backgroundColor: theme.colors.successFill }]}
                        onPress={async () => {
                            vibrate(50);
                            try {
                                const result = await storageActions.safeReMigrateAsyncStorage();
                                if (result.skipped) {
                                    Alert.alert('Safe Recovery', 'No legacy data found in AsyncStorage. Nothing to recover.');
                                } else {
                                    const errorMsg = result.errors.length > 0
                                        ? `\n\nErrors (${result.errors.length}):\n${result.errors.join('\n')}`
                                        : '';
                                    Alert.alert(
                                        'Safe Recovery Complete',
                                        `• ${result.notesRecovered} notes recovered\n• ${result.personsRecovered} persons recovered\n• ${result.vlogsRecovered} vlogs recovered${errorMsg}`,
                                        [{ text: 'OK' }]
                                    );
                                }
                            } catch (err) {
                                Alert.alert('Recovery Error', String(err));
                            }
                        }}
                    >
                        <View style={commonStyles.devToolIconBox}>
                            <MaterialCommunityIcons name="backup-restore" size={16} color={theme.colors.green} />
                        </View>
                        <Text style={[commonStyles.devToolBtnText, { color: theme.colors.green }]}>Safe Recover from AsyncStorage</Text>
                    </AnimatedScaleButton>

                    <AnimatedScaleButton
                        style={[commonStyles.devToolBtn, { backgroundColor: theme.colors.infoFill }]}
                        onPress={async () => {
                            vibrate(50);
                            try {
                                const result = await storageActions.exportAsyncStorageToFile();
                                Alert.alert(
                                    'Export Complete',
                                    `Exported ${result.keyCount} keys (${result.fileSizeKB} KB).\n\nUse "Save" in the share sheet to keep the file, then send it for analysis.\n\nFile: ${result.filePath}`
                                );
                            } catch (err) {
                                Alert.alert('Export Error', String(err));
                            }
                        }}
                    >
                        <View style={commonStyles.devToolIconBox}>
                            <MaterialCommunityIcons name="export" size={16} color={theme.colors.devBlue} />
                        </View>
                        <Text style={[commonStyles.devToolBtnText, { color: theme.colors.devBlue }]}>Export All AsyncStorage Data</Text>
                    </AnimatedScaleButton>
                    <AnimatedScaleButton
                        style={[commonStyles.devToolBtn, { backgroundColor: theme.colors.infoFill }]}
                        onPress={async () => {
                            vibrate(50);
                            try {
                                await storageActions.safeReMigrateAsyncStorage();
                                Alert.alert('Restore', 'Restored from AsyncStorage (if present).');
                            } catch (err) {
                                Alert.alert('Restore Error', String(err));
                            }
                        }}
                    >
                        <View style={commonStyles.devToolIconBox}>
                            <MaterialCommunityIcons name="restore" size={16} color={theme.colors.devPurple} />
                        </View>
                        <Text style={[commonStyles.devToolBtnText, { color: theme.colors.devPurple }]}>Restore from AsyncStorage (Destructive)</Text>
                    </AnimatedScaleButton>

                    <AnimatedScaleButton
                        style={[commonStyles.devToolBtn, { backgroundColor: theme.colors.goldFill }]}
                        onPress={async () => {
                            vibrate(50);
                            try {
                                const result = await storageActions.scanOrphanVlogs();
                                if (result.orphans.length === 0) {
                                    Alert.alert('Orphan Scan', 'No orphaned video files found on disk.\n\nAll files are already tracked in the database.');
                                } else {
                                    const list = result.orphans.map(o => `• ${o.fileName} (${(o.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB, ${o.modDate})`).join('\n');
                                    Alert.alert(
                                        `Found ${result.orphans.length} Orphaned Video(s)`,
                                        `${list}\n\nTap "Re-attach Orphan Videos" to recover them.`,
                                        [{ text: 'OK' }]
                                    );
                                }
                            } catch (err) {
                                Alert.alert('Scan Error', String(err));
                            }
                        }}
                    >
                        <View style={commonStyles.devToolIconBox}>
                            <MaterialCommunityIcons name="video-off-outline" size={16} color={theme.colors.gold} />
                        </View>
                        <Text style={[commonStyles.devToolBtnText, { color: theme.colors.gold }]}>Scan Orphan Videos</Text>
                    </AnimatedScaleButton>

                    <AnimatedScaleButton
                        style={[commonStyles.devToolBtn, { backgroundColor: theme.colors.successFill }]}
                        onPress={async () => {
                            vibrate(50);
                            try {
                                const result = await storageActions.reattachOrphanVlogs();
                                Alert.alert(
                                    'Orphan Recovery Complete',
                                    `Re-attached ${result.reattached} video(s).\nFailed: ${result.failed}.\n\nRestart the app or go to the Vlog Calendar to see them.`,
                                    [{ text: 'OK' }]
                                );
                            } catch (err) {
                                Alert.alert('Recovery Error', String(err));
                            }
                        }}
                    >
                        <View style={commonStyles.devToolIconBox}>
                            <MaterialCommunityIcons name="video-check-outline" size={16} color={theme.colors.green} />
                        </View>
                        <Text style={[commonStyles.devToolBtnText, { color: theme.colors.green }]}>Re-attach Orphan Videos</Text>
                    </AnimatedScaleButton>

                    <AnimatedScaleButton
                        style={[commonStyles.devToolBtn, { backgroundColor: theme.colors.orangeFill }]}
                        onPress={() => {
                            notes.clearAllAiMetadata();
                            vibrate(50);
                        }}
                    >
                        <View style={commonStyles.devToolIconBox}>
                            <MaterialCommunityIcons name="robot-off-outline" size={16} color={theme.colors.devOrange} />
                        </View>
                        <Text style={[commonStyles.devToolBtnText, { color: theme.colors.devOrange }]}>Reset all AI Entries</Text>
                    </AnimatedScaleButton>

                    <View style={{ backgroundColor: theme.colors.glassSurfaceLow, borderRadius: theme.borderRadius.sm, padding: 12, marginTop: 5 }}>
                        <Text style={{ color: theme.colors.gold, fontSize: 12, fontWeight: 'bold', marginBottom: 8 }}>📊 Storage Info</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>Notes: {notes.savedNotes.length}</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>Circles: {personsHook.persons.length}</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>Current Streak: {streak.currentStreak}</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>Last Win: {streak.lastWinDate || 'Never'}</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>Streak History: {streak.streakHistory.length} days</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>Font: {CONFIG.FONTS[preferences.fontIndex]?.label || 'Default'} | Size: {CONFIG.SIZES[preferences.sizeIndex]?.label || 'Default'}</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>Vlogs: {vlogs.savedVlogs.length} ({(vlogs.totalVlogStorageBytes / (1024 * 1024)).toFixed(1)} MB)</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>AI Title Coverage: {notes.savedNotes.filter((n: SavedNote) => n.aiTitle).length}/{notes.savedNotes.length} notes</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>AI Queue: {queueState.pendingCount} pending, {queueState.isProcessing ? 'active' : 'idle'}</Text>
                    </View>

                    {/* ── App Log (AI + Console) ───────────────────────────── */}
                    <AnimatedScaleButton
                        style={[commonStyles.devToolBtn, { backgroundColor: theme.colors.goldFill, marginTop: 10 }]}
                        onPress={async () => {
                            await loadAiLog();
                            refreshConsoleLogs();
                            setShowAiLog(!showAiLog);
                        }}
                    >
                        <View style={commonStyles.devToolIconBox}>
                            <MaterialCommunityIcons name={showAiLog ? 'chevron-down' : 'format-list-bulleted'} size={16} color={theme.colors.gold} />
                        </View>
                        <Text style={[commonStyles.devToolBtnText, { color: theme.colors.gold }]}>{showAiLog ? 'Hide' : 'Show'} App Log</Text>
                    </AnimatedScaleButton>

                    {showAiLog && (
                        <View style={{ backgroundColor: theme.colors.glassSurfaceLow, borderRadius: theme.borderRadius.sm, padding: 12, marginTop: 8, maxHeight: 400 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <Text style={{ color: theme.colors.gold, fontSize: 12, fontWeight: 'bold' }}>App Log</Text>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <AnimatedScaleButton onPress={async () => { await clearAiLog(); setAiLogEntries([]); }}>
                                        <Text style={{ color: theme.colors.danger, fontSize: 11, fontWeight: '600' }}>Clear AI</Text>
                                    </AnimatedScaleButton>
                                    <AnimatedScaleButton onPress={handleClearConsoleLogs}>
                                        <Text style={{ color: theme.colors.danger, fontSize: 11, fontWeight: '600' }}>Clear Console</Text>
                                    </AnimatedScaleButton>
                                </View>
                            </View>

                            {/* AI Log Entries */}
                            {aiLogEntries.length > 0 && (
                                <>
                                    <Text style={{ color: theme.colors.textSecondary, fontSize: 10, fontWeight: 'bold', marginBottom: 4 }}>AI Processing</Text>
                                    <ScrollView style={{ maxHeight: 120 }} nestedScrollEnabled>
                                        {aiLogEntries.map((entry, i) => (
                                            <View key={`ai-${i}`} style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.glassSurfaceSubtle, paddingVertical: 3 }}>
                                                <Text style={{ color: theme.colors.textMuted, fontSize: 10 }}>
                                                    {new Date(entry.timestamp).toLocaleTimeString()} | {entry.action.toUpperCase()} | {entry.phase}{entry.durationMs ? ` | ${entry.durationMs}ms` : ''}
                                                </Text>
                                                {entry.error && <Text style={{ color: theme.colors.danger, fontSize: 10 }}>{entry.error}</Text>}
                                            </View>
                                        ))}
                                    </ScrollView>
                                </>
                            )}

                            {/* Console Log Entries */}
                            {consoleLogs.length > 0 && (
                                <>
                                    <Text style={{ color: theme.colors.textSecondary, fontSize: 10, fontWeight: 'bold', marginTop: 8, marginBottom: 4 }}>Console Output</Text>
                                    <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                                        {consoleLogs.map((entry, i) => {
                                            const levelColor =
                                                entry.level === 'error' ? theme.colors.danger :
                                                    entry.level === 'warn' ? theme.colors.devOrange :
                                                        theme.colors.textMuted;
                                            return (
                                                <View key={`console-${i}`} style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.glassSurfaceSubtle, paddingVertical: 2 }}>
                                                    <Text style={{ color: levelColor, fontSize: 9, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                                                        {new Date(entry.timestamp).toLocaleTimeString()} [{entry.level.toUpperCase()}] {entry.message}
                                                    </Text>
                                                </View>
                                            );
                                        })}
                                    </ScrollView>
                                </>
                            )}

                            {aiLogEntries.length === 0 && consoleLogs.length === 0 && (
                                <Text style={{ color: theme.colors.textMuted, fontSize: 11, fontStyle: 'italic' }}>No log entries yet</Text>
                            )}
                        </View>
                    )}

                    <AnimatedScaleButton
                        style={[commonStyles.devToolBtn, { backgroundColor: theme.colors.infoFill, marginTop: 10 }]}
                        onPress={async () => {
                            if (!showFileSystem) await loadFileSystemData();
                            setShowFileSystem(!showFileSystem);
                        }}
                    >
                        <View style={commonStyles.devToolIconBox}>
                            <MaterialCommunityIcons name={showFileSystem ? 'chevron-down' : 'folder-outline'} size={16} color={theme.colors.devBlue} />
                        </View>
                        <Text style={[commonStyles.devToolBtnText, { color: theme.colors.devBlue }]}>{showFileSystem ? 'Hide' : 'Show'} File System Explorer</Text>
                    </AnimatedScaleButton>

                    {showFileSystem && (
                        <View style={{ backgroundColor: theme.colors.glassSurfaceLow, borderRadius: theme.borderRadius.sm, padding: 12, marginTop: 8, maxHeight: 400 }}>
                            {viewingFile ? (
                                <View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <Text style={{ color: theme.colors.gold, fontSize: 12, fontWeight: 'bold' }}>📄 {viewingFile.name}</Text>
                                        <AnimatedScaleButton onPress={() => setViewingFile(null)}>
                                            <Text style={{ color: theme.colors.textMuted, fontSize: 11, fontWeight: '600' }}>Close</Text>
                                        </AnimatedScaleButton>
                                    </View>
                                    <ScrollView style={{ maxHeight: 250 }} nestedScrollEnabled>
                                        <Text style={{ color: theme.colors.textBodyDim, fontSize: 10, fontFamily: 'monospace' }}>
                                            {viewingFile.content || '(Empty file)'}
                                        </Text>
                                    </ScrollView>
                                </View>
                            ) : (
                                <>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                                            <Text style={{ color: theme.colors.devBlue, fontSize: 12, fontWeight: 'bold', marginRight: 8 }}>📁 Explorer</Text>
                                            {currentPath !== FileSystem.documentDirectory && (
                                                <AnimatedScaleButton onPress={() => {
                                                    const parts = currentPath.split('/');
                                                    parts.pop(); // remove trailing empty string
                                                    parts.pop(); // remove current directory
                                                    loadFileSystemData(parts.join('/') + '/');
                                                }} style={{ paddingHorizontal: 6, paddingVertical: 2, backgroundColor: theme.colors.glassBorder, borderRadius: 4 }}>
                                                    <Text style={{ color: theme.colors.textPrimary, fontSize: 10 }}>⬅️ Up</Text>
                                                </AnimatedScaleButton>
                                            )}
                                        </View>
                                        <AnimatedScaleButton onPress={() => loadFileSystemData(currentPath)}>
                                            <Text style={{ color: theme.colors.primaryAction, fontSize: 11, fontWeight: '600' }}>Refresh</Text>
                                        </AnimatedScaleButton>
                                    </View>
                                    <Text style={{ color: theme.colors.textMuted, fontSize: 8, marginBottom: 8 }} numberOfLines={1}>{currentPath}</Text>

                                    <ScrollView style={{ maxHeight: 250 }} nestedScrollEnabled>
                                        {fileSystemLoading ? (
                                            <Text style={{ color: theme.colors.textMuted, fontSize: 11, fontStyle: 'italic' }}>Loading files...</Text>
                                        ) : fileSystemData.length === 0 ? (
                                            <Text style={{ color: theme.colors.textMuted, fontSize: 11, fontStyle: 'italic' }}>Empty directory</Text>
                                        ) : (
                                            fileSystemData.map((file, i) => (
                                                <AnimatedScaleButton
                                                    key={i}
                                                    style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.glassSurfaceSubtle, paddingVertical: 8 }}
                                                    onPress={async () => {
                                                        if (file.isDirectory) {
                                                            loadFileSystemData(currentPath + file.name + '/');
                                                        } else {
                                                            try {
                                                                const content = await FileSystem.readAsStringAsync(currentPath + file.name);
                                                                setViewingFile({ name: file.name, content: content.substring(0, 5000) + (content.length > 5000 ? '\n...[TRUNCATED]' : '') });
                                                            } catch (err) {
                                                                setViewingFile({ name: file.name, content: `[Cannot read file as text]\n${err}` });
                                                            }
                                                        }
                                                    }}
                                                >
                                                    <Text style={{ color: file.isDirectory ? theme.colors.devBlue : theme.colors.textSecondary, fontSize: 11, fontWeight: 'bold' }}>
                                                        {file.isDirectory ? '📁' : '📄'} {file.name}
                                                    </Text>
                                                    <Text style={{ color: theme.colors.textMuted, fontSize: 10 }}>
                                                        Size: {(file.size / 1024).toFixed(2)} KB | Modified: {new Date((file.modificationTime || 0) * 1000).toLocaleString()}
                                                    </Text>
                                                </AnimatedScaleButton>
                                            ))
                                        )}
                                    </ScrollView>
                                </>
                            )}
                        </View>
                    )}

                    <View style={{ backgroundColor: theme.colors.glassSurfaceLow, borderRadius: theme.borderRadius.sm, padding: 12, marginTop: 10 }}>
                        <Text style={{ color: theme.colors.gold, fontSize: 12, fontWeight: 'bold', marginBottom: 10 }}>🤖 AI Prompts (editable)</Text>
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>Title Prompt</Text>
                        <TextInput
                            style={{ backgroundColor: theme.colors.overlayDark, color: theme.colors.textPrimary, fontSize: 11, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.goldFill, marginBottom: 8, minHeight: 60, textAlignVertical: 'top' }}
                            defaultValue={aiConfig.aiPrompts.title || DEFAULT_AI_PROMPTS.title}
                            onChangeText={(v) => titlePromptRef.current = v}
                            onEndEditing={() => aiConfig.saveAiPrompts({ ...aiConfig.aiPrompts, title: titlePromptRef.current })}
                            multiline
                        />
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>Summary Prompt</Text>
                        <TextInput
                            style={{ backgroundColor: theme.colors.overlayDark, color: theme.colors.textPrimary, fontSize: 11, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.goldFill, marginBottom: 8, minHeight: 60, textAlignVertical: 'top' }}
                            defaultValue={aiConfig.aiPrompts.summary || DEFAULT_AI_PROMPTS.summary}
                            onChangeText={(v) => summaryPromptRef.current = v}
                            onEndEditing={() => aiConfig.saveAiPrompts({ ...aiConfig.aiPrompts, summary: summaryPromptRef.current })}
                            multiline
                        />
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>Relationship Title Prompt</Text>
                        <TextInput
                            style={{ backgroundColor: theme.colors.overlayDark, color: theme.colors.textPrimary, fontSize: 11, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.goldFill, marginBottom: 8, minHeight: 60, textAlignVertical: 'top' }}
                            defaultValue={aiConfig.aiPrompts.relationshipTitle || DEFAULT_AI_PROMPTS.relationshipTitle}
                            onChangeText={(v) => relationshipTitlePromptRef.current = v}
                            onEndEditing={() => aiConfig.saveAiPrompts({ ...aiConfig.aiPrompts, relationshipTitle: relationshipTitlePromptRef.current })}
                            multiline
                        />
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>Relationship Summary Prompt</Text>
                        <TextInput
                            style={{ backgroundColor: theme.colors.overlayDark, color: theme.colors.textPrimary, fontSize: 11, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.goldFill, marginBottom: 8, minHeight: 60, textAlignVertical: 'top' }}
                            defaultValue={aiConfig.aiPrompts.relationshipSummary || DEFAULT_AI_PROMPTS.relationshipSummary}
                            onChangeText={(v) => relationshipSummaryPromptRef.current = v}
                            onEndEditing={() => aiConfig.saveAiPrompts({ ...aiConfig.aiPrompts, relationshipSummary: relationshipSummaryPromptRef.current })}
                            multiline
                        />
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>Grammar Prompt</Text>
                        <TextInput
                            style={{ backgroundColor: theme.colors.overlayDark, color: theme.colors.textPrimary, fontSize: 11, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.goldFill, marginBottom: 8, minHeight: 60, textAlignVertical: 'top' }}
                            defaultValue={aiConfig.aiPrompts.grammar || DEFAULT_AI_PROMPTS.grammar}
                            onChangeText={(v) => grammarPromptRef.current = v}
                            onEndEditing={() => aiConfig.saveAiPrompts({ ...aiConfig.aiPrompts, grammar: grammarPromptRef.current })}
                            multiline
                        />
                        <AnimatedScaleButton
                            style={{ alignSelf: 'flex-end', padding: 6 }}
                            onPress={() => aiConfig.saveAiPrompts({ ...DEFAULT_AI_PROMPTS })}
                        >
                            <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>Reset to defaults</Text>
                        </AnimatedScaleButton>
                    </View>

                    <FeatureFlagsSection />

                    <View style={{ backgroundColor: theme.colors.glassSurfaceLow, borderRadius: theme.borderRadius.sm, padding: 12, marginTop: 10 }}>
                        <Text style={{ color: theme.colors.gold, fontSize: 12, fontWeight: 'bold', marginBottom: 10 }}>🔥 Debug Injectors</Text>

                        <AnimatedScaleButton
                            style={[commonStyles.devToolBtn, { backgroundColor: preferences.debugLayout ? theme.colors.successBorder : theme.colors.glassBackground, marginBottom: 8 }]}
                            onPress={preferences.toggleDebugLayout}
                        >
                            <View style={commonStyles.devToolIconBox}>
                                <MaterialCommunityIcons name={preferences.debugLayout ? 'eye' : 'eye-off'} size={16} color={preferences.debugLayout ? theme.colors.green : theme.colors.textMuted} />
                            </View>
                            <Text style={[commonStyles.devToolBtnText, { color: preferences.debugLayout ? theme.colors.green : theme.colors.textMuted }]}>
                                {preferences.debugLayout ? 'Layout Bounds ON' : 'Layout Bounds OFF'}
                            </Text>
                        </AnimatedScaleButton>

                        <AnimatedScaleButton
                            style={[commonStyles.devToolBtn, { backgroundColor: theme.colors.dangerFill }]}
                            onPress={() => {
                                // Trigger a render cycle bomb
                                setTimeout(() => { throw new Error("Developer Simulated Native Crash"); }, 100);
                            }}
                        >
                            <View style={commonStyles.devToolIconBox}>
                                <MaterialCommunityIcons name="bomb" size={16} color={theme.colors.danger} />
                            </View>
                            <Text style={[commonStyles.devToolBtnText, { color: theme.colors.danger }]}>Simulate Native Crash</Text>
                        </AnimatedScaleButton>

                        <AnimatedScaleButton
                            style={[commonStyles.devToolBtn, { backgroundColor: theme.colors.purpleFill, marginTop: 10 }]}
                            onPress={() => {
                                setShowSettings(false);
                                navigation.navigate('Sandbox');
                            }}
                        >
                            <View style={commonStyles.devToolIconBox}>
                                <MaterialCommunityIcons name="flask-outline" size={16} color={theme.colors.devPurple} />
                            </View>
                            <Text style={[commonStyles.devToolBtnText, { color: theme.colors.devPurple }]}>Launch Component Sandbox</Text>
                        </AnimatedScaleButton>
                    </View>
                </View>
            )}
        </View>
    );
};