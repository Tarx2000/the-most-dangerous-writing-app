import React, { useLayoutEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '@/styles/theme';

/* ── CONFIGURABLE ─────────────────────────────────────────────────────────── */

/** Width of the pill relative to the screen (0.88 = 88%) */
const PILL_WIDTH_RATIO = 0.88;

/** Total pill height — icon + label layout */
const PILL_HEIGHT = 62;

/** Icon size */
const ICON_SIZE = 22;

/** Label size */
const LABEL_SIZE = 10;

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
 * Floating pill navigation bar — icon + text label per tab.
 *
 * Deliberately NOT liquid glass: BlurView was removed entirely because Android
 * renders blurs on the CPU (stutters on the sliding indicator) and the solid
 * AMOLED surface is faster on both platforms.
 *
 * Layer architecture (max 3 stacked visible layers):
 *
 *   Layer A — Pill background (solid translucent AMOLED surface)
 *   Layer B — Sliding indicator (the "bubble")
 *   Layer C — Row of Pressable tabs (icon + label)
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
    const insets = useSafeAreaInsets();
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
        <View style={[styles.wrapper, { bottom: insets.bottom + 14 }]}>
            <View style={[styles.pill, { width: PILL_WIDTH }]}>
                {/*
                 * Layer B — Sliding active indicator (the "bubble").
                 * Vertically centered, equal padding top/bottom.
                 */}
                <Animated.View
                    style={[styles.indicator, { width: tabWidth - INDICATOR_PADDING * 2 }, indicatorStyle]}
                />

                {/*
                 * Layer C — Row of tab items (icon + text label).
                 * Sits above the indicator so the active tab "pops".
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
                                <Text
                                    style={[
                                        styles.tabLabel,
                                        { color: isActive ? theme.colors.navIconActive : theme.colors.navIconInactive },
                                    ]}
                                >
                                    {item.label}
                                </Text>
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
        width: '100%',
        alignItems: 'center',
        zIndex: 999,
    },

    /**
     * The pill — single visible "Layer A".
     * Solid translucent AMOLED surface (no BlurView — see component comment).
     * Carries border, radius, shadow, and overflow clipping so all visual
     * properties collapse into one native view (maximizes view flattening).
     */
    pill: {
        height: PILL_HEIGHT,
        borderRadius: PILL_HEIGHT / 2,
        borderWidth: 1,
        borderColor: theme.colors.specularBorderStart,
        backgroundColor: theme.colors.overlayLockAndroid,
        shadowColor: theme.colors.navPillShadow,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.7,
        shadowRadius: 24,
        elevation: 24,
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'center',
    },

    /** Sliding active indicator — "Layer B" */
    indicator: {
        position: 'absolute',
        top: 6,
        left: 0,
        height: PILL_HEIGHT - 12,
        borderRadius: (PILL_HEIGHT - 12) / 2,
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

    /** Individual tab — icon above, label below */
    tab: {
        alignItems: 'center',
        justifyContent: 'center',
        height: PILL_HEIGHT,
    },

    /** Icon wrapper for badge positioning */
    iconContainer: {
        position: 'relative',
        marginBottom: 2,
    },

    /** Tab text label */
    tabLabel: {
        fontSize: LABEL_SIZE,
        fontWeight: '600',
        letterSpacing: 0.2,
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
