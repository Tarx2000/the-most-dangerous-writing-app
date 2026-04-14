import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation.types';
import { commonStyles } from '@/styles/commonStyles';
import { theme } from '@/styles/theme';
import { CONFIG } from '@/config';
import { useSession } from '@/lib/hooks/useSession';
import { usePreferences, useStorageActions } from '@/lib/hooks/useStorage';
import { AlignmentReflection } from '@/types';
import { DangerOverlay } from '@/components/features/writing/DangerOverlay';
import { generateId } from '@/lib/utils';

type Props = NativeStackScreenProps<RootStackParamList, 'AlignmentWriting'>;

export const AlignmentWritingScreen: React.FC<Props> = ({ route, navigation }) => {
    const { alignmentScore, timeIndex } = route.params;

    const stopRef = useRef<TextInput>(null);
    const startRef = useRef<TextInput>(null);
    const continueRef = useRef<TextInput>(null);

    const stopText = useRef('');
    const startText = useRef('');
    const continueText = useRef('');

    const DIFF_INDEX = 0; // Force Easy rank for Reflections

    const {
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
    } = useSession(timeIndex, DIFF_INDEX, stopRef);

    const { saveAlignmentReflection } = useStorageActions();
    const { fontIndex, sizeIndex, devMode } = usePreferences();

    useEffect(() => {
        startSession(false);
        return () => clearTimers();
    }, [startSession, clearTimers]);

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

    const handleInput = (type: 'stop'|'start'|'continue', text: string) => {
        handleTextChange(text); // Reset timer
        if (type === 'stop') stopText.current = text;
        if (type === 'start') startText.current = text;
        if (type === 'continue') continueText.current = text;
    };

    const handleSave = async () => {
        const fullText = `Stop:\n${stopText.current}\n\nStart:\n${startText.current}\n\nContinue:\n${continueText.current}`;
        
        // If entirely empty, just abort
        if (!stopText.current.trim() && !startText.current.trim() && !continueText.current.trim()) {
            navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
            return;
        }

        const noteWon = !hasLost && !isContinuingAfterLoss;
        const refObj: AlignmentReflection = {
            id: generateId(),
            text: fullText,
            dateStr: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: Date.now(),
            durationMin: CONFIG.SESSION_OPTIONS_MINS[timeIndex] || 5,
            won: noteWon,
            alignmentScore: alignmentScore,
            stopText: stopText.current,
            startText: startText.current,
            continueText: continueText.current,
            isAlignmentReflection: true,
            isQuickNote: false
        };

        const result = await saveAlignmentReflection(refObj);
        navigation.reset({
            index: 0,
            routes: [{
                name: 'Home',
                params: {
                    streakIncreased: result.streakIncreased,
                    newStreak: result.newStreak
                }
            }]
        });
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
                    isDisabled={false}
                />

                <Animated.View style={[commonStyles.writingContainer, animatedShakeStyle, { zIndex: 3 }]}>
                    <View style={commonStyles.header}>
                        <Text style={commonStyles.wordCount}>Weekly Reflection</Text>
                        <Text style={hasLost ? commonStyles.lossText : sessionTimeRemaining === 0 ? commonStyles.winText : { color: 'rgba(255,255,255,0.4)', fontSize: 18, fontWeight: 'bold' }}>
                            {hasLost ? 'YOU DIED' : sessionTimeRemaining === 0 ? 'YOU SURVIVED' : `${Math.floor(sessionTimeRemaining / 60)}:${(sessionTimeRemaining % 60).toString().padStart(2, '0')}`}
                        </Text>
                        {devMode && sessionTimeRemaining > 0 && !hasLost && (
                            <AnimatedScaleButton onPress={skipTimer} style={{ backgroundColor: '#FFD700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginLeft: 8 }}>
                                <Text style={{ color: '#000', fontSize: 12, fontWeight: 'bold' }}>⏩ Skip</Text>
                            </AnimatedScaleButton>
                        )}
                    </View>

                    <View style={commonStyles.inputWrapper}>
                        <ScrollView
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={{ flexGrow: 1, paddingBottom: 250 }}
                            showsVerticalScrollIndicator={false}
                            keyboardDismissMode="interactive"
                        >
                            <Text style={styles.promptHeader}>STOP</Text>
                            <Text style={styles.promptSub}>What habits or actions pulled you away from your best self this week?</Text>
                            <TextInput
                                ref={stopRef}
                                style={[commonStyles.textInput, { fontSize: currentSize, lineHeight: currentLineHeight, fontFamily: currentFont, minHeight: 120, marginBottom: 30 }]}
                                multiline
                                autoFocus
                                onChangeText={(t) => handleInput('stop', t)}
                                placeholder="I need to stop..."
                                placeholderTextColor="#555"
                                selectionColor={theme.colors.primaryAction}
                                editable={!hasLost}
                            />

                            <Text style={styles.promptHeader}>START</Text>
                            <Text style={styles.promptSub}>What specific action will you take next week to bridge the gap?</Text>
                            <TextInput
                                ref={startRef}
                                style={[commonStyles.textInput, { fontSize: currentSize, lineHeight: currentLineHeight, fontFamily: currentFont, minHeight: 120, marginBottom: 30 }]}
                                multiline
                                onChangeText={(t) => handleInput('start', t)}
                                placeholder="I will start..."
                                placeholderTextColor="#555"
                                selectionColor={theme.colors.primaryAction}
                                editable={!hasLost}
                            />

                            <Text style={styles.promptHeader}>CONTINUE</Text>
                            <Text style={styles.promptSub}>What did you do well? What gave you energy?</Text>
                            <TextInput
                                ref={continueRef}
                                style={[commonStyles.textInput, { fontSize: currentSize, lineHeight: currentLineHeight, fontFamily: currentFont, minHeight: 120, marginBottom: 20 }]}
                                multiline
                                onChangeText={(t) => handleInput('continue', t)}
                                placeholder="I will continue..."
                                placeholderTextColor="#555"
                                selectionColor={theme.colors.primaryAction}
                                editable={!hasLost}
                            />
                        </ScrollView>
                    </View>

                    {(sessionTimeRemaining === 0 || isContinuingAfterLoss) && !hasLost && (
                        <View style={commonStyles.finishedActionsContainer}>
                            <AnimatedScaleButton style={[commonStyles.saveActionBtn, { opacity: 0.6 }]} onPress={handleSave}>
                                <Text style={commonStyles.saveActionText}>SAVE ENTRY</Text>
                            </AnimatedScaleButton>
                        </View>
                    )}
                </Animated.View>

                {/* Death Overlay */}
                <Animated.View pointerEvents={hasLost ? 'auto' : 'none'} style={[commonStyles.deathOverlayLayer, animatedOpacityStyle]}>
                    {hasLost && (
                        <View style={commonStyles.deathContentBox}>
                            <Text style={commonStyles.deathGiant}>YOU DIED</Text>
                            <Text style={commonStyles.deathSub}>You stopped reflecting for too long.</Text>

                            <AnimatedScaleButton style={commonStyles.deathBtnMaster} onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}>
                                <Text style={commonStyles.deathBtnMasterText}>Return to Menu</Text>
                            </AnimatedScaleButton>

                            <AnimatedScaleButton style={commonStyles.deathBtnSecondary} onPress={() => resumeWritingFreely()}>
                                <Text style={commonStyles.deathBtnSecondaryText}>Let me finish my reflection</Text>
                            </AnimatedScaleButton>
                        </View>
                    )}
                </Animated.View>
            </KeyboardAvoidingView>
        </View>
    );
};

const styles = StyleSheet.create({
    promptHeader: { color: theme.colors.primaryAction, fontSize: 16, fontWeight: 'bold', letterSpacing: 2, marginBottom: 5, fontFamily: theme.typography.fontFamily },
    promptSub: { color: '#888', fontSize: 14, marginBottom: 15, fontFamily: theme.typography.fontFamily, lineHeight: 20 }
});
