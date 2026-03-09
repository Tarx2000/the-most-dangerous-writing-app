import React from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { CONFIG } from '../config';

interface Props {
    idleTimeMs: number;
    difficultyLimit: number;
    hasLost: boolean;
    isContinuingAfterLoss: boolean;
    sessionTimeRemaining: number;
}

export const DangerOverlay: React.FC<Props> = React.memo(({
    idleTimeMs,
    difficultyLimit,
    hasLost,
    isContinuingAfterLoss,
    sessionTimeRemaining
}) => {
    let blurIntensity = 0;
    if (!hasLost && !isContinuingAfterLoss && sessionTimeRemaining > 0 && difficultyLimit > 0) {
        const dangerThreshold = difficultyLimit * CONFIG.BLUR_RATIO_START;
        if (idleTimeMs > dangerThreshold) {
            blurIntensity = ((idleTimeMs - dangerThreshold) / (difficultyLimit - dangerThreshold)) * 100;
        }
    }

    const getBorderColor = () => {
        if (hasLost || isContinuingAfterLoss || sessionTimeRemaining === 0) return 'transparent';
        const threshold = difficultyLimit * 0.5;
        if (idleTimeMs > threshold) {
            const dangerRatio = (idleTimeMs - threshold) / (difficultyLimit - threshold);
            const { r, g, b } = CONFIG.DANGER_COLOR_RGB;
            return `rgba(${r}, ${g}, ${b}, ${dangerRatio})`;
        }
        return CONFIG.SAFE_BORDER_COLOR;
    };

    return (
        <>
            {blurIntensity > 0 && !hasLost && (
                <BlurView
                    intensity={Math.min(blurIntensity, 100)}
                    tint="dark"
                    style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
                    pointerEvents="none"
                />
            )}
            <View style={[StyleSheet.absoluteFill, {
                zIndex: 2,
                pointerEvents: 'none',
                borderWidth: blurIntensity > 0 ? 8 : 4,
                borderColor: getBorderColor(),
            }]} />
        </>
    );
}, (prev, next) => {
    // Only re-render if the rounded blur intensity or border color would actually change significantly
    const prevBlur = prev.idleTimeMs > (prev.difficultyLimit * CONFIG.BLUR_RATIO_START);
    const nextBlur = next.idleTimeMs > (next.difficultyLimit * CONFIG.BLUR_RATIO_START);
    if (prevBlur !== nextBlur) return false;
    if (!nextBlur && prev.idleTimeMs === next.idleTimeMs) return true;

    // Throttle updates: only re-render if idleTimeMs changed by more than 100ms or hit limits
    return Math.abs(prev.idleTimeMs - next.idleTimeMs) < 100 && prev.hasLost === next.hasLost;
});
