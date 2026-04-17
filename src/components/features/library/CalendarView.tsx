import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
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
const CALENDAR_PADDING = 20;

const WEEK_DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/* ────────────────────────────────────────────────────────────────────────────
 * Helper: Build day cells for a given month
 * ──────────────────────────────────────────────────────────────────────────── */
function buildMonthCells(
    year: number,
    month: number,
    recordDays: Set<string>,
    now: Date,
    daySize: number,
) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayJS = new Date(year, month, 1).getDay();
    const firstDayMon = (firstDayJS + 6) % 7;

    const cells: React.ReactNode[] = [];

    for (let i = 0; i < firstDayMon; i++) {
        cells.push(<View key={`e-${i}`} style={[styles.dayCell, { width: daySize, height: daySize, borderRadius: daySize / 2 }]} />);
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
                    { width: daySize, height: daySize, borderRadius: daySize / 2 },
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

export const CalendarView = React.memo(function CalendarView({
    currentStreak,
    streakHistory,
}: CalendarViewProps) {
    const { width: screenW } = useWindowDimensions();
    const gridWidth = screenW - 40 - (CALENDAR_PADDING * 2);
    const daySize = Math.floor(gridWidth / 7);
    const swipeThreshold = gridWidth * 0.2;
    const velocityThreshold = 400;

    const [monthOffset, setMonthOffset] = useState(0);

    const recordDays = useMemo(
        () => new Set<string>(streakHistory),
        [streakHistory],
    );

    const now = useMemo(() => new Date(), [monthOffset]);

    const prevDate = new Date(now.getFullYear(), now.getMonth() - monthOffset - 1, 1);
    const currDate = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    const nextDate = new Date(now.getFullYear(), now.getMonth() - monthOffset + 1, 1);

    const prevCells = useMemo(() => buildMonthCells(prevDate.getFullYear(), prevDate.getMonth(), recordDays, now, daySize), [prevDate.getFullYear(), prevDate.getMonth(), recordDays, now, daySize]);
    const currCells = useMemo(() => buildMonthCells(currDate.getFullYear(), currDate.getMonth(), recordDays, now, daySize), [currDate.getFullYear(), currDate.getMonth(), recordDays, now, daySize]);
    const nextCells = useMemo(() => buildMonthCells(nextDate.getFullYear(), nextDate.getMonth(), recordDays, now, daySize), [nextDate.getFullYear(), nextDate.getMonth(), recordDays, now, daySize]);

    const monthLabel = currDate.toLocaleString('default', { month: 'long' });
    const yearLabel = currDate.getFullYear().toString();
    const canGoForward = monthOffset > 0;

    /* ── Reanimated ── */
    const translateX = useSharedValue(0);

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
                translateX.value = e.translationX * 0.15;
            } else {
                translateX.value = e.translationX;
            }
        })
        .onEnd((e) => {
            const swipedRight = e.translationX > swipeThreshold || e.velocityX > velocityThreshold;
            const swipedLeft = e.translationX < -swipeThreshold || e.velocityX < -velocityThreshold;

            if (swipedRight) {
                runOnJS(commitMonth)('prev');
                translateX.value = gridWidth * 0.06;
                translateX.value = withSpring(0, { damping: 30, stiffness: 300, mass: 0.8 });
            } else if (swipedLeft && canGoForward) {
                runOnJS(commitMonth)('next');
                translateX.value = -gridWidth * 0.06;
                translateX.value = withSpring(0, { damping: 30, stiffness: 300, mass: 0.8 });
            } else {
                translateX.value = withSpring(0, { damping: 30, stiffness: 300, mass: 0.8 });
            }
        });

    /* ── Animated styles ── */
    const stripStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value - gridWidth }],
    }));

    return (
        <View style={[styles.container, { paddingHorizontal: CALENDAR_PADDING }]}>
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
                    <Text key={`wd-${i}`} style={[styles.weekDayLabel, { width: daySize }]}>{d}</Text>
                ))}
            </View>

            {/* ── 3-Month Swipeable Strip ── */}
            <GestureDetector gesture={panGesture}>
                <View style={[styles.viewport, { width: gridWidth, minHeight: daySize * 7 }]}>
                    <Animated.View style={[styles.strip, { width: gridWidth * 3 }, stripStyle]}>
                        <View style={[styles.page, { width: gridWidth }]}>{prevCells}</View>
                        <View style={[styles.page, { width: gridWidth }]}>{currCells}</View>
                        <View style={[styles.page, { width: gridWidth }]}>{nextCells}</View>
                    </Animated.View>
                </View>
            </GestureDetector>
        </View>
    );
});

/* ────────────────────────────────────────────────────────────────────────────
 * Styles
 * ──────────────────────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
    container: {
        width: '100%',
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
        backgroundColor: theme.colors.glassSurfaceMedium,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
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
        textAlign: 'center',
        color: theme.colors.textMuted,
        fontSize: 13,
        fontWeight: theme.typography.weightMedium,
    },
    viewport: {
        overflow: 'hidden',
    },
    strip: {
        flexDirection: 'row',
    },
    page: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 6,
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
    dayTextRecord: { color: theme.colors.textPrimary, fontWeight: theme.typography.weightBold },
    dayTextToday: { color: theme.colors.textPrimary, fontWeight: theme.typography.weightBold },
});