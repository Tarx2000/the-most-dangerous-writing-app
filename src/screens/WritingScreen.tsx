import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Pressable
} from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation.types';;
import { commonStyles } from '@/styles/commonStyles';
import { CONFIG } from '@/config';
import { useSession } from '@/lib/hooks/useSession';
import { useStorage } from '@/lib/hooks/useStorage';
import { SavedNote } from '@/types';;
import { DangerOverlay } from '@/components/features/writing/DangerOverlay';
import { theme } from '@/styles/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Writing'>;

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

    const { saveNote, fontIndex, sizeIndex, loadAllData, devMode } = useStorage();

    // On mount, start the session immediately and load storage
    useEffect(() => {
        loadAllData();
        startSession(isQuickNote);
        return () => clearTimers();
    }, [startSession, clearTimers, loadAllData, isQuickNote]);

    const handleSave = async () => {
        const currentText = textRef.current;
        if (currentText.trim().length === 0) {
            navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
            return;
        }

        const noteWon = !hasLost && !isContinuingAfterLoss;
        const newNote: SavedNote = {
            id: Date.now().toString(),
            text: currentText,
            dateStr: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: Date.now(),
            durationMin: isQuickNote ? 0 : sessionTimeSelected / 60,
            won: noteWon,
            ...(mode === 'circles' && personId ? { personId } : {}),
            isQuickNote // We can optionally add this to the note data struct but durationMin=0 essentially serves that purpose
        };

        const result = await saveNote(newNote);
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

    const difficultyLimit = CONFIG.DIFFICULTIES[diffIndex]?.value || 8000;
    
    const handleTextChangeLocal = (newText: string) => {
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
                        <Text style={hasLost ? commonStyles.lossText : (sessionTimeRemaining === 0 && !isQuickNote) ? commonStyles.winText : isQuickNote ? { color: theme.colors.textMuted, fontSize: 14 } : { color: 'rgba(255,255,255,0.4)', fontSize: 18, fontWeight: 'bold' }}>
                            {hasLost ? 'YOU DIED' : isQuickNote ? 'QUICK NOTE' : sessionTimeRemaining === 0 ? 'YOU SURVIVED' : `${Math.floor(sessionTimeRemaining / 60)}:${(sessionTimeRemaining % 60).toString().padStart(2, '0')}`}
                        </Text>
                        {/* [DEV MODE] Skip Timer Button — instantly completes the countdown */}
                        {devMode && sessionTimeRemaining > 0 && !hasLost && !isQuickNote && (
                            <TouchableOpacity
                                onPress={skipTimer}
                                style={{ backgroundColor: '#FFD700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginLeft: 8 }}
                            >
                                <Text style={{ color: '#000', fontSize: 12, fontWeight: 'bold' }}>⏩ Skip</Text>
                            </TouchableOpacity>
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
                                style={[commonStyles.textInput, {
                                    flex: 1,
                                    fontSize: currentSize,
                                    lineHeight: currentLineHeight,
                                    fontFamily: currentFont,
                                    textAlignVertical: 'top',
                                    paddingBottom: 200 // Ensures text doesn't stay hidden under keyboard
                                }]}
                                scrollEnabled={false}
                                multiline
                                autoFocus
                                defaultValue=""
                                onChangeText={handleTextChangeLocal}
                                placeholder="Keep typing..."
                                placeholderTextColor="#555"
                                selectionColor="#ff4d4d"
                                editable={!hasLost}
                            />
                        </ScrollView>
                    </View>

                    {(sessionTimeRemaining === 0 || isContinuingAfterLoss || isQuickNote) && !hasLost && (
                        <View style={commonStyles.finishedActionsContainer}>
                            <TouchableOpacity style={[commonStyles.saveActionBtn, { opacity: 0.6 }]} onPress={handleSave}>
                                <Text style={commonStyles.saveActionText}>SAVE ENTRY</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[commonStyles.menuActionBtn, { opacity: 0.6 }]} onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}>
                                <Text style={commonStyles.menuActionText}>Return to Menu</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </Animated.View>

                {/* Death Overlay */}
                <Animated.View pointerEvents={hasLost ? 'auto' : 'none'} style={[commonStyles.deathOverlayLayer, animatedOpacityStyle]}>
                    {hasLost && (
                        <View style={commonStyles.deathContentBox}>
                            <Text style={commonStyles.deathGiant}>YOU DIED</Text>
                            <Text style={commonStyles.deathSub}>You stopped writing for too long.</Text>

                            <TouchableOpacity style={commonStyles.deathBtnMaster} onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}>
                                <Text style={commonStyles.deathBtnMasterText}>Return to Output</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={commonStyles.deathBtnSecondary} onPress={() => resumeWritingFreely()}>
                                <Text style={commonStyles.deathBtnSecondaryText}>I don't care, let me write</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </Animated.View>

                {/* Floating Buttons on Death Screen */}
                {hasLost && (
                    <View style={commonStyles.floatingActionRow}>
                        <TouchableOpacity style={commonStyles.floatHomeBtn} onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}>
                            <Text style={commonStyles.floatBtnText}>🏠 Menu</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={commonStyles.floatSaveBtn} onPress={handleSave}>
                            <Text style={commonStyles.floatBtnText}>💾 Save What's Left</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </KeyboardAvoidingView>
        </View>
    );
};

// Extracted from original App.tsx - needed for absolute fill compatibility
export default WritingScreen;
