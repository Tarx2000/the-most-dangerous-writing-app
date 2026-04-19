import React, { useEffect } from 'react';
import Svg, { Path, Circle } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withTiming, Easing, withDelay } from 'react-native-reanimated';

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface Props {
    size: number;
    strokeWidth: number;
    color: string;
    backgroundColor?: string;
    delay?: number;
    isActive?: boolean;
}

export const AnimatedSymmetricalRing = ({ size, strokeWidth, color, backgroundColor = 'transparent', delay = 0, isActive = true }: Props) => {
    const radius = (size - strokeWidth) / 2;
    const center = size / 2;
    // Length of a half circle
    const halfCirc = Math.PI * radius;
    // Buffer gap to safely swallow round stroke linecaps at 0 progress
    const gapLength = halfCirc + (strokeWidth * 2);

    const progress = useSharedValue(0);
    const animatedColor = useSharedValue(color);

    useEffect(() => {
        animatedColor.value = withTiming(color, { duration: 150, easing: Easing.out(Easing.cubic) });
    }, [color, animatedColor]);

    // Using useAnimatedProps securely to avoid performance penalties
    const animatedPropsLeft = useAnimatedProps(() => ({
        strokeDashoffset: gapLength * (1 - progress.value),
        stroke: animatedColor.value as string,
    }));

    const animatedPropsRight = useAnimatedProps(() => ({
        strokeDashoffset: gapLength * (1 - progress.value),
        stroke: animatedColor.value as string,
    }));

    // Interpolate draw lines gracefully reacting to activation state, immune to color updates
    useEffect(() => {
        if (isActive) {
            progress.value = withDelay(delay, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
        } else {
            progress.value = withTiming(0, { duration: 400, easing: Easing.inOut(Easing.quad) });
        }
    }, [isActive, delay, progress]);

    // Start at bottom: (center, center + radius)
    // End at top: (center, center - radius)
    // Left side counter-clockwise (sweep=1)
    const leftPath = `M ${center} ${center + radius} A ${radius} ${radius} 0 0 1 ${center} ${center - radius}`;
    // Right side clockwise (sweep=0)
    const rightPath = `M ${center} ${center + radius} A ${radius} ${radius} 0 0 0 ${center} ${center - radius}`;

    return (
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {backgroundColor !== 'transparent' && (
                <Circle cx={center} cy={center} r={size/2} fill={backgroundColor} />
            )}
            
            <AnimatedPath
                d={leftPath}
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={`${halfCirc} ${gapLength}`}
                animatedProps={animatedPropsLeft}
                strokeLinecap="round"
            />
            <AnimatedPath
                d={rightPath}
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={`${halfCirc} ${gapLength}`}
                animatedProps={animatedPropsRight}
                strokeLinecap="round"
            />
        </Svg>
    );
};
