import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    useAnimatedReaction,
    withTiming,
    withRepeat,
    withSequence,
    SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { theme } from '@/styles/theme';

/**
 * DangerOverlay — Blood vignette visual feedback for idle danger state.
 *
 * Renders a full-screen SVG RadialGradient vignette that seeps inward
 * from the edges as the user stops typing. Above 75% idle, a heartbeat
 * pulse contracts the vignette rhythmically.
 *
 * Architecture:
 *  - An `Animated.View` wrapper handles opacity + scale (GPU-composited).
 *  - A plain `<Svg>` inside renders the radial gradient (no Animated wrapping
 *    needed — react-native-svg doesn't support Reanimated style props directly).
 *  - The container is sized to 120% of screen dimensions and offset by -10%
 *    so that heartbeat-scale contractions never reveal screen boundaries.
 *
 * Performance: All transitions run on the UI thread via useAnimatedStyle.
 * The component never re-renders from the idle timer (SharedValue-driven).
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

/* ── CONFIGURABLE: Vignette timing thresholds ─────────────────────────── */

/** Idle ratio below which the vignette is fully invisible */
const VIGNETTE_FADE_START = 0.15;
/** Idle ratio above which the heartbeat pulse kicks in */
const HEARTBEAT_START = 0.75;
/** How far inward the heartbeat contracts the vignette (0.06 = 6% scale) */
const HEARTBEAT_CONTRACTION = 0.06;
/** Container overscan factor (1.2 = 120% of screen, prevents edge gaps) */
const OVERSCAN = 1.2;

export const DangerOverlay: React.FC<Props> = React.memo(
    ({ idleTimeMsShared, difficultyLimit, hasLost, isContinuingAfterLoss, sessionTimeRemaining, isDisabled }) => {
        const { width: screenWidth, height: screenHeight } = useWindowDimensions();

        // Pulse animation value for heartbeat contraction effect
        const heartbeatPulse = useSharedValue(0);

        // Watch idle time to trigger/stop heartbeat pulse entirely on the UI thread
        useAnimatedReaction(
            () => {
                if (difficultyLimit <= 0) return 0;
                return Math.min(idleTimeMsShared.value / difficultyLimit, 1);
            },
            (ratio) => {
                const isActive = !hasLost && !isContinuingAfterLoss && sessionTimeRemaining > 0;
                if (isActive && ratio > HEARTBEAT_START) {
                    // Start a physical heartbeat contraction (lub-dub pattern with pause)
                    if (heartbeatPulse.value === 0) {
                        heartbeatPulse.value = withRepeat(
                            withSequence(
                                withTiming(1.0, { duration: 120 }), // Primary contraction (lub)
                                withTiming(0.0, { duration: 120 }),
                                withTiming(0.6, { duration: 100 }), // Secondary contraction (dub)
                                withTiming(0.0, { duration: 600 }), // Pause before next heartbeat
                            ),
                            -1, // Loop infinitely
                            false,
                        );
                    }
                } else {
                    // Instantly reset the pulse when safe or session ends
                    heartbeatPulse.value = 0;
                }
            },
            [difficultyLimit, hasLost, isContinuingAfterLoss, sessionTimeRemaining],
        );

        /**
         * Animated.View wrapper style — drives opacity + scale on the GPU.
         * The SVG inside is a static child; only the View's compositing props change.
         */
        const vignetteStyle = useAnimatedStyle(() => {
            const isActive = !hasLost && !isContinuingAfterLoss && sessionTimeRemaining > 0 && difficultyLimit > 0;
            if (!isActive) return { opacity: 0, transform: [{ scale: 1.15 }] };

            const ratio = Math.min(idleTimeMsShared.value / difficultyLimit, 1);

            // Fades in starting at VIGNETTE_FADE_START, reaching 95% max opacity at 100%
            const opacity =
                ratio <= VIGNETTE_FADE_START ? 0 : ((ratio - VIGNETTE_FADE_START) / (1 - VIGNETTE_FADE_START)) * 0.95;

            // Seeps inward: scale goes from 1.12 (edges hidden) down to 1.0 (fully visible)
            const baseScale =
                ratio <= VIGNETTE_FADE_START
                    ? 1.12
                    : 1.12 - ((ratio - VIGNETTE_FADE_START) / (1 - VIGNETTE_FADE_START)) * 0.12;

            // Heartbeat pulse: contracts scale further inward (lub-dub throbbing effect)
            const pulseScale = heartbeatPulse.value * -HEARTBEAT_CONTRACTION;

            return {
                opacity,
                transform: [{ scale: baseScale + pulseScale }],
            };
        });

        /**
         * Dark fog layer style — runs entirely on UI thread.
         * Renders below the blood vignette, fades in above 50% idle to obscure text.
         */
        const fogStyle = useAnimatedStyle(() => {
            const isActive = !hasLost && !isContinuingAfterLoss && sessionTimeRemaining > 0 && difficultyLimit > 0;
            if (!isActive) return { opacity: 0 };

            const ratio = Math.min(idleTimeMsShared.value / difficultyLimit, 1);
            const opacity = ratio <= 0.5 ? 0 : ((ratio - 0.5) / 0.5) * 0.85;
            return { opacity };
        });

        // Don't render anything if disabled — placed AFTER all hooks to satisfy React rules
        if (isDisabled) return null;

        // Explicit pixel dimensions for the oversized container (percentages are unreliable in RN)
        const containerWidth = screenWidth * OVERSCAN;
        const containerHeight = screenHeight * OVERSCAN;
        const offsetX = -(screenWidth * (OVERSCAN - 1)) / 2;
        const offsetY = -(screenHeight * (OVERSCAN - 1)) / 2;

        return (
            <>
                {/* Dark fog overlay below blood vignette to gently fade background text */}
                <Animated.View style={[StyleSheet.absoluteFill, styles.fogOverlay, fogStyle]} pointerEvents="none" />

                {/* Blood Vignette — Animated.View wrapper handles opacity + scale */}
                <Animated.View
                    style={[
                        {
                            position: 'absolute',
                            width: containerWidth,
                            height: containerHeight,
                            left: offsetX,
                            top: offsetY,
                            zIndex: 4,
                        },
                        vignetteStyle,
                    ]}
                    pointerEvents="none"
                >
                    {/* Static SVG — never animated directly, only its parent View is */}
                    <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <Defs>
                            <RadialGradient id="bloodVignette" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                                {/* Center core — 0% to 45% of radius is transparent to keep text legible */}
                                <Stop offset="0" stopColor={theme.colors.bloodDark} stopOpacity={0} />
                                <Stop offset="0.45" stopColor={theme.colors.bloodDark} stopOpacity={0} />

                                {/* Soft, organic blood fade — gradual transition into deep red */}
                                <Stop offset="0.7" stopColor={theme.colors.bloodMedium} stopOpacity={0.55} />
                                <Stop offset="0.85" stopColor={theme.colors.bloodDark} stopOpacity={0.85} />
                                <Stop offset="1" stopColor={theme.colors.bloodDark} stopOpacity={1} />
                            </RadialGradient>
                        </Defs>
                        <Rect x="0" y="0" width="100" height="100" fill="url(#bloodVignette)" />
                    </Svg>
                </Animated.View>
            </>
        );
    },
);

DangerOverlay.displayName = 'DangerOverlay';

const styles = StyleSheet.create({
    fogOverlay: {
        zIndex: 3,
        backgroundColor: theme.colors.background,
    },
});
