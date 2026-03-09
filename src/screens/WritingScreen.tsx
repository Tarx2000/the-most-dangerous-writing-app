import React, { useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Animated,
    StyleSheet
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { commonStyles } from '../styles/commonStyles';
import { CONFIG } from '../config';
import { useSession } from '../hooks/useSession';
import { useStorage } from '../hooks/useStorage';
import { SavedNote } from '../types';
import { DangerOverlay } from '../components/DangerOverlay';
import { theme } from '../styles/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Writing'>;

export const WritingScreen: React.FC<Props> = ({ route, navigation }) => {
    const { timeIndex, diffIndex, mode, personId } = route.params;

    const {
        text,
        sessionTimeSelected,
        sessionTimeRemaining,
        idleTimeMs,
        hasLost,
        isContinuingAfterLoss,
        shakeAnimation,
        lossOverlayOpacity,
        startSession,
        handleTextChange,
        resumeWritingFreely,
        clearTimers
    } = useSession(timeIndex, diffIndex);

    const { saveNote, fontIndex, sizeIndex, loadAllData } = useStorage();

    // On mount, start the session immediately and load storage
    useEffect(() => {
        loadAllData();
        startSession();
        return () => clearTimers();
    }, [startSession, clearTimers, loadAllData]);

    const handleSave = async () => {
        if (text.trim().length === 0) {
            navigation.navigate('Start');
            return;
        }

        const noteWon = !hasLost && !isContinuingAfterLoss;
        const newNote: SavedNote = {
            id: Date.now().toString(),
            text,
            dateStr: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: Date.now(),
            durationMin: sessionTimeSelected / 60,
            won: noteWon,
            ...(mode === 'circles' && personId ? { personId } : {}),
        };

        await saveNote(newNote);
        navigation.navigate('Library');
    };

    const difficultyLimit = CONFIG.DIFFICULTIES[diffIndex]?.value || 8000;
    const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;

    const currentFont = CONFIG.FONTS[fontIndex]?.value || (Platform.OS === 'ios' ? 'System' : 'sans-serif');
    const currentSize = CONFIG.SIZES[sizeIndex]?.value || 18;
    const currentLineHeight = CONFIG.SIZES[sizeIndex]?.line || 28;

    return (
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
            <KeyboardAvoidingView style={commonStyles.safeArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <DangerOverlay
                    idleTimeMs={idleTimeMs}
                    difficultyLimit={difficultyLimit}
                    hasLost={hasLost}
                    isContinuingAfterLoss={isContinuingAfterLoss}
                    sessionTimeRemaining={sessionTimeRemaining}
                />

                <Animated.View style={[commonStyles.writingContainer, { transform: [{ translateX: shakeAnimation }], zIndex: 3 }]}>
                    <View style={commonStyles.header}>
                        <Text style={commonStyles.wordCount}>{wordCount} Words</Text>
                        <Text style={hasLost ? commonStyles.lossText : sessionTimeRemaining === 0 ? commonStyles.winText : { color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
                            {hasLost ? 'YOU DIED' : sessionTimeRemaining === 0 ? 'YOU SURVIVED' : `${Math.floor(sessionTimeRemaining / 60)}:${(sessionTimeRemaining % 60).toString().padStart(2, '0')}`}
                        </Text>
                    </View>

                    <View style={commonStyles.inputWrapper}>
                        <ScrollView
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={{ flexGrow: 1 }}
                            showsVerticalScrollIndicator={false}
                        >
                            <TextInput
                                style={[commonStyles.textInput, {
                                    fontSize: currentSize,
                                    lineHeight: currentLineHeight,
                                    fontFamily: currentFont
                                }]}
                                multiline
                                autoFocus
                                value={text}
                                onChangeText={handleTextChange}
                                placeholder="Keep typing..."
                                placeholderTextColor="#555"
                                selectionColor="#ff4d4d"
                                editable={!hasLost}
                            />
                        </ScrollView>
                    </View>

                    {(sessionTimeRemaining === 0 || isContinuingAfterLoss) && !hasLost && (
                        <View style={commonStyles.finishedActionsContainer}>
                            <TouchableOpacity style={commonStyles.saveActionBtn} onPress={handleSave}>
                                <Text style={commonStyles.saveActionText}>SAVE ENTRY</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={commonStyles.menuActionBtn} onPress={() => navigation.navigate('Start')}>
                                <Text style={commonStyles.menuActionText}>Abandon & Return to Menu</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </Animated.View>

                {/* Death Overlay */}
                <Animated.View style={[commonStyles.deathOverlayLayer, { opacity: lossOverlayOpacity }]}>
                    {hasLost && (
                        <View style={commonStyles.deathContentBox}>
                            <Text style={commonStyles.deathGiant}>YOU DIED</Text>
                            <Text style={commonStyles.deathSub}>You stopped writing for too long.</Text>

                            <TouchableOpacity style={commonStyles.deathBtnMaster} onPress={() => navigation.navigate('Start')}>
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
                        <TouchableOpacity style={commonStyles.floatHomeBtn} onPress={() => navigation.navigate('Start')}>
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
