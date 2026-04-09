import React from 'react';
import {
    View,
    Pressable,
    StyleSheet,
    useWindowDimensions,
    Platform,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
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

/** Indicator spring physics for the premium slide effect */
const INDICATOR_SPRING = {
    damping: 20,
    stiffness: 200,
    mass: 0.6,
};

/* ── COMPONENT ────────────────────────────────────────────────────────────── */

/**
 * LiquidGlassNav — Premium floating pill navigation bar (icon-only).
 *
 * Design:
 * - Thicker, more opaque glass for a stronger "liquid" feel
 * - Icon-only tabs (no labels) for a cleaner, more modern look
 * - Larger pill height (72px) with bigger icons (26px)
 * - Perfectly centered icons via flexbox (no gap offset)
 *
 * Performance:
 * - Wrapped in React.memo to skip scroll-event re-renders
 * - Uses raw Pressable for instant tap response (<16ms)
 * - Sliding indicator uses spring animation for premium feel
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
    const PILL_WIDTH = SCREEN_WIDTH * PILL_WIDTH_RATIO;

    const activeIndex = items.findIndex(i => i.id === activeId);
    const tabWidth = PILL_WIDTH / items.length;

    /** Animated position for the sliding indicator */
    const indicatorX = useSharedValue(activeIndex * tabWidth);

    /**
     * Drive indicator to the new position on activeId change.
     * Since the component is memoized, this only fires when activeId changes.
     */
    const targetX = activeIndex * tabWidth;
    if (indicatorX.value !== targetX) {
        indicatorX.value = withSpring(targetX, INDICATOR_SPRING);
    }

    /** Indicator padding from edges */
    const INDICATOR_PADDING = 7;

    const indicatorStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: indicatorX.value + INDICATOR_PADDING }],
    }));

    return (
        <View style={styles.wrapper}>
            <View style={[styles.pill, { width: PILL_WIDTH }]}>
                {/* Frosted glass — higher intensity for more opaque "liquid" feel */}
                <BlurView
                    intensity={60}
                    tint="dark"
                    style={StyleSheet.absoluteFillObject}
                />

                {/* Dense tint overlay — darker and more opaque for liquid glass effect */}
                <View style={styles.tintOverlay} />

                {/* Sliding active indicator — vertically centered */}
                <Animated.View
                    style={[
                        styles.indicator,
                        { width: tabWidth - (INDICATOR_PADDING * 2) },
                        indicatorStyle
                    ]}
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
                                    {item.urgent && (
                                        <View style={styles.urgentDot} />
                                    )}
                                    <MaterialCommunityIcons
                                        name={item.icon as any}
                                        size={ICON_SIZE}
                                        color={isActive ? theme.colors.textPrimary : 'rgba(255,255,255,0.35)'}
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
        borderColor: 'rgba(255, 255, 255, 0.18)',
        // Stronger glow shadow for floating effect
        shadowColor: 'rgba(0, 0, 0, 0.9)',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.7,
        shadowRadius: 24,
        elevation: 24,
    },

    /**
     * Denser tint overlay — more opaque for a solid "liquid glass" look
     * rather than a thin barely-visible frosted effect.
     */
    tintOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(10, 10, 10, 0.75)',
    },

    /** Sliding highlight — vertically centered with equal padding top/bottom */
    indicator: {
        position: 'absolute',
        top: 7,
        height: PILL_HEIGHT - 14,
        borderRadius: (PILL_HEIGHT - 14) / 2,
        backgroundColor: 'rgba(255, 255, 255, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
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
        backgroundColor: '#FFD700',
        zIndex: 3,
    },
});
