import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    runOnJS,
} from 'react-native-reanimated';
import { theme } from '@/styles/theme';

/* ────────────────────────────────────────────────────────────────────────────
 * CONFIGURABLE: Calendar layout constants
 * ──────────────────────────────────────────────────────────────────────────── */
const SCREEN_W = Dimensions.get('window').width;
const CALENDAR_PADDING = 20;
const GRID_WIDTH = SCREEN_W - 40 - (CALENDAR_PADDING * 2);
const DAY_SIZE = Math.floor(GRID_WIDTH / 7);

const WEEK_DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Swipe distance OR velocity to commit a month change */
const SWIPE_THRESHOLD = GRID_WIDTH * 0.2;
const VELOCITY_THRESHOLD = 400;

/* ────────────────────────────────────────────────────────────────────────────
 * Helper: Build day cells for a given month
 * ──────────────────────────────────────────────────────────────────────────── */
function buildMonthCells(
    year: number,
    month: number,
    recordDays: Set<string>,
    now: Date,
) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayJS = new Date(year, month, 1).getDay();
    const firstDayMon = (firstDayJS + 6) % 7;

    const cells: React.ReactNode[] = [];

    for (let i = 0; i < firstDayMon; i++) {
        cells.push(<View key={`e-${i}`} style={styles.dayCell} />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${month}-${day}`;
        const hasRecord = recordDays.has(dateStr);
        const isToday =
            now.getDate() === day &&
            now.getMonth() === month &&
            now.getFullYear() === year;

        cells.push(
            <View
                key={`d-${day}`}
                style={[
                    styles.dayCell,
                    hasRecord && styles.dayCellRecord,
                    isToday && !hasRecord && styles.dayCellToday,
                    isToday && hasRecord && styles.dayCellTodayRecord,
                ]}
            >
                <Text
                    style={[
                        styles.dayText,
                        hasRecord && styles.dayTextRecord,
                        isToday && !hasRecord && styles.dayTextToday,
                    ]}
                >
                    {day}
                </Text>
            </View>,
        );
    }

    return cells;
}

/* ────────────────────────────────────────────────────────────────────────────
 * CalendarView — Seamless 3-month pager with instant updates.
 *
 * Architecture: Renders prev/current/next months side-by-side in a clipped
 * viewport. The strip follows the finger 1:1. On commit, state updates
 * INSTANTLY (no animation delay) so rapid scrolling feels snappy.
 * The strip then springs from a small entry offset to center.
 * ──────────────────────────────────────────────────────────────────────────── */
interface CalendarViewProps {
    currentStreak: number;
    streakHistory: string[];
}

export const CalendarView: React.FC<CalendarViewProps> = ({
    currentStreak,
    streakHistory,
}) => {
    const [monthOffset, setMonthOffset] = useState(0);

    const recordDays = React.useMemo(
        () => new Set<string>(streakHistory),
        [streakHistory],
    );

    const now = new Date();

    /* ── Compute 3 months: prev, current, next ── */
    const prevDate = new Date(now.getFullYear(), now.getMonth() - monthOffset - 1, 1);
    const currDate = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    const nextDate = new Date(now.getFullYear(), now.getMonth() - monthOffset + 1, 1);

    const prevCells = buildMonthCells(prevDate.getFullYear(), prevDate.getMonth(), recordDays, now);
    const currCells = buildMonthCells(currDate.getFullYear(), currDate.getMonth(), recordDays, now);
    const nextCells = buildMonthCells(nextDate.getFullYear(), nextDate.getMonth(), recordDays, now);

    const monthLabel = currDate.toLocaleString('default', { month: 'long' });
    const yearLabel = currDate.getFullYear().toString();
    const canGoForward = monthOffset > 0;

    /* ── Reanimated ── */
    const translateX = useSharedValue(0);

    /**
     * Commit a month change INSTANTLY.
     * - Updates state immediately → re-render on next frame
     * - Sets translateX to a small entry offset so the new month slides in
     *   from the correct direction with a short spring
     */
    const commitMonth = useCallback(
        (direction: 'prev' | 'next') => {
            if (direction === 'prev') {
                setMonthOffset((o) => o + 1);
            } else {
                setMonthOffset((o) => Math.max(0, o - 1));
            }
        },
        [],
    );

    /* ── Gesture ── */
    const panGesture = Gesture.Pan()
        .activeOffsetX([-15, 15])
        .failOffsetY([-15, 15])
        .onUpdate((e) => {
            if (!canGoForward && e.translationX < 0) {
                // Rubber-band at current month
                translateX.value = e.translationX * 0.15;
            } else {
                translateX.value = e.translationX;
            }
        })
        .onEnd((e) => {
            const swipedRight = e.translationX > SWIPE_THRESHOLD || e.velocityX > VELOCITY_THRESHOLD;
            const swipedLeft = e.translationX < -SWIPE_THRESHOLD || e.velocityX < -VELOCITY_THRESHOLD;

            if (swipedRight) {
                // Go to previous (older) month — update state IMMEDIATELY
                runOnJS(commitMonth)('prev');
                // Start from a very small offset (6%) so it just feels like a gentle nudge
                translateX.value = GRID_WIDTH * 0.06;
                translateX.value = withSpring(0, { damping: 30, stiffness: 300, mass: 0.8 });
            } else if (swipedLeft && canGoForward) {
                // Go to next (newer) month
                runOnJS(commitMonth)('next');
                translateX.value = -GRID_WIDTH * 0.06;
                translateX.value = withSpring(0, { damping: 30, stiffness: 300, mass: 0.8 });
            } else {
                // Snap back (tightly)
                translateX.value = withSpring(0, { damping: 30, stiffness: 300, mass: 0.8 });
            }
        });

    /* ── Animated styles ── */
    const stripStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value - GRID_WIDTH }],
    }));

    return (
        <View style={styles.container}>
            {/* ── Hero Streak Header ── */}
            <Text style={styles.fireIcon}>🔥</Text>
            <Text style={styles.heroTitle}>
                You're on a{'\n'}
                <Text style={styles.heroStreak}>{currentStreak}-day </Text>
                streak
            </Text>
            <Text style={styles.heroSubtitle}>
                Keep it up! Write every day and don't let your streak reset.
            </Text>

            {/* ── Month Navigation ── */}
            <View style={styles.monthNav}>
                <Text style={styles.monthLabel}>{monthLabel} {yearLabel}</Text>
                <View style={styles.monthArrows}>
                    <AnimatedScaleButton
                        onPress={() => commitMonth('prev')}
                        style={styles.arrowBtn}
                        activeOpacity={0.6}
                    >
                        <Text style={styles.arrowText}>‹</Text>
                    </AnimatedScaleButton>
                    <AnimatedScaleButton
                        onPress={() => canGoForward && commitMonth('next')}
                        style={[styles.arrowBtn, !canGoForward && styles.arrowDisabled]}
                        activeOpacity={canGoForward ? 0.6 : 1}
                    >
                        <Text style={[styles.arrowText, !canGoForward && styles.arrowTextDisabled]}>›</Text>
                    </AnimatedScaleButton>
                </View>
            </View>

            {/* ── Week Day Headers ── */}
            <View style={styles.weekRow}>
                {WEEK_DAYS.map((d, i) => (
                    <Text key={`wd-${i}`} style={styles.weekDayLabel}>{d}</Text>
                ))}
            </View>

            {/* ── 3-Month Swipeable Strip ── */}
            <GestureDetector gesture={panGesture}>
                <View style={styles.viewport}>
                    <Animated.View style={[styles.strip, stripStyle]}>
                        <View style={styles.page}>{prevCells}</View>
                        <View style={styles.page}>{currCells}</View>
                        <View style={styles.page}>{nextCells}</View>
                    </Animated.View>
                </View>
            </GestureDetector>
        </View>
    );
};

/* ────────────────────────────────────────────────────────────────────────────
 * Styles
 * ──────────────────────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
    container: {
        width: '100%',
        paddingHorizontal: CALENDAR_PADDING,
        paddingBottom: 20,
    },
    fireIcon: { fontSize: 36, marginBottom: 12 },
    heroTitle: {
        color: theme.colors.textPrimary,
        fontSize: 32,
        fontWeight: 'bold',
        lineHeight: 40,
        marginBottom: 10,
    },
    heroStreak: {
        color: theme.colors.danger,
        fontStyle: 'italic',
        fontWeight: 'bold',
    },
    heroSubtitle: {
        color: theme.colors.textMuted,
        fontSize: 15,
        lineHeight: 22,
        marginBottom: 30,
    },
    monthNav: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    monthLabel: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        fontWeight: theme.typography.weightBold,
    },
    monthArrows: { flexDirection: 'row', gap: 8 },
    arrowBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    arrowDisabled: { opacity: 0.3 },
    arrowText: {
        color: theme.colors.textPrimary,
        fontSize: 22,
        fontWeight: 'bold',
        lineHeight: 24,
    },
    arrowTextDisabled: { color: theme.colors.textMuted },
    weekRow: { flexDirection: 'row', marginBottom: 12 },
    weekDayLabel: {
        width: DAY_SIZE,
        textAlign: 'center',
        color: theme.colors.textMuted,
        fontSize: 13,
        fontWeight: theme.typography.weightMedium,
    },
    viewport: {
        width: GRID_WIDTH,
        overflow: 'hidden',
        minHeight: DAY_SIZE * 7,
    },
    strip: {
        flexDirection: 'row',
        width: GRID_WIDTH * 3,
    },
    page: {
        width: GRID_WIDTH,
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: DAY_SIZE,
        height: DAY_SIZE,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 6,
        borderRadius: DAY_SIZE / 2,
    },
    dayCellRecord: { backgroundColor: theme.colors.danger },
    dayCellToday: { borderWidth: 1.5, borderColor: theme.colors.textPrimary },
    dayCellTodayRecord: {
        backgroundColor: theme.colors.danger,
        borderWidth: 2,
        borderColor: theme.colors.textPrimary,
    },
    dayText: {
        color: theme.colors.textSecondary,
        fontSize: 15,
        fontWeight: theme.typography.weightMedium,
    },
    dayTextRecord: { color: '#FFFFFF', fontWeight: theme.typography.weightBold },
    dayTextToday: { color: theme.colors.textPrimary, fontWeight: theme.typography.weightBold },
});
