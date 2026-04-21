/**
 * ShimmerLine — Pulsing placeholder for loading states.
 *
 * A lightweight shimmer animation that runs on the UI thread via Reanimated.
 * Use as a skeleton/placeholder while async content is loading.
 *
 * @example
 * <ShimmerLine width="75%" height={24} />
 * <ShimmerLine width={120} style={{ marginBottom: 8 }} />
 */

import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import { theme } from '@/styles/theme';

type Props = {
    width: number | string;
    height?: number;
    style?: object;
};

const ShimmerLine: React.FC<Props> = ({ width, height = 16, style }) => {
    const pulse = useSharedValue(0);

    useEffect(() => {
        pulse.value = withRepeat(
            withSequence(
                withTiming(1, { duration: 1000 }),
                withTiming(0, { duration: 1000 }),
            ),
            -1,
            false,
        );
        return () => {
            pulse.value = 0;
        };
    }, [pulse]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: 0.15 + pulse.value * 0.2,
    }));

    return (
        <Animated.View
            style={[
                styles.base,
                { width: width as number | string, height },
                animatedStyle,
                style,
            ]}
        />
    );
};

const styles = StyleSheet.create({
    base: {
        borderRadius: 8,
        backgroundColor: theme.colors.textPrimary,
    },
});

export { ShimmerLine };
