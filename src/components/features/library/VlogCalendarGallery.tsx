import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Dimensions,
    Modal,
    Animated,
    ScrollView,
    Platform,
    Vibration,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useVideoPlayer, VideoView } from 'expo-video';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SavedVlog } from '@/types';
import { theme } from '@/styles/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/* ────────────────────────────────────────────────────────────────────────────
 * CONFIGURABLE: Calendar layout
 * ──────────────────────────────────────────────────────────────────────────── */
/** Days of the week starting with Monday (as requested) */
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
/** Width of each calendar cell (auto-calculated from screen width with padding) */
const CELL_SIZE = (SCREEN_WIDTH - 48) / 7;
/** Height of the thumbnail on calendar cells that have vlogs */
const THUMB_HEIGHT = CELL_SIZE * 1.15;

interface Props {
    vlogs: SavedVlog[];
    isLocked: boolean;
    onUnlock: () => Promise<boolean>;
    onDeleteVlog: (id: string) => Promise<void>;
}

/**
 * VlogCalendarGallery — BeReal-style calendar grid for browsing recorded vlogs.
 *
 * Features:
 * - Monday-first 7-column calendar grid
 * - Days with vlogs show a gradient thumbnail card with duration overlay
 * - Stacked indicator for multi-vlog days
 * - Tap a day → expand to full video playback
 * - Swipe left/right between multiple vlogs on the same day
 * - Month navigation (prev/next)
 * - Biometric lock overlay (same pattern as Circles)
 */
export const VlogCalendarGallery: React.FC<Props> = ({
    vlogs,
    isLocked,
    onUnlock,
    onDeleteVlog,
}) => {
    /* ── Current displayed month ───────────────────────────────────────── */
    const [displayDate, setDisplayDate] = useState(new Date());
    const currentYear = displayDate.getFullYear();
    const currentMonth = displayDate.getMonth();

    /* ── Expanded vlog state ───────────────────────────────────────────── */
    const [expandedDayVlogs, setExpandedDayVlogs] = useState<SavedVlog[] | null>(null);
    const [expandedIndex, setExpandedIndex] = useState(0);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

    /* ── Animations ────────────────────────────────────────────────────── */
    const expandScale = useRef(new Animated.Value(0.8)).current;
    const expandOpacity = useRef(new Animated.Value(0)).current;

    /**
     * Group vlogs by calendar date key (YYYY-MM-DD) for quick lookup.
     * This is memoized so it only recalculates when vlogs change.
     */
    const vlogsByDate = useMemo(() => {
        const map: Record<string, SavedVlog[]> = {};
        vlogs.forEach(v => {
            const d = new Date(v.timestamp);
            const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            if (!map[key]) map[key] = [];
            map[key].push(v);
        });
        // Sort each day's vlogs newest first
        Object.values(map).forEach(arr => arr.sort((a, b) => b.timestamp - a.timestamp));
        return map;
    }, [vlogs]);

    /* ── Month navigation ──────────────────────────────────────────────── */
    const goToMonth = useCallback((offset: number) => {
        setDisplayDate(prev => {
            const d = new Date(prev);
            d.setMonth(d.getMonth() + offset);
            return d;
        });
    }, []);

    /* ── Build calendar grid ───────────────────────────────────────────── */
    const calendarDays = useMemo(() => {
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
        const daysInMonth = lastDay.getDate();

        // Get day of week (0=Sunday), convert to Monday-first (0=Monday)
        let startDow = firstDay.getDay() - 1;
        if (startDow < 0) startDow = 6; // Sunday becomes 6

        const cells: Array<{ day: number | null; dateKey: string }> = [];

        // Empty cells before the 1st
        for (let i = 0; i < startDow; i++) {
            cells.push({ day: null, dateKey: '' });
        }

        // Actual days
        for (let d = 1; d <= daysInMonth; d++) {
            cells.push({ day: d, dateKey: `${currentYear}-${currentMonth}-${d}` });
        }

        return cells;
    }, [currentYear, currentMonth]);

    /* ── Open expanded view ────────────────────────────────────────────── */
    const openDay = useCallback((dateKey: string) => {
        const dayVlogs = vlogsByDate[dateKey];
        if (!dayVlogs || dayVlogs.length === 0) return;

        setExpandedDayVlogs(dayVlogs);
        setExpandedIndex(0);

        // Animate in
        expandScale.setValue(0.85);
        expandOpacity.setValue(0);
        Animated.parallel([
            Animated.spring(expandScale, {
                toValue: 1,
                useNativeDriver: true,
                damping: 18,
                stiffness: 180,
            }),
            Animated.timing(expandOpacity, {
                toValue: 1,
                duration: 250,
                useNativeDriver: true,
            }),
        ]).start();

        Vibration.vibrate(20);
    }, [vlogsByDate]);

    /* ── Close expanded view ───────────────────────────────────────────── */
    const closeExpanded = useCallback(() => {
        Animated.parallel([
            Animated.timing(expandScale, {
                toValue: 0.85,
                duration: 200,
                useNativeDriver: true,
            }),
            Animated.timing(expandOpacity, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start(() => {
            setExpandedDayVlogs(null);
            setExpandedIndex(0);
        });
    }, []);

    /* ── Swipe between vlogs on same day ───────────────────────────────── */
    const swipeVlog = useCallback((direction: number) => {
        if (!expandedDayVlogs) return;
        const newIdx = expandedIndex + direction;
        if (newIdx >= 0 && newIdx < expandedDayVlogs.length) {
            setExpandedIndex(newIdx);
            Vibration.vibrate(10);
        }
    }, [expandedDayVlogs, expandedIndex]);

    /* ── Format helpers ────────────────────────────────────────────────── */
    const monthLabel = new Date(currentYear, currentMonth).toLocaleString('default', {
        month: 'long',
        year: 'numeric',
    });

    const formatDuration = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const today = new Date();
    const isToday = (day: number) =>
        day === today.getDate() &&
        currentMonth === today.getMonth() &&
        currentYear === today.getFullYear();

    /* ── Biometric lock overlay ────────────────────────────────────────── */
    if (isLocked) {
        return (
            <View style={styles.lockOverlay}>
                <View style={styles.lockCard}>
                    <MaterialCommunityIcons name="lock-outline" size={48} color={theme.colors.primaryAction} style={{ marginBottom: 16 }} />
                    <Text style={styles.lockTitle}>Vlogs Protected</Text>
                    <Text style={styles.lockSubtitle}>Verify your identity to view your video journals</Text>
                    <TouchableOpacity
                        style={styles.unlockBtn}
                        onPress={async () => {
                            const success = await onUnlock();
                            if (success) Vibration.vibrate(50);
                        }}
                    >
                        <MaterialCommunityIcons name="fingerprint" size={22} color="#FFF" style={{ marginRight: 10 }} />
                        <Text style={styles.unlockBtnText}>Unlock Vlogs</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    /* ── Render ─────────────────────────────────────────────────────────── */
    return (
        <View style={{ flex: 1 }}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
                {/* Month navigation header */}
                <View style={styles.monthHeader}>
                    <TouchableOpacity onPress={() => goToMonth(-1)} style={styles.monthArrow}>
                        <MaterialCommunityIcons name="chevron-left" size={24} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                    <Text style={styles.monthLabel}>{monthLabel}</Text>
                    <TouchableOpacity onPress={() => goToMonth(1)} style={styles.monthArrow}>
                        <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                </View>

                {/* Weekday header row */}
                <View style={styles.weekdayRow}>
                    {WEEKDAYS.map(day => (
                        <View key={day} style={styles.weekdayCell}>
                            <Text style={styles.weekdayText}>{day}</Text>
                        </View>
                    ))}
                </View>

                {/* Calendar grid */}
                <View style={styles.calendarGrid}>
                    {calendarDays.map((cell, idx) => {
                        const dayVlogs = cell.dateKey ? vlogsByDate[cell.dateKey] : undefined;
                        const hasVlogs = dayVlogs && dayVlogs.length > 0;
                        const multiVlogs = dayVlogs && dayVlogs.length > 1;

                        return (
                            <TouchableOpacity
                                key={idx}
                                style={styles.dayCell}
                                onPress={() => hasVlogs ? openDay(cell.dateKey) : null}
                                activeOpacity={hasVlogs ? 0.7 : 1}
                                disabled={!hasVlogs}
                            >
                                {cell.day !== null && (
                                    <>
                                        {hasVlogs ? (
                                            /* Day with vlog — gradient thumbnail card */
                                            <View style={[
                                                styles.vlogThumb,
                                                isToday(cell.day) && styles.vlogThumbToday,
                                            ]}>
                                                {/* Gradient background as placeholder */}
                                                <View style={styles.vlogThumbGradient}>
                                                    <MaterialCommunityIcons name="play-circle-outline" size={20} color="rgba(255,255,255,0.7)" />
                                                </View>

                                                {/* Day number */}
                                                <Text style={styles.vlogThumbDay}>{cell.day}</Text>

                                                {/* Duration badge */}
                                                <Text style={styles.vlogThumbDuration}>
                                                    {formatDuration(dayVlogs![0].durationSec)}
                                                </Text>

                                                {/* Stacked indicator for multiple vlogs */}
                                                {multiVlogs && (
                                                    <View style={styles.stackIndicator}>
                                                        <Text style={styles.stackText}>{dayVlogs!.length}</Text>
                                                    </View>
                                                )}
                                            </View>
                                        ) : (
                                            /* Empty day — just the number */
                                            <View style={[
                                                styles.emptyDay,
                                                isToday(cell.day) && styles.todayCircle,
                                            ]}>
                                                <Text style={[
                                                    styles.dayText,
                                                    isToday(cell.day) && styles.todayText,
                                                ]}>{cell.day}</Text>
                                            </View>
                                        )}
                                    </>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Stats row */}
                {vlogs.length > 0 && (
                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{vlogs.length}</Text>
                            <Text style={styles.statLabel}>Total Vlogs</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>
                                {Math.round(vlogs.reduce((s, v) => s + v.durationSec, 0) / 60)}m
                            </Text>
                            <Text style={styles.statLabel}>Recorded</Text>
                        </View>
                    </View>
                )}
            </ScrollView>

            {/* Expanded Vlog Playback Modal */}
            <Modal visible={!!expandedDayVlogs} transparent animationType="none" onRequestClose={closeExpanded}>
                {expandedDayVlogs && expandedDayVlogs[expandedIndex] && (
                    <Animated.View style={[
                        styles.expandedBackdrop,
                        {
                            opacity: expandOpacity,
                        },
                    ]}>
                        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={closeExpanded} />

                        <Animated.View style={[
                            styles.expandedCard,
                            { transform: [{ scale: expandScale }] },
                        ]}>
                            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
                            <View style={styles.expandedTint} />

                            {/* Video Player */}
                            <View style={styles.expandedVideoContainer}>
                                <VlogPlayer uri={expandedDayVlogs[expandedIndex].filePath} />
                            </View>

                            {/* Info bar */}
                            <View style={styles.expandedInfo}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.expandedDate}>{expandedDayVlogs[expandedIndex].dateStr}</Text>
                                    <Text style={styles.expandedMeta}>
                                        {formatDuration(expandedDayVlogs[expandedIndex].durationSec)} • {(expandedDayVlogs[expandedIndex].fileSizeBytes / (1024 * 1024)).toFixed(1)} MB
                                    </Text>
                                </View>

                                {/* Swipe navigation (if multiple vlogs on this day) */}
                                {expandedDayVlogs.length > 1 && (
                                    <View style={styles.swipeNav}>
                                        <TouchableOpacity
                                            onPress={() => swipeVlog(-1)}
                                            disabled={expandedIndex === 0}
                                            style={[styles.swipeBtn, expandedIndex === 0 && { opacity: 0.3 }]}
                                        >
                                            <MaterialCommunityIcons name="chevron-left" size={24} color="#FFF" />
                                        </TouchableOpacity>
                                        <Text style={styles.swipeCounter}>
                                            {expandedIndex + 1}/{expandedDayVlogs.length}
                                        </Text>
                                        <TouchableOpacity
                                            onPress={() => swipeVlog(1)}
                                            disabled={expandedIndex === expandedDayVlogs.length - 1}
                                            style={[styles.swipeBtn, expandedIndex === expandedDayVlogs.length - 1 && { opacity: 0.3 }]}
                                        >
                                            <MaterialCommunityIcons name="chevron-right" size={24} color="#FFF" />
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>

                            {/* Actions */}
                            <View style={styles.expandedActions}>
                                <TouchableOpacity style={styles.closeBtn} onPress={closeExpanded}>
                                    <MaterialCommunityIcons name="close" size={20} color="#FFF" />
                                    <Text style={styles.closeBtnText}>Close</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.deleteBtn}
                                    onPress={() => setShowDeleteConfirm(expandedDayVlogs[expandedIndex].id)}
                                >
                                    <MaterialCommunityIcons name="delete-outline" size={18} color={theme.colors.danger} />
                                    <Text style={styles.deleteBtnText}>Delete</Text>
                                </TouchableOpacity>
                            </View>
                        </Animated.View>
                    </Animated.View>
                )}
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal visible={!!showDeleteConfirm} transparent animationType="fade">
                <View style={styles.deleteModalOverlay}>
                    <View style={styles.deleteModalCard}>
                        <Text style={styles.deleteModalTitle}>Delete Vlog?</Text>
                        <Text style={styles.deleteModalSub}>
                            This will permanently delete this video. This cannot be undone.
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                            <TouchableOpacity
                                style={[styles.deleteModalBtn, { backgroundColor: theme.colors.glassBackground }]}
                                onPress={() => setShowDeleteConfirm(null)}
                            >
                                <Text style={styles.deleteModalBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.deleteModalBtn, { backgroundColor: theme.colors.danger }]}
                                onPress={async () => {
                                    if (showDeleteConfirm) {
                                        await onDeleteVlog(showDeleteConfirm);
                                        setShowDeleteConfirm(null);
                                        // If we deleted the last vlog for this day, close the expanded view
                                        if (expandedDayVlogs && expandedDayVlogs.length <= 1) {
                                            closeExpanded();
                                        } else if (expandedIndex >= (expandedDayVlogs?.length || 1) - 1) {
                                            setExpandedIndex(Math.max(0, expandedIndex - 1));
                                        }
                                    }
                                }}
                            >
                                <Text style={styles.deleteModalBtnText}>Delete</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

/**
 * VlogPlayer — Inline video player using expo-video.
 *
 * Separated as its own component because `useVideoPlayer` must be called
 * at the top level and the source URI changes when swiping between vlogs.
 */
const VlogPlayer: React.FC<{ uri: string }> = ({ uri }) => {
    const player = useVideoPlayer(uri, p => {
        p.loop = false;
        p.play();
    });

    return (
        <VideoView
            style={styles.videoPlayer}
            player={player}
            nativeControls
        />
    );
};

/* ──────────────────────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
    /* ── Lock Overlay ──────────────────────────────────────────────────── */
    lockOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 30,
    },
    lockCard: {
        backgroundColor: theme.colors.glassBackground,
        borderRadius: 24,
        padding: 40,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        width: '100%',
    },
    lockTitle: {
        color: '#FFF',
        fontSize: 22,
        fontWeight: '900',
        marginBottom: 8,
    },
    lockSubtitle: {
        color: theme.colors.textMuted,
        fontSize: 15,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22,
    },
    unlockBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.primaryAction,
        paddingVertical: 16,
        paddingHorizontal: 28,
        borderRadius: 100,
        shadowColor: theme.colors.primaryAction,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    unlockBtnText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '800',
    },

    /* ── Month Navigation ──────────────────────────────────────────────── */
    monthHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    monthArrow: {
        padding: 8,
        backgroundColor: theme.colors.glassBackground,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
    },
    monthLabel: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: '800',
        letterSpacing: 0.3,
    },

    /* ── Weekday Header Row ────────────────────────────────────────────── */
    weekdayRow: {
        flexDirection: 'row',
        marginBottom: 10,
    },
    weekdayCell: {
        width: CELL_SIZE,
        alignItems: 'center',
    },
    weekdayText: {
        color: theme.colors.textMuted,
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1,
    },

    /* ── Calendar Grid ─────────────────────────────────────────────────── */
    calendarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: CELL_SIZE,
        height: THUMB_HEIGHT + 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 6,
    },

    /* ── Empty Day ─────────────────────────────────────────────────────── */
    emptyDay: {
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 16,
    },
    dayText: {
        color: theme.colors.textMuted,
        fontSize: 14,
        fontWeight: '500',
    },
    todayCircle: {
        borderWidth: 2,
        borderColor: theme.colors.primaryAction,
    },
    todayText: {
        color: theme.colors.primaryAction,
        fontWeight: '800',
    },

    /* ── Vlog Thumbnail Card ───────────────────────────────────────────── */
    vlogThumb: {
        width: CELL_SIZE - 6,
        height: THUMB_HEIGHT,
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: 'rgba(255, 42, 42, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(255, 42, 42, 0.25)',
    },
    vlogThumbToday: {
        borderColor: theme.colors.primaryAction,
        borderWidth: 2,
    },
    vlogThumbGradient: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
    },
    vlogThumbDay: {
        position: 'absolute',
        top: 4,
        left: 6,
        color: '#FFF',
        fontSize: 11,
        fontWeight: '800',
    },
    vlogThumbDuration: {
        position: 'absolute',
        bottom: 3,
        right: 4,
        color: 'rgba(255,255,255,0.6)',
        fontSize: 9,
        fontWeight: '600',
    },
    stackIndicator: {
        position: 'absolute',
        top: 3,
        right: 4,
        backgroundColor: theme.colors.primaryAction,
        borderRadius: 8,
        width: 16,
        height: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    stackText: {
        color: '#FFF',
        fontSize: 9,
        fontWeight: '900',
    },

    /* ── Stats Row ─────────────────────────────────────────────────────── */
    statsRow: {
        flexDirection: 'row',
        backgroundColor: theme.colors.glassBackground,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        padding: 18,
        marginTop: 20,
        justifyContent: 'space-around',
        alignItems: 'center',
    },
    statItem: {
        alignItems: 'center',
    },
    statValue: {
        color: '#FFF',
        fontSize: 22,
        fontWeight: '800',
    },
    statLabel: {
        color: theme.colors.textMuted,
        fontSize: 12,
        fontWeight: '600',
        marginTop: 4,
    },
    statDivider: {
        width: 1,
        height: 30,
        backgroundColor: theme.colors.glassBorder,
    },

    /* ── Expanded Playback Modal ───────────────────────────────────────── */
    expandedBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    expandedCard: {
        width: '100%',
        height: SCREEN_HEIGHT * 0.75,
        borderRadius: 28,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    expandedTint: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(18, 18, 18, 0.85)',
    },
    expandedVideoContainer: {
        flex: 1,
        margin: 12,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#000',
        zIndex: 2,
    },
    videoPlayer: {
        flex: 1,
        width: '100%',
    },
    expandedInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
        zIndex: 2,
    },
    expandedDate: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '800',
    },
    expandedMeta: {
        color: theme.colors.primaryAction,
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginTop: 2,
    },
    swipeNav: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    swipeBtn: {
        padding: 6,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 14,
    },
    swipeCounter: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 13,
        fontWeight: '600',
        minWidth: 30,
        textAlign: 'center',
    },
    expandedActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 16,
        zIndex: 2,
    },
    closeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
        paddingVertical: 10,
        paddingHorizontal: 18,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        gap: 6,
    },
    closeBtnText: {
        color: '#FFF',
        fontWeight: '600',
        fontSize: 14,
    },
    deleteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 77, 77, 0.08)',
        paddingVertical: 10,
        paddingHorizontal: 18,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(255, 77, 77, 0.15)',
        gap: 6,
    },
    deleteBtnText: {
        color: theme.colors.danger,
        fontWeight: '600',
        fontSize: 14,
    },

    /* ── Delete Confirmation Modal ─────────────────────────────────────── */
    deleteModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 30,
    },
    deleteModalCard: {
        backgroundColor: '#1A1A1A',
        borderRadius: 20,
        padding: 25,
        width: '100%',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    deleteModalTitle: {
        color: '#FFF',
        fontSize: 20,
        fontWeight: '900',
        marginBottom: 10,
    },
    deleteModalSub: {
        color: theme.colors.textMuted,
        fontSize: 15,
        lineHeight: 22,
    },
    deleteModalBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
    },
    deleteModalBtnText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 15,
    },
});
