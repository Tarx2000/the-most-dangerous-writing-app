import React from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { CONFIG } from '../config';

/**
 * DangerOverlay - Visual feedback overlay for idle danger state.
 * 
 * Renders two layers ABOVE the writing content (zIndex 4 & 5):
 * 1. A dark fog overlay that fades in at 50% idle time (simulates blur/fog)
 * 2. A colored border that intensifies from 20% idle time
 * 
 * Uses Animated for smooth transitions. The fog uses a semi-transparent
 * dark background instead of BlurView for reliable Android rendering.
 */
interface Props {
    idleTimeMs: number;
    difficultyLimit: number;
    hasLost: boolean;
    isContinuingAfterLoss: boolean;
    sessionTimeRemaining: number;
    /** If true, danger overlay is completely disabled (e.g. Quick Notes) */
    isDisabled?: boolean;
}

export const DangerOverlay: React.FC<Props> = React.memo(({
    idleTimeMs,
    difficultyLimit,
    hasLost,
    isContinuingAfterLoss,
    sessionTimeRemaining,
    isDisabled
}) => {
    const animatedDanger = React.useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        // When disabled (Quick Notes), always stay at 0
        if (isDisabled) {
            animatedDanger.setValue(0);
            return;
        }

        let targetValue = 0;
        if (!hasLost && !isContinuingAfterLoss && sessionTimeRemaining > 0 && difficultyLimit > 0) {
            // targetValue is the ratio of idleTime to difficultyLimit (0 to 1)
            targetValue = Math.min(idleTimeMs / difficultyLimit, 1);
        }

        Animated.timing(animatedDanger, {
            toValue: targetValue,
            duration: 150,
            useNativeDriver: false, // borderColor and backgroundColor don't support native driver
        }).start();
    }, [idleTimeMs, difficultyLimit, hasLost, isContinuingAfterLoss, sessionTimeRemaining, isDisabled]);

    // Dark fog opacity: invisible until 50% idle, then ramps to strong coverage
    const fogOpacity = animatedDanger.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, 0, 0.85],
        extrapolate: 'clamp'
    });

    // Red glow starts earlier at 30% idle, builds gradually
    const redGlowOpacity = animatedDanger.interpolate({
        inputRange: [0, 0.3, 0.7, 1],
        outputRange: [0, 0, 0.3, 0.6],
        extrapolate: 'clamp'
    });

    // Border color: safe until 20% idle, then ramps to danger red
    const borderColor = animatedDanger.interpolate({
        inputRange: [0, 0.2, 1],
        outputRange: [
            CONFIG.SAFE_BORDER_COLOR,
            CONFIG.SAFE_BORDER_COLOR,
            `rgba(${CONFIG.DANGER_COLOR_RGB.r}, ${CONFIG.DANGER_COLOR_RGB.g}, ${CONFIG.DANGER_COLOR_RGB.b}, 1)`
        ],
        extrapolate: 'clamp'
    });

    // Border width: thin until 20% idle, then grows thicker
    const borderWidth = animatedDanger.interpolate({
        inputRange: [0, 0.2, 1],
        outputRange: [4, 4, 10],
        extrapolate: 'clamp'
    });

    // Don't render anything if disabled
    if (isDisabled) return null;

    return (
        <>
            {/* Red glow layer - starts at 30% idle, builds to strong red tint */}
            <Animated.View style={[StyleSheet.absoluteFill, {
                zIndex: 4,
                pointerEvents: 'none',
                backgroundColor: `rgba(${CONFIG.DANGER_COLOR_RGB.r}, ${CONFIG.DANGER_COLOR_RGB.g}, ${CONFIG.DANGER_COLOR_RGB.b}, 1)`,
                opacity: redGlowOpacity,
            }]} />
            {/* Dark fog overlay - renders ABOVE content at zIndex 5 */}
            <Animated.View style={[StyleSheet.absoluteFill, {
                zIndex: 5,
                pointerEvents: 'none',
                backgroundColor: 'rgba(0, 0, 0, 1)',
                opacity: fogOpacity,
            }]} />
            {/* Border overlay - renders ABOVE fog at zIndex 6 */}
            <Animated.View style={[StyleSheet.absoluteFill, {
                zIndex: 6,
                pointerEvents: 'none',
                borderWidth: borderWidth,
                borderColor: borderColor,
            }]} />
        </>
    );
});

