import React, { useLayoutEffect, useRef } from 'react';
import { View, Pressable, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnUI } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '@/styles/theme';

/* ── CONFIGURABLE ─────────────────────────────────────────────────────────── */

/** Width of the pill relative to the screen (0.88 = 88%) */
const PILL_WIDTH_RATIO = 0.88;

/** Total pill height — increased for icon-only layout */
const PILL_HEIGHT = 72;

/** Icon size — larger now that labels are removed */
const ICON_SIZE = 26;

/**
 * Indicator spring configuration.
 * Tuned for a visibly-smooth settle that masks occasional JS lag.
 * Lower stiffness (200) + higher mass (0.8) = longer travel (~120ms)
 * with a pronounced slide rather than an instant snap.
 */
const INDICATOR_SPRING = {
    damping: 18,
    stiffness: 200,
    mass: 0.8,
};

/* ── COMPONENT ────────────────────────────────────────────────────────────── */

/**
 * LiquidGlassNav — Premium floating pill navigation bar (icon-only).
 *
 * Design:
 * - Multi-layer glass effect: BlurView + dark tint + specular highlight
 * - Icon-only tabs (no labels) for a cleaner, more modern look
 * - Larger pill height (72px) with bigger icons (26px)
 * - Top-edge specular gradient simulates light refraction on glass
 *
 * Performance:
 * - Wrapped in React.memo to skip scroll-event re-renders
 * - Uses raw Pressable for instant tap response (<16ms)
 * - Indicator animation in useEffect (not render-time) for stutter-free sliding
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

    /** Track previous activeIndex to avoid duplicate spring triggers */
    const prevActiveIndexRef = useRef(activeIndex);

    /**
     * Drive indicator to the new position synchronously BEFORE paint commits.
     * useLayoutEffect fires after DOM mutations but before the browser paints,
     * eliminating the one-frame delay caused by useEffect.
     *
     * For extra safety on rapid switches, we also guard against duplicate
     * targets and batch the spring start on the UI thread via runOnUI.
     */
    useLayoutEffect(() => {
        if (activeIndex === prevActiveIndexRef.current) return;
        prevActiveIndexRef.current = activeIndex;

        const targetX = activeIndex * tabWidth;
        // UI-thread spring: avoids being queued behind JS work
        runOnUI(() => {
            'worklet';
            indicatorX.value = withSpring(targetX, INDICATOR_SPRING);
        })();
    }, [activeIndex, tabWidth, indicatorX]);

    /** Indicator padding from edges */
    const INDICATOR_PADDING = 7;

    const indicatorStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: indicatorX.value + INDICATOR_PADDING }],
    }));

    return (
        <View style={styles.wrapper}>
            <View style={[styles.pill, { width: PILL_WIDTH }]}>
                {/* Layer 1: Frosted glass blur */}
                <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />

                {/* Layer 2: Dense dark tint for depth */}
                <View style={styles.tintOverlay} />

                {/* Layer 3: Specular highlight — top-edge gradient simulating glass refraction */}
                <LinearGradient
                    colors={[
                        theme.colors.navSpecularHighlightStart,
                        theme.colors.navSpecularHighlightMid,
                        'transparent',
                    ]}
                    style={styles.specularHighlight}
                />

                {/* Sliding active indicator — vertically centered */}
                <Animated.View
                    style={[styles.indicator, { width: tabWidth - INDICATOR_PADDING * 2 }, indicatorStyle]}
                />

                {/* Tab items — icon only, no labels */}
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
    /** Positioned at the bottom of the screen */
    wrapper: {
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 30 : 16,
        width: '100%',
        alignItems: 'center',
        zIndex: 999,
    },

    /** The glass pill — taller, more opaque, stronger border glow */
    pill: {
        height: PILL_HEIGHT,
        borderRadius: PILL_HEIGHT / 2,
        overflow: 'hidden',
        // Liquid glass border — slightly brighter for more definition
        borderWidth: 1,
        borderColor: theme.colors.navPillBorder,
        // Stronger glow shadow for floating effect
        shadowColor: theme.colors.navPillShadow,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.7,
        shadowRadius: 24,
        elevation: 24,
    },

    /**
     * Layer 2: Dense tint overlay — more opaque for a solid "liquid glass" look
     * rather than a thin barely-visible frosted effect.
     */
    tintOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: theme.colors.navPillBackground,
    },

    /**
     * Layer 3: Specular highlight on the top edge.
     * Simulates the way light refracts through real glass surfaces,
     * creating a subtle bright strip along the top of the pill.
     */
    specularHighlight: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: PILL_HEIGHT * 0.4,
    },

    /** Sliding highlight — vertically centered with equal padding top/bottom */
    indicator: {
        position: 'absolute',
        top: 7,
        height: PILL_HEIGHT - 14,
        borderRadius: (PILL_HEIGHT - 14) / 2,
        backgroundColor: theme.colors.navIndicatorBackground,
        borderWidth: 1,
        borderColor: theme.colors.navIndicatorBorder,
    },

    /** Row of tab buttons */
    tabRow: {
        flexDirection: 'row',
        flex: 1,
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
