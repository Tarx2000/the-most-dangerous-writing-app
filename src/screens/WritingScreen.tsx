import React, { useEffect, useRef, useMemo } from 'react';
import {
    View,
    Text,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    DeviceEventEmitter,
} from 'react-native';
import { vibrate } from '@/lib/haptics';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
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

type Props = NativeStackScreenProps<RootStackParamList, 'Writing'>;

/** Derive the status label and style based on session state */
function getStatusDisplay(hasLost: boolean, isQuickNote: boolean | undefined, isTweet: boolean | undefined, timeRemaining: number) {
    if (hasLost) return { text: 'YOU DIED', style: commonStyles.lossText };
    if (isTweet) return { text: 'TWEET', style: styles.tweetLabel };
    if (isQuickNote) return { text: 'QUICK NOTE', style: styles.quickNoteLabel };
    if (timeRemaining === 0) return { text: 'YOU SURVIVED', style: styles.winText };
    const mins = Math.floor(timeRemaining / 60);
    const secs = (timeRemaining % 60).toString().padStart(2, '0');
    return { text: `${mins}:${secs}`, style: styles.timerText };
}

export const WritingScreen: React.FC<Props> = ({ route, navigation }) => {
    const { timeIndex, diffIndex, mode, personId, isQuickNote, isTweet } = route.params;
    const isTweetMode = isTweet === true;
    const isQuickNoteMode = isQuickNote === true || isTweetMode; // tweets behave like quick notes

    const inputRef = useRef<TextInput>(null);
    const lastTimerResetRef = useRef(0);

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
    } = useSession(timeIndex, diffIndex, inputRef);

    const { saveNote } = useNotes();
    const { fontIndex, sizeIndex, devMode } = usePreferences();

    // On mount, start the session immediately
    useEffect(() => {
        startSession(isQuickNoteMode);
        vibrate(50);
        return () => {
            clearTimers();
        };
    }, [startSession, clearTimers, isQuickNoteMode]);

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
            navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
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
            // Tweets skip PostWriting — no AI processing needed
            navigation.reset({
                index: 0,
                routes: [
                    {
                        name: 'Home',
                        params: result.streakIncreased
                            ? { streakIncreased: true, newStreak: result.newStreak }
                            : undefined,
                    },
                ],
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

    /** Memoize inline style objects to prevent new references on every render */
    const containerStyle = useMemo(() => ({ flex: 1, backgroundColor: theme.colors.background }), []);

    return (
        <View style={containerStyle}>
            <KeyboardAvoidingView
                style={commonStyles.safeArea}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <DangerOverlay
                    idleTimeMsShared={idleTimeMsShared}
                    difficultyLimit={difficultyLimit}
                    hasLost={hasLost}
                    isContinuingAfterLoss={isContinuingAfterLoss}
                    sessionTimeRemaining={sessionTimeRemaining}
                    isDisabled={isQuickNoteMode}
                />

                <Animated.View style={[commonStyles.writingContainer, animatedShakeStyle, { zIndex: 3 }]}>
                    <View style={commonStyles.header}>
                        <Text style={[commonStyles.wordCount, isTweetMode && wordCount > TWEET_THRESHOLD - 10 && { color: theme.colors.danger }]}>
                            {isTweetMode ? `${wordCount} / ${TWEET_THRESHOLD} Words` : `${wordCount} Words`}
                        </Text>
                        {(() => {
                            const { text, style } = getStatusDisplay(hasLost, isQuickNote, isTweet, sessionTimeRemaining);
                            return <Text style={style}>{text}</Text>;
                        })()}
                        {/* [DEV MODE] Skip Timer Button — instantly completes the countdown */}
                        {devMode && sessionTimeRemaining > 0 && !hasLost && !isQuickNoteMode && (
                            <AnimatedScaleButton onPress={skipTimer} style={styles.skipButton}>
                                <Text style={styles.skipButtonText}>⏩ Skip</Text>
                            </AnimatedScaleButton>
                        )}
                    </View>

                    <View style={commonStyles.inputWrapper}>
                        <ScrollView
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={{ flexGrow: 1, paddingBottom: 150 }}
                            showsVerticalScrollIndicator={false}
                            keyboardDismissMode="interactive"
                        >
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
                                        paddingBottom: 200, // Ensures text doesn't stay hidden under keyboard
                                    },
                                ]}
                                scrollEnabled={false}
                                multiline
                                autoFocus
                                defaultValue=""
                                onChangeText={handleTextChangeLocal}
                                placeholder="Keep typing..."
                                placeholderTextColor={theme.colors.placeholder}
                                selectionColor={theme.colors.danger}
                                editable={!hasLost}
                            />
                        </ScrollView>
                    </View>

                    {isTweetMode && !hasLost && (
                        <View style={styles.tweetProgressContainer}>
                            <View style={styles.tweetProgressTrack}>
                                <View style={[styles.tweetProgressFill, {
                                    width: `${Math.min(100, (wordCount / TWEET_THRESHOLD) * 100)}%`,
                                    backgroundColor: wordCount >= TWEET_THRESHOLD ? theme.colors.danger : theme.colors.primaryAction,
                                }]} />
                            </View>
                            <Text style={[styles.tweetProgressText, wordCount >= TWEET_THRESHOLD && { color: theme.colors.danger }]}>
                                {wordCount >= TWEET_THRESHOLD ? 'Maximum length reached' : `${TWEET_THRESHOLD - wordCount} words left`}
                            </Text>
                        </View>
                    )}

                    {(sessionTimeRemaining === 0 || isContinuingAfterLoss || isQuickNoteMode) && !hasLost && (
                        <View style={commonStyles.finishedActionsContainer}>
                            <AnimatedScaleButton
                                style={[commonStyles.saveActionBtn, { opacity: 0.6 }]}
                                onPress={handleSave}
                            >
                                <Text style={commonStyles.saveActionText}>SAVE ENTRY</Text>
                            </AnimatedScaleButton>
                            <AnimatedScaleButton
                                style={[commonStyles.menuActionBtn, { opacity: 0.6 }]}
                                onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}
                            >
                                <Text style={commonStyles.menuActionText}>Return to Menu</Text>
                            </AnimatedScaleButton>
                        </View>
                    )}
                </Animated.View>

                <DeathOverlay
                    lossOverlayOpacity={lossOverlayOpacity}
                    hasLost={hasLost}
                    subtitle="You stopped writing for too long."
                    primaryLabel="Return to Menu"
                    onReturnHome={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}
                    secondaryLabel="I don't care, let me write"
                    onContinueWriting={resumeWritingFreely}
                />

                {/* Floating Buttons on Death Screen */}
                {hasLost && (
                    <View style={commonStyles.floatingActionRow}>
                        <AnimatedScaleButton
                            style={commonStyles.floatHomeBtn}
                            onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}
                        >
                            <Text style={commonStyles.floatBtnText}>🏠 Menu</Text>
                        </AnimatedScaleButton>
                        <AnimatedScaleButton style={commonStyles.floatSaveBtn} onPress={handleSave}>
                            <Text style={commonStyles.floatBtnText}>💾 Save What's Left</Text>
                        </AnimatedScaleButton>
                    </View>
                )}
            </KeyboardAvoidingView>
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
    tweetProgressContainer: {
        position: 'absolute',
        bottom: 20,
        left: 20,
        right: 20,
        zIndex: 10,
        alignItems: 'center',
    },
    tweetProgressTrack: {
        width: '100%',
        height: 4,
        backgroundColor: theme.colors.glassSurface,
        borderRadius: 2,
        overflow: 'hidden',
    },
    tweetProgressFill: {
        height: '100%',
        borderRadius: 2,
    },
    tweetProgressText: {
        color: theme.colors.textMuted,
        fontSize: 11,
        fontWeight: '600',
        marginTop: 4,
    },
});
