import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    useWindowDimensions,
    DeviceEventEmitter,
    Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
    withSequence,
    interpolate,
    interpolateColor,
    Easing,
    runOnJS,
    FadeInUp,
} from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StackActions } from '@react-navigation/native';
import { RootStackParamList } from '@/types/navigation.types';
import { commonStyles } from '@/styles/commonStyles';
import { theme } from '@/styles/theme';
import { CONFIG } from '@/config';
import { usePillars, usePreferences, useNotes } from '@/lib/hooks/useStorage';
import { run } from '@/lib/db';
import { DangerOverlay } from '@/components/features/writing/DangerOverlay';
import { DeathOverlay } from '@/components/features/writing/DeathOverlay';
import { CustomSlider } from '@/components/features/alignment/CustomSlider';
import { generateId } from '@/lib/utils';
import { vibrate } from '@/lib/haptics';
import { useSession } from '@/lib/hooks/useSession';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Pillar, PillarLog, SavedNote } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AlignmentWriting'>;

interface PickedItem {
    id: string;
    type: 'pillar' | 'advice';
    title: string;
    pillarType?: Pillar['type'];
    loggedValue: string | number | boolean | null; // Rating (1-10), Duration (hrs), Boolean (yes/no), or empty
    isReflected: boolean;
    reflectionText: string;
    logId?: string; // Cache the generated SQLite row ID
    version?: number;
}

// Customizable Animation Settings
const MORPH_TRANSITION_CONFIG = {
    duration: 300,
    textFadeThreshold: 0.4,
};

// Check-in interval rate limit (3 hours in milliseconds)
const CHECKIN_RATE_LIMIT_MS = 3 * 60 * 60 * 1000;

export const AlignmentWritingScreen: React.FC<Props> = ({ route, navigation }) => {
    const { isWeekly = false, buttonLayout } = route.params;

    const { getPillarsForCheckIn, savePillarLog, linkPillarLogNote, lastLogDate } = usePillars();
    const insets = useSafeAreaInsets();
    const { saveNote } = useNotes();
    const { fontIndex, sizeIndex, devMode } = usePreferences();
    const { setLastReflectionDate } = usePreferences();

    const [phase, setPhase] = useState<1 | 2>(1); // 1: Calm Entry, 2: Dangerous Deck
    const [pickedItems, setPickedItems] = useState<PickedItem[]>([]);
    const [activeReflection, setActiveReflection] = useState<PickedItem | null>(null);

    // Gating rate limit states
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [isBypassed, setIsBypassed] = useState(false);

    // Format millisecond duration to HH:MM:SS format
    const formatTimeLeft = (ms: number) => {
        const totalSecs = Math.ceil(ms / 1000);
        const hrs = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = totalSecs % 60;
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Calculate time left to unlock check-in logging
    useEffect(() => {
        if (lastLogDate === null) return;
        const diff = Date.now() - lastLogDate;
        if (diff < CHECKIN_RATE_LIMIT_MS) {
            setTimeLeft(CHECKIN_RATE_LIMIT_MS - diff);
            const interval = setInterval(() => {
                const newDiff = Date.now() - lastLogDate;
                if (newDiff >= CHECKIN_RATE_LIMIT_MS) {
                    setTimeLeft(null);
                    clearInterval(interval);
                } else {
                    setTimeLeft(CHECKIN_RATE_LIMIT_MS - newDiff);
                }
            }, 1000);
            return () => clearInterval(interval);
        } else {
            setTimeLeft(null);
        }
    }, [lastLogDate]);

    const isLocked = timeLeft !== null && timeLeft > 0 && !isBypassed;

    const editorRef = useRef<TextInput>(null);
    const editorText = useRef('');

    const DIFF_INDEX = 0; // Force Easy difficulty (10s threshold) for Checkins

    // Re-use standard useSession for the 1-minute reflection session
    // We pass -99 as the timeIndex, which is captured by our upgraded useSession as a 1-minute limit.
    const {
        sessionTimeRemaining,
        idleTimeMsShared,
        hasLost,
        isContinuingAfterLoss,
        shakeAnimation,
        lossOverlayOpacity,
        startSession,
        handleTextChange,
        resumeWritingFreely,
        clearTimers,
        skipTimer,
    } = useSession(-99, DIFF_INDEX, editorRef);

    // ── Entry Morph & Save Fly-Away Animation States ──
    const [isIntroFinished, setIsIntroFinished] = useState(!buttonLayout);
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const morphProgress = useSharedValue(0);
    const editorOpacity = useSharedValue(buttonLayout ? 0 : 1);
    const headerProgress = useSharedValue(buttonLayout ? 0 : 1);

    const isExitingRef = useRef(false);

    // ── Save Fly-Away Animation Shared Values ──
    const saveTranslateX = useSharedValue(0);
    const saveScale = useSharedValue(1);
    const saveRotate = useSharedValue(0);
    const saveOpacity = useSharedValue(1);
    const saveBorderRadius = useSharedValue(0);
    const saveBorderWidth = useSharedValue(0);
    const savePadding = useSharedValue(20);
    const saveBgColor = useSharedValue('transparent');
    const saveWidth = useSharedValue(screenWidth);
    const saveHeight = useSharedValue(screenHeight);
    const screenBgOpacity = useSharedValue(1);

    // Pick random items for this checkin session on mount
    useEffect(() => {
        const { pillars: pickedPillars, advice: pickedAdvice } = getPillarsForCheckIn(isWeekly);

        const items: PickedItem[] = pickedPillars.map((p) => ({
            id: p.id,
            type: 'pillar',
            title: p.title,
            pillarType: p.type,
            loggedValue: p.type === 'rating' ? 5 : p.type === 'time' ? 7.0 : p.type === 'boolean' ? true : '',
            isReflected: false,
            reflectionText: '',
            logId: generateId(), // Pre-generate log row ID
            version: p.version || 1,
        }));

        if (isWeekly && pickedAdvice) {
            items.push({
                id: pickedAdvice.id,
                type: 'advice',
                title: pickedAdvice.text,
                loggedValue: '',
                isReflected: false,
                reflectionText: '',
            });
        }

        setPickedItems(items);
    }, [isWeekly, getPillarsForCheckIn]);

    // Handle Entry Morph Expansion
    useEffect(() => {
        const handleMorphComplete = () => {
            setIsIntroFinished(true);
            vibrate(50);
            headerProgress.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });
        };

        if (buttonLayout) {
            morphProgress.value = 0;
            morphProgress.value = withTiming(
                1,
                {
                    duration: MORPH_TRANSITION_CONFIG.duration,
                    easing: Easing.bezier(0.25, 1, 0.5, 1),
                },
                (finished) => {
                    if (finished) {
                        runOnJS(handleMorphComplete)();
                        editorOpacity.value = withTiming(1, { duration: 150 });
                    }
                },
            );
        } else {
            vibrate(50);
            headerProgress.value = 1;
        }
        return () => {
            clearTimers();
        };
    }, [buttonLayout, clearTimers, editorOpacity, headerProgress, morphProgress]);

    // Morph Exit Animation
    const performExitTransition = useCallback(
        (onComplete: () => void) => {
            isExitingRef.current = true;
            if (buttonLayout) {
                setIsIntroFinished(false);
                editorOpacity.value = withTiming(0, { duration: 150 });
                headerProgress.value = withTiming(0, { duration: 150 });
                screenBgOpacity.value = withTiming(0, { duration: MORPH_TRANSITION_CONFIG.duration });
                morphProgress.value = withTiming(
                    0,
                    {
                        duration: MORPH_TRANSITION_CONFIG.duration,
                        easing: Easing.bezier(0.25, 1, 0.5, 1),
                    },
                    (finished) => {
                        if (finished) {
                            runOnJS(onComplete)();
                        }
                    },
                );
            } else {
                onComplete();
            }
        },
        [buttonLayout, editorOpacity, headerProgress, morphProgress, screenBgOpacity],
    );

    // Save Fly-Away throw animation
    const performSaveFlyAwayTransition = (onComplete: () => void) => {
        isExitingRef.current = true;
        setIsIntroFinished(false);
        headerProgress.value = withTiming(0, { duration: 150 });
        screenBgOpacity.value = withTiming(0, { duration: 250 });

        savePadding.value = withTiming(16, { duration: 250 });
        saveBorderRadius.value = withTiming(theme.borderRadius.md, { duration: 250 });
        saveBorderWidth.value = withTiming(1, { duration: 250 });
        saveBgColor.value = withTiming(theme.colors.surfaceCard, { duration: 250 });

        saveWidth.value = withTiming(320, {
            duration: 350,
            easing: Easing.bezier(0.25, 1, 0.5, 1),
        });
        saveHeight.value = withTiming(180, {
            duration: 350,
            easing: Easing.bezier(0.25, 1, 0.5, 1),
        });

        saveTranslateX.value = withSequence(
            withTiming(0, { duration: 200 }),
            withTiming(
                screenWidth * 1.3,
                {
                    duration: 400,
                    easing: Easing.bezier(0.3, 0, 0.8, 0.15),
                },
                (finished) => {
                    if (finished) {
                        runOnJS(onComplete)();
                    }
                },
            ),
        );

        saveOpacity.value = withSequence(withTiming(1, { duration: 350 }), withTiming(0, { duration: 250 }));
    };

    // Hardware back buttons / swipe gesture intercepts
    useEffect(() => {
        const unsubscribe = navigation.addListener('beforeRemove', (e) => {
            if (isExitingRef.current) return;
            e.preventDefault();
            performExitTransition(() => {
                isExitingRef.current = true;
                navigation.dispatch(e.data.action);
            });
        });
        return unsubscribe;
    }, [navigation, performExitTransition]);

    // Update Pillar values in state
    const updateItemValue = (id: string, value: string | number | boolean | null) => {
        setPickedItems((prev) => prev.map((item) => (item.id === id ? { ...item, loggedValue: value } : item)));
    };

    // Phase 1 -> Phase 2 trigger
    const handleLogAndContinue = async () => {
        vibrate(30);

        // SQLite logging actions for pillars
        for (const item of pickedItems) {
            if (item.type === 'pillar') {
                const log: PillarLog = {
                    id: item.logId || generateId(),
                    pillarId: item.id,
                    valueNum:
                        typeof item.loggedValue === 'boolean' ? (item.loggedValue ? 1 : 0) : Number(item.loggedValue),
                    valueStr: String(item.loggedValue),
                    timestamp: Date.now(),
                    noteId: null,
                };
                await savePillarLog(log);
            }
        }

        // Set Last Reflection Date today to highlight check-in urgency finished
        const now = Date.now();
        setLastReflectionDate(now);
        await run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('LAST_REFLECTION_DATE', ?)`, [String(now)]);

        setPhase(2);
    };

    // Phase 2: Start 1-minute reflection session
    const handleStartReflection = (item: PickedItem) => {
        if (item.isReflected) return;
        vibrate(40);
        editorText.current = '';
        setActiveReflection(item);
        startSession(false); // start the 1-minute death timer
        setTimeout(() => {
            editorRef.current?.focus();
        }, 100);
    };

    // Save reflection text
    const handleSaveReflection = async () => {
        if (!activeReflection) return;
        vibrate(50);
        clearTimers();

        const textToSave = editorText.current.trim();
        if (!textToSave) {
            setActiveReflection(null);
            return;
        }

        // Save Note to SQLite
        const noteId = generateId();
        const reflectionNote: SavedNote = {
            id: noteId,
            text: textToSave,
            dateStr:
                new Date().toLocaleDateString() +
                ' ' +
                new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: Date.now(),
            durationMin: 1, // 1 min duration
            won: true,
            pillarId: activeReflection.type === 'pillar' ? activeReflection.id : undefined,
            adviceId: activeReflection.type === 'advice' ? activeReflection.id : undefined,
            pillarValue: activeReflection.type === 'pillar' ? Number(activeReflection.loggedValue) : undefined,
            pillarVersion: activeReflection.type === 'pillar' ? activeReflection.version : undefined,
            isAlignmentReflection: true,
        };

        const result = await saveNote(reflectionNote);

        // Link SQLite log note reference
        if (activeReflection.type === 'pillar' && activeReflection.logId) {
            await linkPillarLogNote(activeReflection.logId, noteId);
        } else if (activeReflection.type === 'advice') {
            // Update last_reflected_at for smart advice rotation weighting
            await run(
                `UPDATE advice_cards SET last_reflected_at = ?, reflection_count = reflection_count + 1 WHERE id = ?`,
                [Date.now(), activeReflection.id],
            );
        }

        // Emit streak data
        if (result.streakIncreased) {
            DeviceEventEmitter.emit('streakIncreased', { newStreak: result.newStreak });
        }

        // Update UI state
        setPickedItems((prev) =>
            prev.map((item) =>
                item.id === activeReflection.id ? { ...item, isReflected: true, reflectionText: textToSave } : item,
            ),
        );

        setActiveReflection(null);
    };

    // Exit overall check-in
    const handleFinishCheckin = () => {
        performSaveFlyAwayTransition(() => {
            navigation.dispatch(StackActions.popToTop());
        });
    };

    const handleTextTyping = (t: string) => {
        editorText.current = t;
        handleTextChange(t); // Reset timer
    };

    // Reanimated Morph/Fly-away styling mappings
    const animatedShellStyle = useAnimatedStyle(() => {
        if (!buttonLayout) return {};
        const left = interpolate(morphProgress.value, [0, 1], [buttonLayout.x, 0]);
        const top = interpolate(morphProgress.value, [0, 1], [buttonLayout.y, 0]);
        const width = interpolate(morphProgress.value, [0, 1], [buttonLayout.width, screenWidth]);
        const height = interpolate(morphProgress.value, [0, 1], [buttonLayout.height, screenHeight]);
        const borderRadius = interpolate(morphProgress.value, [0, 1], [30, 0]);
        const backgroundColor = interpolateColor(
            morphProgress.value,
            [0, 1],
            [theme.colors.textPrimary, theme.colors.background],
        );
        return {
            position: 'absolute',
            left,
            top,
            width,
            height,
            borderRadius,
            backgroundColor,
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
        };
    });

    const animatedMorphTextStyle = useAnimatedStyle(() => {
        const opacity = interpolate(morphProgress.value, [0, MORPH_TRANSITION_CONFIG.textFadeThreshold], [1, 0]);
        return { opacity, color: theme.colors.background };
    });

    const animatedEditorStyle = useAnimatedStyle(() => ({ opacity: editorOpacity.value }));
    const bgStyle = useAnimatedStyle(() => ({ opacity: screenBgOpacity.value }));
    const animatedShakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeAnimation.value }] }));
    const animatedHeaderStyle = useAnimatedStyle(() => {
        const translateY = interpolate(headerProgress.value, [0, 1], [-15, 0]);
        return { opacity: headerProgress.value, transform: [{ translateY }] };
    });

    const saveAnimatedStyle = useAnimatedStyle(() => ({
        width: saveWidth.value,
        height: saveHeight.value,
        alignSelf: 'center',
        transform: [
            { translateX: saveTranslateX.value },
            { scale: saveScale.value },
            { rotate: `${saveRotate.value}deg` },
        ],
        borderRadius: saveBorderRadius.value,
        borderWidth: saveBorderWidth.value,
        padding: savePadding.value,
        backgroundColor: saveBgColor.value,
        borderColor: theme.colors.glassBorder,
        overflow: 'hidden',
    }));

    const currentFont = CONFIG.FONTS[fontIndex]?.value || (Platform.OS === 'ios' ? 'System' : 'sans-serif');
    const currentSize = CONFIG.SIZES[sizeIndex]?.value || 18;
    const currentLineHeight = CONFIG.SIZES[sizeIndex]?.line || 28;

    if (isLocked) {
        return (
            <View style={[styles.lockContainer, { paddingTop: Math.max(insets.top, 16) }]}>
                <Animated.View entering={FadeInUp.duration(350).springify().damping(15)} style={styles.lockGlassPanel}>
                    <MaterialCommunityIcons
                        name="lock-clock"
                        size={64}
                        color={theme.colors.gold}
                        style={styles.lockIcon}
                    />
                    <Text style={styles.lockTitle}>Mastery Log Locked</Text>
                    <Text style={styles.lockSubtitle}>
                        To build lasting habits, reflect with intention. You can check in again in:
                    </Text>

                    <View style={styles.countdownBox}>
                        <Text style={styles.countdownText}>{formatTimeLeft(timeLeft || 0)}</Text>
                    </View>

                    <View style={styles.lockActionRow}>
                        <View style={{ flex: 1 }}>
                            <AnimatedScaleButton
                                style={[styles.lockBackBtn, { width: '100%' }]}
                                onPress={() => {
                                    vibrate(10);
                                    navigation.goBack();
                                }}
                            >
                                <Text style={styles.lockBackText}>Go Back</Text>
                            </AnimatedScaleButton>
                        </View>

                        <View style={{ flex: 1 }}>
                            <AnimatedScaleButton
                                style={[styles.lockDashboardBtn, { width: '100%' }]}
                                onPress={() => {
                                    vibrate(10);
                                    navigation.replace('PillarsDashboard');
                                }}
                            >
                                <Text style={styles.lockDashboardText}>View Masteries</Text>
                            </AnimatedScaleButton>
                        </View>
                    </View>

                    {devMode && (
                        <Pressable
                            style={styles.bypassBtn}
                            onPress={() => {
                                vibrate(30);
                                setIsBypassed(true);
                            }}
                        >
                            <Text style={styles.bypassText}>Bypass Gating (Dev Mode)</Text>
                        </Pressable>
                    )}
                </Animated.View>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: 'transparent' }}>
            <Animated.View
                style={[StyleSheet.absoluteFillObject, bgStyle, { backgroundColor: theme.colors.background }]}
            />
            <KeyboardAvoidingView
                style={[commonStyles.safeArea, { justifyContent: 'center', alignItems: 'center' }]}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <Animated.View
                    style={[commonStyles.writingContainer, animatedShakeStyle, saveAnimatedStyle, { zIndex: 3 }]}
                >
                    {/* The Dangerous vignette overlay */}
                    <DangerOverlay
                        idleTimeMsShared={idleTimeMsShared}
                        difficultyLimit={CONFIG.DIFFICULTIES[DIFF_INDEX]?.value || 8000}
                        hasLost={hasLost}
                        isContinuingAfterLoss={isContinuingAfterLoss}
                        sessionTimeRemaining={sessionTimeRemaining}
                        isDisabled={activeReflection === null}
                    />

                    <Animated.View style={[{ flex: 1, width: '100%' }, animatedEditorStyle]}>
                        {/* ── Active Reflection Editor View ── */}
                        {activeReflection ? (
                            <View style={{ flex: 1 }}>
                                <Animated.View style={[commonStyles.header, animatedHeaderStyle]}>
                                    <Text
                                        style={[
                                            commonStyles.wordCount,
                                            { color: theme.colors.primaryAction, fontSize: 13 },
                                        ]}
                                    >
                                        REFLECTING
                                    </Text>
                                    <Text
                                        style={
                                            hasLost
                                                ? commonStyles.lossText
                                                : { color: theme.colors.textDim, fontSize: 18, fontWeight: 'bold' }
                                        }
                                    >
                                        {hasLost
                                            ? 'YOU DIED'
                                            : `${Math.floor(sessionTimeRemaining / 60)}:${(sessionTimeRemaining % 60).toString().padStart(2, '0')}`}
                                    </Text>
                                    {devMode && sessionTimeRemaining > 0 && !hasLost && (
                                        <AnimatedScaleButton onPress={skipTimer} style={styles.skipBtn}>
                                            <Text
                                                style={{
                                                    color: theme.colors.background,
                                                    fontSize: 12,
                                                    fontWeight: 'bold',
                                                }}
                                            >
                                                ⏩ Skip
                                            </Text>
                                        </AnimatedScaleButton>
                                    )}
                                </Animated.View>

                                <View style={{ paddingHorizontal: 5, paddingVertical: 10 }}>
                                    <Text style={styles.reflectPromptTitle}>
                                        {activeReflection.type === 'pillar' ? 'CORE MASTERY' : 'LIFE ADVICE'}
                                    </Text>
                                    <Text style={styles.reflectPromptBody}>
                                        {activeReflection.type === 'pillar'
                                            ? `Reflect on: "${activeReflection.title}" (Logged: ${
                                                  activeReflection.pillarType === 'boolean'
                                                      ? activeReflection.loggedValue
                                                          ? 'YES'
                                                          : 'NO'
                                                      : activeReflection.loggedValue
                                              })`
                                            : `Review implementation of: "${activeReflection.title}"`}
                                    </Text>
                                </View>

                                <TextInput
                                    ref={editorRef}
                                    style={[
                                        commonStyles.textInput,
                                        {
                                            fontSize: currentSize,
                                            lineHeight: currentLineHeight,
                                            fontFamily: currentFont,
                                            flex: 1,
                                            textAlignVertical: 'top',
                                        },
                                    ]}
                                    multiline
                                    onChangeText={handleTextTyping}
                                    placeholder="Write continuously for 1 minute..."
                                    placeholderTextColor={theme.colors.placeholder}
                                    selectionColor={theme.colors.primaryAction}
                                    editable={!hasLost}
                                />

                                {sessionTimeRemaining === 0 && !hasLost && (
                                    <Animated.View style={[commonStyles.finishedActionsContainer, animatedHeaderStyle]}>
                                        <AnimatedScaleButton
                                            style={commonStyles.saveActionBtn}
                                            onPress={handleSaveReflection}
                                        >
                                            <Text style={commonStyles.saveActionText}>SAVE REFLECTION</Text>
                                        </AnimatedScaleButton>
                                    </Animated.View>
                                )}
                            </View>
                        ) : phase === 1 ? (
                            /* ── Phase 1: Calm Entry View ── */
                            <View style={{ flex: 1 }}>
                                <Animated.View style={[commonStyles.header, animatedHeaderStyle]}>
                                    <Text style={commonStyles.wordCount}>
                                        {isWeekly ? 'Weekly Alignment' : 'Daily Log'}
                                    </Text>
                                    <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>Phase 1/2</Text>
                                </Animated.View>

                                <ScrollView
                                    contentContainerStyle={{ paddingBottom: 150 }}
                                    showsVerticalScrollIndicator={false}
                                >
                                    <Text style={styles.phaseLabel}>LOG YOUR MASTERIES</Text>
                                    <Text style={styles.phaseSub}>Update your metrics for today.</Text>

                                    {pickedItems
                                        .filter((i) => i.type === 'pillar')
                                        .map((item) => (
                                            <View key={item.id} style={styles.pillarLogCard}>
                                                <Text style={styles.pillarLogTitle}>{item.title}</Text>

                                                {/* Rating input type (1-10 slider) */}
                                                {item.pillarType === 'rating' && (
                                                    <View style={{ width: '100%', marginTop: 10 }}>
                                                        <CustomSlider
                                                            value={item.loggedValue as number}
                                                            onValueChange={(val) => updateItemValue(item.id, val)}
                                                        />
                                                        <Text style={styles.loggedValueText}>
                                                            Value: {item.loggedValue as number}/10
                                                        </Text>
                                                    </View>
                                                )}

                                                {/* Time duration input type (+/- Hour Stepper) */}
                                                {item.pillarType === 'time' && (
                                                    <View style={styles.stepperContainer}>
                                                        <Pressable
                                                            style={styles.stepperBtn}
                                                            onPress={() => {
                                                                vibrate(10);
                                                                updateItemValue(
                                                                    item.id,
                                                                    Math.max(0, (item.loggedValue as number) - 0.5),
                                                                );
                                                            }}
                                                        >
                                                            <MaterialCommunityIcons
                                                                name="minus"
                                                                size={20}
                                                                color={theme.colors.textPrimary}
                                                            />
                                                        </Pressable>
                                                        <Text style={styles.stepperValue}>
                                                            {(item.loggedValue as number).toFixed(1)} hrs
                                                        </Text>
                                                        <Pressable
                                                            style={styles.stepperBtn}
                                                            onPress={() => {
                                                                vibrate(10);
                                                                updateItemValue(
                                                                    item.id,
                                                                    (item.loggedValue as number) + 0.5,
                                                                );
                                                            }}
                                                        >
                                                            <MaterialCommunityIcons
                                                                name="plus"
                                                                size={20}
                                                                color={theme.colors.textPrimary}
                                                            />
                                                        </Pressable>
                                                    </View>
                                                )}

                                                {/* Boolean toggle type (Yes/No pills) */}
                                                {item.pillarType === 'boolean' && (
                                                    <View style={styles.booleanContainer}>
                                                        <Pressable
                                                            style={[
                                                                styles.boolPill,
                                                                item.loggedValue === true && styles.boolPillActive,
                                                            ]}
                                                            onPress={() => {
                                                                vibrate(10);
                                                                updateItemValue(item.id, true);
                                                            }}
                                                        >
                                                            <Text
                                                                style={[
                                                                    styles.boolPillText,
                                                                    item.loggedValue === true &&
                                                                        styles.boolPillTextActive,
                                                                ]}
                                                            >
                                                                YES
                                                            </Text>
                                                        </Pressable>
                                                        <Pressable
                                                            style={[
                                                                styles.boolPill,
                                                                item.loggedValue === false && styles.boolPillActive,
                                                            ]}
                                                            onPress={() => {
                                                                vibrate(10);
                                                                updateItemValue(item.id, false);
                                                            }}
                                                        >
                                                            <Text
                                                                style={[
                                                                    styles.boolPillText,
                                                                    item.loggedValue === false &&
                                                                        styles.boolPillTextActive,
                                                                ]}
                                                            >
                                                                NO
                                                            </Text>
                                                        </Pressable>
                                                    </View>
                                                )}
                                            </View>
                                        ))}

                                    {/* Focus Advice banner inside Phase 1 weekly logs */}
                                    {isWeekly && pickedItems.some((i) => i.type === 'advice') && (
                                        <View
                                            style={[
                                                styles.pillarLogCard,
                                                {
                                                    borderColor: theme.colors.goldBorder,
                                                    backgroundColor: theme.colors.goldBackground,
                                                },
                                            ]}
                                        >
                                            <Text style={[styles.pillarLogTitle, { color: theme.colors.gold }]}>
                                                Focus Advice Card
                                            </Text>
                                            <Text style={[styles.adviceTextBanner, { fontFamily: currentFont }]}>
                                                "{pickedItems.find((i) => i.type === 'advice')?.title}"
                                            </Text>
                                        </View>
                                    )}
                                </ScrollView>

                                <View style={styles.actionContainer}>
                                    <AnimatedScaleButton style={styles.logContinueBtn} onPress={handleLogAndContinue}>
                                        <Text style={styles.logContinueBtnText}>LOG & CONTINUE</Text>
                                    </AnimatedScaleButton>
                                </View>
                            </View>
                        ) : (
                            /* ── Phase 2: Dangerous Deck View ── */
                            <View style={{ flex: 1 }}>
                                <Animated.View style={[commonStyles.header, animatedHeaderStyle]}>
                                    <Text style={commonStyles.wordCount}>Check-in Reflections</Text>
                                    <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>Phase 2/2</Text>
                                </Animated.View>

                                <ScrollView
                                    contentContainerStyle={{ paddingBottom: 150 }}
                                    showsVerticalScrollIndicator={false}
                                >
                                    <Text style={styles.phaseLabel}>WRITE REFLECTIONS</Text>
                                    <Text style={styles.phaseSub}>
                                        Write a 1-minute continuous reflection on your alignment.
                                    </Text>

                                    {pickedItems.map((item) => (
                                        <Pressable
                                            key={item.id}
                                            style={[styles.deckCard, item.isReflected && styles.deckCardCompleted]}
                                            onPress={() => handleStartReflection(item)}
                                            disabled={item.isReflected}
                                        >
                                            <View style={styles.deckCardHeader}>
                                                <View
                                                    style={{
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        gap: 10,
                                                        flex: 1,
                                                    }}
                                                >
                                                    <MaterialCommunityIcons
                                                        name={item.type === 'pillar' ? 'pillar' : 'cards-outline'}
                                                        size={18}
                                                        color={
                                                            item.isReflected
                                                                ? theme.colors.green
                                                                : theme.colors.textSecondary
                                                        }
                                                    />
                                                    <Text
                                                        style={[
                                                            styles.deckCardTitle,
                                                            item.isReflected && { color: theme.colors.textMuted },
                                                        ]}
                                                        numberOfLines={1}
                                                    >
                                                        {item.title}
                                                    </Text>
                                                </View>
                                                {item.isReflected ? (
                                                    <View style={styles.reflectedBadge}>
                                                        <Text style={styles.reflectedBadgeText}>✓ DONE</Text>
                                                    </View>
                                                ) : (
                                                    <MaterialCommunityIcons
                                                        name="pencil-outline"
                                                        size={16}
                                                        color={theme.colors.primaryAction}
                                                    />
                                                )}
                                            </View>

                                            {item.type === 'pillar' && !item.isReflected && (
                                                <Text style={styles.deckCardValue}>
                                                    Logged value:{' '}
                                                    {item.pillarType === 'boolean'
                                                        ? item.loggedValue
                                                            ? 'YES'
                                                            : 'NO'
                                                        : item.loggedValue}
                                                </Text>
                                            )}

                                            {item.isReflected ? (
                                                <Text style={styles.deckCardSnippet} numberOfLines={2}>
                                                    {item.reflectionText}
                                                </Text>
                                            ) : (
                                                <Text style={styles.deckCardActionText}>
                                                    Tap to write 1-minute reflection
                                                </Text>
                                            )}
                                        </Pressable>
                                    ))}
                                </ScrollView>

                                <View style={styles.actionContainer}>
                                    <AnimatedScaleButton style={styles.logContinueBtn} onPress={handleFinishCheckin}>
                                        <Text style={styles.logContinueBtnText}>FINISH CHECK-IN</Text>
                                    </AnimatedScaleButton>
                                </View>
                            </View>
                        )}
                    </Animated.View>

                    {/* Death overlay for failures */}
                    <DeathOverlay
                        lossOverlayOpacity={lossOverlayOpacity}
                        hasLost={hasLost}
                        subtitle="You stopped reflecting for too long."
                        primaryLabel="Cancel Reflection"
                        onReturnHome={() => {
                            clearTimers();
                            setActiveReflection(null);
                        }}
                        secondaryLabel="Let me finish"
                        onContinueWriting={resumeWritingFreely}
                    />
                </Animated.View>
            </KeyboardAvoidingView>

            {!isIntroFinished && buttonLayout && (
                <Animated.View style={animatedShellStyle} pointerEvents="none">
                    <Animated.Text style={[styles.morphText, animatedMorphTextStyle]}>Check-in</Animated.Text>
                </Animated.View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    skipBtn: {
        backgroundColor: theme.colors.gold,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        marginLeft: 8,
    },
    reflectPromptTitle: {
        color: theme.colors.primaryAction,
        fontSize: 12,
        fontWeight: 'bold',
        letterSpacing: 2,
    },
    reflectPromptBody: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        fontWeight: '900',
        marginTop: 4,
        lineHeight: 22,
    },
    phaseLabel: {
        color: theme.colors.primaryAction,
        fontSize: 13,
        fontWeight: 'bold',
        letterSpacing: 2,
        marginTop: 15,
        marginBottom: 4,
        fontFamily: theme.typography.fontFamily,
    },
    phaseSub: {
        color: theme.colors.textMuted,
        fontSize: 14,
        marginBottom: 20,
        fontFamily: theme.typography.fontFamily,
    },
    pillarLogCard: {
        backgroundColor: theme.colors.glassBackground,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        borderRadius: theme.borderRadius.md,
        padding: 16,
        marginBottom: 16,
    },
    pillarLogTitle: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        fontWeight: 'bold',
    },
    loggedValueText: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        textAlign: 'center',
        marginTop: 12,
        fontWeight: '600',
    },
    stepperContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        marginTop: 15,
    },
    stepperBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: theme.colors.glassSurface,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
    },
    stepperValue: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        fontWeight: 'bold',
        minWidth: 80,
        textAlign: 'center',
    },
    booleanContainer: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 15,
    },
    boolPill: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: theme.borderRadius.sm,
        backgroundColor: theme.colors.glassSurface,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
    },
    boolPillActive: {
        backgroundColor: theme.colors.primaryAction,
        borderColor: theme.colors.primaryAction,
    },
    boolPillText: {
        color: theme.colors.textSecondary,
        fontWeight: 'bold',
        fontSize: 14,
    },
    boolPillTextActive: {
        color: theme.colors.background,
    },
    adviceTextBanner: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        fontStyle: 'italic',
        lineHeight: 24,
        marginTop: 10,
        textAlign: 'center',
    },
    actionContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'transparent',
        paddingVertical: 20,
    },
    logContinueBtn: {
        backgroundColor: theme.colors.textPrimary,
        paddingVertical: 16,
        borderRadius: 30,
        alignItems: 'center',
        shadowColor: theme.colors.textPrimary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 6,
    },
    logContinueBtnText: {
        color: theme.colors.background,
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 1,
    },
    deckCard: {
        backgroundColor: theme.colors.glassBackground,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        borderRadius: theme.borderRadius.md,
        padding: 16,
        marginBottom: 12,
    },
    deckCardCompleted: {
        borderColor: theme.colors.glassBorderSubtle,
        opacity: 0.65,
    },
    deckCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    deckCardTitle: {
        color: theme.colors.textPrimary,
        fontSize: 15,
        fontWeight: 'bold',
    },
    reflectedBadge: {
        backgroundColor: theme.colors.successFill,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: theme.colors.successBorder,
    },
    reflectedBadgeText: {
        color: theme.colors.green,
        fontSize: 9,
        fontWeight: 'bold',
    },
    deckCardValue: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        marginTop: 6,
    },
    deckCardSnippet: {
        color: theme.colors.textBodyDim,
        fontSize: 13,
        lineHeight: 18,
        fontStyle: 'italic',
        marginTop: 10,
        backgroundColor: theme.colors.overlayLight,
        padding: 8,
        borderRadius: 6,
    },
    deckCardActionText: {
        color: theme.colors.primaryAction,
        fontSize: 12,
        fontWeight: 'bold',
        marginTop: 10,
    },
    morphText: {
        fontSize: 18,
        fontWeight: '900',
        letterSpacing: 1,
        fontFamily: theme.typography.fontFamily,
    },
    lockContainer: {
        flex: 1,
        backgroundColor: theme.colors.background,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    lockGlassPanel: {
        width: '100%',
        backgroundColor: theme.colors.glassBackground,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        borderRadius: theme.borderRadius.md,
        padding: 24,
        alignItems: 'center',
    },
    lockIcon: {
        marginBottom: 16,
    },
    lockTitle: {
        color: theme.colors.textPrimary,
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    lockSubtitle: {
        color: theme.colors.textMuted,
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 24,
    },
    countdownBox: {
        backgroundColor: theme.colors.glassSurfaceMinimal,
        borderWidth: 1,
        borderColor: theme.colors.glassBorderFaint,
        borderRadius: theme.borderRadius.sm,
        paddingVertical: 16,
        paddingHorizontal: 32,
        marginBottom: 32,
    },
    countdownText: {
        color: theme.colors.primaryAction,
        fontSize: 36,
        fontWeight: '900',
        letterSpacing: 2,
        fontVariant: ['tabular-nums'],
    },
    lockActionRow: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    lockBackBtn: {
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        borderRadius: theme.borderRadius.round,
        paddingVertical: 14,
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    lockBackText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        fontWeight: 'bold',
    },
    lockDashboardBtn: {
        backgroundColor: theme.colors.primaryAction,
        borderRadius: theme.borderRadius.round,
        paddingVertical: 14,
        alignItems: 'center',
    },
    lockDashboardText: {
        color: theme.colors.primaryActionText,
        fontSize: 14,
        fontWeight: 'bold',
    },
    bypassBtn: {
        marginTop: 20,
        padding: 8,
    },
    bypassText: {
        color: theme.colors.gold,
        fontSize: 12,
        textDecorationLine: 'underline',
    },
});
