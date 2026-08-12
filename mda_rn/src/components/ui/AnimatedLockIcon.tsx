import React, { useEffect } from 'react';
import Svg, { Rect, Path, G, Circle } from 'react-native-svg';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    useAnimatedProps,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { theme } from '@/styles/theme';

// Create animated components to support smooth color morphing and path animations
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G) as unknown as React.ComponentType<Record<string, unknown>>;

interface Props {
    /** Whether the lock is in the unlocked state */
    isUnlocked: boolean;
    /** The active icon color (optional, defaults to themed lock/unlock colors) */
    color?: string;
    /** Optional custom size (defaults to 16) */
    size?: number;
    /** Optional custom style for the Svg wrapper */
    style?: import('react-native').StyleProp<import('react-native').ViewStyle>;
    /** Optional animation duration in ms (defaults to 300) */
    duration?: number;
}

/**
 * AnimatedLockIcon - A premium, custom SVG-based lock icon that animates
 * its shackle opening (translating and rotating 180 degrees around the Y-axis).
 * This creates a gorgeous 3D swing gate animation on the UI thread.
 */
export const AnimatedLockIcon: React.FC<Props> = React.memo(({ isUnlocked, color, size = 16, style, duration }) => {
    // Animation shared value for realistic physical 3D lock swinging
    const shackleRotateY = useSharedValue(isUnlocked ? 180 : 0);

    const animDuration = duration !== undefined ? duration : 300;

    useEffect(() => {
        if (isUnlocked) {
            // Smooth rotation around Y-axis
            shackleRotateY.value = withTiming(180, {
                duration: animDuration,
                easing: Easing.out(Easing.quad),
            });
        } else {
            // Smooth return to closed state
            shackleRotateY.value = withTiming(0, {
                duration: animDuration,
                easing: Easing.out(Easing.quad),
            });
        }
    }, [isUnlocked, shackleRotateY, animDuration]);

    // Animate shackle transform in 3D using rotateY
    // Pivots around the left hinge coordinate (7.0, 11.0)
    const shackleStyle = useAnimatedStyle(() => {
        const rotateValue = `${shackleRotateY.value}deg` as const;
        return {
            transform: [
                { translateX: 7.0 },
                { translateY: 11.0 },
                { rotateY: rotateValue },
                { translateX: -7.0 },
                { translateY: -11.0 },
            ],
        };
    });

    const pathProps = useAnimatedProps(() => {
        const strokeColor =
            color ||
            withTiming(isUnlocked ? theme.colors.textPrimary : theme.colors.primaryActionText, {
                duration: 250,
                easing: Easing.out(Easing.cubic),
            });
        return {
            stroke: strokeColor,
        };
    });

    const keyholeCircleProps = useAnimatedProps(() => {
        const strokeColor =
            color ||
            withTiming(isUnlocked ? theme.colors.textPrimary : theme.colors.primaryActionText, {
                duration: 250,
                easing: Easing.out(Easing.cubic),
            });
        return {
            fill: strokeColor,
        };
    });

    const keyholeGProps = useAnimatedProps(() => {
        const opacity = withTiming(isUnlocked ? 0 : 1, { duration: 200 });
        return {
            opacity: opacity,
        };
    });

    return (
        <Svg width={size} height={size} viewBox="-6 0 30 24" style={style}>
            {/* Lock Body */}
            <AnimatedRect
                x={3}
                y={11}
                width={18}
                height={11}
                rx={2}
                strokeWidth={2}
                animatedProps={pathProps}
                fill="none"
            />
            {/* Keyhole detail (fades out when unlocked) */}
            <AnimatedG animatedProps={keyholeGProps}>
                <AnimatedCircle cx={12} cy={16} r={1.5} animatedProps={keyholeCircleProps} />
                <AnimatedPath d="M 12,17.5 V 19" strokeWidth={1.5} strokeLinecap="round" animatedProps={pathProps} />
            </AnimatedG>
            {/* Lock Shackle (Rendered on top to ensure no gaps or coverage) */}
            <AnimatedG style={shackleStyle}>
                <AnimatedPath
                    d="M 7,11 V 7 A 5,5 0 0,1 17,7 V 11"
                    strokeWidth={2}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    animatedProps={pathProps}
                />
            </AnimatedG>
        </Svg>
    );
});
