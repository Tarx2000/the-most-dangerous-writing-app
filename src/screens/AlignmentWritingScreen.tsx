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
} from 'react-native';
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
} from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StackActions } from '@react-navigation/native';
import { RootStackParamList } from '@/types/navigation.types';
import { commonStyles } from '@/styles/commonStyles';
import { theme } from '@/styles/theme';
import { CONFIG } from '@/config';
import { useSession } from '@/lib/hooks/useSession';
import { usePreferences, useStorageActions } from '@/lib/hooks/useStorage';
import { AlignmentReflection } from '@/types';
import { DangerOverlay } from '@/components/features/writing/DangerOverlay';
import { DeathOverlay } from '@/components/features/writing/DeathOverlay';
import { generateId } from '@/lib/utils';
import { vibrate } from '@/lib/haptics';

type Props = NativeStackScreenProps<RootStackParamList, 'AlignmentWriting'>;

// CUSTOMIZABLE ANIMATION SETTINGS FOR THE START WRITING BUTTON MORPH
const MORPH_TRANSITION_CONFIG = {
    duration: 300, // Duration of the morph expansion in milliseconds
    textFadeThreshold: 0.4, // At what point of the morph the text fully fades out (0 to 1)
};

export const AlignmentWritingScreen: React.FC<Props> = ({ route, navigation }) => {
    const { alignmentScore, timeIndex, buttonLayout } = route.params;

    const stopRef = useRef<TextInput>(null);
    const startRef = useRef<TextInput>(null);
    const continueRef = useRef<TextInput>(null);

    const stopText = useRef('');
    const startText = useRef('');
    const continueText = useRef('');

    const DIFF_INDEX = 0; // Force Easy rank for Reflections

    // ── Entry Morph & Save Fly-Away Animation States ──
    const [isIntroFinished, setIsIntroFinished] = useState(!buttonLayout);
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const morphProgress = useSharedValue(0);
    const editorOpacity = useSharedValue(buttonLayout ? 0 : 1);
    const headerProgress = useSharedValue(buttonLayout ? 0 : 1);

    // Flag to prevent double navigation interception
    const isExitingRef = useRef(false);

    // ── Save Fly-Away Animation Shared Values ──
    const saveTranslateX = useSharedValue(0);
    const saveScale = useSharedValue(1);
    const saveRotate = useSharedValue(0);
    const saveOpacity = useSharedValue(1);
    const saveBorderRadius = useSharedValue(0);
    const saveBorderWidth = useSharedValue(0);
    const savePadding = useSharedValue(20);
    const saveBgColor = useSharedValue(theme.colors.background);
    const saveWidth = useSharedValue(screenWidth);
    const saveHeight = useSharedValue(screenHeight);
    const screenBgOpacity = useSharedValue(1);

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
    } = useSession(timeIndex, DIFF_INDEX, stopRef);

    const { saveAlignmentReflection } = useStorageActions();
    const { fontIndex, sizeIndex, devMode } = usePreferences();

    /**
     * Plays the reverse morph animation (collapsing back to the button bounds)
     * before executing the navigation callback. Fades out the editor controls
     * and slides the header back up dynamically.
     */
    const performExitTransition = useCallback(
        (onComplete: () => void) => {
            isExitingRef.current = true; // bypass beforeRemove interception
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
                            // Safe execution of JavaScript callback on UI completion
                            runOnJS(onComplete)();
                        }
                    },
                );
            } else {
                // Immediate handoff if coordinate geometry is not defined
                onComplete();
            }
        },
        [buttonLayout, editorOpacity, headerProgress, morphProgress, screenBgOpacity],
    );

    /** Plays a card-shrink and slide-right throw animation when saving successfully */
    const performSaveFlyAwayTransition = (onComplete: () => void) => {
        isExitingRef.current = true; // bypass beforeRemove interception
        setIsIntroFinished(false); // overlay blocks interaction

        // Fade out HUD controls so only the text preview is cardified
        headerProgress.value = withTiming(0, { duration: 150 });

        // Fade out the solid screen background to reveal the Home screen underneath
        screenBgOpacity.value = withTiming(0, { duration: 250 });

        // Transform writingContainer style to mimic a library note card
        savePadding.value = withTiming(16, { duration: 250 });
        saveBorderRadius.value = withTiming(theme.borderRadius.md, { duration: 250 });
        saveBorderWidth.value = withTiming(1, { duration: 250 });
        saveBgColor.value = withTiming(theme.colors.surfaceCard, { duration: 250 }); // solid opaque background

        // Shrink dimensions directly to target 320 x 180 card size
        saveWidth.value = withTiming(320, {
            duration: 350,
            easing: Easing.bezier(0.25, 1, 0.5, 1),
        });
        saveHeight.value = withTiming(180, {
            duration: 350,
            easing: Easing.bezier(0.25, 1, 0.5, 1),
        });

        // Scale stays at 1 since we shrink layout dimensions directly
        saveScale.value = withTiming(1, {
            duration: 350,
            easing: Easing.bezier(0.25, 1, 0.5, 1),
        });

        // Translate off screen to the right
        saveTranslateX.value = withSequence(
            withTiming(0, { duration: 200 }), // hold for shrink
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

    // Intercept hardware back button and iOS swipe gesture back to morph collapse
    useEffect(() => {
        const unsubscribe = navigation.addListener('beforeRemove', (e) => {
            if (isExitingRef.current) {
                return;
            }
            e.preventDefault();
            performExitTransition(() => {
                isExitingRef.current = true;
                navigation.dispatch(e.data.action);
            });
        });
        return unsubscribe;
    }, [navigation, buttonLayout, performExitTransition]);

    // Handle Entry Morph Animation & Focus Synchronization
    useEffect(() => {
        const handleMorphComplete = () => {
            setIsIntroFinished(true);
            vibrate(50); // Tactile trigger as boundaries hit screen edges
            startSession(false); // Start danger timer
            stopRef.current?.focus(); // Focus keyboard in sync with boundaries
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
            // Instant fallback if no coordinates were passed
            vibrate(50);
            startSession(false);
            stopRef.current?.focus();
            headerProgress.value = 1;
        }
        return () => {
            clearTimers();
        };
    }, [buttonLayout, startSession, clearTimers, editorOpacity, headerProgress, morphProgress]);

    /** Reanimated Style: Morph borders to screen viewport and dissolve background from white to black */
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
            zIndex: 9999, // Drawn on top of the hidden editor wrapper
        };
    });

    /** Reanimated Style: Fades out button text early in the morph */
    const animatedMorphTextStyle = useAnimatedStyle(() => {
        const opacity = interpolate(morphProgress.value, [0, MORPH_TRANSITION_CONFIG.textFadeThreshold], [1, 0]);
        return {
            opacity,
            color: theme.colors.background, // Match the starting button text styling (dark text on white)
        };
    });

    /** Reanimated Style: Fades in the editor text area after the morph completes */
    const animatedEditorStyle = useAnimatedStyle(() => ({
        opacity: editorOpacity.value,
    }));

    /** Reanimated Style: Solid black background overlay that fades to transparent on exits */
    const bgStyle = useAnimatedStyle(() => ({
        opacity: screenBgOpacity.value,
    }));

    /** Reanimated Style: Transforms writing container to a note card and throws to the right */
    const saveAnimatedStyle = useAnimatedStyle(() => {
        return {
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
        };
    });

    /** Reanimated Style: Translates and fades in the header elegantly */
    const animatedHeaderStyle = useAnimatedStyle(() => {
        const translateY = interpolate(headerProgress.value, [0, 1], [-15, 0]);
        return {
            opacity: headerProgress.value,
            transform: [{ translateY }],
        };
    });

    useEffect(() => {
        if (hasLost && !isContinuingAfterLoss) {
            startRef.current?.clear();
            continueRef.current?.clear();
            stopText.current = '';
            startText.current = '';
            continueText.current = '';
        }
    }, [hasLost, isContinuingAfterLoss]);

    const difficultyLimit = CONFIG.DIFFICULTIES[DIFF_INDEX]?.value || 8000;

    const handleInput = (type: 'stop' | 'start' | 'continue', text: string) => {
        handleTextChange(text); // Reset timer
        if (type === 'stop') stopText.current = text;
        if (type === 'start') startText.current = text;
        if (type === 'continue') continueText.current = text;
    };

    const handleSave = async () => {
        const fullText = `Stop:\n${stopText.current}\n\nStart:\n${startText.current}\n\nContinue:\n${continueText.current}`;

        // If entirely empty, just abort with exit animation
        if (!stopText.current.trim() && !startText.current.trim() && !continueText.current.trim()) {
            performExitTransition(() => {
                navigation.dispatch(StackActions.popToTop());
            });
            return;
        }

        const noteWon = !hasLost && !isContinuingAfterLoss;
        const refObj: AlignmentReflection = {
            id: generateId(),
            text: fullText,
            dateStr:
                new Date().toLocaleDateString() +
                ' ' +
                new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: Date.now(),
            durationMin: CONFIG.SESSION_OPTIONS_MINS[timeIndex] || 5,
            won: noteWon,
            alignmentScore: alignmentScore,
            stopText: stopText.current,
            startText: startText.current,
            continueText: continueText.current,
            isAlignmentReflection: true,
            isQuickNote: false,
        };

        const result = await saveAlignmentReflection(refObj);
        // Play save fly-away animation before returning to Home screen
        performSaveFlyAwayTransition(() => {
            // Emit streak data via event so Home screen picks it up without re-rendering from param changes
            if (result.streakIncreased) {
                DeviceEventEmitter.emit('streakIncreased', { newStreak: result.newStreak });
            }
            navigation.dispatch(StackActions.popToTop());
        });
    };

    const animatedShakeStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: shakeAnimation.value }],
    }));

    const currentFont = CONFIG.FONTS[fontIndex]?.value || (Platform.OS === 'ios' ? 'System' : 'sans-serif');
    const currentSize = CONFIG.SIZES[sizeIndex]?.value || 18;
    const currentLineHeight = CONFIG.SIZES[sizeIndex]?.line || 28;

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
                    <DangerOverlay
                        idleTimeMsShared={idleTimeMsShared}
                        difficultyLimit={difficultyLimit}
                        hasLost={hasLost}
                        isContinuingAfterLoss={isContinuingAfterLoss}
                        sessionTimeRemaining={sessionTimeRemaining}
                        isDisabled={false}
                    />

                    <Animated.View style={[{ flex: 1 }, animatedEditorStyle]}>
                        <Animated.View style={[commonStyles.header, animatedHeaderStyle]}>
                            <Text style={commonStyles.wordCount}>Weekly Reflection</Text>
                            <Text
                                style={
                                    hasLost
                                        ? commonStyles.lossText
                                        : sessionTimeRemaining === 0
                                          ? commonStyles.winText
                                          : { color: theme.colors.textDim, fontSize: 18, fontWeight: 'bold' }
                                }
                            >
                                {hasLost
                                    ? 'YOU DIED'
                                    : sessionTimeRemaining === 0
                                      ? 'YOU SURVIVED'
                                      : `${Math.floor(sessionTimeRemaining / 60)}:${(sessionTimeRemaining % 60).toString().padStart(2, '0')}`}
                            </Text>
                            {devMode && sessionTimeRemaining > 0 && !hasLost && (
                                <AnimatedScaleButton
                                    onPress={skipTimer}
                                    style={{
                                        backgroundColor: theme.colors.gold,
                                        paddingHorizontal: 10,
                                        paddingVertical: 4,
                                        borderRadius: 12,
                                        marginLeft: 8,
                                    }}
                                >
                                    <Text style={{ color: theme.colors.background, fontSize: 12, fontWeight: 'bold' }}>
                                        ⏩ Skip
                                    </Text>
                                </AnimatedScaleButton>
                            )}
                        </Animated.View>

                        <View style={commonStyles.inputWrapper}>
                            <ScrollView
                                keyboardShouldPersistTaps="handled"
                                contentContainerStyle={{ flexGrow: 1, paddingBottom: 250 }}
                                showsVerticalScrollIndicator={false}
                                keyboardDismissMode="interactive"
                            >
                                <Text style={styles.promptHeader}>STOP</Text>
                                <Text style={styles.promptSub}>
                                    What habits or actions pulled you away from your best self this week?
                                </Text>
                                <TextInput
                                    key={`input_stop_${currentFont}`}
                                    ref={(node) => {
                                        stopRef.current = node;
                                        if (Platform.OS === 'android' && node) {
                                            node.setNativeProps({ style: { fontFamily: currentFont } });
                                        }
                                    }}
                                    style={[
                                        commonStyles.textInput,
                                        {
                                            fontSize: currentSize,
                                            lineHeight: currentLineHeight,
                                            fontFamily: currentFont,
                                            fontWeight: 'normal',
                                            minHeight: 120,
                                            marginBottom: 30,
                                        },
                                    ]}
                                    multiline
                                    onChangeText={(t) => handleInput('stop', t)}
                                    placeholder="I need to stop..."
                                    placeholderTextColor={theme.colors.placeholder}
                                    selectionColor={theme.colors.primaryAction}
                                    editable={!hasLost}
                                />

                                <Text style={styles.promptHeader}>START</Text>
                                <Text style={styles.promptSub}>
                                    What specific action will you take next week to bridge the gap?
                                </Text>
                                <TextInput
                                    key={`input_start_${currentFont}`}
                                    ref={(node) => {
                                        startRef.current = node;
                                        if (Platform.OS === 'android' && node) {
                                            node.setNativeProps({ style: { fontFamily: currentFont } });
                                        }
                                    }}
                                    style={[
                                        commonStyles.textInput,
                                        {
                                            fontSize: currentSize,
                                            lineHeight: currentLineHeight,
                                            fontFamily: currentFont,
                                            fontWeight: 'normal',
                                            minHeight: 120,
                                            marginBottom: 30,
                                        },
                                    ]}
                                    multiline
                                    onChangeText={(t) => handleInput('start', t)}
                                    placeholder="I will start..."
                                    placeholderTextColor={theme.colors.placeholder}
                                    selectionColor={theme.colors.primaryAction}
                                    editable={!hasLost}
                                />

                                <Text style={styles.promptHeader}>CONTINUE</Text>
                                <Text style={styles.promptSub}>What did you do well? What gave you energy?</Text>
                                <TextInput
                                    ref={continueRef}
                                    style={[
                                        commonStyles.textInput,
                                        {
                                            fontSize: currentSize,
                                            lineHeight: currentLineHeight,
                                            fontFamily: currentFont,
                                            minHeight: 120,
                                            marginBottom: 20,
                                        },
                                    ]}
                                    multiline
                                    onChangeText={(t) => handleInput('continue', t)}
                                    placeholder="I will continue..."
                                    placeholderTextColor={theme.colors.placeholder}
                                    selectionColor={theme.colors.primaryAction}
                                    editable={!hasLost}
                                />
                            </ScrollView>
                        </View>

                        {(sessionTimeRemaining === 0 || isContinuingAfterLoss) && !hasLost && (
                            <Animated.View style={[commonStyles.finishedActionsContainer, animatedHeaderStyle]}>
                                <AnimatedScaleButton
                                    style={[commonStyles.saveActionBtn, { opacity: 0.6 }]}
                                    onPress={handleSave}
                                >
                                    <Text style={commonStyles.saveActionText}>SAVE ENTRY</Text>
                                </AnimatedScaleButton>
                            </Animated.View>
                        )}
                    </Animated.View>

                    <DeathOverlay
                        lossOverlayOpacity={lossOverlayOpacity}
                        hasLost={hasLost}
                        subtitle="You stopped reflecting for too long."
                        primaryLabel="Return to Menu"
                        onReturnHome={() => performExitTransition(() => navigation.dispatch(StackActions.popToTop()))}
                        secondaryLabel="Let me finish my reflection"
                        onContinueWriting={resumeWritingFreely}
                    />
                </Animated.View>
            </KeyboardAvoidingView>
            {!isIntroFinished && buttonLayout && (
                <Animated.View style={animatedShellStyle} pointerEvents="none">
                    <Animated.Text style={[styles.morphText, animatedMorphTextStyle]}>Start Writing</Animated.Text>
                </Animated.View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    promptHeader: {
        color: theme.colors.primaryAction,
        fontSize: 16,
        fontWeight: 'bold',
        letterSpacing: 2,
        marginBottom: 5,
        fontFamily: theme.typography.fontFamily,
    },
    promptSub: {
        color: theme.colors.textMuted,
        fontSize: 14,
        marginBottom: 15,
        fontFamily: theme.typography.fontFamily,
        lineHeight: 20,
    },
    morphText: {
        fontSize: 18,
        fontWeight: '900',
        letterSpacing: 1,
        fontFamily: theme.typography.fontFamily,
    },
});
