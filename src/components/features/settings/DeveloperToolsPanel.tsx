import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, Vibration } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation.types';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { SettingsCard } from '@/components/ui/SettingsCard';
import { commonStyles } from '@/styles/commonStyles';
import { theme } from '@/styles/theme';
import { CONFIG } from '@/config';
import { DEFAULT_AI_PROMPTS } from '@/config/ai';
import type { AiLogEntry } from '@/types';

type DeveloperToolsPanelProps = {
    notes: { savedNotes: any[]; clearAllAiMetadata: () => Promise<void> };
    personsHook: { persons: any[] };
    streak: { currentStreak: number; lastWinDate: string; streakHistory: string[] };
    preferences: { devMode: boolean; debugLayout: boolean; fontIndex: number; sizeIndex: number; toggleDevMode: () => Promise<void>; toggleDebugLayout: () => Promise<void> };
    aiConfig: { aiPrompts: any; saveAiPrompts: (prompts: any) => Promise<void> };
    vlogs: { savedVlogs: any[]; totalVlogStorageBytes: number };
    storageActions: { clearAllData: () => Promise<void> };
    queueState: any;
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

/**
 * DeveloperToolsPanel — Debug/dev settings panel.
 * Provides dev mode toggle, storage info, AI log viewer, and editable prompts.
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
    const [fileSystemData, setFileSystemData] = useState<any[]>([]);
    const [fileSystemLoading, setFileSystemLoading] = useState(false);
    const [viewingFile, setViewingFile] = useState<{name: string, content: string} | null>(null);

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
        <View style={{ backgroundColor: preferences.devMode ? 'rgba(255, 215, 0, 0.08)' : theme.colors.glassBackground, borderRadius: theme.borderRadius.md, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: preferences.devMode ? 'rgba(255, 215, 0, 0.3)' : theme.colors.glassBorder, marginTop: 10 }}>
            <Text style={[commonStyles.settingsLabel, { marginTop: 0, color: preferences.devMode ? theme.colors.gold : theme.colors.textPrimary, fontSize: 16 }]}>🛠 Developer Tools</Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginBottom: 15 }}>Debug features for testing</Text>

            {/* Dev Mode Toggle */}
            <AnimatedScaleButton
                style={[commonStyles.closeVersionBtn, { backgroundColor: preferences.devMode ? 'rgba(255, 215, 0, 0.2)' : theme.colors.glassHighlight, marginTop: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                onPress={() => {
                    Vibration.vibrate(preferences.devMode ? [0, 100, 50, 100] : [0, 50, 100, 50, 100, 150]);
                    preferences.toggleDevMode();
                }}
            >
                <Text style={[commonStyles.closeVersionBtnText, preferences.devMode && { color: theme.colors.gold }]}>Dev Mode</Text>
                <Text style={{ color: preferences.devMode ? theme.colors.gold : theme.colors.textMuted, fontSize: 13, fontWeight: 'bold' }}>{preferences.devMode ? 'ON' : 'OFF'}</Text>
            </AnimatedScaleButton>

            {/* Dev Actions */}
            {preferences.devMode && (
                <View style={{ marginTop: 15, gap: 10 }}>
                    <AnimatedScaleButton
                        style={[commonStyles.closeVersionBtn, { backgroundColor: 'rgba(255, 215, 0, 0.15)', marginTop: 0 }]}
                        onPress={() => {
                            setNewStreakParam(streak.currentStreak || 1);
                            setShowStreakPopup(true);
                            setShowSettings(false);
                        }}
                    >
                        <Text style={[commonStyles.closeVersionBtnText, { color: theme.colors.gold }]}>🎯 Simulate Streak Popup</Text>
                    </AnimatedScaleButton>

                    <AnimatedScaleButton
                        style={[commonStyles.closeVersionBtn, { backgroundColor: 'rgba(74, 222, 128, 0.15)', marginTop: 0 }]}
                        onPress={() => setShowBenchmarkModal(true)}
                    >
                        <Text style={[commonStyles.closeVersionBtnText, { color: theme.colors.green }]}>⚡ Run AI Benchmark</Text>
                    </AnimatedScaleButton>

                    <AnimatedScaleButton
                        style={[commonStyles.closeVersionBtn, { backgroundColor: 'rgba(255, 77, 77, 0.15)', marginTop: 0 }]}
                        onPress={() => {
                            storageActions.clearAllData();
                            setShowSettings(false);
                        }}
                    >
                        <Text style={[commonStyles.closeVersionBtnText, { color: theme.colors.danger }]}>🗑 Clear All Data</Text>
                    </AnimatedScaleButton>

                    <AnimatedScaleButton
                        style={[commonStyles.closeVersionBtn, { backgroundColor: 'rgba(255, 165, 0, 0.15)', marginTop: 0 }]}
                        onPress={() => {
                            notes.clearAllAiMetadata();
                            Vibration.vibrate(50);
                        }}
                    >
                        <Text style={[commonStyles.closeVersionBtnText, { color: '#FFA500' }]}>🗑 Reset all AI Entries</Text>
                    </AnimatedScaleButton>

                    <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: theme.borderRadius.sm, padding: 12, marginTop: 5 }}>
                        <Text style={{ color: theme.colors.gold, fontSize: 12, fontWeight: 'bold', marginBottom: 8 }}>📊 Storage Info</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>Notes: {notes.savedNotes.length}</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>Circles: {personsHook.persons.length}</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>Current Streak: {streak.currentStreak}</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>Last Win: {streak.lastWinDate || 'Never'}</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>Streak History: {streak.streakHistory.length} days</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>Font: {CONFIG.FONTS[preferences.fontIndex]?.label || 'Default'} | Size: {CONFIG.SIZES[preferences.sizeIndex]?.label || 'Default'}</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>Vlogs: {vlogs.savedVlogs.length} ({(vlogs.totalVlogStorageBytes / (1024 * 1024)).toFixed(1)} MB)</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>AI Title Coverage: {notes.savedNotes.filter((n: any) => n.aiTitle).length}/{notes.savedNotes.length} notes</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>AI Queue: {queueState.pendingCount} pending, {queueState.isProcessing ? 'active' : 'idle'}</Text>
                    </View>

                    <AnimatedScaleButton
                        style={[commonStyles.closeVersionBtn, { backgroundColor: 'rgba(255, 215, 0, 0.15)', marginTop: 10 }]}
                        onPress={async () => { await loadAiLog(); setShowAiLog(!showAiLog); }}
                    >
                        <Text style={[commonStyles.closeVersionBtnText, { color: theme.colors.gold }]}>{showAiLog ? '🔽 Hide' : '📋 Show'} AI Processing Log</Text>
                    </AnimatedScaleButton>

                    {showAiLog && (
                        <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: theme.borderRadius.sm, padding: 12, marginTop: 8, maxHeight: 300 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <Text style={{ color: theme.colors.gold, fontSize: 12, fontWeight: 'bold' }}>📋 AI Log ({aiLogEntries.length} entries)</Text>
                                <AnimatedScaleButton onPress={async () => { await clearAiLog(); setAiLogEntries([]); }}>
                                    <Text style={{ color: theme.colors.danger, fontSize: 11, fontWeight: '600' }}>Clear</Text>
                                </AnimatedScaleButton>
                            </View>
                            <ScrollView style={{ maxHeight: 250 }} nestedScrollEnabled>
                                {aiLogEntries.length === 0 ? (
                                    <Text style={{ color: theme.colors.textMuted, fontSize: 11, fontStyle: 'italic' }}>No log entries yet</Text>
                                ) : (
                                    aiLogEntries.map((entry, i) => (
                                        <View key={i} style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', paddingVertical: 4 }}>
                                            <Text style={{ color: theme.colors.textMuted, fontSize: 10 }}>
                                                {new Date(entry.timestamp).toLocaleTimeString()} | {entry.action.toUpperCase()} | {entry.phase}{entry.durationMs ? ` | ${entry.durationMs}ms` : ''}
                                            </Text>
                                            {entry.error && <Text style={{ color: theme.colors.danger, fontSize: 10 }}>{entry.error}</Text>}
                                        </View>
                                    ))
                                )}
                            </ScrollView>
                        </View>
                    )}

                    <AnimatedScaleButton
                        style={[commonStyles.closeVersionBtn, { backgroundColor: 'rgba(50, 150, 255, 0.15)', marginTop: 10 }]}
                        onPress={async () => { 
                            if (!showFileSystem) await loadFileSystemData();
                            setShowFileSystem(!showFileSystem); 
                        }}
                    >
                        <Text style={[commonStyles.closeVersionBtnText, { color: '#3296FF' }]}>{showFileSystem ? '🔽 Hide' : '📁 Show'} File System Explorer</Text>
                    </AnimatedScaleButton>

                    {showFileSystem && (
                        <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: theme.borderRadius.sm, padding: 12, marginTop: 8, maxHeight: 400 }}>
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
                                            <Text style={{ color: '#3296FF', fontSize: 12, fontWeight: 'bold', marginRight: 8 }}>📁 Explorer</Text>
                                            {currentPath !== FileSystem.documentDirectory && (
                                                <AnimatedScaleButton onPress={() => {
                                                    const parts = currentPath.split('/');
                                                    parts.pop(); // remove trailing empty string
                                                    parts.pop(); // remove current directory
                                                    loadFileSystemData(parts.join('/') + '/');
                                                }} style={{ paddingHorizontal: 6, paddingVertical: 2, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4 }}>
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
                                                    style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', paddingVertical: 8 }}
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
                                                    <Text style={{ color: file.isDirectory ? '#3296FF' : theme.colors.textSecondary, fontSize: 11, fontWeight: 'bold' }}>
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

                    <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: theme.borderRadius.sm, padding: 12, marginTop: 10 }}>
                        <Text style={{ color: theme.colors.gold, fontSize: 12, fontWeight: 'bold', marginBottom: 10 }}>🤖 AI Prompts (editable)</Text>
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>Title Prompt</Text>
                        <TextInput
                            style={{ backgroundColor: 'rgba(0,0,0,0.4)', color: theme.colors.textPrimary, fontSize: 11, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,215,0,0.15)', marginBottom: 8, minHeight: 60, textAlignVertical: 'top' }}
                            defaultValue={aiConfig.aiPrompts.title || DEFAULT_AI_PROMPTS.title}
                            onChangeText={(v) => titlePromptRef.current = v}
                            onEndEditing={() => aiConfig.saveAiPrompts({ ...aiConfig.aiPrompts, title: titlePromptRef.current })}
                            multiline
                        />
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>Summary Prompt</Text>
                        <TextInput
                            style={{ backgroundColor: 'rgba(0,0,0,0.4)', color: theme.colors.textPrimary, fontSize: 11, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,215,0,0.15)', marginBottom: 8, minHeight: 60, textAlignVertical: 'top' }}
                            defaultValue={aiConfig.aiPrompts.summary || DEFAULT_AI_PROMPTS.summary}
                            onChangeText={(v) => summaryPromptRef.current = v}
                            onEndEditing={() => aiConfig.saveAiPrompts({ ...aiConfig.aiPrompts, summary: summaryPromptRef.current })}
                            multiline
                        />
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>Relationship Title Prompt</Text>
                        <TextInput
                            style={{ backgroundColor: 'rgba(0,0,0,0.4)', color: theme.colors.textPrimary, fontSize: 11, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,215,0,0.15)', marginBottom: 8, minHeight: 60, textAlignVertical: 'top' }}
                            defaultValue={aiConfig.aiPrompts.relationshipTitle || DEFAULT_AI_PROMPTS.relationshipTitle}
                            onChangeText={(v) => relationshipTitlePromptRef.current = v}
                            onEndEditing={() => aiConfig.saveAiPrompts({ ...aiConfig.aiPrompts, relationshipTitle: relationshipTitlePromptRef.current })}
                            multiline
                        />
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>Relationship Summary Prompt</Text>
                        <TextInput
                            style={{ backgroundColor: 'rgba(0,0,0,0.4)', color: theme.colors.textPrimary, fontSize: 11, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,215,0,0.15)', marginBottom: 8, minHeight: 60, textAlignVertical: 'top' }}
                            defaultValue={aiConfig.aiPrompts.relationshipSummary || DEFAULT_AI_PROMPTS.relationshipSummary}
                            onChangeText={(v) => relationshipSummaryPromptRef.current = v}
                            onEndEditing={() => aiConfig.saveAiPrompts({ ...aiConfig.aiPrompts, relationshipSummary: relationshipSummaryPromptRef.current })}
                            multiline
                        />
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>Grammar Prompt</Text>
                        <TextInput
                            style={{ backgroundColor: 'rgba(0,0,0,0.4)', color: theme.colors.textPrimary, fontSize: 11, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,215,0,0.15)', marginBottom: 8, minHeight: 60, textAlignVertical: 'top' }}
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

                    <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: theme.borderRadius.sm, padding: 12, marginTop: 10 }}>
                        <Text style={{ color: theme.colors.gold, fontSize: 12, fontWeight: 'bold', marginBottom: 10 }}>🔥 Debug Injectors</Text>
                        
                        <AnimatedScaleButton
                            style={[commonStyles.closeVersionBtn, { backgroundColor: preferences.debugLayout ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255, 255, 255, 0.05)', marginTop: 0, marginBottom: 8 }]}
                            onPress={preferences.toggleDebugLayout}
                        >
                            <Text style={[commonStyles.closeVersionBtnText, { color: preferences.debugLayout ? theme.colors.green : theme.colors.textMuted }]}>
                                {preferences.debugLayout ? '🟢 Layout Bounds ON' : '⚪ Layout Bounds OFF'}
                            </Text>
                        </AnimatedScaleButton>

                        <AnimatedScaleButton
                            style={[commonStyles.closeVersionBtn, { backgroundColor: 'rgba(255, 77, 77, 0.15)', marginTop: 0 }]}
                            onPress={() => {
                                // Trigger a render cycle bomb
                                setTimeout(() => { throw new Error("Developer Simulated Native Crash"); }, 100);
                            }}
                        >
                            <Text style={[commonStyles.closeVersionBtnText, { color: theme.colors.danger }]}>🧨 Simulate Native Crash</Text>
                        </AnimatedScaleButton>

                        <AnimatedScaleButton
                            style={[commonStyles.closeVersionBtn, { backgroundColor: 'rgba(100, 100, 255, 0.15)', marginTop: 10 }]}
                            onPress={() => {
                                setShowSettings(false);
                                navigation.navigate('Sandbox');
                            }}
                        >
                            <Text style={[commonStyles.closeVersionBtnText, { color: '#6464FF' }]}>🧪 Launch Component Sandbox</Text>
                        </AnimatedScaleButton>
                    </View>
                </View>
            )}
        </View>
    );
};