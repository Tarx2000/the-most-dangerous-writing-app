import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Platform, StyleSheet, DeviceEventEmitter } from 'react-native';
import { vibrate } from '@/lib/haptics';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import Animated, { FadeInUp, FadeOutUp, FadeIn, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { LiquidMorphIcon } from '@/components/ui/LiquidMorphIcon';
import { AnimatedSymmetricalRing } from '@/components/ui/AnimatedSymmetricalRing';
import { VisionLockButton } from '@/components/ui/VisionLockButton';
import { useAiQueueContext } from '@/lib/hooks/useAiQueueProvider';
import { useCompressionQueueContext } from '@/lib/hooks/useCompressionQueueProvider';
import { clearAiLog, getAiLog } from '@/lib/aiLogger';
import { theme } from '@/styles/theme';
import { useSecurity } from '@/lib/hooks/useSecurity';
import { usePersons, useStreak, usePreferences } from '@/lib/hooks/useStorage';
import { TickDial } from '@/components/ui/TickDial';
import { StreakPopup } from '@/components/features/writing/StreakPopup';
import { CalendarView } from '@/components/features/library/CalendarView';
import { BaseModal } from '@/components/ui/BaseModal';
import { CustomSlider } from '@/components/features/alignment/CustomSlider';
import { CONFIG } from '@/config';
import { getFeatureFlags } from '@/lib/featureFlags';
import { commonStyles } from '@/styles/commonStyles';
import { RootStackParamList } from '@/types/navigation.types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Route } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BenchmarkModal } from '@/components/features/dev/BenchmarkModal';
import { SettingsModal } from '@/components/features/settings/SettingsModal';
import { CirclePickerSheet } from '@/components/features/circles/CirclePickerSheet';
import { getAlignmentScoreDetails } from '@/lib/alignmentScores';
import type { AiLogEntry } from '@/types';

/* -- LAYOUT CONFIGURATION -------------------------------------------------- */
/** Spacer height to keep the start button and other content from being hidden behind the floating LiquidGlassNav */
const BOTTOM_SPACER_HEIGHT = Platform.OS === 'ios' ? 115 : 100;
/** Bottom margin for the start writing button container to separate it from the spacer */
const START_BUTTON_MARGIN_BOTTOM = 15;
/** Bottom margin for the difficulty selector to balance space above the start button */
const DIFFICULTY_SELECTOR_MARGIN_BOTTOM = 25;

type StartScreenParams = undefined | { streakIncreased?: boolean; newStreak?: number };

type Props = {
    navigation: NativeStackNavigationProp<RootStackParamList>;
    route: Route<string, StartScreenParams>;
    _onGoToLibrary: () => void;
    setHomeScrollEnabled?: (enabled: boolean) => void;
    /** Shared session mode from HomeScreen (drives LiquidGlassNav) */
    sessionMode: 'journal' | 'circles' | 'checkin' | 'vlog';
    /** Update shared session mode */
    _setSessionMode: (mode: 'journal' | 'circles' | 'checkin' | 'vlog') => void;
    /** Whether this screen is currently active/visible in horizontal pagination */
    isActive?: boolean;
};

const StartScreenInner: React.FC<Props> = ({ navigation, setHomeScrollEnabled, sessionMode, isActive = true }) => {
    // ── Button Morph Measurement Refs ──
    const containerRef = useRef<View>(null); // Ref on root container to serve as coordinate frame
    const buttonRef = useRef<View>(null); // Ref on button container to measure layout bounds

    const [timeIndex, setTimeIndex] = useState(1);
    const [diffIndex, setDiffIndex] = useState(1);

    const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
    const [score, setScore] = useState(5);

    const [showSettings, setShowSettings] = useState(false);
    const [showCalendar, setShowCalendar] = useState(false);
    const [showPersonSelect, setShowPersonSelect] = useState(false);
    const [showStreakPopup, setShowStreakPopup] = useState(false);
    const [showBenchmarkModal, setShowBenchmarkModal] = useState(false);
    const [newStreakParam, setNewStreakParam] = useState(0);
    const [devModeUnlocked, setDevModeUnlocked] = useState(false);
    /** Toast message for dev mode unlock feedback */
    const [devToast, setDevToast] = useState<string | null>(null);

    /** Ref for the 4-second long-press timer on the settings button */
    const settingsLongPressTimer = useRef<NodeJS.Timeout | null>(null);

    // AI Batch UI State (processing is handled by the queue)
    const [forceBatchOverwrite, setForceBatchOverwrite] = useState(false);
    /** Category filters for batch processing — which entry types to include */
    const [batchJournals, setBatchJournals] = useState(true);
    const [batchCircles, setBatchCircles] = useState(true);
    const [batchCheckins, setBatchCheckins] = useState(true);
    const [choosingModelFor, setChoosingModelFor] = useState<'summary' | 'grammar' | null>(null);
    /** AI log entries for the Dev Tools panel */
    const [aiLogEntries, setAiLogEntries] = useState<AiLogEntry[]>([]);
    const [showAiLog, setShowAiLog] = useState(false);

    const personsHook = usePersons();
    const streak = useStreak();
    const preferences = usePreferences();

    const security = useSecurity();

    /** Central AI Queue — single instance via AiQueueProvider */
    const { queueState, startBatch, cancelBatch } = useAiQueueContext();

    /** Compression Queue — single instance via CompressionQueueProvider */
    const { compressionState, cancelJob, retryJob, clearPending } = useCompressionQueueContext();

    const isModalOpen = showSettings || showCalendar || showPersonSelect || showStreakPopup;
    const isModalOpenRef = useRef(isModalOpen);
    isModalOpenRef.current = isModalOpen;

    // Listen for streak increase events emitted by writing screens
    // Uses DeviceEventEmitter instead of route params to avoid triggering
    // a re-render/reload of the Home screen when modals are popped
    useEffect(() => {
        const subscription = DeviceEventEmitter.addListener('streakIncreased', ({ newStreak }) => {
            setNewStreakParam(newStreak || streak.currentStreak + 1);
            setShowStreakPopup(true);
        });
        return () => subscription.remove();
    }, [streak.currentStreak]);

    /**
     * handleStart
     * Measures the button's layout relative to the container and navigates instantly,
     * passing the coordinates as 'buttonLayout' to the target screen.
     */
    const handleStart = () => {
        const navigateToScreen = (buttonLayout?: { x: number; y: number; width: number; height: number }) => {
            if (sessionMode === 'vlog') {
                navigation.navigate('VlogRecording', {
                    timeIndex: timeIndex,
                    buttonLayout,
                });
                return;
            }

            if (sessionMode === 'checkin') {
                navigation.navigate('AlignmentWriting', {
                    alignmentScore: score,
                    timeIndex: timeIndex,
                    buttonLayout,
                });
                return;
            }

            navigation.navigate('Writing', {
                timeIndex,
                diffIndex,
                mode: sessionMode,
                personId: selectedPersonId,
                buttonLayout,
            });
        };

        if (buttonRef.current && containerRef.current) {
            buttonRef.current.measureLayout(
                containerRef.current,
                (left, top, width, height) => {
                    navigateToScreen({ x: left, y: top, width, height });
                },
                () => {
                    // Fallback to navigation without morph coordinates if measurement fails
                    navigateToScreen();
                },
            );
        } else {
            navigateToScreen();
        }
    };

    const getScoreDetails = getAlignmentScoreDetails;

    const details = getScoreDetails(score);

    const animatedGlowStyle = useAnimatedStyle(
        () => ({
            // Remove backgroundColor so the solid circle ring is gone
            shadowColor: withTiming(details.color, { duration: 150, easing: Easing.out(Easing.cubic) }),
            opacity: withTiming(sessionMode === 'checkin' ? 1 : 0, { duration: 400 }),
        }),
        [details.color, sessionMode],
    );

    const animatedTextStyle = useAnimatedStyle(
        () => ({
            color: withTiming(details.color, { duration: 150, easing: Easing.out(Easing.cubic) }),
        }),
        [details.color],
    );

    /** Load AI log entries for the Dev Tools panel */
    const loadAiLog = async () => {
        const entries = await getAiLog();
        setAiLogEntries(entries.slice(-50).reverse());
    };

    return (
        <View ref={containerRef} style={commonStyles.startContainer} collapsable={false}>
            {/* Status bar is hidden app-wide (App.tsx) — do NOT re-show it here.
                Re-showing made the Library title collide with the status bar. */}

            {/* Dev Mode Toast Notification */}
            {devToast && (
                <View
                    style={{
                        position: 'absolute',
                        top: 50,
                        alignSelf: 'center',
                        zIndex: 9999,
                        backgroundColor: theme.colors.surfaceRaised,
                        paddingHorizontal: 20,
                        paddingVertical: 12,
                        borderRadius: 25,
                        borderWidth: 1,
                        borderColor: theme.colors.dangerBorderStrong,
                    }}
                >
                    <Text style={{ color: theme.colors.gold, fontSize: 14, fontWeight: '600' }}>{devToast}</Text>
                </View>
            )}

            {/* Premium Header */}
            <View
                style={[
                    commonStyles.topBar,
                    preferences.debugLayout && { borderWidth: 1, borderColor: theme.colors.dangerBorder },
                ]}
            >
                <AnimatedScaleButton onPress={() => setShowCalendar(true)} style={commonStyles.iconButton}>
                    <MaterialCommunityIcons name="fire" size={18} color={theme.colors.danger} />
                    <Text style={commonStyles.streakText}>{streak.currentStreak}</Text>
                </AnimatedScaleButton>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    {/* Vision Board button — moved here from footer */}
                    <VisionLockButton
                        isUnlocked={security.isNotesUnlocked}
                        onPress={async () => {
                            if (security.isNotesUnlocked) {
                                navigation.navigate('PillarsDashboard');
                            } else {
                                const success = await security.unlockNotes();
                                if (success) vibrate(50);
                            }
                        }}
                        onLongPress={() => {
                            if (security.isNotesUnlocked) {
                                security.lockAll();
                                vibrate(50);
                            }
                        }}
                    />
                    <AnimatedScaleButton
                        onPress={() => setShowSettings(true)}
                        onPressIn={() => {
                            // Start 4s timer to unlock dev tools
                            settingsLongPressTimer.current = setTimeout(() => {
                                const newState = !devModeUnlocked;
                                setDevModeUnlocked(newState);
                                if (newState) {
                                    vibrate([0, 50, 100, 50, 100, 150]);
                                } else {
                                    vibrate([0, 150, 100, 150]);
                                }
                                setDevToast(newState ? '🛠 Developer Mode Unlocked' : '🔒 Developer Mode Locked');
                                setTimeout(() => setDevToast(null), CONFIG.DEV_MODE_TOAST_DURATION_MS);
                            }, CONFIG.DEV_MODE_LONG_PRESS_MS);
                        }}
                        onPressOut={() => {
                            if (settingsLongPressTimer.current) {
                                clearTimeout(settingsLongPressTimer.current);
                                settingsLongPressTimer.current = null;
                            }
                        }}
                        style={commonStyles.iconButton}
                    >
                        <MaterialCommunityIcons name="cog-outline" size={20} color={theme.colors.textPrimary} />
                    </AnimatedScaleButton>
                </View>
            </View>

            {/* Main Center Content */}
            <View style={{ flex: 1, paddingVertical: 10 }}>
                {/* Dynamic Hero Area */}
                <View style={styles.heroWidgetContainer}>
                    {/* The Morphing Vector Icon - Always Mounted */}
                    <View
                        style={{
                            position: 'relative',
                            marginBottom: 12,
                            marginTop: 0,
                            width: 80,
                            height: 80,
                            justifyContent: 'center',
                            alignItems: 'center',
                        }}
                    >
                        {/* Glow ring - behind the icon. Uses animated opacity to trace out backwards. */}
                        <Animated.View
                            style={[
                                styles.glowRing,
                                { position: 'absolute', width: 60, height: 60, borderRadius: 30 },
                                animatedGlowStyle,
                            ]}
                        />

                        {/* Inner Circle - behind the icon. IsActive prop handles stable retracting draws. */}
                        <View
                            style={[
                                styles.iconCircle,
                                {
                                    position: 'absolute',
                                    width: 68,
                                    height: 68,
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    borderWidth: 0,
                                },
                            ]}
                        >
                            <AnimatedSymmetricalRing
                                size={68}
                                strokeWidth={4}
                                color={details.color}
                                backgroundColor={sessionMode === 'checkin' ? theme.colors.background : 'transparent'}
                                isActive={sessionMode === 'checkin'}
                            />
                        </View>

                        {/* The Icon itself - permanently mounted so it can morph */}
                        <LiquidMorphIcon
                            mode={sessionMode}
                            size={sessionMode === 'checkin' ? 40 : 42}
                            color={sessionMode === 'checkin' ? details.color : theme.colors.primaryAction}
                            animated={isActive}
                        />
                    </View>

                    {/* Mode Content Container - absolute position elements so they fade smoothly without stacking */}
                    <View style={{ width: '100%', height: 80, alignItems: 'center' }}>
                        {sessionMode === 'journal' && (
                            <Animated.View
                                // Snappy entry transition matching theme settings
                                entering={FadeInUp.springify()
                                    .damping(theme.animation.springSnappy.damping)
                                    .stiffness(theme.animation.springSnappy.stiffness)
                                    .mass(theme.animation.springSnappy.mass)}
                                exiting={FadeOutUp.duration(200)}
                                style={{ position: 'absolute', alignItems: 'center', width: '100%' }}
                            >
                                <Text style={styles.heroTitle}>Free Writing</Text>
                                <Text style={styles.heroSubtitle}>Write continuously, or all is lost.</Text>
                                {getFeatureFlags().ENABLE_TWEET_IN_JOURNAL_MODE && (
                                    <AnimatedScaleButton
                                        style={styles.tweetBtn}
                                        onPress={() => {
                                            vibrate(30);
                                            navigation.navigate('Writing', {
                                                timeIndex: 0,
                                                diffIndex,
                                                mode: 'journal',
                                                personId: null,
                                                isTweet: true,
                                            });
                                        }}
                                    >
                                        <MaterialCommunityIcons
                                            name="chat-processing-outline"
                                            size={16}
                                            color={theme.colors.background}
                                        />
                                        <Text style={styles.tweetBtnText}>New Tweet</Text>
                                    </AnimatedScaleButton>
                                )}
                            </Animated.View>
                        )}
                        {sessionMode === 'circles' && (
                            <Animated.View
                                // Snappy entry transition matching theme settings
                                entering={FadeInUp.springify()
                                    .damping(theme.animation.springSnappy.damping)
                                    .stiffness(theme.animation.springSnappy.stiffness)
                                    .mass(theme.animation.springSnappy.mass)}
                                exiting={FadeOutUp.duration(200)}
                                style={{ position: 'absolute', alignItems: 'center', width: '100%' }}
                            >
                                <Text style={styles.heroTitle}>Relationship Journal</Text>
                                <AnimatedScaleButton
                                    style={styles.personSmallSelectBtn}
                                    onPress={() => {
                                        setShowPersonSelect(true);
                                    }}
                                >
                                    <Text style={styles.personSmallSelectText}>
                                        {selectedPersonId
                                            ? personsHook.persons.find((p) => p.id === selectedPersonId)?.name
                                            : 'Select target person...'}
                                        <Text style={{ opacity: 0.5 }}> ▼</Text>
                                    </Text>
                                </AnimatedScaleButton>
                                {selectedPersonId && getFeatureFlags().ENABLE_TWEET_IN_CIRCLE_MODE && (
                                    <AnimatedScaleButton
                                        style={styles.tweetBtn}
                                        onPress={() => {
                                            vibrate(30);
                                            navigation.navigate('Writing', {
                                                timeIndex: 0,
                                                diffIndex,
                                                mode: 'circles',
                                                personId: selectedPersonId,
                                                isTweet: true,
                                            });
                                        }}
                                    >
                                        <MaterialCommunityIcons
                                            name="chat-processing-outline"
                                            size={16}
                                            color={theme.colors.background}
                                        />
                                        <Text style={styles.tweetBtnText}>Tweet</Text>
                                    </AnimatedScaleButton>
                                )}
                            </Animated.View>
                        )}
                        {sessionMode === 'checkin' && (
                            <Animated.View
                                // Faster fade-in to align with snappy transitions
                                entering={FadeIn.duration(200)}
                                exiting={FadeOutUp.duration(200)}
                                style={{ position: 'absolute', alignItems: 'center', width: '100%' }}
                            >
                                <Animated.Text
                                    style={[
                                        styles.scoreText,
                                        { fontSize: 14, marginTop: 8, marginBottom: -6 },
                                        animatedTextStyle,
                                    ]}
                                >
                                    {details.text.toUpperCase()}
                                </Animated.Text>
                                <View
                                    style={{
                                        transform: [{ scale: 0.9 }],
                                        marginTop: -14,
                                        marginBottom: -40,
                                        width: '100%',
                                    }}
                                >
                                    <CustomSlider value={score} onValueChange={setScore} />
                                </View>
                            </Animated.View>
                        )}
                        {sessionMode === 'vlog' && (
                            <Animated.View
                                // Snappy entry transition matching theme settings
                                entering={FadeInUp.springify()
                                    .damping(theme.animation.springSnappy.damping)
                                    .stiffness(theme.animation.springSnappy.stiffness)
                                    .mass(theme.animation.springSnappy.mass)}
                                exiting={FadeOutUp.duration(200)}
                                style={{ position: 'absolute', alignItems: 'center', width: '100%' }}
                            >
                                <Text style={styles.heroTitle}>Video Journal</Text>
                                <Text style={styles.heroSubtitle}>Record your thoughts on camera.</Text>
                                <AnimatedScaleButton
                                    style={styles.quickNoteBtn}
                                    onPress={() => {
                                        vibrate(30);
                                        navigation.navigate('VlogRecording', { timeIndex: 0, isQuickVideo: true });
                                    }}
                                >
                                    <MaterialCommunityIcons
                                        name="lightning-bolt"
                                        size={16}
                                        color={theme.colors.background}
                                    />
                                    <Text style={styles.quickNoteText}>Quick Video</Text>
                                </AnimatedScaleButton>
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
                    <View
                        style={[
                            styles.diffSelectorContainer,
                            (sessionMode === 'checkin' || sessionMode === 'vlog') && { opacity: 0 },
                        ]}
                        pointerEvents={sessionMode === 'checkin' || sessionMode === 'vlog' ? 'none' : 'auto'}
                    >
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.diffScroll}
                        >
                            {CONFIG.DIFFICULTIES.map((diff, i) => (
                                <AnimatedScaleButton
                                    key={i}
                                    style={[styles.diffPill, diffIndex === i && styles.diffPillActive]}
                                    onPress={() => setDiffIndex(i)}
                                >
                                    <Text style={[styles.diffPillText, diffIndex === i && styles.diffPillTextActive]}>
                                        {diff.label}
                                    </Text>
                                </AnimatedScaleButton>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </View>

            {/* Start Writing Button — now standalone pill above the nav area */}
            <View style={styles.startBtnContainer}>
                <View ref={buttonRef} collapsable={false}>
                    <AnimatedScaleButton style={styles.massiveStartBtn} onPress={handleStart}>
                        <Text style={styles.massiveStartBtnText}>
                            {sessionMode === 'vlog' ? 'Start Recording' : 'Start Writing'}
                        </Text>
                    </AnimatedScaleButton>
                </View>
            </View>

            {/* Bottom spacer for the floating LiquidGlassNav pill */}
            <View style={styles.bottomSpacer} />

            {/* Modals */}
            <BaseModal
                visible={showCalendar}
                onClose={() => setShowCalendar(false)}
                setHomeScrollEnabled={setHomeScrollEnabled}
            >
                <CalendarView currentStreak={streak.currentStreak} streakHistory={streak.streakHistory} />
            </BaseModal>

            <SettingsModal
                visible={showSettings}
                onClose={() => setShowSettings(false)}
                setHomeScrollEnabled={setHomeScrollEnabled}
                queueState={queueState}
                startBatch={startBatch}
                cancelBatch={cancelBatch}
                batchState={{
                    forceBatchOverwrite,
                    setForceBatchOverwrite,
                    batchJournals,
                    setBatchJournals,
                    batchCircles,
                    setBatchCircles,
                    batchCheckins,
                    setBatchCheckins,
                    choosingModelFor,
                    setChoosingModelFor,
                }}
                logState={{
                    aiLogEntries,
                    showAiLog,
                    setShowAiLog,
                    setAiLogEntries,
                }}
                devTools={{
                    devModeUnlocked,
                    setShowStreakPopup,
                    setNewStreakParam,
                    setShowSettings,
                    setShowBenchmarkModal,
                    loadAiLog,
                    clearAiLog,
                }}
                compressionState={compressionState}
                onCancelCompression={cancelJob}
                onRetryCompression={retryJob}
                onClearPendingCompressions={clearPending}
            />

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

            <BenchmarkModal visible={showBenchmarkModal} onClose={() => setShowBenchmarkModal(false)} />
        </View>
    );
};

const styles = StyleSheet.create({
    heroWidgetContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        height: 200, // Exact height prevents jumps
        marginTop: 5,
    },
    heroTitle: {
        fontSize: 28,
        fontWeight: '900',
        color: theme.colors.textPrimary,
        fontFamily: theme.typography.fontFamily,
        letterSpacing: -0.5,
        marginBottom: 6,
    },
    heroSubtitle: {
        fontSize: 16,
        color: theme.colors.textSecondary,
        fontFamily: theme.typography.fontFamily,
    },
    tweetBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.primaryAction,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginTop: 15,
        gap: 6,
    },
    tweetBtnText: {
        color: theme.colors.background,
        fontWeight: 'bold',
        fontSize: 13,
    },
    personSmallSelectBtn: {
        backgroundColor: theme.colors.glassBorder,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginTop: 5,
    },
    personSmallSelectText: {
        color: theme.colors.textPrimary,
        fontSize: 14,
        fontWeight: '600',
    },
    quickNoteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.primaryAction,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginTop: 15,
        gap: 6,
    },
    quickNoteText: {
        color: theme.colors.background,
        fontWeight: 'bold',
        fontSize: 13,
    },
    diffSelectorContainer: {
        width: '100%',
        alignItems: 'center',
        marginTop: 10,
        marginBottom: DIFFICULTY_SELECTOR_MARGIN_BOTTOM,
    },
    diffScroll: {
        gap: 8,
        paddingHorizontal: 20,
    },
    diffPill: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: theme.colors.glassBackground,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
    },
    diffPillActive: {
        backgroundColor: theme.colors.glassHighlight,
        borderColor: theme.colors.textDim,
    },
    diffPillText: {
        color: theme.colors.lightGrey,
        fontSize: 13,
        fontWeight: '600',
    },
    diffPillTextActive: {
        color: theme.colors.textPrimary,
    },
    /** Container for the standalone Start Writing button */
    startBtnContainer: {
        alignItems: 'center',
        marginBottom: START_BUTTON_MARGIN_BOTTOM,
    },
    bottomSpacer: {
        height: BOTTOM_SPACER_HEIGHT,
    },
    massiveStartBtn: {
        backgroundColor: theme.colors.textPrimary,
        paddingHorizontal: 40,
        paddingVertical: 18,
        borderRadius: 30,
        shadowColor: theme.colors.textPrimary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 15,
        elevation: 10,
    },
    massiveStartBtnText: {
        color: theme.colors.background,
        fontSize: 18,
        fontWeight: '900',
        letterSpacing: 1,
    },
    // Inline Checkin specific styles
    glowRing: {
        width: 110,
        height: 110,
        borderRadius: 55,
        justifyContent: 'center',
        alignItems: 'center',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 30,
        elevation: 15,
    },
    iconCircle: {
        width: 90,
        height: 90,
        borderRadius: 45,
        backgroundColor: theme.colors.background,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: theme.colors.glassBorder,
    },
    scoreText: {
        fontSize: 16,
        fontWeight: '900',
        marginTop: 15,
        letterSpacing: 2,
        fontFamily: theme.typography.fontFamily,
    },

    // Premium UI Overrides for Select Person
    premiumPersonModal: { paddingTop: Platform.OS === 'ios' ? 20 : 0 },
    premiumPersonHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 25,
        paddingTop: 20,
        paddingBottom: 25,
    },
    premiumPersonTitle: { color: theme.colors.textPrimary, fontSize: 24, fontWeight: '900', letterSpacing: 0.5 },
    premiumPersonCloseBtn: { backgroundColor: theme.colors.glassBorder, padding: 8, borderRadius: 20 },
    premiumSearchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.glassSurface,
        borderRadius: 16,
        paddingHorizontal: 15,
        height: 55,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
    },
    premiumSearchInput: { flex: 1, color: theme.colors.textPrimary, fontSize: 16, paddingVertical: 0 },
    premiumPersonItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.glassBackground,
    },
    premiumPersonAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: theme.colors.glassBorder,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
    },
    premiumPersonAvatarText: { color: theme.colors.primaryAction, fontSize: 18, fontWeight: '800' },
    premiumPersonName: { color: theme.colors.textPrimary, fontSize: 17, fontWeight: '600' },
    premiumCreateBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.primaryAction,
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 30,
    },
    premiumCreateBtnText: { color: theme.colors.background, fontSize: 16, fontWeight: 'bold', marginLeft: 6 },
    premiumFloatCreateBtn: {
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 40 : 20,
        right: 20,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.primaryAction,
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderRadius: 30,
        shadowColor: theme.colors.textPrimary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 8,
    },
    premiumFloatCreateBtnText: { color: theme.colors.background, fontSize: 15, fontWeight: 'bold', marginLeft: 6 },
});

/**
 * Memoized export — prevents re-renders from HomeScreen scroll events
 * and useTransition-deferred updates from causing layout thrashing.
 */
export const StartScreen = React.memo(StartScreenInner);
