import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
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
    const { visionBoard, saveVisionBoard, loadAllData } = useStorage();
    const [activeTab, setActiveTab] = useState<TabKey>('health');
    const [localState, setLocalState] = useState<VisionBoard>({
        health: '',
        career: '',
        relationships: '',
        mindset: ''
    });

    useEffect(() => {
        loadAllData();
    }, [loadAllData]);

    useEffect(() => {
        if (visionBoard) {
            setLocalState(visionBoard);
        }
    }, [visionBoard]);

    const handleTextChange = (text: string) => {
        setLocalState(prev => ({ ...prev, [activeTab]: text }));
    };

    const handleSaveAndExit = () => {
        saveVisionBoard(localState);
        navigation.goBack();
    };

    return (
        <View style={styles.container}>
            <KeyboardAvoidingView style={commonStyles.safeArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.header}>
                    <Text style={styles.title}>Your Best Self</Text>
                    <TouchableOpacity onPress={handleSaveAndExit} style={styles.doneBtn}>
                        <Text style={styles.doneBtnText}>Done</Text>
                    </TouchableOpacity>
                </View>

                {/* Tabs */}
                <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false} 
                    contentContainerStyle={styles.tabsContainer}
                    style={{ maxHeight: 60 }}
                >
                    {TABS.map(tab => (
                        <TouchableOpacity
                            key={tab.key}
                            style={[styles.tab, activeTab === tab.key && styles.activeTab]}
                            onPress={() => setActiveTab(tab.key)}
                        >
                            <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
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
                        style={styles.textInput}
                        multiline
                        autoFocus
                        value={localState[activeTab]}
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
        color: '#FFF',
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
        color: '#FFF',
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
