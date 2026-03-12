import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, SharedValue } from 'react-native-reanimated';
import { CONFIG } from '@/config';

/**
 * DangerOverlay - Visual feedback overlay for idle danger state.
 * 
 * Renders three layers ABOVE the writing content (zIndex 4, 5 & 6):
 * 1. A red glow layer that fades in at 30% idle time
 * 2. A dark fog overlay that fades in at 50% idle time
 * 3. A colored border that intensifies from 20% idle time
 * 
 * Performance: All visual updates run entirely on the UI thread via
 * Reanimated `useAnimatedStyle`. The `idleTimeMsShared` SharedValue
 * is updated by the idle timer in useSession WITHOUT triggering any
 * React state changes, so this component never re-renders from the timer.
 */
interface Props {
    /** Reanimated SharedValue — idle time in ms, updated every 100ms on JS thread */
    idleTimeMsShared: SharedValue<number>;
    difficultyLimit: number;
    hasLost: boolean;
    isContinuingAfterLoss: boolean;
    sessionTimeRemaining: number;
    /** If true, danger overlay is completely disabled (e.g. Quick Notes) */
    isDisabled?: boolean;
}

export const DangerOverlay: React.FC<Props> = React.memo(({
    idleTimeMsShared,
    difficultyLimit,
    hasLost,
    isContinuingAfterLoss,
    sessionTimeRemaining,
    isDisabled
}) => {
    // Don't render anything if disabled
    if (isDisabled) return null;

    /**
     * Red glow layer style — runs entirely on UI thread.
     * Starts visible at 30% idle, reaches 0.6 opacity at 100%.
     */
    const redGlowStyle = useAnimatedStyle(() => {
        const isActive = !hasLost && !isContinuingAfterLoss && sessionTimeRemaining > 0 && difficultyLimit > 0;
        if (!isActive) return { opacity: 0 };

        const ratio = Math.min(idleTimeMsShared.value / difficultyLimit, 1);
        // Interpolate: 0→0, 0.3→0, 0.7→0.3, 1→0.6
        let opacity = 0;
        if (ratio > 0.3) {
            if (ratio <= 0.7) {
                opacity = ((ratio - 0.3) / 0.4) * 0.3;
            } else {
                opacity = 0.3 + ((ratio - 0.7) / 0.3) * 0.3;
            }
        }
        return { opacity };
    });

    /**
     * Dark fog layer style — runs entirely on UI thread.
     * Invisible until 50% idle, then ramps to strong 0.85 coverage.
     */
    const fogStyle = useAnimatedStyle(() => {
        const isActive = !hasLost && !isContinuingAfterLoss && sessionTimeRemaining > 0 && difficultyLimit > 0;
        if (!isActive) return { opacity: 0 };

        const ratio = Math.min(idleTimeMsShared.value / difficultyLimit, 1);
        // Interpolate: 0→0, 0.5→0, 1→0.85
        const opacity = ratio <= 0.5 ? 0 : ((ratio - 0.5) / 0.5) * 0.85;
        return { opacity };
    });

    /**
     * Border layer style — runs entirely on UI thread.
     * Thin until 20% idle, then border grows thicker and turns danger red.
     */
    const borderStyle = useAnimatedStyle(() => {
        const isActive = !hasLost && !isContinuingAfterLoss && sessionTimeRemaining > 0 && difficultyLimit > 0;
        if (!isActive) return { borderWidth: 4, borderColor: CONFIG.SAFE_BORDER_COLOR };

        const ratio = Math.min(idleTimeMsShared.value / difficultyLimit, 1);
        // Border width: 4 until 20%, then ramps to 10
        const borderWidth = ratio <= 0.2 ? 4 : 4 + ((ratio - 0.2) / 0.8) * 6;
        // Border color: safe until 20%, then shifts to danger
        const dangerBlend = ratio <= 0.2 ? 0 : (ratio - 0.2) / 0.8;
        const r = CONFIG.DANGER_COLOR_RGB.r;
        const g = CONFIG.DANGER_COLOR_RGB.g;
        const b = CONFIG.DANGER_COLOR_RGB.b;
        const borderColor = dangerBlend <= 0
            ? CONFIG.SAFE_BORDER_COLOR
            : `rgba(${r}, ${g}, ${b}, ${dangerBlend})`;
        return { borderWidth, borderColor };
    });

    return (
        <>
            {/* Red glow layer - starts at 30% idle, builds to strong red tint */}
            <Animated.View style={[StyleSheet.absoluteFill, {
                zIndex: 4,
                pointerEvents: 'none',
                backgroundColor: `rgba(${CONFIG.DANGER_COLOR_RGB.r}, ${CONFIG.DANGER_COLOR_RGB.g}, ${CONFIG.DANGER_COLOR_RGB.b}, 1)`,
            }, redGlowStyle]} />
            {/* Dark fog overlay - renders ABOVE content at zIndex 5 */}
            <Animated.View style={[StyleSheet.absoluteFill, {
                zIndex: 5,
                pointerEvents: 'none',
                backgroundColor: 'rgba(0, 0, 0, 1)',
            }, fogStyle]} />
            {/* Border overlay - renders ABOVE fog at zIndex 6 */}
            <Animated.View style={[StyleSheet.absoluteFill, {
                zIndex: 6,
                pointerEvents: 'none',
            }, borderStyle]} />
        </>
    );
});
