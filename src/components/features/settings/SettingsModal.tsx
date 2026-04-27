import React, { useState } from 'react';
import {View,
    Text,
    ScrollView,
import { vibrate } from '@/lib/haptics';
    Pressable,, vibrate} from 'react-native';
import { SwipeableModal } from '@/components/ui/SwipeableModal';
import { ActionSheet } from '@/components/ui/ActionSheet';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { AiSettingsPanel } from '@/components/features/settings/AiSettingsPanel';
import { DeveloperToolsPanel } from '@/components/features/settings/DeveloperToolsPanel';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CONFIG } from '@/config';
import { AI_AVAILABLE_MODELS } from '@/config/ai';
import { commonStyles } from '@/styles/commonStyles';
import { theme } from '@/styles/theme';
import { isCompressionAvailable } from '@/lib/videoCompressor';
import type { AiLogEntry, AiQueueState } from '@/types';
import type { usePreferences, useFeedData, useVlogs, useNotes, useAiConfig, usePersons, useStreak, useStorageActions } from '@/lib/hooks/useStorage';
import type { useSecurity } from '@/lib/hooks/useSecurity';

// ---- Grouped prop types to reduce prop drilling ----

export type BatchState = {
    forceBatchOverwrite: boolean;
    setForceBatchOverwrite: (val: boolean) => void;
    batchJournals: boolean;
    setBatchJournals: (val: boolean) => void;
    batchCircles: boolean;
    setBatchCircles: (val: boolean) => void;
    batchCheckins: boolean;
    setBatchCheckins: (val: boolean) => void;
    choosingModelFor: 'summary' | 'grammar' | null;
    setChoosingModelFor: (val: 'summary' | 'grammar' | null) => void;
};

export type LogState = {
    aiLogEntries: AiLogEntry[];
    showAiLog: boolean;
    setShowAiLog: (val: boolean) => void;
    setAiLogEntries: (val: AiLogEntry[]) => void;
};

export type DevTools = {
    devModeUnlocked: boolean;
    setShowStreakPopup: (val: boolean) => void;
    setNewStreakParam: (val: number) => void;
    setShowSettings: (val: boolean) => void;
    setShowBenchmarkModal: (val: boolean) => void;
    loadAiLog: () => Promise<void>;
    clearAiLog: () => Promise<void>;
};

/** Domain-specific hook return types */
type Preferences = ReturnType<typeof usePreferences>;
type FeedData = ReturnType<typeof useFeedData>;
type Vlogs = ReturnType<typeof useVlogs>;
type Notes = ReturnType<typeof useNotes>;
type AiConfig = ReturnType<typeof useAiConfig>;
type PersonsHook = ReturnType<typeof usePersons>;
type Streak = ReturnType<typeof useStreak>;
type StorageActions = ReturnType<typeof useStorageActions>;
type Security = ReturnType<typeof useSecurity>;

interface SettingsModalProps {
    visible: boolean;
    onClose: () => void;
    setHomeScrollEnabled?: (enabled: boolean) => void;

    /** Hook data */
    preferences: Preferences;
    feedData: FeedData;
    vlogs: Vlogs;
    notes: Notes;
    aiConfig: AiConfig;
    personsHook: PersonsHook;
    streak: Streak;
    storageActions: StorageActions;
    security: Security;

    /** AI queue */
    queueState: AiQueueState;
    startBatch: (overwrite: boolean, filter?: Set<'journal' | 'circle' | 'checkin'> | undefined) => Promise<number>;
    cancelBatch: () => Promise<void>;

    /** Grouped props */
    batchState: BatchState;
    logState: LogState;
    devTools: DevTools;

    /** Derived values */
    activeFont: string;
    activeSize: number;
}

export const SettingsModal: React.FC<SettingsModalProps> = React.memo(function SettingsModal({
    visible,
    onClose,
    setHomeScrollEnabled,
    preferences,
    feedData,
    vlogs,
    notes,
    aiConfig,
    personsHook,
    streak,
    storageActions,
    security,
    queueState,
    startBatch,
    cancelBatch,
    batchState,
    logState,
    devTools,
    activeFont,
    activeSize,
}) {
    // --- Internal ActionSheet modal state (co-located with their modals) ---
    const [showLockTimeoutModal, setShowLockTimeoutModal] = useState(false);
    const [showVlogQualityModal, setShowVlogQualityModal] = useState(false);
    const [showCompressionModal, setShowCompressionModal] = useState(false);

    // --- AI Batch Processing via AI Queue -------------------------
    const handleBatchProcess = async () => {
        if (queueState.isProcessing) {
            await cancelBatch();
            return;
        }

        const selectedCategories = new Set<'journal' | 'circle' | 'checkin'>();
        if (batchState.batchJournals) selectedCategories.add('journal');
        if (batchState.batchCircles) selectedCategories.add('circle');
        if (batchState.batchCheckins) selectedCategories.add('checkin');

        if (selectedCategories.size === 0) {
            alert('Please select at least one category to process.');
            return;
        }

        const filter = selectedCategories.size === 3 ? undefined : selectedCategories;

        const count = await startBatch(batchState.forceBatchOverwrite, filter);
        if (count === 0) {
            alert('All entries in the selected categories are already fully processed!');
        }
    };

    /** Dynamically adjusted Vlog quality descriptions based on compression preset */
    const getQualityOptions = () => {
        let multiplier = 1;
        if (isCompressionAvailable()) {
            switch (preferences.compressionPreset) {
                case 'light': multiplier = 0.6; break;
                case 'balanced': multiplier = 0.4; break;
                case 'max': multiplier = 0.2; break;
                case 'off':
                default: multiplier = 1; break;
            }
        }

        return [
            { id: '720p', label: `Data Saver (720p) — ~${Math.round(18 * multiplier)} MB/min` },
            { id: '1080p', label: `Standard (1080p) — ~${Math.round(34 * multiplier)} MB/min` },
            { id: '2160p', label: `Cinematic (4K) — ~${Math.round(90 * multiplier)} MB/min` },
        ];
    };

    return (
        <>
            <SwipeableModal visible={visible} onClose={onClose} title="Settings" setHomeScrollEnabled={setHomeScrollEnabled}>
                <ScrollView
                    contentContainerStyle={{ paddingBottom: 150 }}
                    showsVerticalScrollIndicator={false}
                    style={preferences.debugLayout && { borderWidth: 1, borderColor: theme.colors.dangerBorderMedium }}
                >
                    {/* Appearance & Typography Card */}
                    <View style={{ backgroundColor: theme.colors.glassBackground, borderRadius: theme.borderRadius.md, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: theme.colors.glassBorder }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <MaterialCommunityIcons name="format-text" size={18} color={theme.colors.primaryAction} />
                            <Text style={[commonStyles.settingsLabel, { marginTop: 0, marginBottom: 0, color: theme.colors.textPrimary, fontSize: 16 }]}>Appearance</Text>
                        </View>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginBottom: 15 }}>Customize your reading and writing typography</Text>

                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 20 }}>
                            {CONFIG.FONTS.map((f, i) => {
                                const fontValue = f.value;
                                return (
                                    <AnimatedScaleButton
                                        key={i}
                                        style={[commonStyles.sortBtn, preferences.fontIndex === i && commonStyles.sortBtnActive]}
                                        onPress={() => preferences.savePreferences(i, preferences.sizeIndex)}
                                    >
                                        <Text style={[commonStyles.sortBtnText, { fontFamily: fontValue }, preferences.fontIndex === i && commonStyles.sortBtnTextActive]}>
                                            {f.label}
                                        </Text>
                                    </AnimatedScaleButton>
                                );
                            })}
                        </ScrollView>

                        <View style={{ height: 1, backgroundColor: theme.colors.glassBorder, marginVertical: 20 }} />

                        <Text style={{ color: theme.colors.textSecondary, fontSize: 13, fontWeight: '500', marginBottom: 12 }}>Reading Size</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.glassSurfaceLow, borderRadius: theme.borderRadius.md, padding: 4 }}>
                            {CONFIG.SIZES.map((s, i) => (
                                <Pressable
                                    key={i}
                                    style={{ flex: 1, paddingVertical: 14, alignItems: 'center', backgroundColor: preferences.sizeIndex === i ? theme.colors.primaryAction : 'transparent', borderRadius: theme.borderRadius.sm }}
                                    onPress={() => {
                                        preferences.savePreferences(preferences.fontIndex, i);
                                        vibrate(10);
                                    }}
                                >
                                    <Text style={{ color: preferences.sizeIndex === i ? theme.colors.primaryActionText : theme.colors.textSecondary, fontSize: 12 + (i * 4), fontWeight: preferences.sizeIndex === i ? 'bold' : '500' }}>
                                        A
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>

                    <Text style={[commonStyles.settingsLabel, { marginLeft: 5, color: theme.colors.textPrimary }]}>Live Preview</Text>
                    <View style={commonStyles.previewContainer}>
                        <Text style={[commonStyles.previewText, {
                            fontFamily: activeFont,
                            fontSize: activeSize
                        }]}>
                            The quick brown fox jumps over the lazy dog.
                        </Text>
                    </View>

                    {/* Security & Storage Card */}
                    <View style={{ backgroundColor: theme.colors.glassBackground, borderRadius: theme.borderRadius.md, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: theme.colors.glassBorder, marginTop: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <MaterialCommunityIcons name="shield-lock-outline" size={18} color={theme.colors.primaryAction} />
                            <Text style={[commonStyles.settingsLabel, { marginTop: 0, marginBottom: 0, color: theme.colors.textPrimary, fontSize: 16 }]}>Security & Storage</Text>
                        </View>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginBottom: 16, lineHeight: 20 }}>Notes and Circles are protected by biometric authentication (fingerprint / face).</Text>

                        {/* Force PIN Authentication Toggle */}
                        <AnimatedScaleButton
                            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.colors.glassSurfaceMinimal, borderRadius: theme.borderRadius.sm, padding: 14, marginBottom: 10 }}
                            onPress={() => {
                                preferences.updatePreferPinAuth(!preferences.preferPinAuth);
                                vibrate(10);
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                <MaterialCommunityIcons name="dialpad" size={20} color={theme.colors.textSecondary} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: theme.colors.textPrimary, fontSize: 14, fontWeight: '600' }}>Force PIN Auth</Text>
                                    <Text style={{ color: theme.colors.textMuted, fontSize: 11, marginTop: 2 }}>Always ask for PIN instead of Biometrics</Text>
                                </View>
                            </View>
                            <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: preferences.preferPinAuth ? theme.colors.primaryAction : theme.colors.border, justifyContent: 'center', padding: 2 }}>
                                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: theme.colors.textPrimary, alignSelf: preferences.preferPinAuth ? 'flex-end' : 'flex-start' }} />
                            </View>
                        </AnimatedScaleButton>

                        {/* Lock Timeout Selection */}
                        <AnimatedScaleButton
                            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.colors.glassSurfaceMinimal, borderRadius: theme.borderRadius.sm, padding: 14, marginBottom: 10 }}
                            onPress={() => setShowLockTimeoutModal(true)}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <MaterialCommunityIcons name="timer-lock-outline" size={20} color={theme.colors.textSecondary} />
                                <View>
                                    <Text style={{ color: theme.colors.textPrimary, fontSize: 14, fontWeight: '600' }}>Inactivity Lock</Text>
                                    <Text style={{ color: theme.colors.textMuted, fontSize: 11, marginTop: 2 }}>Time before face/fingerprint needed</Text>
                                </View>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Text style={{ color: theme.colors.primaryAction, fontSize: 13, fontWeight: '800' }}>
                                    {preferences.lockTimeoutMins === 0 ? 'Immediate' : `${preferences.lockTimeoutMins} Min${preferences.lockTimeoutMins !== 1 ? 's' : ''}`}
                                </Text>
                                <MaterialCommunityIcons name="chevron-down" size={16} color={theme.colors.primaryAction} />
                            </View>
                        </AnimatedScaleButton>

                        {/* Vlog Storage Usage Counter */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.colors.glassSurfaceMinimal, borderRadius: theme.borderRadius.sm, padding: 14, marginBottom: 10 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <MaterialCommunityIcons name="server-network" size={20} color={theme.colors.textSecondary} />
                                <Text style={{ color: theme.colors.textPrimary, fontSize: 14, fontWeight: '600' }}>Vlog Footprint</Text>
                            </View>
                            <Text style={{ color: theme.colors.primaryAction, fontSize: 14, fontWeight: '800' }}>
                                {(vlogs.totalVlogStorageBytes / (1024 * 1024)).toFixed(1)} MB
                            </Text>
                        </View>

                        {/* Vlog Video Quality */}
                        <AnimatedScaleButton
                            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.colors.glassSurfaceMinimal, borderRadius: theme.borderRadius.sm, padding: 14 }}
                            onPress={() => setShowVlogQualityModal(true)}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <MaterialCommunityIcons name="video-outline" size={20} color={theme.colors.textSecondary} />
                                <View>
                                    <Text style={{ color: theme.colors.textPrimary, fontSize: 14, fontWeight: '600' }}>Vlog Quality</Text>
                                    <Text style={{ color: theme.colors.textMuted, fontSize: 11, marginTop: 2 }}>Storage vs Resolution</Text>
                                </View>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Text style={{ color: theme.colors.primaryAction, fontSize: 13, fontWeight: '800' }}>
                                    {preferences.vlogQuality || '1080p'}
                                </Text>
                                <MaterialCommunityIcons name="chevron-down" size={16} color={theme.colors.primaryAction} />
                            </View>
                        </AnimatedScaleButton>

                        {/* Vlog Compression Preset */}
                        <AnimatedScaleButton
                            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.colors.glassSurfaceMinimal, borderRadius: theme.borderRadius.sm, padding: 14, marginTop: 10, opacity: isCompressionAvailable() ? 1 : 0.35 }}
                            onPress={() => isCompressionAvailable() && setShowCompressionModal(true)}
                            disabled={!isCompressionAvailable()}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
                                <MaterialCommunityIcons name="zip-box-outline" size={20} color={theme.colors.textSecondary} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: theme.colors.textPrimary, fontSize: 14, fontWeight: '600' }}>Compression</Text>
                                    <Text style={{ color: theme.colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                                        {isCompressionAvailable() ? 'Post-recording optimization' : 'Requires dev build'}
                                    </Text>
                                </View>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                <Text style={{ color: isCompressionAvailable() ? theme.colors.primaryAction : theme.colors.textMuted, fontSize: 13, fontWeight: '800' }}>
                                    {isCompressionAvailable()
                                        ? (CONFIG.VLOG_COMPRESSION_PRESETS.find(p => p.id === preferences.compressionPreset)?.label || 'Balanced')
                                        : 'Unavailable'}
                                </Text>
                                {isCompressionAvailable() && <MaterialCommunityIcons name="chevron-down" size={16} color={theme.colors.primaryAction} />}
                            </View>
                        </AnimatedScaleButton>
                    </View>

                    {/* Feed Settings */}
                    <View style={{ backgroundColor: theme.colors.glassBackground, borderRadius: theme.borderRadius.md, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: theme.colors.glassBorder, marginTop: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <MaterialCommunityIcons name="newspaper-variant-outline" size={18} color={theme.colors.primaryAction} />
                            <Text style={[commonStyles.settingsLabel, { marginTop: 0, marginBottom: 0, color: theme.colors.textPrimary, fontSize: 16 }]}>Feed & System</Text>
                        </View>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginBottom: 12 }}>System-wide configurations and behaviors</Text>

                        {/* Haptic Feedback toggle */}
                        <AnimatedScaleButton
                            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.colors.glassSurfaceMinimal, borderRadius: theme.borderRadius.sm, padding: 14, marginBottom: 10 }}
                            onPress={() => {
                                preferences.updateHapticsPref(!preferences.enableHaptics);
                                vibrate(10);
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                <MaterialCommunityIcons name="vibrate" size={20} color={theme.colors.textSecondary} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: theme.colors.textPrimary, fontSize: 14, fontWeight: '600' }}>Haptic Feedback</Text>
                                    <Text style={{ color: theme.colors.textMuted, fontSize: 11, marginTop: 2 }}>Subtle vibrations on interaction</Text>
                                </View>
                            </View>
                            <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: preferences.enableHaptics ? theme.colors.primaryAction : theme.colors.border, justifyContent: 'center', padding: 2 }}>
                                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: theme.colors.textPrimary, alignSelf: preferences.enableHaptics ? 'flex-end' : 'flex-start' }} />
                            </View>
                        </AnimatedScaleButton>

                        {/* Auto-play videos toggle */}
                        <AnimatedScaleButton
                            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.colors.glassSurfaceMinimal, borderRadius: theme.borderRadius.sm, padding: 14 }}
                            onPress={() => {
                                feedData.toggleAutoPlayFeedVideos(!feedData.autoPlayFeedVideos);
                                vibrate(10);
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                <MaterialCommunityIcons name="play-circle-outline" size={20} color={theme.colors.textSecondary} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: theme.colors.textPrimary, fontSize: 14, fontWeight: '600' }}>Auto-play Videos</Text>
                                    <Text style={{ color: theme.colors.textMuted, fontSize: 11, marginTop: 2 }}>Videos play muted while scrolling</Text>
                                </View>
                            </View>
                            <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: feedData.autoPlayFeedVideos ? theme.colors.primaryAction : theme.colors.border, justifyContent: 'center', padding: 2 }}>
                                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: theme.colors.textPrimary, alignSelf: feedData.autoPlayFeedVideos ? 'flex-end' : 'flex-start' }} />
                            </View>
                        </AnimatedScaleButton>
                    </View>

                    <AiSettingsPanel
                        notes={notes}
                        aiConfig={aiConfig}
                        queueState={queueState}
                        forceBatchOverwrite={batchState.forceBatchOverwrite}
                        setForceBatchOverwrite={batchState.setForceBatchOverwrite}
                        batchJournals={batchState.batchJournals}
                        setBatchJournals={batchState.setBatchJournals}
                        batchCircles={batchState.batchCircles}
                        setBatchCircles={batchState.setBatchCircles}
                        batchCheckins={batchState.batchCheckins}
                        setBatchCheckins={batchState.setBatchCheckins}
                        handleBatchProcess={handleBatchProcess}
                        setChoosingModelFor={batchState.setChoosingModelFor}
                    />

                    <DeveloperToolsPanel
                        notes={notes}
                        personsHook={personsHook}
                        streak={streak}
                        preferences={preferences}
                        aiConfig={aiConfig}
                        vlogs={vlogs}
                        storageActions={storageActions}
                        queueState={queueState}
                        devModeUnlocked={devTools.devModeUnlocked}
                        setNewStreakParam={devTools.setNewStreakParam}
                        setShowStreakPopup={devTools.setShowStreakPopup}
                        setShowSettings={devTools.setShowSettings}
                        setShowBenchmarkModal={devTools.setShowBenchmarkModal}
                        loadAiLog={devTools.loadAiLog}
                        showAiLog={logState.showAiLog}
                        setShowAiLog={logState.setShowAiLog}
                        aiLogEntries={logState.aiLogEntries}
                        setAiLogEntries={logState.setAiLogEntries}
                        clearAiLog={devTools.clearAiLog}
                    />
                </ScrollView>
            </SwipeableModal>

            {/* Select AI Model — unified ActionSheet */}
            <ActionSheet
                visible={!!batchState.choosingModelFor}
                title={`Select ${batchState.choosingModelFor === 'summary' ? 'Summary & Title' : 'Grammar'} Model`}
                options={AI_AVAILABLE_MODELS.map(m => ({ id: m, label: m }))}
                activeId={batchState.choosingModelFor === 'summary' ? aiConfig.aiModel : aiConfig.aiGrammarModel}
                onSelect={(id) => {
                    if (batchState.choosingModelFor === 'summary') aiConfig.saveAiModel(id);
                    else aiConfig.saveAiGrammarModel(id);
                    batchState.setChoosingModelFor(null);
                }}
                onClose={() => batchState.setChoosingModelFor(null)}
            />

            {/* Lock Timeout Options */}
            <ActionSheet
                visible={showLockTimeoutModal}
                title="Inactivity Lock Timeout"
                options={[
                    { id: '0', label: 'Immediately' },
                    { id: '1', label: '1 Minute' },
                    { id: '3', label: '3 Minutes' },
                    { id: '5', label: '5 Minutes' },
                    { id: '15', label: '15 Minutes' },
                ]}
                activeId={preferences.lockTimeoutMins.toString()}
                onSelect={(id) => {
                    preferences.updateLockTimeout(parseInt(id, 10));
                    setShowLockTimeoutModal(false);
                }}
                onClose={() => setShowLockTimeoutModal(false)}
            />

            {/* Vlog Quality Options */}
            <ActionSheet
                visible={showVlogQualityModal}
                title="Vlog Recording Quality"
                options={getQualityOptions()}
                activeId={preferences.vlogQuality || '1080p'}
                onSelect={(id) => {
                    preferences.updateVlogQuality(id);
                    setShowVlogQualityModal(false);
                }}
                onClose={() => setShowVlogQualityModal(false)}
            />

            {/* Compression Preset Options */}
            <ActionSheet
                visible={showCompressionModal}
                title="Compression Preset"
                options={[
                    { id: 'off',      label: 'Off (Raw Quality)' },
                    { id: 'light',    label: 'Light — ~40% smaller' },
                    { id: 'balanced', label: 'Balanced — ~60% smaller ✦' },
                    { id: 'max',      label: 'Max Savings — ~80% smaller' },
                ]}
                activeId={preferences.compressionPreset || 'balanced'}
                onSelect={(id) => {
                    preferences.updateCompressionPreset(id);
                    setShowCompressionModal(false);
                }}
                onClose={() => setShowCompressionModal(false)}
            />
        </>
    );
});

