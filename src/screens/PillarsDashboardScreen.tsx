/**
 * PillarsDashboardScreen — Self-tracking Growth Pillars Dashboard.
 *
 * This screen displays the user's active tracking metrics (Pillars), such as
 * sleep quality, focus sessions, or workout routines. Stopping typing during notes
 * allows users to record logs for these pillars.
 *
 * Key Features:
 * 1. Gated on biometric security — Redirects back if notes are locked.
 * 2. Glassmorphism cards — Beautiful AMOLED-compliant translucent components.
 * 3. Mini SVG Sparklines — Graphing the last 7 logs using raw mathematical SVG paths.
 * 4. Inline modal addition — Let's user create custom pillars on-the-fly.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, FadeInUp, FadeOutDown } from 'react-native-reanimated';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    Platform,
    Alert,
    Pressable,
    Switch,
    Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Path, Line } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { RootStackParamList } from '@/types/navigation.types';
import { Pillar, PillarLog } from '@/types';
import { usePillars } from '@/lib/hooks/useStorage';
import { useSecurity } from '@/lib/hooks/useSecurity';
import { theme } from '@/styles/theme';
import { vibrate } from '@/lib/haptics';
import { BaseModal } from '@/components/ui/BaseModal';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { PillarsSettingsPanel } from '@/components/features/settings/PillarsSettingsPanel';

type Props = NativeStackScreenProps<RootStackParamList, 'PillarsDashboard'>;

/* ── CUSTOMIZABLE CONFIGURATION FOR PILLARS ──────────────────────────────── */
const CONFIG = {
    /** Dimension settings for the mini sparkline SVG graphs on each card */
    SPARKLINE_WIDTH: 80,
    SPARKLINE_HEIGHT: 30,
    SPARKLINE_PADDING: 3,

    /** Default days required to graduate an adaptive pillar to weekly scope */
    DEFAULT_ADAPTIVE_DAYS: 14,
};

/* ═══════════════════════════════════════════════════════════════════════════
   SUB-COMPONENT: Sparkline Chart
   ═══════════════════════════════════════════════════════════════════════════ */

interface SparklineProps {
    /** Historical numeric values to plot */
    values: number[];
}

/**
 * Sparkline — Inline SVG trend indicator mapping historical data points.
 *
 * Math explanation:
 * Maps an array of floats (max length 7) into a 2D viewport coordinates box.
 * Min & Max values are computed dynamically to stretch the trend vertically, while
 * keeping a padding offset on top and bottom boundaries to prevent line clipping.
 */
const Sparkline: React.FC<SparklineProps> = React.memo(({ values }) => {
    const width = CONFIG.SPARKLINE_WIDTH;
    const height = CONFIG.SPARKLINE_HEIGHT;
    const padding = CONFIG.SPARKLINE_PADDING;

    // Degrade to dashed flat line if no logs exist
    if (values.length === 0) {
        return (
            <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
                <Line
                    x1={0}
                    y1={height / 2}
                    x2={width}
                    y2={height / 2}
                    stroke={theme.colors.textMuted}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                />
            </Svg>
        );
    }

    // If there is only one log, draw a solid horizontal line across the middle
    if (values.length === 1) {
        return (
            <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
                <Line
                    x1={0}
                    y1={height / 2}
                    x2={width}
                    y2={height / 2}
                    stroke={theme.colors.primaryAction}
                    strokeWidth={2}
                />
            </Svg>
        );
    }

    // Determine scale bounds
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    // If all values are identical (e.g. flat streak), center the line vertically
    if (range === 0) {
        return (
            <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
                <Line
                    x1={0}
                    y1={height / 2}
                    x2={width}
                    y2={height / 2}
                    stroke={theme.colors.primaryAction}
                    strokeWidth={2}
                />
            </Svg>
        );
    }

    // Generate path data using an SVG Bezier/Line mapper
    // Coordinates mapping:
    // X goes from left to right (0 to width) based on index ratio.
    // Y is inverted (0 is top in SVG coordinates) and mapped relative to max/min range.
    const pathData = values
        .map((val, idx) => {
            const x = (idx / (values.length - 1)) * width;
            const normalizedY = (val - min) / range;
            const y = height - padding - normalizedY * (height - padding * 2);
            return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ');

    return (
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <Path
                d={pathData}
                fill="none"
                stroke={theme.colors.primaryAction}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
});

/* ═══════════════════════════════════════════════════════════════════════════
   SUB-COMPONENT: Pillar Card
   ═══════════════════════════════════════════════════════════════════════════ */

interface PillarCardProps {
    item: Pillar;
    /** Triggers refetch on focus or state updates */
    refreshKey: number;
    onPress: () => void;
    onToggleActive: (id: string, isActive: boolean) => void;
}

/**
 * PillarCard — Glassmorphism element detailing a single tracking item.
 *
 * Performance: Wraps database calls locally with clean useEffect triggers,
 * utilizing the parent screen's refreshKey to poll fresh state without global re-renders.
 */
const PillarCard: React.FC<PillarCardProps> = React.memo(({ item, refreshKey, onPress, onToggleActive }) => {
    const { getPillarLogs } = usePillars();
    const [logs, setLogs] = useState<PillarLog[]>([]);

    useEffect(() => {
        let isMounted = true;
        getPillarLogs(item.id)
            .then((res) => {
                if (isMounted) {
                    setLogs(res || []);
                }
            })
            .catch((err) => {
                console.error(`[PillarCard] Failed fetching logs for ${item.id}`, err);
            });
        return () => {
            isMounted = false;
        };
    }, [item.id, getPillarLogs, refreshKey]);

    // Unique days tracked - used for graduation and summary progress
    const uniqueDaysCount = useMemo(() => {
        const dayStrings = logs.map((log) => new Date(log.timestamp).toDateString());
        return new Set(dayStrings).size;
    }, [logs]);

    // Percentage of progress to graduation (0.0 to 1.0)
    const progress = useMemo(() => {
        if (item.scope !== 'adaptive') return 0;
        return Math.min(uniqueDaysCount / (item.adaptiveDays || CONFIG.DEFAULT_ADAPTIVE_DAYS), 1);
    }, [item.scope, item.adaptiveDays, uniqueDaysCount]);

    // Filter and extract numeric values from last 7 logs (sorted by timestamp ascending)
    const last7Values = useMemo(() => {
        const sorted = [...logs].sort((a, b) => a.timestamp - b.timestamp);
        return sorted
            .slice(-7)
            .map((log) => log.valueNum)
            .filter((val): val is number => val !== null);
    }, [logs]);

    // Icon helper matching tracking types
    const getTypeIcon = (type: Pillar['type']) => {
        switch (type) {
            case 'rating':
                return 'star-outline';
            case 'time':
                return 'clock-outline';
            case 'boolean':
                return 'checkbox-marked-circle-outline';
            case 'text':
                return 'text-box-outline';
            default:
                return 'help-circle-outline';
        }
    };

    const opacity = useSharedValue(item.isActive ? 1 : 0.6);
    useEffect(() => {
        opacity.value = withTiming(item.isActive ? 1 : 0.6, { duration: 250 });
    }, [item.isActive]);

    const animatedCardStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
    }));

    return (
        <AnimatedScaleButton onPress={onPress} style={[styles.card, animatedCardStyle]}>
            <View style={styles.cardContent}>
                <View style={styles.cardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <MaterialCommunityIcons
                            name={getTypeIcon(item.type)}
                            size={18}
                            color={theme.colors.textSecondary}
                            style={styles.cardTypeIcon}
                        />
                        <Text style={styles.cardScopeText}>{item.scope.toUpperCase()}</Text>
                    </View>
                    <Switch
                        value={item.isActive}
                        onValueChange={(val) => {
                            vibrate(10);
                            onToggleActive(item.id, val);
                        }}
                        trackColor={{ false: 'rgba(255, 255, 255, 0.08)', true: theme.colors.primaryAction }}
                        thumbColor={
                            Platform.OS === 'ios' ? '#ffffff' : item.isActive ? theme.colors.primaryAction : '#888888'
                        }
                        style={Platform.OS === 'ios' ? { transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] } : undefined}
                    />
                </View>

                <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.title}
                </Text>

                {item.scope === 'adaptive' && (
                    <View style={styles.graduationBox}>
                        <View style={styles.progressBar}>
                            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                        </View>
                        <Text style={styles.graduationText}>
                            {uniqueDaysCount}/{item.adaptiveDays} days to graduate
                        </Text>
                    </View>
                )}
            </View>

            <View style={styles.sparklineContainer}>
                <Sparkline values={last7Values} />
            </View>
        </AnimatedScaleButton>
    );
});

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT: Pillars Dashboard Screen
   ═══════════════════════════════════════════════════════════════════════════ */

export const PillarsDashboardScreen: React.FC<Props> = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { isNotesUnlocked } = useSecurity();
    const { pillars, savePillar, togglePillarActive } = usePillars();

    // Local triggers and states
    const [refreshKey, setRefreshKey] = useState(0);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isSettingsModalVisible, setIsSettingsModalVisible] = useState(false);
    const [isInactiveExpanded, setIsInactiveExpanded] = useState(false);

    // Section grouping freeze states
    const [activePillarIds, setActivePillarIds] = useState<string[]>([]);
    const [pausedPillarIds, setPausedPillarIds] = useState<string[]>([]);
    const [hasInitializedIds, setHasInitializedIds] = useState(false);

    // Form inputs state
    const [title, setTitle] = useState('');
    const [type, setType] = useState<Pillar['type']>('rating');
    const [scope, setScope] = useState<Pillar['scope']>('daily');
    const [adaptiveDaysStr, setAdaptiveDaysStr] = useState(CONFIG.DEFAULT_ADAPTIVE_DAYS.toString());
    const [description, setDescription] = useState('');

    /* ── Biometric Lock Gate ────────────────────────────────────────── */
    // If the biometric lock triggers, pop this screen immediately to protect sensitive logs.
    useEffect(() => {
        if (!isNotesUnlocked) {
            navigation.goBack();
        }
    }, [isNotesUnlocked, navigation]);

    // Force card re-query and un-freeze groups whenever screen becomes focused/re-entered
    useFocusEffect(
        useCallback(() => {
            setRefreshKey((prev) => prev + 1);
            setHasInitializedIds(false);
        }, []),
    );

    // Freeze list partition on focus or when pillars initially finish loading
    useEffect(() => {
        if (!hasInitializedIds && pillars.length > 0) {
            const active = pillars.filter((p) => p.isActive).map((p) => p.id);
            const paused = pillars.filter((p) => !p.isActive).map((p) => p.id);
            setActivePillarIds(active);
            setPausedPillarIds(paused);
            setHasInitializedIds(true);
        }
    }, [pillars, hasInitializedIds]);

    /* ── Form Save Handler ────────────────────────────────────────── */
    const handleCreatePillar = async () => {
        // Dismiss keyboard first to avoid layout fight during creation and modal dismissal
        Keyboard.dismiss();

        const cleanTitle = title.trim();
        if (!cleanTitle) {
            Alert.alert('Title Required', 'Please enter a name for the new growth pillar.');
            return;
        }

        let days = CONFIG.DEFAULT_ADAPTIVE_DAYS;
        if (scope === 'adaptive') {
            const parsed = parseInt(adaptiveDaysStr, 10);
            if (isNaN(parsed) || parsed <= 0) {
                Alert.alert('Invalid Graduation Days', 'Please provide a valid threshold above zero.');
                return;
            }
            days = parsed;
        }

        const newPillar: Pillar = {
            id: Math.random().toString(36).substring(7),
            title: cleanTitle,
            type,
            scope,
            createdAt: Date.now(),
            lastEditedAt: Date.now(),
            adaptiveDays: days,
            isActive: true,
            description: description.trim() || undefined,
            version: 1,
        };

        try {
            await savePillar(newPillar);
            vibrate(15);

            // Add the new pillar ID to activePillarIds so it renders in the active list
            setActivePillarIds((prev) => [newPillar.id, ...prev]);

            // Clean up states
            setTitle('');
            setDescription('');
            setType('rating');
            setScope('daily');
            setAdaptiveDaysStr(CONFIG.DEFAULT_ADAPTIVE_DAYS.toString());
            setIsModalVisible(false);

            // Push refresh trigger
            setRefreshKey((prev) => prev + 1);
        } catch (e) {
            console.error('[PillarsDashboardScreen] Failed creating pillar', e);
            Alert.alert('Error', 'Unable to create this Pillar. Please try again.');
        }
    };

    // Filter active and inactive items for display
    const activeSectionPillars = useMemo(() => {
        // Fallback if state is not partitioned yet
        if (!hasInitializedIds) {
            return pillars.filter((p) => p.isActive);
        }
        return pillars.filter((p) => activePillarIds.includes(p.id));
    }, [pillars, activePillarIds, hasInitializedIds]);

    const pausedSectionPillars = useMemo(() => {
        // Fallback if state is not partitioned yet
        if (!hasInitializedIds) {
            return pillars.filter((p) => !p.isActive);
        }
        return pillars.filter((p) => pausedPillarIds.includes(p.id));
    }, [pillars, pausedPillarIds, hasInitializedIds]);

    const handleToggleActive = async (id: string, isActive: boolean) => {
        try {
            await togglePillarActive(id, isActive);
            setRefreshKey((prev) => prev + 1);
        } catch (e) {
            console.error('Failed to toggle active state', e);
            Alert.alert('Error', 'Failed to toggle Mastery active status.');
        }
    };

    return (
        <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
            {/* Header section with inline '+' action button */}
            <View style={styles.header}>
                <AnimatedScaleButton
                    onPress={() => {
                        vibrate(10);
                        navigation.goBack();
                    }}
                    style={styles.backBtn}
                >
                    <MaterialCommunityIcons name="chevron-left" size={24} color={theme.colors.textPrimary} />
                </AnimatedScaleButton>

                <Text style={styles.title}>Masteries</Text>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <AnimatedScaleButton
                        onPress={() => {
                            vibrate(10);
                            setIsSettingsModalVisible(true);
                        }}
                        style={styles.addBtn}
                    >
                        <MaterialCommunityIcons name="cog-outline" size={24} color={theme.colors.textPrimary} />
                    </AnimatedScaleButton>

                    <AnimatedScaleButton
                        onPress={() => {
                            vibrate(10);
                            setIsModalVisible(true);
                        }}
                        style={styles.addBtn}
                    >
                        <MaterialCommunityIcons name="plus" size={24} color={theme.colors.textPrimary} />
                    </AnimatedScaleButton>
                </View>
            </View>

            {/* Scrollable list of active tracking cards */}
            <ScrollView
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
                showsVerticalScrollIndicator={false}
            >
                {activeSectionPillars.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <MaterialCommunityIcons name="pillar" size={48} color={theme.colors.textMuted} />
                        <Text style={styles.emptyTitle}>No Active Masteries</Text>
                        <Text style={styles.emptySubtitle}>
                            Track your progress. Tap the + icon at the top to create your first mastery check-in.
                        </Text>
                    </View>
                ) : (
                    activeSectionPillars.map((item) => (
                        <PillarCard
                            key={item.id}
                            item={item}
                            refreshKey={refreshKey}
                            onPress={() => {
                                vibrate(10);
                                navigation.navigate('PillarDetail', { pillarId: item.id });
                            }}
                            onToggleActive={handleToggleActive}
                        />
                    ))
                )}

                {/* Collapsible Paused/Inactive Section */}
                {pausedSectionPillars.length > 0 && (
                    <View style={{ marginTop: 24 }}>
                        <Pressable
                            style={styles.pausedHeader}
                            onPress={() => {
                                vibrate(10);
                                setIsInactiveExpanded(!isInactiveExpanded);
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <MaterialCommunityIcons
                                    name="pause-circle-outline"
                                    size={20}
                                    color={theme.colors.textMuted}
                                />
                                <Text style={styles.pausedTitle}>Paused Masteries ({pausedSectionPillars.length})</Text>
                            </View>
                            <MaterialCommunityIcons
                                name={isInactiveExpanded ? 'chevron-up' : 'chevron-down'}
                                size={20}
                                color={theme.colors.textMuted}
                            />
                        </Pressable>

                        {isInactiveExpanded && (
                            <Animated.View
                                entering={FadeInUp.duration(250)}
                                exiting={FadeOutDown.duration(200)}
                                style={{ marginTop: 16 }}
                            >
                                {pausedSectionPillars.map((item) => (
                                    <PillarCard
                                        key={item.id}
                                        item={item}
                                        refreshKey={refreshKey}
                                        onPress={() => {
                                            vibrate(10);
                                            navigation.navigate('PillarDetail', { pillarId: item.id });
                                        }}
                                        onToggleActive={handleToggleActive}
                                    />
                                ))}
                            </Animated.View>
                        )}
                    </View>
                )}
            </ScrollView>

            {/* Slide-Up Custom Modal Sheet */}
            <BaseModal
                visible={isModalVisible}
                onClose={() => {
                    setTitle('');
                    setDescription('');
                    setIsModalVisible(false);
                }}
                title="Create New Mastery"
                height={Platform.OS === 'ios' ? 700 : 660}
            >
                <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                    <Text style={styles.modalLabel}>Mastery Title</Text>
                    <TextInput
                        style={styles.modalInput}
                        value={title}
                        onChangeText={setTitle}
                        placeholder="e.g. Comfort Zone Challenge, Sleep Hygiene..."
                        placeholderTextColor={theme.colors.placeholder}
                        selectionColor={theme.colors.primaryAction}
                    />

                    <Text style={styles.modalLabel}>Guidelines & Details</Text>
                    <TextInput
                        style={[styles.modalInput, { minHeight: 70, textAlignVertical: 'top' }]}
                        value={description}
                        onChangeText={setDescription}
                        placeholder="Detail the rules of this mastery, sources, or custom goals..."
                        placeholderTextColor={theme.colors.placeholder}
                        selectionColor={theme.colors.primaryAction}
                        multiline
                        numberOfLines={3}
                    />

                    <Text style={styles.modalLabel}>Metric Type</Text>
                    <View style={styles.pillRow}>
                        {(['rating', 'time', 'boolean', 'text'] as Pillar['type'][]).map((t) => (
                            <AnimatedScaleButton
                                key={t}
                                style={[styles.modalPill, type === t && styles.modalPillActive]}
                                onPress={() => {
                                    vibrate(8);
                                    setType(t);
                                }}
                            >
                                <Text style={[styles.modalPillText, type === t && styles.modalPillTextActive]}>
                                    {t === 'rating' ? 'Rating (1-10)' : t}
                                </Text>
                            </AnimatedScaleButton>
                        ))}
                    </View>

                    <Text style={styles.modalLabel}>Scope</Text>
                    <View style={styles.pillRow}>
                        {(['daily', 'weekly', 'adaptive'] as Pillar['scope'][]).map((s) => (
                            <AnimatedScaleButton
                                key={s}
                                style={[styles.modalPill, scope === s && styles.modalPillActive]}
                                onPress={() => {
                                    vibrate(8);
                                    setScope(s);
                                }}
                            >
                                <Text style={[styles.modalPillText, scope === s && styles.modalPillTextActive]}>
                                    {s}
                                </Text>
                            </AnimatedScaleButton>
                        ))}
                    </View>

                    {scope === 'adaptive' && (
                        <View style={styles.adaptiveWrapper}>
                            <Text style={styles.modalLabel}>Days to graduate to Weekly</Text>
                            <Text style={styles.adaptiveDescription}>
                                Adaptive masteries begin tracking daily and automatically transition to weekly once this
                                day threshold is met.
                            </Text>
                            <TextInput
                                style={styles.modalInputSmall}
                                value={adaptiveDaysStr}
                                onChangeText={setAdaptiveDaysStr}
                                keyboardType="numeric"
                                placeholder="14"
                                placeholderTextColor={theme.colors.placeholder}
                                selectionColor={theme.colors.primaryAction}
                            />
                        </View>
                    )}

                    <AnimatedScaleButton style={styles.submitButton} onPress={handleCreatePillar}>
                        <Text style={styles.submitButtonText}>CREATE MASTERY</Text>
                    </AnimatedScaleButton>
                </ScrollView>
            </BaseModal>

            {/* Masteries Settings Modal */}
            <BaseModal
                visible={isSettingsModalVisible}
                onClose={() => {
                    setIsSettingsModalVisible(false);
                    setHasInitializedIds(false); // Force groups to re-partition from updated pillars context
                }}
                title="Mastery Settings"
                height={Platform.OS === 'ios' ? 720 : 680}
            >
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 50 }}>
                    <PillarsSettingsPanel />
                </ScrollView>
            </BaseModal>
        </View>
    );
};

/* ═══════════════════════════════════════════════════════════════════════════
   STYLES (AMOLED AMOLED Black System)
   ═══════════════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background, // Pure AMOLED Black (#000)
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: theme.colors.glassBackground,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.glassBorderFaint,
    },
    title: {
        color: theme.colors.textPrimary,
        fontSize: 20,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
    addBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: theme.colors.glassBackground,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.glassBorderFaint,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 16,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 80,
        paddingHorizontal: 30,
    },
    emptyTitle: {
        color: theme.colors.textSecondary,
        fontSize: 18,
        fontWeight: 'bold',
        marginTop: 16,
        marginBottom: 8,
    },
    emptySubtitle: {
        color: theme.colors.textMuted,
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
    },

    /* Card styling */
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: theme.colors.glassBackground,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        borderRadius: theme.borderRadius.md,
        padding: 16,
        marginBottom: 16,
    },
    cardContent: {
        flex: 1,
        marginRight: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    cardTypeIcon: {
        marginRight: 6,
    },
    cardScopeText: {
        color: theme.colors.textMuted,
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 1.2,
    },
    cardTitle: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 4,
    },

    /* Graduation / Progress Box */
    graduationBox: {
        marginTop: 8,
    },
    progressBar: {
        height: 4,
        backgroundColor: theme.colors.glassSurfaceMedium,
        borderRadius: 2,
        overflow: 'hidden',
        marginBottom: 4,
        width: '100%',
    },
    progressFill: {
        height: '100%',
        backgroundColor: theme.colors.primaryAction,
    },
    graduationText: {
        color: theme.colors.textMuted,
        fontSize: 11,
        fontWeight: '500',
    },
    sparklineContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        paddingLeft: 8,
    },

    /* Modal styles */
    modalBody: {
        flex: 1,
        paddingTop: 10,
    },
    modalLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1.2,
        marginBottom: 8,
        marginTop: 16,
    },
    modalInput: {
        backgroundColor: theme.colors.glassSurface,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        borderRadius: theme.borderRadius.sm,
        padding: 14,
        color: theme.colors.textPrimary,
        fontSize: 16,
        marginBottom: 8,
    },
    modalInputSmall: {
        backgroundColor: theme.colors.glassSurface,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        borderRadius: theme.borderRadius.sm,
        padding: 10,
        color: theme.colors.textPrimary,
        fontSize: 16,
        width: 80,
        textAlign: 'center',
        marginTop: 4,
    },
    pillRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 8,
    },
    modalPill: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: theme.borderRadius.round,
        backgroundColor: theme.colors.glassSurface,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
    },
    modalPillActive: {
        backgroundColor: theme.colors.primaryAction,
        borderColor: theme.colors.primaryAction,
    },
    modalPillText: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        fontWeight: '600',
        textTransform: 'capitalize',
    },
    modalPillTextActive: {
        color: theme.colors.textPrimary,
    },
    adaptiveWrapper: {
        marginTop: 4,
    },
    adaptiveDescription: {
        color: theme.colors.textMuted,
        fontSize: 11,
        lineHeight: 16,
        marginBottom: 6,
    },
    submitButton: {
        backgroundColor: theme.colors.primaryAction,
        borderRadius: theme.borderRadius.round,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 28,
        shadowColor: theme.colors.primaryAction,
        shadowOpacity: 0.2,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
    },
    submitButtonText: {
        color: theme.colors.primaryActionText,
        fontSize: 16,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    pausedHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: theme.colors.glassBackground,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        borderRadius: theme.borderRadius.sm,
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    pausedTitle: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
    cardToggleBtn: {
        paddingLeft: 8,
        paddingVertical: 4,
    },
});
