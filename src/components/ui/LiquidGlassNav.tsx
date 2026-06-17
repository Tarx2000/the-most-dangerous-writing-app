import React, { useLayoutEffect, useRef } from 'react';
import { View, Pressable, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '@/styles/theme';

/* ── CONFIGURABLE ─────────────────────────────────────────────────────────── */

/** Width of the pill relative to the screen (0.88 = 88%) */
const PILL_WIDTH_RATIO = 0.88;

/** Total pill height — increased for icon-only layout */
const PILL_HEIGHT = 72;

/** Icon size — larger now that labels are removed */
const ICON_SIZE = 26;

/** Indicator padding from edges */
const INDICATOR_PADDING = 7;

/**
 * Indicator slide config — uses `withTiming` (NOT withSpring).
 *
 * Rationale: A spring's overshoot oscillations show up as visible jank on
 * throttled GPUs (battery saver, low-end devices). A cubic-out timing slide
 * settles in a fixed ~180ms with ZERO overshoot frames, so the compositor
 * never has to paint extra frames beyond what's actually visible.
 *
 * Per `.agents/instructions/animations.md` rule:
 *   "For micro-interactions like tab switching, prefer clean timing transitions."
 */
const INDICATOR_TIMING = {
    duration: 180,
    easing: Easing.out(Easing.cubic),
};

/* ── COMPONENT ────────────────────────────────────────────────────────────── */

/**
 * LiquidGlassNav — Premium floating pill navigation bar (icon-only).
 *
 * Layer architecture (max 3 stacked visible layers, was 7):
 *
 *   Layer A — Pill background
 *     • iOS:    BlurView (intensity 80, tint dark) — native GPU blur
 *     • Android: solid translucent color (CPU blur kills perf per AGENTS.md)
 *
 *   Layer B — Sliding indicator (the "bubble")
 *     • Animated.View driven by `indicatorX` SharedValue via withTiming
 *
 *   Layer C — Row of Pressable tab icons
 *
 * The previous outer specular border gradient + tint overlay + specular
 * highlight gradient were removed — they added 4 extra compositor layers
 * per frame the indicator moved, but were barely perceptible visually.
 */
interface NavItem {
    id: string;
    icon: string;
    label: string;
    /** Optional badge (e.g. urgent dot for check-in) */
    urgent?: boolean;
}

interface Props {
    items: NavItem[];
    activeId: string;
    onSelect: (id: string) => void;
}

const LiquidGlassNavInner: React.FC<Props> = ({ items, activeId, onSelect }) => {
    const { width: SCREEN_WIDTH } = useWindowDimensions();
    const PILL_WIDTH = React.useMemo(() => SCREEN_WIDTH * PILL_WIDTH_RATIO, [SCREEN_WIDTH]);

    const activeIndex = items.findIndex((i) => i.id === activeId);
    const tabWidth = React.useMemo(() => PILL_WIDTH / items.length, [PILL_WIDTH, items.length]);

    /** Animated position for the sliding indicator */
    const indicatorX = useSharedValue(activeIndex * tabWidth);

    /** Track previous activeIndex to avoid duplicate timing triggers */
    const prevActiveIndexRef = useRef(activeIndex);

    /**
     * Drive indicator to the new position synchronously BEFORE paint commits.
     * useLayoutEffect fires after DOM mutations but before the browser paints,
     * eliminating the one-frame delay caused by useEffect.
     */
    useLayoutEffect(() => {
        if (activeIndex === prevActiveIndexRef.current) return;
        prevActiveIndexRef.current = activeIndex;

        const targetX = activeIndex * tabWidth;
        indicatorX.value = withTiming(targetX, INDICATOR_TIMING);
    }, [activeIndex, tabWidth, indicatorX]);

    const indicatorStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: indicatorX.value + INDICATOR_PADDING }],
    }));

    return (
        <View style={styles.wrapper}>
            {/*
             * Layer A — Pill background.
             *   iOS:    BlurView fills the pill (native GPU blur)
             *   Android: solid translucent color on the container itself
             *            (Android software blur kills scroll/animation perf
             *             per .agents/instructions/animations.md:63)
             *
             * All visual pill properties (radius, shadow, border) live on
             * this single layer to maximize view flattening.
             */}
            <View style={[styles.pill, { width: PILL_WIDTH }, Platform.OS === 'android' && styles.pillAndroidSolid]}>
                {Platform.OS === 'ios' && <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFillObject} />}

                {/*
                 * Layer B — Sliding active indicator (the "bubble").
                 * Vertically centered, equal padding top/bottom.
                 */}
                <Animated.View
                    style={[styles.indicator, { width: tabWidth - INDICATOR_PADDING * 2 }, indicatorStyle]}
                />

                {/*
                 * Layer C — Row of tab items (icon only, no labels).
                 * Sits above the indicator so active icon color "pops".
                 */}
                <View style={styles.tabRow}>
                    {items.map((item) => {
                        const isActive = item.id === activeId;
                        return (
                            <Pressable
                                key={item.id}
                                style={[styles.tab, { width: tabWidth }]}
                                onPress={() => onSelect(item.id)}
                            >
                                <View style={styles.iconContainer}>
                                    {item.urgent && <View style={styles.urgentDot} />}
                                    <MaterialCommunityIcons
                                        name={item.icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
                                        size={ICON_SIZE}
                                        color={isActive ? theme.colors.navIconActive : theme.colors.navIconInactive}
                                    />
                                </View>
                            </Pressable>
                        );
                    })}
                </View>
            </View>
        </View>
    );
};

/**
 * Memoized export — only re-renders when items or activeId change.
 * Prevents re-renders from HomeScreen scroll events.
 */
export const LiquidGlassNav = React.memo(LiquidGlassNavInner);

/* ── STYLES ───────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
    /** Positioned at the bottom of the screen, layout-only wrapper (no visual layer) */
    wrapper: {
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 30 : 16,
        width: '100%',
        alignItems: 'center',
        zIndex: 999,
    },

    /**
     * The glass pill — single visible "Layer A".
     * Carries border, radius, shadow, and overflow clipping so all visual
     * properties collapse into one native view (maximizes view flattening).
     * Width is set inline via PILL_WIDTH.
     */
    pill: {
        height: PILL_HEIGHT,
        borderRadius: PILL_HEIGHT / 2,
        borderWidth: 1,
        borderColor: theme.colors.specularBorderStart,
        shadowColor: theme.colors.navPillShadow,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.7,
        shadowRadius: 24,
        elevation: 24,
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'center',
    },

    /**
     * Android fallback — solid translucent background.
     * Replaces BlurView because Android blurs on the CPU and stutters
     * every indicator frame. `overlayLockAndroid` is tuned for exactly
     * this purpose (see theme.ts).
     */
    pillAndroidSolid: {
        backgroundColor: theme.colors.overlayLockAndroid,
    },

    /** Sliding active indicator — "Layer B" */
    indicator: {
        position: 'absolute',
        top: 7,
        left: 0,
        height: PILL_HEIGHT - 14,
        borderRadius: (PILL_HEIGHT - 14) / 2,
        backgroundColor: theme.colors.navIndicatorBackground,
        borderWidth: 1,
        borderColor: theme.colors.navIndicatorBorder,
    },

    /** Row of tab buttons — "Layer C" */
    tabRow: {
        flexDirection: 'row',
        flex: 1,
        height: PILL_HEIGHT,
        zIndex: 2,
    },

    /** Individual tab — perfectly centered icon (no gap, no label) */
    tab: {
        alignItems: 'center',
        justifyContent: 'center',
        height: PILL_HEIGHT,
    },

    /** Icon wrapper for badge positioning */
    iconContainer: {
        position: 'relative',
    },

    /** Urgent notification dot */
    urgentDot: {
        position: 'absolute',
        top: -3,
        right: -5,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: theme.colors.gold,
        zIndex: 3,
    },
});
