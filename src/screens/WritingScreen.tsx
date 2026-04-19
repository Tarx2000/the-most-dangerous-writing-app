import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Pressable,
    Vibration,
    DeviceEventEmitter
} from 'react-native';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation.types';
import { commonStyles } from '@/styles/commonStyles';
import { CONFIG } from '@/config';
import { useSession } from '@/lib/hooks/useSession';
import { useNotes, usePreferences } from '@/lib/hooks/useStorage';
import { SavedNote } from '@/types';
import { DangerOverlay } from '@/components/features/writing/DangerOverlay';
import { DeathOverlay } from '@/components/features/writing/DeathOverlay';
import { theme } from '@/styles/theme';
import { generateId, formatSessionDate } from '@/lib/utils';

type Props = NativeStackScreenProps<RootStackParamList, 'Writing'>;

/** Derive the status label and style based on session state */
function getStatusDisplay(hasLost: boolean, isQuickNote: boolean, timeRemaining: number) {
    if (hasLost) return { text: 'YOU DIED', style: commonStyles.lossText };
    if (isQuickNote) return { text: 'QUICK NOTE', style: styles.quickNoteLabel };
    if (timeRemaining === 0) return { text: 'YOU SURVIVED', style: styles.winText };
    const mins = Math.floor(timeRemaining / 60);
    const secs = (timeRemaining % 60).toString().padStart(2, '0');
    return { text: `${mins}:${secs}`, style: commonStyles.timerText };
}

export const WritingScreen: React.FC<Props> = ({ route, navigation }) => {
    const { timeIndex, diffIndex, mode, personId, isQuickNote } = route.params;

    const inputRef = React.useRef<TextInput>(null);
    const [wordCount, setWordCount] = useState(0);

    const {
        textRef,
        sessionTimeSelected,
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
        skipTimer
    } = useSession(timeIndex, diffIndex, inputRef);

    const { saveNote } = useNotes();
    const { fontIndex, sizeIndex, devMode } = usePreferences();

    // On mount, start the session immediately
    useEffect(() => {
        startSession(isQuickNote);
        Vibration.vibrate(50);
        return () => clearTimers();
    }, [startSession, clearTimers, isQuickNote]);

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
            durationMin: isQuickNote ? 0 : sessionTimeSelected / 60,
            won: noteWon,
            ...(mode === 'circles' && personId ? { personId } : {}),
            isQuickNote
        };

        const result = await saveNote(newNote);

        // Navigate to PostWriting AI review screen — AI enrichment happens there
        // We use 'navigate' instead of 'reset' so the WritingScreen stays in the background
        // beneath the transparent modal presentation of PostWriting.
        navigation.navigate('PostWriting', {
            noteId: newNote.id,
            streakIncreased: result.streakIncreased,
            newStreak: result.newStreak,
        });
    };

    const difficultyLimit = CONFIG.DIFFICULTIES[diffIndex]?.value || 8000;
    
    const handleTextChangeLocal = (newText: string) => {
        DeviceEventEmitter.emit('RESET_LOCK_TIMER');
        handleTextChange(newText);
        const newWordCount = newText.trim().split(/\s+/).filter(w => w.length > 0).length;
        if (newWordCount !== wordCount) {
            setWordCount(newWordCount);
        }
    };

    const animatedShakeStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: shakeAnimation.value }]
    }));

    const animatedOpacityStyle = useAnimatedStyle(() => ({
        opacity: lossOverlayOpacity.value
    }));

    const currentFont = CONFIG.FONTS[fontIndex]?.value || (Platform.OS === 'ios' ? 'System' : 'sans-serif');
    const currentSize = CONFIG.SIZES[sizeIndex]?.value || 18;
    const currentLineHeight = CONFIG.SIZES[sizeIndex]?.line || 28;

    return (
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
            <KeyboardAvoidingView style={commonStyles.safeArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <DangerOverlay
                    idleTimeMsShared={idleTimeMsShared}
                    difficultyLimit={difficultyLimit}
                    hasLost={hasLost}
                    isContinuingAfterLoss={isContinuingAfterLoss}
                    sessionTimeRemaining={sessionTimeRemaining}
                    isDisabled={isQuickNote}
                />

                <Animated.View style={[commonStyles.writingContainer, animatedShakeStyle, { zIndex: 3 }]}>
                    <View style={commonStyles.header}>
                        <Text style={commonStyles.wordCount}>{wordCount} Words</Text>
                        {(() => {
                            const { text, style } = getStatusDisplay(hasLost, isQuickNote, sessionTimeRemaining);
                            return <Text style={style}>{text}</Text>;
                        })()}
                        {/* [DEV MODE] Skip Timer Button — instantly completes the countdown */}
                        {devMode && sessionTimeRemaining > 0 && !hasLost && !isQuickNote && (
                            <AnimatedScaleButton
                                onPress={skipTimer}
                                style={styles.skipButton}
                            >
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
                                key={`input_${currentFont}`}
                                ref={(node) => {
                                    inputRef.current = node;
                                    if (Platform.OS === 'android' && node) {
                                        node.setNativeProps({ style: { fontFamily: currentFont } });
                                    }
                                }}
                                style={[commonStyles.textInput, {
                                    flex: 1,
                                    fontSize: currentSize,
                                    lineHeight: currentLineHeight,
                                    fontFamily: currentFont,
                                    fontWeight: 'normal',
                                    textAlignVertical: 'top',
                                    paddingBottom: 200 // Ensures text doesn't stay hidden under keyboard
                                }]}
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

                    {(sessionTimeRemaining === 0 || isContinuingAfterLoss || isQuickNote) && !hasLost && (
                        <View style={commonStyles.finishedActionsContainer}>
                            <AnimatedScaleButton style={[commonStyles.saveActionBtn, { opacity: 0.6 }]} onPress={handleSave}>
                                <Text style={commonStyles.saveActionText}>SAVE ENTRY</Text>
                            </AnimatedScaleButton>
                            <AnimatedScaleButton style={[commonStyles.menuActionBtn, { opacity: 0.6 }]} onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}>
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
                        <AnimatedScaleButton style={commonStyles.floatHomeBtn} onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}>
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
    quickNoteLabel: {
        color: theme.colors.textMuted,
        fontSize: 14,
    },
    winText: {
        color: theme.colors.success,
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
});
