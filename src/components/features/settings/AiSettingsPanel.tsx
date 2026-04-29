import React, { useRef, useState } from 'react';
import {
    View, Text, TextInput, ActivityIndicator, Platform, StyleSheet
} from 'react-native';
import { vibrate } from '@/lib/haptics';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { commonStyles } from '@/styles/commonStyles';
import { theme } from '@/styles/theme';
import { pingServer } from '@/lib/aiService';
import { ApiKeySetupModal } from './ApiKeySetupModal';
import type { SavedNote, AiQueueState } from '@/types';

type AiSettingsPanelProps = {
    notes: { savedNotes: SavedNote[] };
    aiConfig: {
        aiApiKey: string;
        aiBaseUrl: string;
        aiModel: string;
        aiGrammarModel: string;
        autoGenerateSummaries: boolean;
        saveAiApiKey: (key: string) => Promise<void>;
        saveAiBaseUrl: (url: string) => Promise<void>;
        saveAiModel: (model: string) => Promise<void>;
        updateAutoGenerateSummaries: (val: boolean) => Promise<void>;
    };
    queueState: AiQueueState;
    forceBatchOverwrite: boolean;
    setForceBatchOverwrite: (val: boolean) => void;
    /** Category filter toggles — which entry types to include in batch */
    batchJournals: boolean;
    setBatchJournals: (val: boolean) => void;
    batchCircles: boolean;
    setBatchCircles: (val: boolean) => void;
    batchCheckins: boolean;
    setBatchCheckins: (val: boolean) => void;
    handleBatchProcess: () => void;
    setChoosingModelFor: (val: 'summary' | 'grammar' | null) => void;
};

export const AiSettingsPanel = React.memo(function AiSettingsPanel({
    notes,
    aiConfig,
    queueState,
    forceBatchOverwrite,
    setForceBatchOverwrite,
    batchJournals,
    setBatchJournals,
    batchCircles,
    setBatchCircles,
    batchCheckins,
    setBatchCheckins,
    handleBatchProcess,
    setChoosingModelFor
}: AiSettingsPanelProps) {
    const baseUrlRef = useRef(aiConfig.aiBaseUrl);
    const [showKeyModal, setShowKeyModal] = useState(false);

    return (
        <View style={styles.container}>
            <ApiKeySetupModal
                visible={showKeyModal}
                initialKey={aiConfig.aiApiKey}
                initialBaseUrl={aiConfig.aiBaseUrl}
                initialModel={aiConfig.aiModel}
                onSave={async (key, url, m) => {
                    await aiConfig.saveAiApiKey(key);
                    await aiConfig.saveAiBaseUrl(url);
                    await aiConfig.saveAiModel(m);
                    setShowKeyModal(false);
                }}
                onSkip={() => setShowKeyModal(false)}
            />

            <View style={styles.headerRow}>
                <MaterialCommunityIcons name="brain" size={18} color={theme.colors.primaryAction} />
                <Text style={[commonStyles.settingsLabel, styles.headerTitle]}>AI Settings</Text>
            </View>
            <Text style={styles.subheading}>Ollama Cloud API</Text>

            {/* API Key — now read-only with a Change button */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={styles.fieldLabel}>API Key</Text>
                <AnimatedScaleButton
                    style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: theme.colors.glassSurface }}
                    onPress={() => setShowKeyModal(true)}
                >
                    <Text style={{ color: theme.colors.primaryAction, fontSize: 11, fontWeight: '600' }}>Change</Text>
                </AnimatedScaleButton>
            </View>
            <View style={[styles.apiKeyInput, { justifyContent: 'center' }]}>
                <Text style={{ color: aiConfig.aiApiKey ? theme.colors.textPrimary : theme.colors.textMuted, fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                    {aiConfig.aiApiKey ? `${aiConfig.aiApiKey.slice(0, 8)}••••••••••••` : 'Not configured — tap Change to set up'}
                </Text>
            </View>

            {/* Model Selection (Summary/Title) */}
            <Text style={styles.modelFieldLabel}>Summary & Title Model</Text>
            <AnimatedScaleButton
                style={styles.modelSelectBtn}
                onPress={() => setChoosingModelFor('summary')}
            >
                <Text style={styles.modelSelectText}>{aiConfig.aiModel}</Text>
                <MaterialCommunityIcons name="chevron-down" size={20} color={theme.colors.textSecondary} />
            </AnimatedScaleButton>

            {/* Grammar Model Selection */}
            <Text style={styles.modelFieldLabel}>Grammar & Spell Check Model</Text>
            <AnimatedScaleButton
                style={styles.modelSelectBtn}
                onPress={() => setChoosingModelFor('grammar')}
            >
                <Text style={styles.modelSelectText}>{aiConfig.aiGrammarModel}</Text>
                <MaterialCommunityIcons name="chevron-down" size={20} color={theme.colors.textSecondary} />
            </AnimatedScaleButton>

            {/* Auto-Generate Toggle */}
            <AnimatedScaleButton
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.colors.glassSurfaceLow, borderRadius: theme.borderRadius.sm, padding: 14, marginBottom: 16 }}
                onPress={() => {
                    aiConfig.updateAutoGenerateSummaries(!aiConfig.autoGenerateSummaries);
                    vibrate(10);
                }}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <MaterialCommunityIcons name="robot-outline" size={20} color={theme.colors.textSecondary} />
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.colors.textPrimary, fontSize: 13, fontWeight: '600' }}>Auto-Generate Summaries</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 11, marginTop: 2 }}>Run AI automatically after writing</Text>
                    </View>
                </View>
                <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: aiConfig.autoGenerateSummaries ? theme.colors.primaryAction : theme.colors.glassBorder, justifyContent: 'center', padding: 2 }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: theme.colors.textPrimary, alignSelf: aiConfig.autoGenerateSummaries ? 'flex-end' : 'flex-start' }} />
                </View>
            </AnimatedScaleButton>

            {/* Batch AI Processing — via central AI Queue */}
            <Text style={styles.batchSectionLabel}>Batch Retrospective Processing</Text>
            <View style={styles.batchSection}>
                <AnimatedScaleButton
                    style={[styles.overwriteRow, { opacity: queueState.isProcessing ? 0.5 : 1 }]}
                    onPress={() => !queueState.isProcessing && setForceBatchOverwrite(!forceBatchOverwrite)}
                    disabled={queueState.isProcessing}
                >
                    <View style={[styles.checkbox, { borderColor: forceBatchOverwrite ? theme.colors.primaryAction : theme.colors.glassBorder, backgroundColor: forceBatchOverwrite ? theme.colors.primaryAction : 'transparent' }]}>
                        {forceBatchOverwrite && <MaterialCommunityIcons name="check" size={14} color={theme.colors.textPrimary} />}
                    </View>
                    <Text style={styles.overwriteLabel}>Force overwrite ALL entries (Slow)</Text>
                </AnimatedScaleButton>

                {/* Category Filter Checkboxes */}
                <Text style={styles.categoryFilterLabel}>Include Categories:</Text>
                <View style={styles.categoryFilterRow}>
                    <AnimatedScaleButton
                        style={styles.categoryCheckRow}
                        onPress={() => !queueState.isProcessing && setBatchJournals(!batchJournals)}
                        disabled={queueState.isProcessing}
                    >
                        <View style={[styles.checkbox, { borderColor: batchJournals ? theme.colors.primaryAction : theme.colors.glassBorder, backgroundColor: batchJournals ? theme.colors.primaryAction : 'transparent' }]}>
                            {batchJournals && <MaterialCommunityIcons name="check" size={14} color={theme.colors.textPrimary} />}
                        </View>
                        <Text style={styles.categoryCheckLabel}>📓 Journals</Text>
                    </AnimatedScaleButton>

                    <AnimatedScaleButton
                        style={styles.categoryCheckRow}
                        onPress={() => !queueState.isProcessing && setBatchCircles(!batchCircles)}
                        disabled={queueState.isProcessing}
                    >
                        <View style={[styles.checkbox, { borderColor: batchCircles ? theme.colors.primaryAction : theme.colors.glassBorder, backgroundColor: batchCircles ? theme.colors.primaryAction : 'transparent' }]}>
                            {batchCircles && <MaterialCommunityIcons name="check" size={14} color={theme.colors.textPrimary} />}
                        </View>
                        <Text style={styles.categoryCheckLabel}>👥 Circles</Text>
                    </AnimatedScaleButton>

                    <AnimatedScaleButton
                        style={styles.categoryCheckRow}
                        onPress={() => !queueState.isProcessing && setBatchCheckins(!batchCheckins)}
                        disabled={queueState.isProcessing}
                    >
                        <View style={[styles.checkbox, { borderColor: batchCheckins ? theme.colors.primaryAction : theme.colors.glassBorder, backgroundColor: batchCheckins ? theme.colors.primaryAction : 'transparent' }]}>
                            {batchCheckins && <MaterialCommunityIcons name="check" size={14} color={theme.colors.textPrimary} />}
                        </View>
                        <Text style={styles.categoryCheckLabel}>🧭 Check-ins</Text>
                    </AnimatedScaleButton>
                </View>

                <AnimatedScaleButton
                    style={[styles.batchProcessBtn, { backgroundColor: queueState.isProcessing ? theme.colors.dangerFill : theme.colors.successBorder, borderColor: queueState.isProcessing ? theme.colors.dangerBorderStrong : theme.colors.successBorder }]}
                    onPress={handleBatchProcess}
                >
                    {queueState.isProcessing ? (
                        <>
                            <ActivityIndicator size="small" color={theme.colors.danger} />
                            <Text style={styles.cancelBtnText}>Cancel Processing</Text>
                        </>
                    ) : (
                        <>
                            <MaterialCommunityIcons name="brain" size={16} color={theme.colors.green} />
                            <Text style={styles.processBtnText}>Process {forceBatchOverwrite ? 'All' : 'Missing'} Entries</Text>
                        </>
                    )}
                </AnimatedScaleButton>

                {/* Granular batch progress UI */}
                {queueState.isProcessing && (
                    <View style={styles.progressSection}>
                        {queueState.batchProgress && (
                            <View style={styles.progressBlock}>
                                <View style={styles.progressRow}>
                                    <Text style={styles.progressCategoryLabel}>
                                        {queueState.currentCategory === 'journal' ? '📓 Journals' : queueState.currentCategory === 'circle' ? '👥 Circles' : queueState.currentCategory === 'checkin' ? '🧭 Check-ins' : '⏳ Processing...'}
                                    </Text>
                                    <Text style={styles.progressCountLabel}>
                                        {queueState.batchProgress.current}/{queueState.batchProgress.total}
                                    </Text>
                                </View>
                                <View style={styles.progressTrack}>
                                    <View style={[styles.progressFill, { width: `${Math.round((queueState.batchProgress.current / Math.max(queueState.batchProgress.total, 1)) * 100)}%` }]} />
                                </View>
                            </View>
                        )}
                        {queueState.currentJob && (() => {
                            const currentNote = notes.savedNotes.find((n: SavedNote) => n.id === queueState.currentJob?.noteId);
                            return currentNote ? (
                                <Text style={styles.currentJobText} numberOfLines={1}>
                                    Now: "{currentNote.text.slice(0, 60)}..."
                                </Text>
                            ) : null;
                        })()}
                    </View>
                )}
            </View>

            {/* ── AI Status Panel — always-visible queue state ───── */}
            <Text style={styles.batchSectionLabel}>AI Status</Text>
            <View style={styles.statusSection}>
                <View style={styles.statusRow}>
                    <View style={[styles.statusDot, { backgroundColor: queueState.serverOnline ? theme.colors.green : queueState.serverOnline === false ? theme.colors.danger : theme.colors.textMuted }]} />
                    <Text style={styles.statusServerText}>
                        Server: {queueState.serverOnline ? 'Online' : queueState.serverOnline === false ? 'Offline' : 'Checking...'}
                    </Text>
                </View>
                <View style={styles.statusQueueRow}>
                    <MaterialCommunityIcons name={queueState.isProcessing ? 'loading' : 'check-circle-outline'} size={14} color={queueState.isProcessing ? theme.colors.primaryAction : theme.colors.green} />
                    <Text style={styles.statusQueueText}>
                        {queueState.isProcessing
                            ? `Processing (${queueState.pendingCount} queued)`
                            : queueState.pendingCount > 0
                                ? `${queueState.pendingCount} jobs waiting (server offline)`
                                : 'All done — no pending jobs'
                        }
                    </Text>
                </View>
                <Text style={styles.coverageText}>
                    AI Coverage: {notes.savedNotes.filter((n: SavedNote) => n.aiTitle).length}/{notes.savedNotes.length} entries
                </Text>

                {queueState.serverOnline === false && queueState.lastError && (
                    <View style={styles.errorBox}>
                        <Text style={styles.errorTitle}>
                            <MaterialCommunityIcons name="alert-circle-outline" size={12} /> Connection Error
                        </Text>
                        <Text style={styles.errorMessage}>
                            {queueState.lastError}
                        </Text>
                        <Text style={styles.errorHint}>
                            Queue is paused and will auto-resume when reachable.
                        </Text>
                    </View>
                )}
            </View>

            {/* Base URL */}
            <Text style={styles.fieldLabel}>Base URL</Text>
            <TextInput
                style={styles.baseUrlInput}
                defaultValue={aiConfig.aiBaseUrl}
                onChangeText={(text) => baseUrlRef.current = text}
                onEndEditing={() => aiConfig.saveAiBaseUrl(baseUrlRef.current)}
                placeholder="https://ollama.com"
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="none"
                keyboardType="url"
            />

            {/* Test Connection */}
            <AnimatedScaleButton
                style={[commonStyles.closeVersionBtn, styles.testConnectionBtn]}
                onPress={async () => {
                    const result = await pingServer({ apiKey: aiConfig.aiApiKey, baseUrl: aiConfig.aiBaseUrl });
                    vibrate(result.online ? 20 : [0, 50, 50, 50]);
                    alert(result.online ? '✅ AI server is reachable!' : `❌ Cannot reach AI server.\n\nError: ${result.error}`);
                }}
            >
                <MaterialCommunityIcons name="connection" size={16} color={theme.colors.primaryAction} />
                <Text style={[commonStyles.closeVersionBtnText, styles.testConnectionText]}>Test Connection</Text>
            </AnimatedScaleButton>
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        backgroundColor: theme.colors.glassBackground,
        borderRadius: theme.borderRadius.md,
        padding: 20,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        marginTop: 10,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    headerTitle: {
        marginTop: 0,
        marginBottom: 0,
        color: theme.colors.textPrimary,
        fontSize: 16,
    },
    subheading: {
        color: theme.colors.textMuted,
        fontSize: 13,
        marginBottom: 12,
    },
    fieldLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 4,
    },
    apiKeyInput: {
        backgroundColor: theme.colors.darkGrey,
        color: theme.colors.textPrimary,
        fontSize: 13,
        padding: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        marginBottom: 10,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    modelFieldLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 8,
    },
    modelSelectBtn: {
        backgroundColor: theme.colors.darkGrey,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        marginBottom: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    modelSelectText: {
        color: theme.colors.textPrimary,
        fontSize: 13,
        fontWeight: '600',
    },
    batchSectionLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 8,
        marginTop: 4,
    },
    batchSection: {
        backgroundColor: theme.colors.surfaceOverlayLight,
        padding: 12,
        borderRadius: 10,
        marginBottom: 16,
    },
    overwriteRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 4,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    overwriteLabel: {
        color: theme.colors.textPrimary,
        fontSize: 13,
        flex: 1,
    },
    categoryFilterLabel: {
        color: theme.colors.textMuted,
        fontSize: 11,
        fontWeight: '600',
        marginBottom: 8,
    },
    categoryFilterRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 14,
    },
    categoryCheckRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 10,
        backgroundColor: theme.colors.glassSurfaceLow,
        borderRadius: 8,
    },
    categoryCheckLabel: {
        color: theme.colors.textPrimary,
        fontSize: 12,
    },
    batchProcessBtn: {
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        borderWidth: 1,
    },
    cancelBtnText: {
        color: theme.colors.danger,
        fontWeight: 'bold',
    },
    processBtnText: {
        color: theme.colors.green,
        fontWeight: 'bold',
    },
    progressSection: {
        marginTop: 12,
    },
    progressBlock: {
        marginBottom: 8,
    },
    progressRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    progressCategoryLabel: {
        color: theme.colors.textMuted,
        fontSize: 11,
        fontWeight: '600',
    },
    progressCountLabel: {
        color: theme.colors.textMuted,
        fontSize: 11,
    },
    progressTrack: {
        height: 4,
        borderRadius: 2,
        backgroundColor: theme.colors.glassSurface,
    },
    progressFill: {
        height: 4,
        borderRadius: 2,
        backgroundColor: theme.colors.primaryAction,
    },
    currentJobText: {
        color: theme.colors.textMuted,
        fontSize: 11,
        fontStyle: 'italic',
    },
    statusSection: {
        backgroundColor: theme.colors.surfaceOverlayLight,
        padding: 12,
        borderRadius: 10,
        marginBottom: 16,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    statusServerText: {
        color: theme.colors.textPrimary,
        fontSize: 13,
        fontWeight: '600',
    },
    statusQueueRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    statusQueueText: {
        color: theme.colors.textMuted,
        fontSize: 12,
    },
    coverageText: {
        color: theme.colors.textMuted,
        fontSize: 11,
        marginTop: 4,
    },
    errorBox: {
        marginTop: 12,
        backgroundColor: theme.colors.dangerFill,
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.dangerBorderStrong,
    },
    errorTitle: {
        color: theme.colors.danger,
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    errorMessage: {
        color: theme.colors.danger,
        fontSize: 11,
    },
    errorHint: {
        color: theme.colors.textSecondary,
        fontSize: 10,
        marginTop: 4,
        fontStyle: 'italic',
    },
    baseUrlInput: {
        backgroundColor: theme.colors.darkGrey,
        color: theme.colors.textPrimary,
        fontSize: 13,
        padding: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        marginBottom: 12,
    },
    testConnectionBtn: {
        backgroundColor: theme.colors.dangerTint,
        marginTop: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    testConnectionText: {
        color: theme.colors.primaryAction,
    },
});
