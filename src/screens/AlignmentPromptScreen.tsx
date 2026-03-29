import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation.types';
import { theme } from '@/styles/theme';
import { useStorage } from '@/lib/hooks/useStorage';
import { ScrollView } from 'react-native-gesture-handler';

// Provide a custom slider component using standard React Native touches 
// to ensure perfect compatibility without complex reanimated gesture code 
// that might conflict with versions if not careful.
const CustomSlider = ({ value, onValueChange }: { value: number, onValueChange: (v: number) => void }) => {
    const { width } = Dimensions.get('window');
    const SLIDER_WIDTH = width - 80;
    
    const handleTouch = (event: any) => {
        const x = event.nativeEvent.locationX;
        let percentage = x / SLIDER_WIDTH;
        if (percentage < 0) percentage = 0;
        if (percentage > 1) percentage = 1;
        
        let newValue = Math.round(percentage * 9) + 1; // 1 to 10
        onValueChange(newValue);
    };

    return (
        <View style={sliderStyles.container}>
            <View 
                style={[sliderStyles.trackContainer, { width: SLIDER_WIDTH }]}
                onStartShouldSetResponder={() => true}
                onResponderGrant={handleTouch}
                onResponderMove={handleTouch}
            >
                <View style={sliderStyles.trackBackground} />
                <View style={[sliderStyles.trackFill, { width: `${((value - 1) / 9) * 100}%` }]} />
                <View style={[sliderStyles.thumb, { left: `${((value - 1) / 9) * 100}%` }]} />
            </View>
            <View style={[sliderStyles.labelsContainer, { width: SLIDER_WIDTH }]}>
                <Text style={sliderStyles.labelText}>1</Text>
                <Text style={sliderStyles.labelText}>10</Text>
            </View>
        </View>
    );
};

const sliderStyles = StyleSheet.create({
    container: { alignItems: 'center', marginVertical: 40 },
    trackContainer: { height: 40, justifyContent: 'center' },
    trackBackground: { position: 'absolute', width: '100%', height: 4, backgroundColor: '#333', borderRadius: 2 },
    trackFill: { position: 'absolute', height: 4, backgroundColor: theme.colors.primary, borderRadius: 2 },
    thumb: { position: 'absolute', width: 28, height: 28, backgroundColor: '#FFF', borderRadius: 14, marginTop: -12, marginLeft: -14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5 },
    labelsContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
    labelText: { color: '#666', fontSize: 12, fontWeight: 'bold' }
});

type Props = NativeStackScreenProps<RootStackParamList, 'AlignmentPrompt'>;

export const AlignmentPromptScreen: React.FC<Props> = ({ navigation }) => {
    const { visionBoard, loadAllData } = useStorage();
    const [score, setScore] = useState(5);

    useEffect(() => {
        loadAllData();
    }, [loadAllData]);

    const getEmojiForScore = (s: number) => {
        if (s <= 2) return '😩';
        if (s <= 4) return '😕';
        if (s === 5) return '😐';
        if (s <= 7) return '🙂';
        if (s <= 9) return '😄';
        return '🤩';
    };

    const getTextForScore = (s: number) => {
        if (s <= 2) return 'struggling';
        if (s <= 4) return 'off track';
        if (s === 5) return 'okay';
        if (s <= 7) return 'good';
        if (s <= 9) return 'great';
        return 'perfectly aligned';
    };

    const handleStartReflection = () => {
        // The user approved a default 5-minute session for reflection.
        navigation.navigate('AlignmentWriting', {
            alignmentScore: score,
            sessionTimeSelected: 5 * 60 // 5 minutes in seconds
        });
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
                    <Text style={styles.closeBtnText}>X</Text>
                </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.title}>Weekly Check-in</Text>
                <Text style={styles.subtitle}>How aligned did you feel with your Best Self this week?</Text>

                <View style={styles.emojiContainer}>
                    <Text style={styles.emoji}>{getEmojiForScore(score)}</Text>
                    <Text style={styles.scoreText}>{getTextForScore(score).toUpperCase()}</Text>
                </View>

                <CustomSlider value={score} onValueChange={setScore} />

                {visionBoard && (
                    <View style={styles.visionSnippetsContainer}>
                        <Text style={styles.snippetHeader}>Your Guiding Stars</Text>
                        {visionBoard.health && <Text style={styles.snippetText}>💪 {visionBoard.health.substring(0, 60)}...</Text>}
                        {visionBoard.career && <Text style={styles.snippetText}>🚀 {visionBoard.career.substring(0, 60)}...</Text>}
                        {visionBoard.relationships && <Text style={styles.snippetText}>❤️ {visionBoard.relationships.substring(0, 60)}...</Text>}
                        {visionBoard.mindset && <Text style={styles.snippetText}>🧠 {visionBoard.mindset.substring(0, 60)}...</Text>}
                    </View>
                )}
            </ScrollView>

            <View style={styles.footer}>
                <TouchableOpacity style={styles.startBtn} onPress={handleStartReflection}>
                    <Text style={styles.startBtnText}>Start Reflection (5 Min)</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    header: { alignItems: 'flex-end', padding: 20, paddingTop: 60 },
    closeBtn: { width: 40, height: 40, backgroundColor: '#222', borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    closeBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
    scrollContent: { paddingHorizontal: 30, paddingBottom: 100, alignItems: 'center' },
    title: { color: '#FFF', fontSize: 32, fontWeight: 'bold', marginBottom: 10, fontFamily: theme.typography.families.primary, textAlign: 'center' },
    subtitle: { color: '#AAA', fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 40, fontFamily: theme.typography.families.primary },
    emojiContainer: { alignItems: 'center', justifyContent: 'center', height: 120 },
    emoji: { fontSize: 80 },
    scoreText: { color: theme.colors.primary, fontSize: 18, fontWeight: 'bold', marginTop: 10, letterSpacing: 1 },
    visionSnippetsContainer: { width: '100%', marginTop: 20, padding: 20, backgroundColor: '#111', borderRadius: 16, borderWidth: 1, borderColor: '#222' },
    snippetHeader: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 15, fontFamily: theme.typography.families.primary },
    snippetText: { color: '#888', fontSize: 14, marginBottom: 10, lineHeight: 20 },
    footer: { position: 'absolute', bottom: 0, width: '100%', padding: 30, backgroundColor: 'rgba(0,0,0,0.8)' },
    startBtn: { backgroundColor: theme.colors.primary, paddingVertical: 18, borderRadius: 12, alignItems: 'center' },
    startBtnText: { color: '#000', fontSize: 18, fontWeight: 'bold' }
});
