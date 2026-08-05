import React, { useCallback } from 'react';
import { Pressable, ViewStyle, StyleProp, GestureResponderEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { theme } from '@/styles/theme';

/**
 * AnimatedScaleButton
 *
 * A premium drop-in replacement for TouchableOpacity that provides fluid,
 * UI-thread scaling and opacity animation on press.
 *
 * Architecture: Uses React Native's `Pressable` for reliable touch handling
 * (works everywhere: Modals, ScrollViews, nested gesture contexts) combined
 * with Reanimated shared values for 60fps UI-thread animations.
 *
 * Previous approach using GestureDetector was broken because:
 * 1. GestureDetector doesn't work inside RN Modal (no GestureHandlerRootView)
 * 2. onPointerUp/Down are web-only and silently ignored on native
 * 3. Gesture conflicts with parent ScrollViews and PanResponders
 *
 * This Pressable + Reanimated approach avoids all those issues while
 * keeping the premium spring animation on the native UI thread.
 */

/* ── Configurable defaults ──────────────────────────────────────────── */

/** How much the button shrinks on press (1 = no shrink, 0.9 = 10% shrink) */
const DEFAULT_ACTIVE_SCALE = 0.95;

/** Opacity when pressed (0 = invisible, 1 = no change) */
const DEFAULT_ACTIVE_OPACITY = 0.8;

/* ── Press spring ───────────────────────────────────────────────────────
   Uses the `springSnappy` theme preset (damping 35) for a clean, non-overshooting
   press feel — per animations.md, no inline spring configs. */

interface AnimatedScaleButtonProps {
    /** Fires when the button is tapped */
    onPress?: (event?: GestureResponderEvent) => void;
    /** Fires on a long press (default ~500ms) */
    onLongPress?: (event?: GestureResponderEvent) => void;
    /** Fires when the finger first touches the button */
    onPressIn?: (event?: GestureResponderEvent) => void;
    /** Fires when the finger lifts or the gesture is cancelled */
    onPressOut?: (event?: GestureResponderEvent) => void;
    style?: StyleProp<ViewStyle>;
    /** Scale factor when pressed (default: 0.95) */
    activeScale?: number;
    /** Opacity when pressed (default: 0.8) */
    activeOpacity?: number;
    /** Disable all interactions */
    disabled?: boolean;
    /** Key for list rendering */
    key?: string | number;
    children?: React.ReactNode;
}

export const AnimatedScaleButton: React.FC<AnimatedScaleButtonProps> = React.memo(
    ({
        onPress,
        onLongPress,
        onPressIn,
        onPressOut,
        style,
        activeScale = DEFAULT_ACTIVE_SCALE,
        activeOpacity = DEFAULT_ACTIVE_OPACITY,
        disabled = false,
        children,
    }) => {
        /* ── Shared values for UI-thread animation ──────────────────────── */
        const scale = useSharedValue(1);
        const opacity = useSharedValue(1);

        /* ── Press handlers bridge Pressable events to Reanimated ──────── */
        const handlePressIn = useCallback(
            (e: GestureResponderEvent) => {
                scale.value = withSpring(activeScale, theme.animation.springSnappy);
                opacity.value = withTiming(activeOpacity, { duration: 100 });
                onPressIn?.(e);
            },
            [activeScale, activeOpacity, onPressIn, scale, opacity],
        );

        const handlePressOut = useCallback(
            (e: GestureResponderEvent) => {
                scale.value = withSpring(1, theme.animation.springSnappy);
                opacity.value = withTiming(1, { duration: 150 });
                onPressOut?.(e);
            },
            [onPressOut, scale, opacity],
        );

        /* ── Animated style runs entirely on the UI thread ──────────────── */
        const animatedStyle = useAnimatedStyle(() => ({
            transform: [{ scale: scale.value }],
            opacity: opacity.value,
        }));

        return (
            <Pressable
                onPress={onPress}
                onLongPress={onLongPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                disabled={disabled}
            >
                <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
            </Pressable>
        );
    },
);
