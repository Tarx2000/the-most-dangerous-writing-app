import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    interpolateColor,
    FadeInDown,
} from 'react-native-reanimated';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation.types';
import { commonStyles } from '@/styles/commonStyles';
import { theme } from '@/styles/theme';
import { CONFIG } from '@/config';
import { usePreferences } from '@/lib/hooks/useStorage';
import { VisionBoard } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'VisionBoard'>;

type TabKey = keyof VisionBoard;

const TABS: { key: TabKey; label: string }[] = [
    { key: 'health', label: 'Health' },
    { key: 'career', label: 'Career & Learning' },
    { key: 'relationships', label: 'Relationships' },
    { key: 'mindset', label: 'Mindset' },
];

/** TabPill component for smooth active/inactive color transition */
const TabPill: React.FC<{
    label: string;
    isActive: boolean;
    onPress: () => void;
}> = React.memo(({ label, isActive, onPress }) => {
    const progress = useSharedValue(isActive ? 1 : 0);

    useEffect(() => {
        progress.value = withTiming(isActive ? 1 : 0, { duration: 250 });
    }, [isActive]);

    const animatedStyle = useAnimatedStyle(() => {
        const backgroundColor = interpolateColor(
            progress.value,
            [0, 1],
            [theme.colors.cardBackground, theme.colors.primaryAction],
        );
        return { backgroundColor };
    });

    const animatedTextStyle = useAnimatedStyle(() => {
        const color = interpolateColor(progress.value, [0, 1], [theme.colors.textMuted, theme.colors.background]);
        return { color };
    });

    return (
        <AnimatedScaleButton onPress={onPress}>
            <Animated.View style={[styles.tab, animatedStyle]}>
                <Animated.Text style={[styles.tabText, animatedTextStyle]}>{label}</Animated.Text>
            </Animated.View>
        </AnimatedScaleButton>
    );
});

export const VisionBoardScreen: React.FC<Props> = ({ navigation }) => {
    const { visionBoard, saveVisionBoard, fontIndex, sizeIndex } = usePreferences();

    /** User's chosen typography — applied to personal note content */
    const activeFont = CONFIG.FONTS[fontIndex]?.value || (Platform.OS === 'ios' ? 'System' : 'sans-serif');
    const activeSize = CONFIG.SIZES[sizeIndex]?.value || 18;
    const activeLineHeight = CONFIG.SIZES[sizeIndex]?.line || 28;

    const [activeTab, setActiveTab] = useState<TabKey>('health');
    const localStateRef = useRef<VisionBoard>({
        health: '',
        career: '',
        relationships: '',
        mindset: '',
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
            <KeyboardAvoidingView
                style={commonStyles.safeArea}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <Animated.View
                    style={styles.header}
                    entering={FadeInDown.delay(100).springify().damping(28).stiffness(150)}
                >
                    <Text style={styles.title}>Your Best Self</Text>
                    <AnimatedScaleButton onPress={handleSaveAndExit} style={styles.doneBtn}>
                        <Text style={styles.doneBtnText}>Done</Text>
                    </AnimatedScaleButton>
                </Animated.View>

                {/* Tabs */}
                <Animated.View entering={FadeInDown.delay(180).springify().damping(28).stiffness(150)}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.tabsContainer}
                        style={{ maxHeight: 60 }}
                    >
                        {TABS.map((tab) => (
                            <TabPill
                                key={tab.key}
                                label={tab.label}
                                isActive={activeTab === tab.key}
                                onPress={() => setActiveTab(tab.key)}
                            />
                        ))}
                    </ScrollView>
                </Animated.View>

                {/* Content */}
                <ScrollView contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
                    <Animated.View entering={FadeInDown.delay(260).springify().damping(28).stiffness(150)}>
                        <Text style={[styles.promptText, { fontFamily: activeFont }]}>
                            Describe your ideal state for {TABS.find((t) => t.key === activeTab)?.label?.toLowerCase()}.
                            Who do you want to become?
                        </Text>
                    </Animated.View>
                    <Animated.View
                        style={{ flex: 1 }}
                        entering={FadeInDown.delay(340).springify().damping(28).stiffness(150)}
                    >
                        <TextInput
                            key={activeTab + (visionBoard ? '_loaded' : '_init')}
                            style={[
                                styles.textInput,
                                { fontFamily: activeFont, fontSize: activeSize, lineHeight: activeLineHeight },
                            ]}
                            multiline
                            autoFocus
                            defaultValue={localStateRef.current[activeTab]}
                            onChangeText={handleTextChange}
                            placeholder="My vision is..."
                            placeholderTextColor={theme.colors.placeholder}
                            selectionColor={theme.colors.primaryAction}
                        />
                    </Animated.View>
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
        borderBottomColor: theme.colors.cardBackground,
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
        backgroundColor: theme.colors.cardBackground,
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
        backgroundColor: theme.colors.cardBackground,
    },
    tabText: {
        color: theme.colors.textMuted,
        fontSize: 15,
        fontWeight: '600',
    },
    contentContainer: {
        padding: 20,
        paddingBottom: 40,
        flexGrow: 1,
    },
    promptText: {
        color: theme.colors.textMuted,
        fontSize: 16,
        lineHeight: 24,
        marginBottom: 20,
    },
    textInput: {
        flex: 1,
        color: theme.colors.textPrimary,
        fontSize: 18, // Overridden at render-time with user's preferred size
        lineHeight: 28,
        minHeight: 300,
        textAlignVertical: 'top',
    },
});
