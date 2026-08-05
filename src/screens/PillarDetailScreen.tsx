/**
 * PillarDetailScreen — Analytics & Reflections for Alignment Pillars
 *
 * This screen displays a detailed historical view of a user's logged metrics
 * for a specific custom Pillar. It renders a beautiful custom SVG trend graph
 * of the last 30 data points with smooth horizontal scrubbing gestures,
 * accompanied by haptic feedback. Below the analytics, it lists all written
 * notes and reflections tied to this pillar, letting the user view, delete,
 * or trigger AI summary updates.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    useWindowDimensions,
    FlatList,
    Platform,
    ActivityIndicator,
    TextInput,
    Alert,
    Pressable,
    ScrollView,
    Keyboard,
} from 'react-native';
import { BaseModal } from '@/components/ui/BaseModal';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation.types';
import { theme } from '@/styles/theme';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { usePillars, useNotes } from '@/lib/hooks/useStorage';
import { useAiQueueContext } from '@/lib/hooks/useAiQueueProvider';
import { NoteCard } from '@/components/features/library/NoteCard';
import { NoteViewerModal } from '@/components/features/library/NoteViewerModal';
import { vibrate } from '@/lib/haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, Line } from 'react-native-svg';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    runOnJS,
    FadeInUp,
    FadeOutDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SavedNote, AiJobCategory, PillarLog, Pillar } from '@/types';

// Customizable configuration variables for dimensions and animations
const CONFIG = {
    GRAPH_HEIGHT: 180,
    GRAPH_PADDING_Y: 20,
    MAX_LOG_POINTS: 30, // Connect last 30 log data points directly
    BUBBLE_WIDTH: 130,
    SPRING_CONFIG: { damping: 25, stiffness: 180 }, // highly-damped spring for clean transitions
};

type Props = NativeStackScreenProps<RootStackParamList, 'PillarDetail'>;

export const PillarDetailScreen: React.FC<Props> = ({ route, navigation }) => {
    const { pillarId } = route.params;
    const insets = useSafeAreaInsets();
    const { width: SCREEN_WIDTH } = useWindowDimensions();

    /* ── DOMAIN STATE & HOOKS ────────────────────────────────────────────── */
    const { pillars, getPillarLogs, savePillar, deletePillar, getPillarVersion } = usePillars();
    const { savedNotes, deleteNote } = useNotes();
    const { isNoteActive, enqueueNote, queueState } = useAiQueueContext();

    // Fetch the target pillar from context
    const pillar = useMemo(() => pillars.find((p) => p.id === pillarId), [pillars, pillarId]);

    // Logs history state
    const [logs, setLogs] = useState<PillarLog[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(true);

    // Note viewer modal state
    const [selectedNote, setSelectedNote] = useState<SavedNote | null>(null);

    // Expand/Collapse description guidelines
    const [descExpanded, setDescExpanded] = useState(false);

    // Edit Mastery states
    const [isEditModalVisible, setIsEditModalVisible] = useState(false);
    const [editTitle, setEditTitle] = useState(pillar?.title || '');
    const [editDescription, setEditDescription] = useState(pillar?.description || '');
    const [editScope, setEditScope] = useState(pillar?.scope || 'daily');
    const [editAdaptiveDaysStr, setEditAdaptiveDaysStr] = useState(pillar?.adaptiveDays?.toString() || '14');

    // Callback when pressing a note's version tag
    const handleVersionPress = useCallback(
        async (note: SavedNote) => {
            if (!note.pillarId) return;
            const version = note.pillarVersion || 1;
            try {
                vibrate(10);
                const verPrompt = await getPillarVersion(note.pillarId, version);
                if (verPrompt) {
                    Alert.alert(
                        `Mastery Definition (v${version})`,
                        `Title: ${verPrompt.title}\n\nGuidelines:\n${verPrompt.description || 'No guidelines recorded for this version.'}`,
                        [{ text: 'Close', style: 'cancel' }],
                    );
                } else {
                    const currentPillar = pillars.find((p) => p.id === note.pillarId);
                    Alert.alert(
                        `Mastery Definition (v${version})`,
                        `Title: ${currentPillar?.title || 'Unknown'}\n\nGuidelines:\n${currentPillar?.description || 'No guidelines.'}`,
                        [{ text: 'Close', style: 'cancel' }],
                    );
                }
            } catch (err) {
                console.error('Failed to fetch prompt version', err);
            }
        },
        [getPillarVersion, pillars],
    );

    // Synchronize editing form states only when the modal is opened.
    // Overwriting form states mid-edit (e.g. on every database sync or pillar change)
    // causes focus loss, keyboard height jumps, and screen flickering.
    useEffect(() => {
        if (isEditModalVisible && pillar) {
            setEditTitle(pillar.title);
            setEditDescription(pillar.description || '');
            setEditScope(pillar.scope);
            setEditAdaptiveDaysStr(pillar.adaptiveDays.toString());
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEditModalVisible]);

    // Edit Mastery save handler
    const handleUpdatePillar = async () => {
        if (!pillar) return;

        // Dismiss keyboard first to avoid layout fight during saving and modal dismissal
        Keyboard.dismiss();

        const cleanTitle = editTitle.trim();
        if (!cleanTitle) {
            Alert.alert('Error', 'Mastery title cannot be empty.');
            return;
        }

        let days = pillar.adaptiveDays;
        if (editScope === 'adaptive') {
            const parsed = parseInt(editAdaptiveDaysStr, 10);
            if (isNaN(parsed) || parsed <= 0) {
                Alert.alert('Error', 'Please enter a valid graduation day threshold.');
                return;
            }
            days = parsed;
        }

        const updatedPillar = {
            ...pillar,
            title: cleanTitle,
            scope: editScope,
            adaptiveDays: days,
            description: editDescription.trim() || undefined,
            lastEditedAt: Date.now(), // update rules timestamp
        };

        try {
            await savePillar(updatedPillar);
            vibrate(15);
            setIsEditModalVisible(false);
        } catch (err) {
            console.error('Failed to update mastery', err);
            Alert.alert('Error', 'Failed to update Mastery details.');
        }
    };

    // Hard delete cascade prompt
    const handlePromptHardDelete = () => {
        if (!pillar) return;
        Alert.alert(
            'Delete Mastery?',
            `Are you sure you want to permanently delete "${pillar.title}"? This will delete all logged data and all saved reflections associated with this mastery. This action is irreversible.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete Permanently',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            vibrate(100);
                            await deletePillar(pillarId);
                            navigation.goBack();
                        } catch (err) {
                            console.error('Failed to delete mastery', err);
                            Alert.alert('Error', 'Failed to delete mastery.');
                        }
                    },
                },
            ],
        );
    };

    // Fetch alignment logs on mount or when the pillarId changes
    useEffect(() => {
        let isMounted = true;
        setLoadingLogs(true);
        getPillarLogs(pillarId)
            .then((fetchedLogs) => {
                if (isMounted) {
                    setLogs(fetchedLogs);
                    setLoadingLogs(false);
                }
            })
            .catch((err) => {
                console.error('[PillarDetailScreen] Error fetching pillar logs:', err);
                if (isMounted) setLoadingLogs(false);
            });

        return () => {
            isMounted = false;
        };
    }, [pillarId, getPillarLogs]);

    /* ── DATA PREPARATION FOR GRAPH (OPTION A) ─────────────────────────── */
    // Sort logs chronologically, restrict to the last 30, and filter logs that contain numeric values
    const chartLogs = useMemo(() => {
        const sorted = [...logs].sort((a, b) => a.timestamp - b.timestamp).slice(-CONFIG.MAX_LOG_POINTS);
        return sorted.filter((l) => l.valueNum !== null);
    }, [logs]);

    // Calculate boundary limits of numeric values for normalization
    const { minVal, maxVal } = useMemo(() => {
        if (chartLogs.length === 0) return { minVal: 0, maxVal: 10 };
        const values = chartLogs.map((l) => l.valueNum as number);
        let min = Math.min(...values);
        let max = Math.max(...values);

        // If all values are the same, create a padding range so graph renders centered
        if (min === max) {
            min = min - 1;
            max = max + 1;
        }
        return { minVal: min, maxVal: max };
    }, [chartLogs]);

    // Define responsive width of the SVG graph inside its card container
    const graphWidth = SCREEN_WIDTH - 72; // Horizontal padding: Card margins (20 * 2) + Card paddings (16 * 2) = 72

    // Compute coordinates (x, y) for each log point
    const points = useMemo(() => {
        if (chartLogs.length === 0) return [];
        return chartLogs.map((log, index) => {
            const x = chartLogs.length > 1 ? (index / (chartLogs.length - 1)) * graphWidth : graphWidth / 2;
            const val = log.valueNum ?? 0;
            const range = maxVal - minVal;
            const ratio = range > 0 ? (val - minVal) / range : 0.5;
            const y =
                CONFIG.GRAPH_HEIGHT -
                CONFIG.GRAPH_PADDING_Y -
                ratio * (CONFIG.GRAPH_HEIGHT - 2 * CONFIG.GRAPH_PADDING_Y);
            return { x, y, log };
        });
    }, [chartLogs, graphWidth, minVal, maxVal]);

    // SVG Line path string connecting log points directly
    const pathD = useMemo(() => {
        if (points.length === 0) return '';
        let d = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            d += ` L ${points[i].x} ${points[i].y}`;
        }
        return d;
    }, [points]);

    // Closed SVG path for the translucent gradient fill under the line chart
    const areaD = useMemo(() => {
        if (points.length === 0) return '';
        let d = `M ${points[0].x} ${CONFIG.GRAPH_HEIGHT}`;
        d += ` L ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            d += ` L ${points[i].x} ${points[i].y}`;
        }
        d += ` L ${points[points.length - 1].x} ${CONFIG.GRAPH_HEIGHT}`;
        d += ' Z';
        return d;
    }, [points]);

    /* ── INTERACTIVE SCRUBBING & GESTURE SYSTEM ───────────────────────── */
    const scrubX = useSharedValue(0);
    const scrubbingActive = useSharedValue(0);
    const activeIndex = useSharedValue(-1);
    const lastIndex = useSharedValue(-1);

    // JS state to track active log text index for rendering within bubble
    const [activeLogIndex, setActiveLogIndex] = useState<number | null>(null);

    const updateActiveLog = useCallback((idx: number | null) => {
        setActiveLogIndex(idx);
    }, []);

    // Gesture detector setup for smooth 60fps scrubbing with subtle haptic ticks
    const panGesture = useMemo(() => {
        return Gesture.Pan()
            .activeOffsetX([-10, 10]) // Filter vertical scroll interactions
            .onStart((e) => {
                if (points.length === 0) return;
                scrubbingActive.value = 1;

                // Find index of closest data point to user finger position
                let closestIdx = 0;
                let minDiff = Infinity;
                for (let i = 0; i < points.length; i++) {
                    const diff = Math.abs(points[i].x - e.x);
                    if (diff < minDiff) {
                        minDiff = diff;
                        closestIdx = i;
                    }
                }
                activeIndex.value = closestIdx;
                scrubX.value = points[closestIdx].x;

                // Vibrate on transition to a new point
                if (closestIdx !== lastIndex.value) {
                    lastIndex.value = closestIdx;
                    runOnJS(vibrate)(10);
                }
                runOnJS(updateActiveLog)(closestIdx);
            })
            .onUpdate((e) => {
                if (points.length === 0) return;
                let closestIdx = 0;
                let minDiff = Infinity;
                for (let i = 0; i < points.length; i++) {
                    const diff = Math.abs(points[i].x - e.x);
                    if (diff < minDiff) {
                        minDiff = diff;
                        closestIdx = i;
                    }
                }
                activeIndex.value = closestIdx;
                scrubX.value = points[closestIdx].x;

                if (closestIdx !== lastIndex.value) {
                    lastIndex.value = closestIdx;
                    runOnJS(vibrate)(10);
                }
                runOnJS(updateActiveLog)(closestIdx);
            })
            .onEnd(() => {
                scrubbingActive.value = withTiming(0, { duration: 250 });
                activeIndex.value = withTiming(-1, { duration: 250 });
                lastIndex.value = -1;
                runOnJS(updateActiveLog)(null);
            });
    }, [points, scrubbingActive, scrubX, activeIndex, lastIndex, updateActiveLog]);

    /* ── ANIMATED STYLES FOR TRACKERS & BUBBLE ────────────────────────── */
    // Slides vertical cursor line horizontally
    const trackerStyle = useAnimatedStyle(() => {
        return {
            opacity: withTiming(scrubbingActive.value, { duration: 150 }),
            transform: [{ translateX: scrubX.value }],
        };
    });

    // Positions highlight circle right over the nearest data point coordinate
    const highlightStyle = useAnimatedStyle(() => {
        if (activeIndex.value === -1 || points.length === 0) {
            return { opacity: 0 };
        }
        const activePt = points[activeIndex.value] || points[0];
        return {
            opacity: withTiming(scrubbingActive.value, { duration: 150 }),
            transform: [
                { translateX: activePt.x - 6 }, // Center horizontal offset
                { translateY: activePt.y - 6 }, // Center vertical offset
            ],
        };
    });

    // Smoothly slides floating bubble above the point and clamps it inside screen limits
    const bubbleStyle = useAnimatedStyle(() => {
        if (activeIndex.value === -1 || points.length === 0) {
            return { opacity: 0 };
        }
        const activePt = points[activeIndex.value] || points[0];
        const halfBubble = CONFIG.BUBBLE_WIDTH / 2;
        let targetX = activePt.x - halfBubble;

        // Prevent bubble overflow boundaries on the left and right edges
        if (targetX < 10) targetX = 10;
        if (targetX > graphWidth - CONFIG.BUBBLE_WIDTH - 10) {
            targetX = graphWidth - CONFIG.BUBBLE_WIDTH - 10;
        }

        // Align bubble above the data point vertically (clamped to prevent clipping top)
        const targetY = Math.max(8, activePt.y - 68);

        return {
            opacity: withTiming(scrubbingActive.value, { duration: 150 }),
            transform: [{ translateX: targetX }, { translateY: targetY }],
        };
    });

    /* ── NOTE LIST DATA & ACTIONS ──────────────────────────────────────── */
    // Filter and sort notes specifically written for this pillar
    const pillarNotes = useMemo(() => {
        return savedNotes.filter((n) => n.pillarId === pillarId).sort((a, b) => b.timestamp - a.timestamp); // Newest reflections first
    }, [savedNotes, pillarId]);

    // Delete reflection note
    const handleDeleteNote = useCallback(
        async (id: string) => {
            try {
                await deleteNote(id);
                setSelectedNote(null);
                vibrate(30);
            } catch (e) {
                console.error('[PillarDetailScreen] Failed to delete note:', e);
            }
        },
        [deleteNote],
    );

    // Trigger AI summarization / title regeneration
    const handleRegenerateAi = useCallback(
        async (note: SavedNote, category: AiJobCategory) => {
            try {
                await enqueueNote(note.id, category);
                vibrate(30);
            } catch (e) {
                console.error('[PillarDetailScreen] Failed to enqueue AI job:', e);
            }
        },
        [enqueueNote],
    );

    // Handle closing note modal
    const handleCloseNoteViewer = useCallback(() => {
        setSelectedNote(null);
    }, []);

    /* ── RENDERING SUB-COMPONENTS ──────────────────────────────────────── */
    const renderNoteItem = useCallback(
        ({ item }: { item: SavedNote }) => {
            if (!pillar) return null;

            // Prior Version criteria: note timestamp is older than lastEditedAt (with 2s safety buffer after creation)
            const showPriorVersionBadge =
                item.timestamp < pillar.lastEditedAt && pillar.lastEditedAt > pillar.createdAt + 2000;

            return (
                <View style={styles.noteItemWrapper}>
                    {showPriorVersionBadge && (
                        <View style={styles.priorVersionBadge}>
                            <MaterialCommunityIcons
                                name="alert-decagram-outline"
                                size={12}
                                color={theme.colors.gold}
                                style={{ marginRight: 4 }}
                            />
                            <Text style={styles.priorVersionText}>Prior Definition</Text>
                        </View>
                    )}
                    <NoteCard
                        note={item}
                        onPress={setSelectedNote}
                        isLocked={false}
                        isProcessing={isNoteActive(item.id)}
                        onVersionPress={handleVersionPress}
                    />
                </View>
            );
        },
        [isNoteActive, pillar, handleVersionPress],
    );

    const renderListHeader = () => {
        if (!pillar) return null;
        return (
            <View style={styles.headerContainer}>
                {/* Custom Navigation Header */}
                <View style={styles.headerRow}>
                    <AnimatedScaleButton onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Text style={styles.backBtnText}>← Back</Text>
                    </AnimatedScaleButton>
                    <Text style={styles.headerTitle}>Analytics</Text>
                    <View style={{ width: 70 }} />
                </View>

                {/* Pillar Meta-Card Information */}
                <View style={styles.pillarMetaCard}>
                    <View
                        style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 12,
                        }}
                    >
                        <Text
                            style={[styles.pillarTitle, { marginBottom: 0, flex: 1, marginRight: 8 }]}
                            numberOfLines={1}
                        >
                            {pillar.title}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <AnimatedScaleButton
                                onPress={() => {
                                    vibrate(10);
                                    setIsEditModalVisible(true);
                                }}
                                style={styles.editBtnSmall}
                            >
                                <MaterialCommunityIcons
                                    name="pencil-outline"
                                    size={16}
                                    color={theme.colors.textPrimary}
                                />
                            </AnimatedScaleButton>

                            <AnimatedScaleButton onPress={handlePromptHardDelete} style={styles.deleteBtnSmall}>
                                <MaterialCommunityIcons
                                    name="trash-can-outline"
                                    size={16}
                                    color={theme.colors.danger}
                                />
                            </AnimatedScaleButton>
                        </View>
                    </View>

                    <View style={[styles.metaRow, { marginBottom: pillar.description ? 16 : 0 }]}>
                        <View style={styles.metaBadge}>
                            <Text style={styles.metaBadgeText}>VERSION: {pillar.version || 1}</Text>
                        </View>
                        <View style={styles.metaBadge}>
                            <Text style={styles.metaBadgeText}>TYPE: {pillar.type.toUpperCase()}</Text>
                        </View>
                        <View style={styles.metaBadge}>
                            <Text style={styles.metaBadgeText}>SCOPE: {pillar.scope.toUpperCase()}</Text>
                        </View>
                        {pillar.scope === 'adaptive' && (
                            <View style={styles.metaBadge}>
                                <Text style={styles.metaBadgeText}>GRADUATION: {pillar.adaptiveDays}D</Text>
                            </View>
                        )}
                    </View>

                    {pillar.description && (
                        <View style={styles.descriptionSection}>
                            <Pressable
                                style={styles.descriptionHeader}
                                onPress={() => {
                                    vibrate(8);
                                    setDescExpanded(!descExpanded);
                                }}
                            >
                                <Text style={styles.descriptionHeaderText}>Guidelines & Details</Text>
                                <MaterialCommunityIcons
                                    name={descExpanded ? 'chevron-up' : 'chevron-down'}
                                    size={16}
                                    color={theme.colors.textSecondary}
                                />
                            </Pressable>
                            {descExpanded && (
                                <Animated.View entering={FadeInUp.duration(200)} exiting={FadeOutDown.duration(150)}>
                                    <Text style={styles.descriptionBody}>{pillar.description}</Text>
                                </Animated.View>
                            )}
                        </View>
                    )}
                </View>

                {/* SVG Line Graph */}
                <Text style={styles.sectionTitle}>Trend Timeline</Text>
                <View style={styles.graphCard}>
                    {loadingLogs ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="small" color={theme.colors.primaryAction} />
                            <Text style={styles.loadingText}>Fetching logs...</Text>
                        </View>
                    ) : points.length > 0 ? (
                        <View style={styles.graphContainer}>
                            <GestureDetector gesture={panGesture}>
                                <Animated.View style={StyleSheet.absoluteFillObject}>
                                    <Svg width={graphWidth} height={CONFIG.GRAPH_HEIGHT}>
                                        <Defs>
                                            <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                                                <Stop
                                                    offset="0%"
                                                    stopColor={theme.colors.primaryAction}
                                                    stopOpacity={0.25}
                                                />
                                                <Stop
                                                    offset="100%"
                                                    stopColor={theme.colors.primaryAction}
                                                    stopOpacity={0.0}
                                                />
                                            </LinearGradient>
                                        </Defs>

                                        {/* Horizontal Specular / Guide Lines */}
                                        <Line
                                            x1="0"
                                            y1={CONFIG.GRAPH_PADDING_Y}
                                            x2={graphWidth}
                                            y2={CONFIG.GRAPH_PADDING_Y}
                                            stroke={theme.colors.glassBorderFaint}
                                            strokeDasharray="4 4"
                                        />
                                        <Line
                                            x1="0"
                                            y1={CONFIG.GRAPH_HEIGHT / 2}
                                            x2={graphWidth}
                                            y2={CONFIG.GRAPH_HEIGHT / 2}
                                            stroke={theme.colors.glassBorderFaint}
                                            strokeDasharray="4 4"
                                        />
                                        <Line
                                            x1="0"
                                            y1={CONFIG.GRAPH_HEIGHT - CONFIG.GRAPH_PADDING_Y}
                                            x2={graphWidth}
                                            y2={CONFIG.GRAPH_HEIGHT - CONFIG.GRAPH_PADDING_Y}
                                            stroke={theme.colors.glassBorderFaint}
                                            strokeDasharray="4 4"
                                        />

                                        {/* Translucent Area Under Curve */}
                                        <Path d={areaD} fill="url(#grad)" />

                                        {/* Main Connected Line Curve */}
                                        <Path
                                            d={pathD}
                                            stroke={theme.colors.primaryAction}
                                            strokeWidth={3}
                                            fill="none"
                                        />

                                        {/* Individual Log Point Dots */}
                                        {points.map((pt, i) => (
                                            <Circle
                                                key={i}
                                                cx={pt.x}
                                                cy={pt.y}
                                                r={4}
                                                fill={theme.colors.primaryAction}
                                            />
                                        ))}
                                    </Svg>

                                    {/* Scrubbing Tracker Line */}
                                    <Animated.View style={[styles.trackerLine, trackerStyle]} />

                                    {/* Scrubbing Highlight Point Overlay */}
                                    <Animated.View style={[styles.highlightCircle, highlightStyle]} />

                                    {/* Floating Stats Bubble */}
                                    <Animated.View style={[styles.bubble, bubbleStyle]} pointerEvents="none">
                                        {activeLogIndex !== null && chartLogs[activeLogIndex] && (
                                            <View style={styles.bubbleContent}>
                                                <Text style={styles.bubbleDate}>
                                                    {new Date(chartLogs[activeLogIndex].timestamp).toLocaleDateString(
                                                        undefined,
                                                        {
                                                            month: 'short',
                                                            day: 'numeric',
                                                        },
                                                    )}
                                                </Text>
                                                <Text style={styles.bubbleValue}>
                                                    {chartLogs[activeLogIndex].valueStr ||
                                                        chartLogs[activeLogIndex].valueNum}
                                                </Text>
                                            </View>
                                        )}
                                    </Animated.View>
                                </Animated.View>
                            </GestureDetector>
                        </View>
                    ) : (
                        <View style={styles.emptyGraph}>
                            <MaterialCommunityIcons name="chart-bell-curve" size={32} color={theme.colors.textMuted} />
                            <Text style={styles.emptyGraphText}>No data points logged yet</Text>
                        </View>
                    )}
                </View>

                {/* Section header for Reflections List */}
                <Text style={styles.sectionTitle}>Reflections ({pillarNotes.length})</Text>
            </View>
        );
    };

    const renderListEmpty = () => {
        if (loadingLogs) return null;
        return (
            <View style={styles.emptyNotesCard}>
                <MaterialCommunityIcons
                    name="book-open-blank-variant-outline"
                    size={28}
                    color={theme.colors.textMuted}
                />
                <Text style={styles.emptyNotesTitle}>No Reflections Found</Text>
                <Text style={styles.emptyNotesSubtitle}>
                    Write a session aligned to this pillar in the writing room to create your first reflection.
                </Text>
            </View>
        );
    };

    /* ── BASE CONTAINER REDIRECT IF PILLAR MISSING ──────────────────────── */
    if (!pillar) {
        return (
            <View style={[styles.container, styles.centerAlign, { paddingTop: insets.top }]}>
                <MaterialCommunityIcons name="alert-circle-outline" size={48} color={theme.colors.danger} />
                <Text style={styles.errorText}>Pillar not found</Text>
                <AnimatedScaleButton onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Text style={styles.backBtnText}>Exit Screen</Text>
                </AnimatedScaleButton>
            </View>
        );
    }

    return (
        <GestureHandlerRootView style={styles.container}>
            <View style={[styles.innerContainer, { paddingTop: insets.top }]}>
                <FlatList
                    data={pillarNotes}
                    keyExtractor={(item) => item.id}
                    renderItem={renderNoteItem}
                    // Pass ELEMENTS (not function refs) so FlatList reconciles the
                    // header/empty tree in place instead of unmount+remounting the
                    // graph + gesture system on every render.
                    ListHeaderComponent={renderListHeader()}
                    ListEmptyComponent={renderListEmpty()}
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
                    showsVerticalScrollIndicator={false}
                    // Only re-render cells when processing actually starts/stops,
                    // NOT on every AI job tick (queueState object changes constantly).
                    extraData={queueState.isProcessing}
                />

                {/* Note details pop-up viewer */}
                <NoteViewerModal
                    note={selectedNote}
                    visible={selectedNote !== null}
                    onClose={handleCloseNoteViewer}
                    onDelete={handleDeleteNote}
                    isNoteActive={isNoteActive}
                    onRegenerateAi={handleRegenerateAi}
                />

                {/* Edit Mastery Modal Sheet */}
                <BaseModal
                    visible={isEditModalVisible}
                    onClose={() => setIsEditModalVisible(false)}
                    title="Edit Mastery Details"
                    height={Platform.OS === 'ios' ? 620 : 580}
                >
                    <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                        <Text
                            style={[
                                styles.modalLabel,
                                { color: theme.colors.textMuted, fontSize: 12, marginBottom: 8 },
                            ]}
                        >
                            Current version: v{pillar.version || 1}
                        </Text>
                        <Text style={styles.modalLabel}>Mastery Title</Text>
                        <TextInput
                            style={styles.modalInput}
                            value={editTitle}
                            onChangeText={setEditTitle}
                            placeholder="e.g. Comfort Zone Challenge..."
                            placeholderTextColor={theme.colors.placeholder}
                            selectionColor={theme.colors.primaryAction}
                        />

                        <Text style={styles.modalLabel}>Guidelines & Details</Text>
                        <TextInput
                            style={[styles.modalInput, { minHeight: 80, textAlignVertical: 'top' }]}
                            value={editDescription}
                            onChangeText={setEditDescription}
                            placeholder="Detail the guidelines, rules, or sources of this mastery..."
                            placeholderTextColor={theme.colors.placeholder}
                            selectionColor={theme.colors.primaryAction}
                            multiline
                            numberOfLines={4}
                        />

                        <Text style={styles.modalLabel}>Scope</Text>
                        <View style={styles.pillRow}>
                            {(['daily', 'weekly', 'adaptive'] as Pillar['scope'][]).map((s) => (
                                <AnimatedScaleButton
                                    key={s}
                                    style={[styles.modalPill, editScope === s && styles.modalPillActive]}
                                    onPress={() => {
                                        vibrate(8);
                                        setEditScope(s);
                                    }}
                                >
                                    <Text style={[styles.modalPillText, editScope === s && styles.modalPillTextActive]}>
                                        {s}
                                    </Text>
                                </AnimatedScaleButton>
                            ))}
                        </View>

                        {editScope === 'adaptive' && (
                            <View style={styles.adaptiveWrapper}>
                                <Text style={styles.modalLabel}>Days to graduate to Weekly</Text>
                                <TextInput
                                    style={styles.modalInputSmall}
                                    value={editAdaptiveDaysStr}
                                    onChangeText={setEditAdaptiveDaysStr}
                                    keyboardType="numeric"
                                    placeholder="14"
                                    placeholderTextColor={theme.colors.placeholder}
                                    selectionColor={theme.colors.primaryAction}
                                />
                            </View>
                        )}

                        {(() => {
                            const isRulesChanged =
                                editTitle.trim() !== pillar.title ||
                                editDescription.trim() !== (pillar.description || '');
                            const nextVersion = (pillar.version || 1) + 1;
                            const buttonText = isRulesChanged ? `UPDATE TO VERSION ${nextVersion}` : 'SAVE CHANGES';
                            return (
                                <AnimatedScaleButton style={styles.submitButton} onPress={handleUpdatePillar}>
                                    <Text style={styles.submitButtonText}>{buttonText}</Text>
                                </AnimatedScaleButton>
                            );
                        })()}
                    </ScrollView>
                </BaseModal>
            </View>
        </GestureHandlerRootView>
    );
};

/* ── STYLES ── */
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background, // AMOLED True Black
    },
    innerContainer: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
    },
    centerAlign: {
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 30,
        gap: 16,
    },
    errorText: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        fontWeight: 'bold',
    },
    headerContainer: {
        paddingTop: 10,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    headerTitle: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        fontWeight: '900',
        fontFamily: theme.typography.fontFamily,
    },
    backBtn: {
        backgroundColor: theme.colors.glassBackground,
        borderColor: theme.colors.glassBorder,
        borderWidth: 1,
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
    },
    backBtnText: {
        color: theme.colors.textPrimary,
        fontSize: 13,
        fontWeight: 'bold',
    },
    pillarMetaCard: {
        backgroundColor: theme.colors.glassBackground,
        borderColor: theme.colors.glassBorder,
        borderWidth: 1,
        borderRadius: theme.borderRadius.md,
        padding: 20,
        marginBottom: 24,
    },
    pillarTitle: {
        color: theme.colors.textPrimary,
        fontSize: 22,
        fontWeight: '900',
        marginBottom: 12,
    },
    metaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    metaBadge: {
        backgroundColor: theme.colors.glassSurface,
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.glassBorderFaint,
    },
    metaBadgeText: {
        color: theme.colors.textSecondary,
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    sectionTitle: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 12,
        marginTop: 8,
    },
    graphCard: {
        backgroundColor: theme.colors.glassBackground,
        borderColor: theme.colors.glassBorder,
        borderWidth: 1,
        borderRadius: theme.borderRadius.md,
        height: CONFIG.GRAPH_HEIGHT + 32,
        padding: 16,
        marginBottom: 28,
        justifyContent: 'center',
    },
    graphContainer: {
        width: '100%',
        height: CONFIG.GRAPH_HEIGHT,
        position: 'relative',
    },
    emptyGraph: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
        gap: 12,
    },
    emptyGraphText: {
        color: theme.colors.textMuted,
        fontSize: 14,
        fontWeight: '500',
    },
    loadingContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    loadingText: {
        color: theme.colors.textMuted,
        fontSize: 12,
    },
    noteItemWrapper: {
        marginBottom: 12,
    },
    emptyNotesCard: {
        backgroundColor: theme.colors.glassSurfaceMinimal,
        borderColor: theme.colors.glassBorderFaint,
        borderWidth: 1,
        borderRadius: theme.borderRadius.md,
        padding: 30,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        marginTop: 10,
    },
    emptyNotesTitle: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        fontWeight: '700',
    },
    emptyNotesSubtitle: {
        color: theme.colors.textMuted,
        fontSize: 13,
        textAlign: 'center',
        lineHeight: 18,
    },

    /* ── SCRUBBER GRAPH POSITIONED ELEMENTS ── */
    trackerLine: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 1,
        backgroundColor: theme.colors.primaryAction,
        opacity: 0.4,
    },
    highlightCircle: {
        position: 'absolute',
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: theme.colors.textPrimary,
        borderWidth: 2,
        borderColor: theme.colors.primaryAction,
    },
    bubble: {
        position: 'absolute',
        width: CONFIG.BUBBLE_WIDTH,
        backgroundColor: theme.colors.surfaceLight,
        borderRadius: theme.borderRadius.sm,
        borderWidth: 1,
        borderColor: theme.colors.glassBorderMedium,
        paddingHorizontal: 8,
        paddingVertical: 6,
        alignItems: 'center',
        shadowColor: theme.colors.shadowDark,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
        elevation: 8,
    },
    bubbleContent: {
        alignItems: 'center',
    },
    bubbleDate: {
        color: theme.colors.textSecondary,
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    bubbleValue: {
        color: theme.colors.textPrimary,
        fontSize: 13,
        fontWeight: '900',
        marginTop: 2,
    },
    editBtnSmall: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: theme.colors.glassSurface,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
    },
    deleteBtnSmall: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: theme.colors.dangerLight,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.dangerBorder,
    },
    descriptionSection: {
        marginTop: 4,
        borderTopWidth: 1,
        borderTopColor: theme.colors.glassBorderFaint,
        paddingTop: 12,
    },
    descriptionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    descriptionHeaderText: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        fontWeight: 'bold',
    },
    descriptionBody: {
        color: theme.colors.textBodyDim,
        fontSize: 13,
        lineHeight: 18,
        marginTop: 8,
    },
    priorVersionBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.goldSubtle,
        borderColor: theme.colors.goldBorder,
        borderWidth: 1,
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        alignSelf: 'flex-start',
        marginBottom: 8,
    },
    priorVersionText: {
        color: theme.colors.gold,
        fontSize: 10,
        fontWeight: 'bold',
    },
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
});
