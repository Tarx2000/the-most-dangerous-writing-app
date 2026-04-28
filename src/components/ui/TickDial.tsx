import React, { useRef, useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    useWindowDimensions,
    ScrollView,
    NativeSyntheticEvent,
    NativeScrollEvent
} from 'react-native';
import { vibrate } from '@/lib/haptics';
import { theme } from '@/styles/theme';

/* ────────────────────────────────────────────────────────────────────────────
 * CONFIGURABLE: Dial layout
 * ──────────────────────────────────────────────────────────────────────────── */
const SNAP = 80;           // px between major ticks (data points)
const MINORS = 4;           // minor ticks drawn between each major
const GAP = SNAP / (MINORS + 1); // px between any two neighbouring ticks
const MAJ_H = 28;
const MIN_H = 12;

interface TickDialProps {
    data: number[];
    selectedIndex: number;
    onSelect: (index: number) => void;
    unit?: string;
    setHomeScrollEnabled?: (enabled: boolean) => void;
}

/**
 * TickDial — Tide-style horizontal ruler for picking a duration.
 *
 * Wrapped in React.memo to prevent re-renders from parent scroll events.
 * All scroll handlers use useCallback to stabilize references for native.
 *
 * Behaviour:
 * 1. No native `snapToInterval` — snapping is handled manually via
 *    `scrollTo({ animated: true })` after the user releases, so the
 *    dial glides smoothly into place instead of jumping.
 * 2. `onScroll` only tracks the current offset in a ref. `onSelect` is
 *    deferred until the snap animation is initiated, preventing the
 *    number from changing while the user is still dragging.
 * 3. Vibration fires exactly once per settled number change via a
 *    `useEffect` watching `selectedIndex`.
 */
export const TickDial = React.memo(function TickDial({
    data,
    selectedIndex,
    onSelect,
    unit = 'min',
    setHomeScrollEnabled,
}: TickDialProps) {
    const { width: SCREEN_W } = useWindowDimensions();
    const scrollRef = useRef<ScrollView>(null);
    const [ready, setReady] = useState(false);
    /** Prevents vibration on initial mount */
    const hasMounted = useRef(false);
    /** Tracks current scroll offset without causing re-renders */
    const currentOffsetRef = useRef(0);
    /** Prevents double-snapping when onScrollEndDrag and onMomentumScrollEnd both fire */
    const hasSnappedRef = useRef(false);
    /** Prevents the selectedIndex effect from cancelling our own snap animation */
    const justSnappedRef = useRef(false);

    // Padding so the first major tick's centre lands at screen centre
    const pad = SCREEN_W / 2 - GAP / 2;

    /* ── Build tick array (stable, memo'd) ────────────────────────────── */
    const ticks = React.useMemo(() => {
        const a: Array<boolean> = []; // true = major
        for (let i = 0; i < data.length; i++) {
            a.push(true);
            if (i < data.length - 1) for (let j = 0; j < MINORS; j++) a.push(false);
        }
        return a;
    }, [data]);

    /* ── Initial scroll (no animation, hidden until done) ─────────────── */
    useEffect(() => {
        if (justSnappedRef.current) {
            justSnappedRef.current = false;
            return;
        }
        const t = setTimeout(() => {
            scrollRef.current?.scrollTo({ x: selectedIndex * SNAP, animated: false });
            setReady(true);
            hasMounted.current = true;
        }, 60);
        return () => clearTimeout(t);
    }, [selectedIndex]);

    /**
     * Vibrate exactly once per number change, completely decoupled
     * from scroll mechanics. Skips the initial mount to avoid
     * vibrating when the component first renders.
     */
    useEffect(() => {
        if (hasMounted.current) {
            vibrate(10);
        }
    }, [selectedIndex]);

    /* ── Read index from scroll offset ─────────────────────────────────── */
    const indexFromOffset = useCallback(
        (x: number) => Math.max(0, Math.min(data.length - 1, Math.round(x / SNAP))),
        [data.length],
    );

    /* ── Snap to the nearest major tick with animation ───────────────── */
    const snapToNearest = useCallback(() => {
        if (hasSnappedRef.current) return;

        const index = indexFromOffset(currentOffsetRef.current);
        const clamped = Math.max(0, Math.min(data.length - 1, index));
        const targetX = clamped * SNAP;

        hasSnappedRef.current = true;
        scrollRef.current?.scrollTo({ x: targetX, animated: true });

        if (clamped !== selectedIndex) {
            justSnappedRef.current = true;
            onSelect(clamped);
        }
    }, [data.length, indexFromOffset, onSelect, selectedIndex]);

    /* ── Scroll event handlers ─────────────────────────────────────────── */
    const onScroll = useCallback(
        (e: NativeSyntheticEvent<NativeScrollEvent>) => {
            currentOffsetRef.current = e.nativeEvent.contentOffset.x;
        },
        [],
    );

    const handleScrollBeginDrag = useCallback(() => {
        hasSnappedRef.current = false;
        setHomeScrollEnabled?.(false);
    }, [setHomeScrollEnabled]);

    const handleScrollEndDrag = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const v = e.nativeEvent.velocity;
        if (!v || Math.abs(v.x) < 0.2) {
            // Low velocity — no momentum scroll will follow, snap now
            snapToNearest();
        }
        setHomeScrollEnabled?.(true);
    }, [setHomeScrollEnabled, snapToNearest]);

    const handleMomentumScrollEnd = useCallback(() => {
        snapToNearest();
        setHomeScrollEnabled?.(true);
    }, [setHomeScrollEnabled, snapToNearest]);

    return (
        <View style={styles.root}>
            {/* Big number */}
            <Text style={styles.value}>
                {data[selectedIndex]}
                <Text style={styles.unit}> {unit}</Text>
            </Text>

            {/* Ruler */}
            <View style={styles.ruler}>
                {/* Centre indicator — exact screen centre */}
                <View style={[styles.indicator, { left: SCREEN_W / 2 - 1.5 }]} />

                <ScrollView
                    ref={scrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    decelerationRate="fast"
                    nestedScrollEnabled
                    scrollEventThrottle={16}
                    onScroll={onScroll}
                    onScrollBeginDrag={handleScrollBeginDrag}
                    onScrollEndDrag={handleScrollEndDrag}
                    onMomentumScrollEnd={handleMomentumScrollEnd}
                    contentContainerStyle={{ paddingLeft: pad, paddingRight: pad }}
                    style={ready ? undefined : styles.hidden}
                >
                    {ticks.map((isMajor, i) => (
                        <View key={i} style={styles.slot}>
                            <View style={isMajor ? styles.major : styles.minor} />
                        </View>
                    ))}
                </ScrollView>
            </View>
        </View>
    );
});

/* ──────────────────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
    root: { alignItems: 'center', width: '100%', paddingVertical: 8 },
    hidden: { opacity: 0 },

    value: {
        color: theme.colors.textPrimary,
        fontSize: 44,
        fontWeight: '200',
        letterSpacing: 1,
        marginBottom: 18,
    },
    unit: { color: theme.colors.textMuted, fontSize: 20, fontWeight: '300' },

    ruler: { width: '100%', height: 52 },

    indicator: {
        position: 'absolute',
        top: 4,
        width: 3,
        height: MAJ_H + 14,
        backgroundColor: theme.colors.danger,
        borderRadius: 2,
        zIndex: 10,
    },

    slot: {
        width: GAP,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
    },
    major: {
        width: 2.5,
        height: MAJ_H,
        backgroundColor: theme.colors.lightGrey,
        borderRadius: 1,
    },
    minor: {
        width: 1.5,
        height: MIN_H,
        backgroundColor: theme.colors.glassBorderMedium,
        borderRadius: 1,
    },
});