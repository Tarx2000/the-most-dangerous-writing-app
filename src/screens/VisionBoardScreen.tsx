import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation.types';
import { commonStyles } from '@/styles/commonStyles';
import { theme } from '@/styles/theme';
import { useStorage } from '@/lib/hooks/useStorage';
import { VisionBoard } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'VisionBoard'>;

type TabKey = keyof VisionBoard;

const TABS: { key: TabKey, label: string }[] = [
    { key: 'health', label: 'Health' },
    { key: 'career', label: 'Career & Learning' },
    { key: 'relationships', label: 'Relationships' },
    { key: 'mindset', label: 'Mindset' },
];

export const VisionBoardScreen: React.FC<Props> = ({ navigation }) => {
    const { visionBoard, saveVisionBoard } = useStorage();
    const [activeTab, setActiveTab] = useState<TabKey>('health');
    const localStateRef = useRef<VisionBoard>({
        health: '',
        career: '',
        relationships: '',
        mindset: ''
    });
    const [, forceRender] = useState({});

    // Empty map for removed loadAllData call
    useEffect(() => {
        if (visionBoard) {
            localStateRef.current = { ...visionBoard };
            forceRender({});
        }
    }, [visionBoard]);

    /**
     * Auto-save vision board when navigating away.
     * Prevents data loss if user swipes back without tapping Done.
     */
    useEffect(() => {
        const unsubscribe = navigation.addListener('beforeRemove', () => {
            saveVisionBoard(localStateRef.current);
        });
        return unsubscribe;
    }, [navigation, saveVisionBoard]);

    const handleTextChange = (text: string) => {
        localStateRef.current[activeTab] = text;
    };

    const handleSaveAndExit = () => {
        saveVisionBoard(localStateRef.current);
        navigation.goBack();
    };

    return (
        <View style={styles.container}>
            <KeyboardAvoidingView style={commonStyles.safeArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.header}>
                    <Text style={styles.title}>Your Best Self</Text>
                    <AnimatedScaleButton onPress={handleSaveAndExit} style={styles.doneBtn}>
                        <Text style={styles.doneBtnText}>Done</Text>
                    </AnimatedScaleButton>
                </View>

                {/* Tabs */}
                <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false} 
                    contentContainerStyle={styles.tabsContainer}
                    style={{ maxHeight: 60 }}
                >
                    {TABS.map(tab => (
                        <AnimatedScaleButton
                            key={tab.key}
                            style={[styles.tab, activeTab === tab.key && styles.activeTab]}
                            onPress={() => setActiveTab(tab.key)}
                        >
                            <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
                                {tab.label}
                            </Text>
                        </AnimatedScaleButton>
                    ))}
                </ScrollView>

                {/* Content */}
                <ScrollView 
                    contentContainerStyle={styles.contentContainer}
                    keyboardShouldPersistTaps="handled"
                >
                    <Text style={styles.promptText}>
                        Describe your ideal state for {TABS.find(t => t.key === activeTab)?.label?.toLowerCase()}. Who do you want to become?
                    </Text>
                    <TextInput
                        key={activeTab + (visionBoard ? '_loaded' : '_init')}
                        style={styles.textInput}
                        multiline
                        autoFocus
                        defaultValue={localStateRef.current[activeTab]}
                        onChangeText={handleTextChange}
                        placeholder="My vision is..."
                        placeholderTextColor="#666"
                        selectionColor={theme.colors.primaryAction}
                    />
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#222',
        marginTop: Platform.OS === 'ios' ? 0 : 20,
    },
    title: {
        color: theme.colors.textPrimary,
        fontSize: 24,
        fontWeight: 'bold',
        fontFamily: theme.typography.fontFamily,
    },
    doneBtn: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        backgroundColor: '#222',
        borderRadius: 20,
    },
    doneBtnText: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        fontWeight: '600',
    },
    tabsContainer: {
        paddingHorizontal: 15,
        paddingVertical: 10,
        alignItems: 'center',
    },
    tab: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 10,
        backgroundColor: '#111',
    },
    activeTab: {
        backgroundColor: theme.colors.primaryAction,
    },
    tabText: {
        color: '#888',
        fontSize: 15,
        fontWeight: '600',
    },
    activeTabText: {
        color: '#000',
    },
    contentContainer: {
        padding: 20,
        paddingBottom: 40,
        flexGrow: 1,
    },
    promptText: {
        color: '#AAA',
        fontSize: 16,
        lineHeight: 24,
        marginBottom: 20,
        fontFamily: theme.typography.fontFamily,
    },
    textInput: {
        flex: 1,
        color: '#FFF',
        fontSize: 18,
        lineHeight: 28,
        minHeight: 300,
        textAlignVertical: 'top',
        fontFamily: theme.typography.fontFamily,
    }
});
