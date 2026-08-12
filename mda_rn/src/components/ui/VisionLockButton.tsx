import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from 'react-native-reanimated';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { AnimatedLockIcon } from '@/components/ui/AnimatedLockIcon';
import { theme } from '@/styles/theme';
import { commonStyles } from '@/styles/commonStyles';

/* -- CUSTOMIZABLE CONFIGURATION VARIABLES ---------------------------------- */
const CONFIG = {
    /** Duration in milliseconds of the cross-dissolve fade and scale animation */
    TRANSITION_DURATION: 250,
    /** Delay in milliseconds before the cross-dissolve starts (letting the lock shackle finish swinging open) */
    UNLOCK_DELAY: 300,
    /** Scale factor that the lock layer shrinks to when disappearing */
    LOCKED_SCALE_END: 0.85,
    /** Scale factor that the star/vision layer starts from when appearing */
    UNLOCKED_SCALE_START: 0.85,
    /** Rotation angle in degrees for the transition swirl effect */
    ROTATION_ANGLE: 25,
    /** Scale factor applied when the user presses the button down */
    ACTIVE_SCALE: 0.96,
};

interface Props {
    /** True if the application is fully unlocked */
    isUnlocked: boolean;
    /** Callback triggered when the button is tapped */
    onPress: () => void;
    /** Callback triggered when the button is long pressed */
    onLongPress: () => void;
}

/**
 * VisionLockButton - A premium, custom-animated lock-to-star transition button.
 *
 * When locked:
 * - Shows the AnimatedLockIcon in its closed state, with the label "Locked" in warning-red.
 *
 * When unlocked:
 * - The lock icon shackle swings open.
 * - After a 300ms delay, the lock layer shrinks, rotates, and fades out.
 * - Concurrently, a premium gold star and the label "Vision" fade in, scaling up and rotating.
 *
 * Layout Safety:
 * Uses a zero-opacity placeholder representation of the unlocked state to reserve
 * precise layout space, ensuring the button width remains rock-solid and never jumps
 * during transitions.
 */
export const VisionLockButton: React.FC<Props> = React.memo(({ isUnlocked, onPress, onLongPress }) => {
    // Shared value for animation progress (0 = Fully Locked, 1 = Fully Unlocked)
    const animationProgress = useSharedValue(isUnlocked ? 1 : 0);

    useEffect(() => {
        if (isUnlocked) {
            // Unlock: Delay transition until lock shackle is open, then run ease-out cubic timing
            animationProgress.value = withDelay(
                CONFIG.UNLOCK_DELAY,
                withTiming(1, {
                    duration: CONFIG.TRANSITION_DURATION,
                    easing: Easing.bezier(0.25, 0.1, 0.25, 1),
                }),
            );
        } else {
            // Lock: Return to closed state immediately without delay
            animationProgress.value = withTiming(0, {
                duration: CONFIG.TRANSITION_DURATION,
                easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            });
        }
    }, [isUnlocked, animationProgress]);

    // Locked Layer Style: Fades out, shrinks slightly, and rotates clockwise.
    // pointerEvents is driven from React state (not the worklet) so it flips
    // exactly once per transition instead of being re-evaluated every frame.
    const lockedLayerStyle = useAnimatedStyle(() => {
        const p = animationProgress.value;
        const scaleVal = 1 - p * (1 - CONFIG.LOCKED_SCALE_END);
        const rotateVal = `${p * CONFIG.ROTATION_ANGLE}deg` as const;
        return {
            opacity: 1 - p,
            transform: [{ scale: scaleVal }, { rotate: rotateVal }],
        };
    });

    // Unlocked Layer Style: Fades in, scales up, and rotates counter-clockwise into place
    const unlockedLayerStyle = useAnimatedStyle(() => {
        const p = animationProgress.value;
        const scaleVal = CONFIG.UNLOCKED_SCALE_START + p * (1 - CONFIG.UNLOCKED_SCALE_START);
        const rotateVal = `${-CONFIG.ROTATION_ANGLE + p * CONFIG.ROTATION_ANGLE}deg` as const;
        return {
            opacity: p,
            transform: [{ scale: scaleVal }, { rotate: rotateVal }],
        };
    });

    return (
        <AnimatedScaleButton
            style={styles.button}
            onPress={onPress}
            onLongPress={onLongPress}
            activeScale={CONFIG.ACTIVE_SCALE}
        >
            {/* Stable layout driver: Invisible dummy view matching the largest size (Unlocked) */}
            <View style={styles.layoutPlaceholder} pointerEvents="none">
                <MaterialCommunityIcons name="pillar" size={16} style={{ opacity: 0 }} />
                <Text style={[commonStyles.iconButtonText, { opacity: 0, marginLeft: 4 }]}>Masteries</Text>
            </View>

            {/* Locked Content Layer */}
            <Animated.View
                pointerEvents={isUnlocked ? 'none' : 'auto'}
                style={[StyleSheet.absoluteFillObject, styles.layer, lockedLayerStyle]}
            >
                <AnimatedLockIcon isUnlocked={isUnlocked} size={16} color={theme.colors.dangerIconOverlay} />
                <Text style={[commonStyles.iconButtonText, styles.lockedText]}>Locked</Text>
            </Animated.View>

            {/* Unlocked Content Layer */}
            <Animated.View
                pointerEvents={isUnlocked ? 'auto' : 'none'}
                style={[StyleSheet.absoluteFillObject, styles.layer, unlockedLayerStyle]}
            >
                <MaterialCommunityIcons name="pillar" size={16} color={theme.colors.gold} />
                <Text style={[commonStyles.iconButtonText, styles.unlockedText]}>Masteries</Text>
            </Animated.View>
        </AnimatedScaleButton>
    );
});

const styles = StyleSheet.create({
    button: {
        ...commonStyles.iconButton,
        position: 'relative',
        overflow: 'hidden',
        minHeight: 38, // Ensures standard header button height is preserved
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 0, // Clears vertical paddings to let minHeight dictate alignment
    },
    layoutPlaceholder: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    layer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    lockedText: {
        color: theme.colors.dangerIconOverlay,
        marginLeft: 4,
    },
    unlockedText: {
        color: theme.colors.textPrimary,
        marginLeft: 4,
    },
});
