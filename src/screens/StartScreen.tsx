import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    View,
    Text,
    StatusBar,
    TextInput,
    ScrollView,
    Platform,
    Modal,
    KeyboardAvoidingView,
    ImageBackground,
    Dimensions,
    Vibration,
    StyleSheet,
    DeviceEventEmitter,
    Pressable,
} from 'react-native';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import Animated, { FadeInUp, FadeOutUp, FadeIn } from 'react-native-reanimated';
import { LiquidMorphIcon } from '@/components/ui/LiquidMorphIcon';
import { clearAiLog, getAiLog } from '@/lib/aiLogger';
import { useAiQueueContext } from '@/lib/hooks/useAiQueueProvider';
import { pingServer } from '@/lib/aiService';
import { theme } from '@/styles/theme';
import * as LocalAuthentication from 'expo-local-authentication';
import { Person } from '@/types';
import { useSecurity } from '@/lib/hooks/useSecurity';
import { useNotes, usePersons, useStreak, usePreferences, useAiConfig, useFeedData, useVlogs, useStorageActions } from '@/lib/hooks/useStorage';
import { TickDial } from '@/components/ui/TickDial';
import { StreakPopup } from '@/components/features/writing/StreakPopup';
import { CalendarView } from '@/components/features/library/CalendarView';
import { SwipeableModal } from '@/components/ui/SwipeableModal';
import { ActionSheet } from '@/components/ui/ActionSheet';
import { CustomSlider } from '@/components/features/alignment/CustomSlider';
import { CarouselSelector } from '@/components/ui/CarouselSelector';
import { APP_VERSION, CONFIG, VERSION_HISTORY } from '@/config';
import { DEFAULT_AI_PROMPTS, AI_AVAILABLE_MODELS } from '@/config/ai';
import { commonStyles } from '@/styles/commonStyles';
import { isCompressionAvailable } from '@/lib/videoCompressor';
import { RootStackParamList } from '@/types/navigation.types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Route } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { BenchmarkModal } from '@/components/features/dev/BenchmarkModal';
import { AiSettingsPanel } from '@/components/features/settings/AiSettingsPanel';
import { DeveloperToolsPanel } from '@/components/features/settings/DeveloperToolsPanel';
import { CirclePickerSheet } from '@/components/features/circles/CirclePickerSheet';
import type { AiLogEntry } from '@/types';
import { Easing } from 'react-native-reanimated';

type StartScreenParams = undefined | { streakIncreased?: boolean; newStreak?: number };

type Props = {
    navigation: NativeStackNavigationProp<RootStackParamList>;
    route: Route<string, StartScreenParams>;
    onGoToLibrary: () => void;
    setHomeScrollEnabled?: (enabled: boolean) => void;
    /** Shared session mode from HomeScreen (drives LiquidGlassNav) */
    sessionMode: 'journal' | 'circles' | 'checkin' | 'vlog';
    /** Update shared session mode */
    setSessionMode: (mode: 'journal' | 'circles' | 'checkin' | 'vlog') => void;
};

const StartScreenInner: React.FC<Props> = ({ navigation, route, onGoToLibrary, setHomeScrollEnabled, sessionMode, setSessionMode }) => {
    const [timeIndex, setTimeIndex] = useState(1);
    const [diffIndex, setDiffIndex] = useState(1);

    const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
    const [score, setScore] = useState(5);

    const [showSettings, setShowSettings] = useState(false);
    const [showCalendar, setShowCalendar] = useState(false);
    const [showVersionHistory, setShowVersionHistory] = useState(false);
    const [showPersonSelect, setShowPersonSelect] = useState(false);
    const [showStreakPopup, setShowStreakPopup] = useState(false);
    const [showBenchmarkModal, setShowBenchmarkModal] = useState(false);
    const [showLockTimeoutModal, setShowLockTimeoutModal] = useState(false);
    const [showVlogQualityModal, setShowVlogQualityModal] = useState(false);
    const [showCompressionModal, setShowCompressionModal] = useState(false);
    const [newStreakParam, setNewStreakParam] = useState(0);
    const [devModeUnlocked, setDevModeUnlocked] = useState(false);
    /** Toast message for dev mode unlock feedback */
    const [devToast, setDevToast] = useState<string | null>(null);

    /** Ref for the 5-second long-press timer on the settings button */
    const settingsLongPressTimer = useRef<NodeJS.Timeout | null>(null);

    // AI Batch UI State (processing is handled by the queue)
    const [forceBatchOverwrite, setForceBatchOverwrite] = useState(false);
    const [choosingModelFor, setChoosingModelFor] = useState<'summary' | 'grammar' | null>(null);
    /** AI log entries for the Dev Tools panel */
    const [aiLogEntries, setAiLogEntries] = useState<AiLogEntry[]>([]);
    const [showAiLog, setShowAiLog] = useState(false);

    const notes = useNotes();
    const personsHook = usePersons();
    const streak = useStreak();
    const preferences = usePreferences();
    const aiConfig = useAiConfig();
    const feedData = useFeedData();
    const vlogs = useVlogs();
    const storageActions = useStorageActions();

    const security = useSecurity(preferences.lockTimeoutMins);

    /** Central AI Queue — single instance via AiQueueProvider */
    const { queueState, startBatch, cancelBatch } = useAiQueueContext();

    const isModalOpen = showSettings || showCalendar || showVersionHistory || showPersonSelect || showStreakPopup;
    const isModalOpenRef = useRef(isModalOpen);
    isModalOpenRef.current = isModalOpen;

    useEffect(() => {
        if (route.params?.streakIncreased) {
            setNewStreakParam(route.params.newStreak || streak.currentStreak + 1);
            setShowStreakPopup(true);
            navigation.setParams({ streakIncreased: undefined, newStreak: undefined });
        }
    }, [route.params?.streakIncreased]);

    const handleStart = () => {
        if (sessionMode === 'vlog') {
            navigation.navigate('VlogRecording', {
                timeIndex: timeIndex,
            });
            return;
        }

        if (sessionMode === 'checkin') {
            navigation.navigate('AlignmentWriting', {
                alignmentScore: score,
                timeIndex: timeIndex
            });
            return;
        }

        navigation.navigate('Writing', {
            timeIndex,
            diffIndex,
            mode: sessionMode,
            personId: selectedPersonId
        });
    };

    const getScoreDetails = (s: number) => {
        if (s <= 2) return { icon: 'emoticon-dead-outline' as const, text: 'struggling', color: '#ff4d4d', glow: 'rgba(255, 77, 77, 0.3)' };
        if (s <= 4) return { icon: 'emoticon-confused-outline' as const, text: 'drifting', color: '#ff9933', glow: 'rgba(255, 153, 51, 0.3)' };
        if (s === 5) return { icon: 'emoticon-neutral-outline' as const, text: 'okay', color: '#ffcc00', glow: 'rgba(255, 204, 0, 0.3)' };
        if (s <= 7) return { icon: 'emoticon-happy-outline' as const, text: 'good', color: '#a2ff66', glow: 'rgba(162, 255, 102, 0.3)' };
        if (s <= 9) return { icon: 'emoticon-excited-outline' as const, text: 'great', color: '#66ffcc', glow: 'rgba(102, 255, 204, 0.3)' };
        return { icon: 'emoticon-cool-outline' as const, text: 'perfectly aligned', color: '#00ccff', glow: 'rgba(0, 204, 255, 0.3)' };
    };
    
    const details = getScoreDetails(score);

    const activeFont = CONFIG.FONTS[preferences.fontIndex]?.value || (Platform.OS === 'ios' ? 'System' : 'sans-serif');
    const activeSize = CONFIG.SIZES[preferences.sizeIndex]?.value || 18;

    // --- LOGIC: Handle Batch Processing via AI Queue -------------------------
    const handleBatchProcess = async () => {
        if (queueState.isProcessing) {
            await cancelBatch();
            return;
        }

        const count = await startBatch(forceBatchOverwrite);
        if (count === 0) {
            alert('All entries are already fully processed by AI!');
        }
    };

    /** Load AI log entries for the Dev Tools panel */
    const loadAiLog = async () => {
        const entries = await getAiLog();
        setAiLogEntries(entries.slice(-50).reverse()); // Show last 50, newest first
    };

    /** Get dynamically adjusted Vlog quality descriptions based on compression preset */
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
        <View style={commonStyles.startContainer}>
            <StatusBar barStyle="light-content" backgroundColor="#000000" />

            {/* Dev Mode Toast Notification */}
            {devToast && (
                <View style={{
                    position: 'absolute', top: 50, alignSelf: 'center', zIndex: 9999,
                    backgroundColor: theme.colors.surfaceRaised, paddingHorizontal: 20, paddingVertical: 12,
                    borderRadius: 25, borderWidth: 1, borderColor: theme.colors.dangerBorderStrong,
                }}>
                    <Text style={{ color: theme.colors.gold, fontSize: 14, fontWeight: '600' }}>{devToast}</Text>
                </View>
            )}

            {/* Premium Header */}
            <View style={[commonStyles.topBar, preferences.debugLayout && { borderWidth: 1, borderColor: 'rgba(255,0,0,0.5)' }]}>
                <AnimatedScaleButton onPress={() => setShowCalendar(true)} style={commonStyles.iconButton}>
                    <Text style={{ color: theme.colors.danger, fontSize: 16 }}>🔥</Text>
                    <Text style={commonStyles.streakText}>{streak.currentStreak}</Text>
                </AnimatedScaleButton>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    {/* Vision Board button — moved here from footer */}
                    <AnimatedScaleButton 
                        style={commonStyles.iconButton}
                        onPress={() => {
                            if (security.isNotesUnlocked) {
                                navigation.navigate('VisionBoard');
                            } else {
                                Vibration.vibrate([0, 50, 100, 50]);
                            }
                        }}
                        onLongPress={async () => {
                            if (security.isNotesUnlocked) {
                                security.lockAll();
                                Vibration.vibrate(50);
                            } else {
                                const success = await security.unlockNotes();
                                if (success) Vibration.vibrate(50);
                            }
                        }}
                    >
                        <MaterialCommunityIcons name={!security.isNotesUnlocked ? "star-off-outline" : "star-four-points"} size={16} color={!security.isNotesUnlocked ? "rgba(255,100,100,0.8)" : theme.colors.textPrimary} style={{ marginRight: 4 }} />
                        <Text style={[commonStyles.iconButtonText, !security.isNotesUnlocked && { color: 'rgba(255,100,100,0.8)' }]}>{!security.isNotesUnlocked ? '🔒' : 'Vision'}</Text>
                    </AnimatedScaleButton>
                    <View style={{ position: 'relative' }}>
                        <AnimatedScaleButton
                            onPress={() => setShowSettings(true)}
                            onPressIn={() => {
                                // Start 5s timer to unlock dev tools
                                settingsLongPressTimer.current = setTimeout(() => {
                                    const newState = !devModeUnlocked;
                                    setDevModeUnlocked(newState);
                                    if (newState) {
                                        Vibration.vibrate([0, 50, 100, 50, 100, 150]);
                                    } else {
                                        Vibration.vibrate([0, 150, 100, 150]);
                                    }
                                    setDevToast(newState ? '🛠 Developer Mode Unlocked' : '🔒 Developer Mode Locked');
                                    setTimeout(() => setDevToast(null), 2000);
                                }, 5000);
                            }}
                            onPressOut={() => {
                                if (settingsLongPressTimer.current) {
                                    clearTimeout(settingsLongPressTimer.current);
                                    settingsLongPressTimer.current = null;
                                }
                            }}
                            style={commonStyles.iconButton}
                        >
                            <Text style={commonStyles.iconButtonText}>⚙️</Text>
                        </AnimatedScaleButton>
                        
                        <View style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: queueState.serverOnline === null ? '#888' : queueState.serverOnline ? theme.colors.green : theme.colors.danger,
                            borderWidth: 1,
                            borderColor: theme.colors.background,
                        }} />
                    </View>

                </View>
            </View>

            {/* Main Center Content */}
            <View style={{ flex: 1, paddingVertical: 10 }}>
                {/* Dynamic Hero Area */}
                <View style={styles.heroWidgetContainer}>
                    {/* The Morphing Vector Icon - Always Mounted */}
                    <View style={{ position: 'relative', marginBottom: 12, marginTop: 0, width: 80, height: 80, justifyContent: 'center', alignItems: 'center' }}>
                        {/* Glow ring - behind the icon, only visible on checkin */}
                        {sessionMode === 'checkin' && (
                            <View style={[styles.glowRing, { position: 'absolute', backgroundColor: details.glow, shadowColor: details.color, width: 80, height: 80, borderRadius: 40 }]} />
                        )}
                        {/* Inner Circle - behind the icon, only visible on checkin */}
                        {sessionMode === 'checkin' && (
                            <View style={[styles.iconCircle, { position: 'absolute', width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: theme.colors.background }]} />
                        )}
                        
                    {/* The Icon itself - permanently mounted so it can morph */}
                        <LiquidMorphIcon 
                            mode={sessionMode} 
                            size={sessionMode === 'checkin' ? 40 : 42} 
                            color={sessionMode === 'checkin' ? details.color : theme.colors.primaryAction} 
                        />
                    </View>

                    {/* Mode Content Container - absolute position elements so they fade smoothly without stacking */}
                    <View style={{ width: '100%', height: 80, alignItems: 'center' }}>
                        {sessionMode === 'journal' && (
                            <Animated.View entering={FadeInUp.springify().damping(14).mass(1).stiffness(120)} exiting={FadeOutUp.duration(200)} style={{ position: 'absolute', alignItems: 'center', width: '100%' }}>
                                <Text style={styles.heroTitle}>Free Writing</Text>
                                <Text style={styles.heroSubtitle}>Write continuously, or all is lost.</Text>
                            </Animated.View>
                        )}
                        {sessionMode === 'circles' && (
                            <Animated.View entering={FadeInUp.springify().damping(14).mass(1).stiffness(120)} exiting={FadeOutUp.duration(200)} style={{ position: 'absolute', alignItems: 'center', width: '100%' }}>
                                <Text style={styles.heroTitle}>Relationship Journal</Text>
                                <AnimatedScaleButton style={styles.personSmallSelectBtn} onPress={() => {
                                    setShowPersonSelect(true);
                                }}>
                                    <Text style={styles.personSmallSelectText}>
                                        {selectedPersonId ? personsHook.persons.find(p => p.id === selectedPersonId)?.name : 'Select target person...'}
                                        <Text style={{ opacity: 0.5 }}> ▼</Text>
                                    </Text>
                                </AnimatedScaleButton>
                                {selectedPersonId && (
                                    <AnimatedScaleButton style={styles.quickNoteBtn} onPress={() => { Vibration.vibrate(30); navigation.navigate('Writing', { timeIndex: 0, diffIndex, mode: 'circles', personId: selectedPersonId, isQuickNote: true }); }}>
                                        <MaterialCommunityIcons name="lightning-bolt" size={16} color={theme.colors.background} />
                                        <Text style={styles.quickNoteText}>Quick Note</Text>
                                    </AnimatedScaleButton>
                                )}
                            </Animated.View>
                        )}
                        {sessionMode === 'checkin' && (
                            <Animated.View entering={FadeIn.duration(400)} exiting={FadeOutUp.duration(200)} style={{ position: 'absolute', alignItems: 'center', width: '100%' }}>
                                <Text style={[styles.scoreText, { color: details.color, fontSize: 14, marginTop: 8, marginBottom: -6 }]}>{details.text.toUpperCase()}</Text>
                                <View style={{ transform: [{ scale: 0.9 }], marginTop: -14, marginBottom: -40, width: '100%' }}>
                                    <CustomSlider value={score} onValueChange={setScore} />
                                </View>
                            </Animated.View>
                        )}
                        {sessionMode === 'vlog' && (
                            <Animated.View entering={FadeInUp.springify().damping(14).mass(1).stiffness(120)} exiting={FadeOutUp.duration(200)} style={{ position: 'absolute', alignItems: 'center', width: '100%' }}>
                                <Text style={styles.heroTitle}>Video Journal</Text>
                                <Text style={styles.heroSubtitle}>Record your thoughts on camera.</Text>
                            </Animated.View>
                        )}
                    </View>
                </View>

                <View style={{ flex: 1, justifyContent: 'center' }}>
                    <TickDial
                        data={sessionMode === 'vlog' ? CONFIG.VLOG_SESSION_OPTIONS_MINS : CONFIG.SESSION_OPTIONS_MINS}
                        selectedIndex={timeIndex}
                        onSelect={setTimeIndex}
                        unit="min"
                        setHomeScrollEnabled={setHomeScrollEnabled}
                    />

                    {/* Difficulty Pill Selector Inline (Invisible for Checkin/Vlog to preserve layout alignment) */}
                    <View style={[styles.diffSelectorContainer, (sessionMode === 'checkin' || sessionMode === 'vlog') && { opacity: 0 }]} pointerEvents={(sessionMode === 'checkin' || sessionMode === 'vlog') ? 'none' : 'auto'}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.diffScroll}>
                            {CONFIG.DIFFICULTIES.map((diff, i) => (
                                <AnimatedScaleButton key={i} style={[styles.diffPill, diffIndex === i && styles.diffPillActive]} onPress={() => setDiffIndex(i)}>
                                    <Text style={[styles.diffPillText, diffIndex === i && styles.diffPillTextActive]}>{diff.label}</Text>
                                </AnimatedScaleButton>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </View>

            {/* Start Writing Button — now standalone pill above the nav area */}
            <View style={styles.startBtnContainer}>
                <AnimatedScaleButton style={styles.massiveStartBtn} onPress={handleStart}>
                    <Text style={styles.massiveStartBtnText}>
                        {sessionMode === 'vlog' ? 'Start Recording' : 'Start Writing'}
                    </Text>
                </AnimatedScaleButton>
                <AnimatedScaleButton style={{ marginTop: 8 }} onPress={() => setShowVersionHistory(true)}>
                    <Text style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, fontWeight: 'bold' }}>v{APP_VERSION}</Text>
                </AnimatedScaleButton>
            </View>

            {/* Bottom spacer for the floating LiquidGlassNav pill */}
            <View style={{ height: 90 }} />

            {/* Modals */}
            <SwipeableModal visible={showCalendar} onClose={() => setShowCalendar(false)} setHomeScrollEnabled={setHomeScrollEnabled}>
                <CalendarView currentStreak={streak.currentStreak} streakHistory={streak.streakHistory} />
            </SwipeableModal>

            <SwipeableModal visible={showVersionHistory} onClose={() => setShowVersionHistory(false)} title="Version History" setHomeScrollEnabled={setHomeScrollEnabled}>
                <View style={{ height: 400, width: '100%' }}>
                    <FlashList
                        data={VERSION_HISTORY}
                        keyExtractor={(v) => v.version}
                        renderItem={({ item: v }) => (
                            <View style={[commonStyles.cardsRow, { marginTop: 20 }, preferences.debugLayout && { borderWidth: 1, borderColor: 'rgba(255,0,0,0.5)' }]}>
                                <Text style={commonStyles.versionHistoryHeader}>{v.version}</Text>
                                {v.changes.map((c, j) => <Text key={j} style={commonStyles.versionHistoryItem}>• {c}</Text>)}
                            </View>
                        )}
                    />
                </View>
            </SwipeableModal>

            <SwipeableModal visible={showSettings} onClose={() => setShowSettings(false)} title="Settings" setHomeScrollEnabled={setHomeScrollEnabled}>
                <ScrollView 
                    contentContainerStyle={{ paddingBottom: 150 }} 
                    showsVerticalScrollIndicator={false}
                    style={preferences.debugLayout && { borderWidth: 1, borderColor: 'rgba(255,0,0,0.5)' }}
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
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: theme.borderRadius.md, padding: 4 }}>
                            {CONFIG.SIZES.map((s, i) => (
                                <Pressable
                                    key={i}
                                    style={{ flex: 1, paddingVertical: 14, alignItems: 'center', backgroundColor: preferences.sizeIndex === i ? theme.colors.primaryAction : 'transparent', borderRadius: theme.borderRadius.sm }}
                                    onPress={() => {
                                        preferences.savePreferences(preferences.fontIndex, i);
                                        Vibration.vibrate(10);
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

                        {/* Lock Timeout Selection */}
                        <AnimatedScaleButton
                            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: theme.borderRadius.sm, padding: 14, marginBottom: 10 }}
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
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: theme.borderRadius.sm, padding: 14, marginBottom: 10 }}>
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
                            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: theme.borderRadius.sm, padding: 14 }}
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
                            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: theme.borderRadius.sm, padding: 14, marginTop: 10, opacity: isCompressionAvailable() ? 1 : 0.35 }}
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
                            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: theme.borderRadius.sm, padding: 14, marginBottom: 10 }}
                            onPress={() => {
                                preferences.updateHapticsPref(!preferences.enableHaptics);
                                Vibration.vibrate(10);
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                <MaterialCommunityIcons name="vibrate" size={20} color={theme.colors.textSecondary} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: theme.colors.textPrimary, fontSize: 14, fontWeight: '600' }}>Haptic Feedback</Text>
                                    <Text style={{ color: theme.colors.textMuted, fontSize: 11, marginTop: 2 }}>Subtle vibrations on interaction</Text>
                                </View>
                            </View>
                            <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: preferences.enableHaptics ? theme.colors.primaryAction : 'rgba(255,255,255,0.1)', justifyContent: 'center', padding: 2 }}>
                                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFF', alignSelf: preferences.enableHaptics ? 'flex-end' : 'flex-start' }} />
                            </View>
                        </AnimatedScaleButton>

                        {/* Auto-play videos toggle */}
                        <AnimatedScaleButton
                            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: theme.borderRadius.sm, padding: 14 }}
                            onPress={() => {
                                feedData.toggleAutoPlayFeedVideos(!feedData.autoPlayFeedVideos);
                                Vibration.vibrate(10);
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                <MaterialCommunityIcons name="play-circle-outline" size={20} color={theme.colors.textSecondary} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: theme.colors.textPrimary, fontSize: 14, fontWeight: '600' }}>Auto-play Videos</Text>
                                    <Text style={{ color: theme.colors.textMuted, fontSize: 11, marginTop: 2 }}>Videos play muted while scrolling</Text>
                                </View>
                            </View>
                            <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: feedData.autoPlayFeedVideos ? theme.colors.primaryAction : 'rgba(255,255,255,0.1)', justifyContent: 'center', padding: 2 }}>
                                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFF', alignSelf: feedData.autoPlayFeedVideos ? 'flex-end' : 'flex-start' }} />
                            </View>
                        </AnimatedScaleButton>
                    </View>

                    <AiSettingsPanel
                        notes={notes}
                        aiConfig={aiConfig}
                        queueState={queueState}
                        forceBatchOverwrite={forceBatchOverwrite}
                        setForceBatchOverwrite={setForceBatchOverwrite}
                        handleBatchProcess={handleBatchProcess}
                        setChoosingModelFor={setChoosingModelFor}
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
                        devModeUnlocked={devModeUnlocked}
                        setNewStreakParam={setNewStreakParam}
                        setShowStreakPopup={setShowStreakPopup}
                        setShowSettings={setShowSettings}
                        setShowBenchmarkModal={setShowBenchmarkModal}
                        loadAiLog={loadAiLog}
                        showAiLog={showAiLog}
                        setShowAiLog={setShowAiLog}
                        aiLogEntries={aiLogEntries}
                        setAiLogEntries={setAiLogEntries}
                        clearAiLog={clearAiLog}
                    />
                </ScrollView>
            </SwipeableModal>

            {/* Select Circle — Extracted into CirclePickerSheet component */}
            <CirclePickerSheet
                visible={showPersonSelect}
                onClose={() => setShowPersonSelect(false)}
                selectedPersonId={selectedPersonId}
                onSelectPerson={setSelectedPersonId}
                persons={personsHook.persons}
                addPerson={personsHook.addPerson}
                isCirclesUnlocked={security.isCirclesUnlocked}
                isNotesUnlocked={security.isNotesUnlocked}
                unlockCircles={security.unlockCircles}
                setHomeScrollEnabled={setHomeScrollEnabled}
            />

            {/* Streak Popup Overlay */}
            <StreakPopup
                visible={showStreakPopup}
                streak={newStreakParam}
                streakHistory={streak.streakHistory}
                onClose={() => setShowStreakPopup(false)}
            />
            
            <BenchmarkModal
                visible={showBenchmarkModal}
                onClose={() => setShowBenchmarkModal(false)}
            />

            {/* Select AI Model — unified ActionSheet */}
            <ActionSheet
                visible={!!choosingModelFor}
                title={`Select ${choosingModelFor === 'summary' ? 'Summary & Title' : 'Grammar'} Model`}
                options={AI_AVAILABLE_MODELS.map(m => ({ id: m, label: m }))}
                activeId={choosingModelFor === 'summary' ? aiConfig.aiModel : aiConfig.aiGrammarModel}
                onSelect={(id) => {
                    if (choosingModelFor === 'summary') aiConfig.saveAiModel(id);
                    else aiConfig.saveAiGrammarModel(id);
                    setChoosingModelFor(null);
                }}
                onClose={() => setChoosingModelFor(null)}
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

        </View>
    );
};

const styles = StyleSheet.create({
    heroWidgetContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        height: 200, // Exact height prevents jumps
        marginTop: 5
    },
    heroTitle: {
        fontSize: 28,
        fontWeight: '900',
        color: theme.colors.textPrimary,
        fontFamily: theme.typography.fontFamily,
        letterSpacing: -0.5,
        marginBottom: 6
    },
    heroSubtitle: {
        fontSize: 16,
        color: theme.colors.textSecondary,
        fontFamily: theme.typography.fontFamily
    },
    personSmallSelectBtn: {
        backgroundColor: theme.colors.glassBorder,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginTop: 5
    },
    personSmallSelectText: {
        color: theme.colors.textPrimary,
        fontSize: 14,
        fontWeight: '600'
    },
    quickNoteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.primaryAction,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginTop: 15,
        gap: 6
    },
    quickNoteText: {
        color: theme.colors.background,
        fontWeight: 'bold',
        fontSize: 13
    },
    diffSelectorContainer: {
        width: '100%',
        alignItems: 'center',
        marginTop: 10,
        marginBottom: 35
    },
    diffScroll: {
        gap: 8,
        paddingHorizontal: 20
    },
    diffPill: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)'
    },
    diffPillActive: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderColor: 'rgba(255,255,255,0.4)'
    },
    diffPillText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 13,
        fontWeight: '600'
    },
    diffPillTextActive: {
        color: '#FFF'
    },
    /** Container for the standalone Start Writing button */
    startBtnContainer: {
        alignItems: 'center',
        marginBottom: 10,
    },
    massiveStartBtn: {
        backgroundColor: '#FFF',
        paddingHorizontal: 40,
        paddingVertical: 18,
        borderRadius: 30,
        shadowColor: '#FFF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 15,
        elevation: 10
    },
    massiveStartBtnText: {
        color: '#000',
        fontSize: 18,
        fontWeight: '900',
        letterSpacing: 1
    },
    // Inline Checkin specific styles
    glowRing: { width: 110, height: 110, borderRadius: 55, justifyContent: 'center', alignItems: 'center', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 30, elevation: 15 },
    iconCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)' },
    scoreText: { fontSize: 16, fontWeight: '900', marginTop: 15, letterSpacing: 2, fontFamily: theme.typography.fontFamily },

    // Premium UI Overrides for Select Person
    premiumPersonModal: { paddingTop: Platform.OS === 'ios' ? 20 : 0 },
    premiumPersonHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 25, paddingTop: 20, paddingBottom: 25 },
    premiumPersonTitle: { color: '#FFF', fontSize: 24, fontWeight: '900', letterSpacing: 0.5 },
    premiumPersonCloseBtn: { backgroundColor: 'rgba(255,255,255,0.1)', padding: 8, borderRadius: 20 },
    premiumSearchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.glassSurface, borderRadius: 16, paddingHorizontal: 15, height: 55, borderWidth: 1, borderColor: theme.colors.glassBorder },
    premiumSearchInput: { flex: 1, color: '#FFF', fontSize: 16, paddingVertical: 0 },
    premiumPersonItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    premiumPersonAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255, 255, 255, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    premiumPersonAvatarText: { color: theme.colors.primaryAction, fontSize: 18, fontWeight: '800' },
    premiumPersonName: { color: '#FFF', fontSize: 17, fontWeight: '600' },
    premiumCreateBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.primaryAction, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 30 },
    premiumCreateBtnText: { color: '#000', fontSize: 16, fontWeight: 'bold', marginLeft: 6 },
    premiumFloatCreateBtn: { position: 'absolute', bottom: Platform.OS === 'ios' ? 40 : 20, right: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.primaryAction, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 30, shadowColor: '#FFF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 8 },
    premiumFloatCreateBtnText: { color: '#000', fontSize: 15, fontWeight: 'bold', marginLeft: 6 }
});

/**
 * Memoized export — prevents re-renders from HomeScreen scroll events
 * and useTransition-deferred updates from causing layout thrashing.
 */
export const StartScreen = React.memo(StartScreenInner);
