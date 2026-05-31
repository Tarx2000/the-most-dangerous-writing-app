import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    DeviceEventEmitter,
    useWindowDimensions,
} from 'react-native';
import { vibrate } from '@/lib/haptics';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
import { CONFIG, TWEET_THRESHOLD } from '@/config';
import { useSession } from '@/lib/hooks/useSession';
import { useNotes, usePreferences } from '@/lib/hooks/useStorage';
import { SavedNote } from '@/types';
import { DangerOverlay } from '@/components/features/writing/DangerOverlay';
import { DeathOverlay } from '@/components/features/writing/DeathOverlay';
import { theme } from '@/styles/theme';
import { generateId, formatSessionDate } from '@/lib/utils';
import { VaporizingText } from '@/components/features/writing/VaporizingText';

type Props = NativeStackScreenProps<RootStackParamList, 'Writing'>;

/** Derive the status label and style based on session state */
function getStatusDisplay(
    hasLost: boolean,
    isQuickNote: boolean | undefined,
    isTweet: boolean | undefined,
    timeRemaining: number,
) {
    if (hasLost) return { text: 'YOU DIED', style: commonStyles.lossText };
    if (isTweet) return { text: 'TWEET', style: styles.tweetLabel };
    if (isQuickNote) return { text: 'QUICK NOTE', style: styles.quickNoteLabel };
    if (timeRemaining === 0) return { text: 'YOU SURVIVED', style: styles.winText };
    const mins = Math.floor(timeRemaining / 60);
    const secs = (timeRemaining % 60).toString().padStart(2, '0');
    return { text: `${mins}:${secs}`, style: styles.timerText };
}

// CUSTOMIZABLE ANIMATION SETTINGS FOR THE START WRITING BUTTON MORPH
const MORPH_TRANSITION_CONFIG = {
    duration: 300, // Duration of the morph expansion in milliseconds
    textFadeThreshold: 0.4, // At what point of the morph the text fully fades out (0 to 1)
};

export const WritingScreen: React.FC<Props> = ({ route, navigation }) => {
    const { timeIndex, diffIndex, mode, personId, isQuickNote, isTweet, buttonLayout } = route.params;
    const isTweetMode = isTweet === true;
    const isQuickNoteMode = isQuickNote === true || isTweetMode; // tweets behave like quick notes

    const inputRef = useRef<TextInput>(null);
    const lastTimerResetRef = useRef(0);
    const [isIdle, setIsIdle] = useState(false);

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
        textRef,
        sessionTimeSelected,
        sessionTimeRemaining,
        idleTimeMsShared,
        hasLost,
        isContinuingAfterLoss,
        shakeAnimation,
        lossOverlayOpacity,
        wordCount,
        startSession,
        handleTextChange,
        resumeWritingFreely,
        clearTimers,
        skipTimer,
    } = useSession(timeIndex, diffIndex, inputRef, (idle) => {
        setIsIdle(idle);
    });

    const { saveNote } = useNotes();
    const { fontIndex, sizeIndex, devMode } = usePreferences();

    // Handle Entry Morph Animation & Focus Synchronization
    useEffect(() => {
        const handleMorphComplete = () => {
            setIsIntroFinished(true);
            vibrate(50); // Tactile trigger as boundaries hit screen edges
            startSession(isQuickNoteMode); // Timer only starts when user is ready to write
            inputRef.current?.focus(); // Focus keyboard in sync with boundaries
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
            startSession(isQuickNoteMode);
            inputRef.current?.focus();
            headerProgress.value = 1;
        }
        return () => {
            clearTimers();
        };
    }, [buttonLayout, startSession, clearTimers, isQuickNoteMode, editorOpacity, headerProgress, morphProgress]);

    /** Plays reverse morph (collapse to button boundaries) before running navigation callback */
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
        saveBgColor.value = withTiming(theme.colors.surfaceCard, { duration: 250 });

        // Shrink dimensions directly to target 320 x 180 card size
        saveWidth.value = withTiming(320, {
            duration: 350,
            easing: Easing.bezier(0.25, 1, 0.5, 1),
        });
        saveHeight.value = withTiming(180, {
            duration: 350,
            easing: Easing.bezier(0.25, 1, 0.5, 1),
        });

        // Shrink scale to note size
        saveScale.value = withTiming(0.45, {
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

    // Clamp text to tweet threshold
    const handleTextChangeLocal = (newText: string) => {
        const now = Date.now();
        if (now - lastTimerResetRef.current > 1000) {
            DeviceEventEmitter.emit('RESET_LOCK_TIMER');
            lastTimerResetRef.current = now;
        }
        if (isTweetMode) {
            const currentWords = newText.trim().split(/\s+/).filter(Boolean).length;
            if (currentWords > TWEET_THRESHOLD) {
                // Block typing past threshold
                return;
            }
        }
        handleTextChange(newText);
    };

    const handleSave = async () => {
        const currentText = textRef.current;
        if (currentText.trim().length === 0) {
            performExitTransition(() => {
                navigation.dispatch(StackActions.popToTop());
            });
            return;
        }

        const noteWon = !hasLost && !isContinuingAfterLoss;
        const newNote: SavedNote = {
            id: generateId(),
            text: currentText,
            dateStr: formatSessionDate(Date.now()),
            timestamp: Date.now(),
            durationMin: isQuickNoteMode ? 0 : sessionTimeSelected / 60,
            won: noteWon,
            ...(mode === 'circles' && personId ? { personId } : {}),
            isQuickNote: isQuickNoteMode || undefined,
            isTweet: isTweetMode || undefined,
        };

        const result = await saveNote(newNote);

        if (isTweetMode) {
            // Tweets skip PostWriting — play fly-away animation before returning to Home
            performSaveFlyAwayTransition(() => {
                // Emit streak data via event so Home screen picks it up without re-rendering from param changes
                if (result.streakIncreased) {
                    DeviceEventEmitter.emit('streakIncreased', { newStreak: result.newStreak });
                }
                navigation.dispatch(StackActions.popToTop());
            });
            return;
        }

        // Navigate to PostWriting AI review screen — AI enrichment happens there
        navigation.navigate('PostWriting', {
            noteId: newNote.id,
            streakIncreased: result.streakIncreased,
            newStreak: result.newStreak,
        });
    };

    const difficultyLimit = CONFIG.DIFFICULTIES[diffIndex]?.value || 8000;

    const animatedShakeStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: shakeAnimation.value }],
    }));

    const vaporizeFade = useSharedValue(0);

    useEffect(() => {
        if (isIdle) {
            vaporizeFade.value = withTiming(1, { duration: 350 });
        } else {
            vaporizeFade.value = withTiming(0, { duration: 80 });
        }
    }, [isIdle, vaporizeFade]);

    const textInputStyle = useAnimatedStyle(() => ({
        opacity: 1 - vaporizeFade.value,
    }));

    const vaporizingStyle = useAnimatedStyle(() => ({
        opacity: vaporizeFade.value,
    }));

    const currentFont = CONFIG.FONTS[fontIndex]?.value || (Platform.OS === 'ios' ? 'System' : 'sans-serif');
    const currentSize = CONFIG.SIZES[sizeIndex]?.value || 18;
    const currentLineHeight = CONFIG.SIZES[sizeIndex]?.line || 28;

    // Apply font changes dynamically via setNativeProps to avoid remounting the TextInput
    useEffect(() => {
        const node = inputRef.current;
        if (node) {
            if (Platform.OS === 'android') {
                node.setNativeProps({
                    style: { fontFamily: currentFont, fontSize: currentSize, lineHeight: currentLineHeight },
                });
            } else {
                node.setNativeProps({
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    style: { fontFamily: currentFont, fontSize: currentSize, lineHeight: currentLineHeight } as any,
                });
            }
        }
    }, [currentFont, currentSize, currentLineHeight]);

    const containerStyle = useMemo(() => ({ flex: 1, backgroundColor: 'transparent' }), []);

    return (
        <View style={containerStyle}>
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
                        isDisabled={isQuickNoteMode}
                    />

                    <Animated.View style={[{ flex: 1 }, animatedEditorStyle]}>
                        <Animated.View style={[commonStyles.header, animatedHeaderStyle]}>
                            <Text
                                style={[
                                    commonStyles.wordCount,
                                    isTweetMode && wordCount > TWEET_THRESHOLD - 10 && { color: theme.colors.danger },
                                ]}
                            >
                                {isTweetMode ? `${wordCount} / ${TWEET_THRESHOLD} Words` : `${wordCount} Words`}
                            </Text>
                            {(() => {
                                // For tweet mode, display a premium messaging icon instead of the text "TWEET"
                                if (isTweetMode && !hasLost) {
                                    return (
                                        <MaterialCommunityIcons
                                            name="chat-processing-outline"
                                            size={20}
                                            color={theme.colors.primaryAction}
                                        />
                                    );
                                }
                                const { text, style } = getStatusDisplay(
                                    hasLost,
                                    isQuickNote,
                                    isTweet,
                                    sessionTimeRemaining,
                                );
                                return <Text style={style}>{text}</Text>;
                            })()}
                            {/* [DEV MODE] Skip Timer Button — instantly completes the countdown */}
                            {devMode && sessionTimeRemaining > 0 && !hasLost && !isQuickNoteMode && (
                                <AnimatedScaleButton onPress={skipTimer} style={styles.skipButton}>
                                    <Text style={styles.skipButtonText}>⏩ Skip</Text>
                                </AnimatedScaleButton>
                            )}
                        </Animated.View>

                        <View style={commonStyles.inputWrapper}>
                            <ScrollView
                                keyboardShouldPersistTaps="handled"
                                contentContainerStyle={{ flexGrow: 1, paddingBottom: 150 }}
                                showsVerticalScrollIndicator={false}
                                keyboardDismissMode="interactive"
                            >
                                <Animated.View style={[{ flex: 1 }, textInputStyle]}>
                                    <TextInput
                                        ref={inputRef}
                                        style={[
                                            commonStyles.textInput,
                                            {
                                                flex: 1,
                                                fontSize: currentSize,
                                                lineHeight: currentLineHeight,
                                                fontFamily: currentFont,
                                                fontWeight: 'normal',
                                                textAlignVertical: 'top',
                                                paddingTop: Platform.OS === 'ios' ? 8 : 10,
                                                paddingHorizontal: Platform.OS === 'ios' ? 4 : 6,
                                                paddingBottom: 200, // Ensures text doesn't stay hidden under keyboard
                                                color: theme.colors.textPrimary,
                                            },
                                        ]}
                                        scrollEnabled={false}
                                        multiline
                                        defaultValue=""
                                        onChangeText={handleTextChangeLocal}
                                        placeholder="Keep typing..."
                                        placeholderTextColor={theme.colors.placeholder}
                                        selectionColor={theme.colors.danger}
                                        editable={!hasLost}
                                    />
                                </Animated.View>
                                {isIdle && (
                                    <Animated.View
                                        style={[
                                            StyleSheet.absoluteFillObject,
                                            { pointerEvents: 'none' },
                                            vaporizingStyle,
                                        ]}
                                        pointerEvents="none"
                                    >
                                        <VaporizingText
                                            text={textRef.current}
                                            idleTimeMsShared={idleTimeMsShared}
                                            difficultyLimit={difficultyLimit}
                                            style={[
                                                commonStyles.textInput,
                                                {
                                                    flex: 1,
                                                    fontSize: currentSize,
                                                    lineHeight: currentLineHeight,
                                                    fontFamily: currentFont,
                                                    fontWeight: 'normal',
                                                    textAlignVertical: 'top',
                                                    paddingTop: Platform.OS === 'ios' ? 8 : 10,
                                                    paddingHorizontal: Platform.OS === 'ios' ? 4 : 6,
                                                    paddingBottom: 200,
                                                    color: theme.colors.textPrimary,
                                                },
                                            ]}
                                        />
                                    </Animated.View>
                                )}
                            </ScrollView>
                        </View>

                        {(sessionTimeRemaining === 0 || isContinuingAfterLoss || isQuickNoteMode) && !hasLost && (
                            <Animated.View style={[commonStyles.finishedActionsContainer, animatedHeaderStyle]}>
                                <AnimatedScaleButton
                                    style={[commonStyles.saveActionBtn, { opacity: 0.6 }]}
                                    onPress={handleSave}
                                >
                                    <Text style={commonStyles.saveActionText}>SAVE ENTRY</Text>
                                </AnimatedScaleButton>
                                <AnimatedScaleButton
                                    style={[commonStyles.menuActionBtn, { opacity: 0.6 }]}
                                    onPress={() =>
                                        performExitTransition(() => navigation.dispatch(StackActions.popToTop()))
                                    }
                                >
                                    <Text style={commonStyles.menuActionText}>Return to Menu</Text>
                                </AnimatedScaleButton>
                            </Animated.View>
                        )}
                    </Animated.View>

                    <DeathOverlay
                        lossOverlayOpacity={lossOverlayOpacity}
                        hasLost={hasLost}
                        subtitle="You stopped writing for too long."
                        primaryLabel="Return to Menu"
                        onReturnHome={() => performExitTransition(() => navigation.dispatch(StackActions.popToTop()))}
                        secondaryLabel="I don't care, let me write"
                        onContinueWriting={resumeWritingFreely}
                    />

                    {/* Floating Buttons on Death Screen */}
                    {hasLost && (
                        <Animated.View style={[commonStyles.floatingActionRow, animatedHeaderStyle]}>
                            <AnimatedScaleButton
                                style={commonStyles.floatHomeBtn}
                                onPress={() =>
                                    performExitTransition(() => navigation.dispatch(StackActions.popToTop()))
                                }
                            >
                                <Text style={commonStyles.floatBtnText}>🏠 Menu</Text>
                            </AnimatedScaleButton>
                            <AnimatedScaleButton style={commonStyles.floatSaveBtn} onPress={handleSave}>
                                <Text style={commonStyles.floatBtnText}>💾 Save What's Left</Text>
                            </AnimatedScaleButton>
                        </Animated.View>
                    )}
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

// Extracted from original App.tsx - needed for absolute fill compatibility
export default WritingScreen;

const styles = StyleSheet.create({
    tweetLabel: {
        color: theme.colors.primaryAction,
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 1,
    },
    quickNoteLabel: {
        color: theme.colors.textMuted,
        fontSize: 14,
    },
    winText: {
        color: theme.colors.success,
        fontSize: 18,
        fontWeight: 'bold',
    },
    timerText: {
        color: theme.colors.textDim,
        fontSize: 18,
        fontWeight: 'bold',
    },
    skipButton: {
        backgroundColor: theme.colors.gold,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        marginLeft: 8,
    },
    skipButtonText: {
        color: theme.colors.background,
        fontSize: 12,
        fontWeight: 'bold',
    },
    morphText: {
        fontSize: 18,
        fontWeight: '900',
        letterSpacing: 1,
        fontFamily: theme.typography.fontFamily,
    },
});
