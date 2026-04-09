import React, { useRef } from 'react';
import { View, Text, TextInput, ActivityIndicator, Vibration, Platform } from 'react-native';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { commonStyles } from '@/styles/commonStyles';
import { theme } from '@/styles/theme';
import { pingServer } from '@/lib/aiService';

type AiSettingsPanelProps = {
    storage: any;
    queueState: any;
    forceBatchOverwrite: boolean;
    setForceBatchOverwrite: (val: boolean) => void;
    handleBatchProcess: () => void;
    setChoosingModelFor: (val: 'summary' | 'grammar' | null) => void;
};

export const AiSettingsPanel: React.FC<AiSettingsPanelProps> = ({
    storage,
    queueState,
    forceBatchOverwrite,
    setForceBatchOverwrite,
    handleBatchProcess,
    setChoosingModelFor
}) => {
    const apiKeyRef = useRef(storage.aiApiKey);
    const baseUrlRef = useRef(storage.aiBaseUrl);

    return (
        <View style={{ backgroundColor: theme.colors.glassBackground, borderRadius: theme.borderRadius.md, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: theme.colors.glassBorder, marginTop: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <MaterialCommunityIcons name="brain" size={18} color={theme.colors.primaryAction} />
                <Text style={[commonStyles.settingsLabel, { marginTop: 0, marginBottom: 0, color: theme.colors.textPrimary, fontSize: 16 }]}>AI Settings</Text>
            </View>
            <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginBottom: 12 }}>Ollama Cloud API — KimiK2.5</Text>

            {/* API Key */}
            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 4 }}>API Key</Text>
            <TextInput
                style={{ backgroundColor: 'rgba(0,0,0,0.3)', color: theme.colors.textPrimary, fontSize: 13, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.glassBorder, marginBottom: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}
                defaultValue={storage.aiApiKey}
                onChangeText={(text) => apiKeyRef.current = text}
                onEndEditing={() => storage.saveAiApiKey(apiKeyRef.current)}
                secureTextEntry
                placeholder="Enter API key"
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="none"
            />

            {/* Model Selection (Summary/Title) */}
            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>Summary & Title Model</Text>
            <AnimatedScaleButton
                style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.glassBorder, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                onPress={() => setChoosingModelFor('summary')}
            >
                <Text style={{ color: theme.colors.textPrimary, fontSize: 13, fontWeight: '600' }}>{storage.aiModel}</Text>
                <MaterialCommunityIcons name="chevron-down" size={20} color={theme.colors.textSecondary} />
            </AnimatedScaleButton>

            {/* Grammar Model Selection */}
            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>Grammar & Spell Check Model</Text>
            <AnimatedScaleButton
                style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.glassBorder, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                onPress={() => setChoosingModelFor('grammar')}
            >
                <Text style={{ color: theme.colors.textPrimary, fontSize: 13, fontWeight: '600' }}>{storage.aiGrammarModel}</Text>
                <MaterialCommunityIcons name="chevron-down" size={20} color={theme.colors.textSecondary} />
            </AnimatedScaleButton>

            {/* Batch AI Processing — via central AI Queue */}
            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 8, marginTop: 4 }}>Batch Retrospective Processing</Text>
            <View style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 10, marginBottom: 16 }}>
                <AnimatedScaleButton 
                    style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, opacity: queueState.isProcessing ? 0.5 : 1 }}
                    onPress={() => !queueState.isProcessing && setForceBatchOverwrite(!forceBatchOverwrite)}
                    disabled={queueState.isProcessing}
                >
                    <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: forceBatchOverwrite ? theme.colors.primaryAction : theme.colors.glassBorder, backgroundColor: forceBatchOverwrite ? theme.colors.primaryAction : 'transparent', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                        {forceBatchOverwrite && <MaterialCommunityIcons name="check" size={14} color="#FFF" />}
                    </View>
                    <Text style={{ color: theme.colors.textPrimary, fontSize: 13, flex: 1 }}>Force overwrite ALL entries (Slow)</Text>
                </AnimatedScaleButton>

                <AnimatedScaleButton
                    style={{
                        backgroundColor: queueState.isProcessing ? 'rgba(255, 77, 77, 0.15)' : 'rgba(74, 222, 128, 0.15)',
                        paddingVertical: 12,
                        borderRadius: 8,
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'center',
                        gap: 8,
                        borderWidth: 1,
                        borderColor: queueState.isProcessing ? 'rgba(255, 77, 77, 0.3)' : 'rgba(74, 222, 128, 0.3)'
                    }}
                    onPress={handleBatchProcess}
                >
                    {queueState.isProcessing ? (
                        <>
                            <ActivityIndicator size="small" color={theme.colors.danger} />
                            <Text style={{ color: theme.colors.danger, fontWeight: 'bold' }}>Cancel Processing</Text>
                        </>
                    ) : (
                        <>
                            <MaterialCommunityIcons name="brain" size={16} color="#4ade80" />
                            <Text style={{ color: '#4ade80', fontWeight: 'bold' }}>Process {forceBatchOverwrite ? 'All' : 'Missing'} Entries</Text>
                        </>
                    )}
                </AnimatedScaleButton>

                {/* Granular batch progress UI */}
                {queueState.isProcessing && (
                    <View style={{ marginTop: 12 }}>
                        {queueState.batchProgress && (
                            <View style={{ marginBottom: 8 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <Text style={{ color: theme.colors.textMuted, fontSize: 11, fontWeight: '600' }}>
                                        {queueState.currentCategory === 'journal' ? '📓 Journals' : queueState.currentCategory === 'circle' ? '👥 Circles' : '🧭 Check-ins'}
                                    </Text>
                                    <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>
                                        {queueState.batchProgress.current}/{queueState.batchProgress.total}
                                    </Text>
                                </View>
                                <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.06)' }}>
                                    <View style={{ height: 4, borderRadius: 2, backgroundColor: theme.colors.primaryAction, width: `${Math.round((queueState.batchProgress.current / Math.max(queueState.batchProgress.total, 1)) * 100)}%` }} />
                                </View>
                            </View>
                        )}
                        {queueState.currentJob && (() => {
                            const currentNote = storage.savedNotes.find((n: any) => n.id === queueState.currentJob?.noteId);
                            return currentNote ? (
                                <Text style={{ color: theme.colors.textMuted, fontSize: 11, fontStyle: 'italic' }} numberOfLines={1}>
                                    Now: "{currentNote.text.slice(0, 60)}..."
                                </Text>
                            ) : null;
                        })()}
                    </View>
                )}
            </View>

            {/* ── AI Status Panel — always-visible queue state ───── */}
            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 8, marginTop: 4 }}>AI Status</Text>
            <View style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 10, marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: queueState.serverOnline ? '#4ade80' : queueState.serverOnline === false ? theme.colors.danger : theme.colors.textMuted }} />
                    <Text style={{ color: theme.colors.textPrimary, fontSize: 13, fontWeight: '600' }}>
                        Server: {queueState.serverOnline ? 'Online' : queueState.serverOnline === false ? 'Offline' : 'Checking...'}
                    </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <MaterialCommunityIcons name={queueState.isProcessing ? 'loading' : 'check-circle-outline'} size={14} color={queueState.isProcessing ? theme.colors.primaryAction : '#4ade80'} />
                    <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
                        {queueState.isProcessing
                            ? `Processing (${queueState.pendingCount} queued)`
                            : queueState.pendingCount > 0
                                ? `${queueState.pendingCount} jobs waiting (server offline)`
                                : 'All done — no pending jobs'
                        }
                    </Text>
                </View>
                <Text style={{ color: theme.colors.textMuted, fontSize: 11, marginTop: 4 }}>
                    AI Coverage: {storage.savedNotes.filter((n: any) => n.aiTitle).length}/{storage.savedNotes.length} entries
                </Text>

                {queueState.serverOnline === false && queueState.lastError && (
                    <View style={{ marginTop: 12, backgroundColor: 'rgba(255, 42, 42, 0.15)', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255, 42, 42, 0.3)' }}>
                        <Text style={{ color: theme.colors.danger, fontSize: 12, fontWeight: 'bold', marginBottom: 4 }}>
                            <MaterialCommunityIcons name="alert-circle-outline" size={12} /> Connection Error
                        </Text>
                        <Text style={{ color: theme.colors.danger, fontSize: 11 }}>
                            {queueState.lastError}
                        </Text>
                        <Text style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 10, marginTop: 4, fontStyle: 'italic' }}>
                            Queue is paused and will auto-resume when reachable.
                        </Text>
                    </View>
                )}
            </View>

            {/* Base URL */}
            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 4 }}>Base URL</Text>
            <TextInput
                style={{ backgroundColor: 'rgba(0,0,0,0.3)', color: theme.colors.textPrimary, fontSize: 13, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.glassBorder, marginBottom: 12 }}
                defaultValue={storage.aiBaseUrl}
                onChangeText={(text) => baseUrlRef.current = text}
                onEndEditing={() => storage.saveAiBaseUrl(baseUrlRef.current)}
                placeholder="https://ollama.com"
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="none"
                keyboardType="url"
            />

            {/* Test Connection */}
            <AnimatedScaleButton
                style={[commonStyles.closeVersionBtn, { backgroundColor: 'rgba(255, 42, 42, 0.1)', marginTop: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }]}
                onPress={async () => {
                    const result = await pingServer({ apiKey: storage.aiApiKey, baseUrl: storage.aiBaseUrl });
                    Vibration.vibrate(result.online ? 20 : [0, 50, 50, 50]);
                    alert(result.online ? '✅ AI server is reachable!' : `❌ Cannot reach AI server.\n\nError: ${result.error}`);
                }}
            >
                <MaterialCommunityIcons name="connection" size={16} color={theme.colors.primaryAction} />
                <Text style={[commonStyles.closeVersionBtnText, { color: theme.colors.primaryAction }]}>Test Connection</Text>
            </AnimatedScaleButton>
        </View>
    );
};
