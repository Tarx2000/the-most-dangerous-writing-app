import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { vibrate } from '@/lib/haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS, withSpring } from 'react-native-reanimated';
import { theme } from '@/styles/theme';

interface CustomSliderProps {
    value: number;
    onValueChange: (v: number) => void;
}
const THUMB_SIZE = 36;
const TICK_COUNT = 10;

/**
 * CustomSlider — 10-step haptic slider for alignment score input.
 *
 * React.memo prevents re-renders from parent state changes while dragging.
 * panGesture is memoized because Gesture objects are expensive to recreate.
 * handleValueChange is memoized to stabilize the runOnJS dependency.
 */
export const CustomSlider = React.memo(function CustomSlider({ value, onValueChange }: CustomSliderProps) {
    const { width } = useWindowDimensions();
    const PADDING = 30;
    const SLIDER_WIDTH = width - PADDING * 2;
    const maxTranslateX = SLIDER_WIDTH - THUMB_SIZE;
    const stepSize = maxTranslateX / 9;

    const translateX = useSharedValue(((value - 1) / 9) * maxTranslateX);
    const context = useSharedValue({ x: 0 });

    // We use a ref to prevent vibrating repeatedly on the same value while dragging
    const lastVibratedValue = useRef(value);

    const handleValueChange = useCallback(
        (v: number) => {
            if (v !== lastVibratedValue.current) {
                vibrate(10); // subtle haptic feedback
                lastVibratedValue.current = v;
                onValueChange(v);
            }
        },
        [onValueChange],
    );

    const panGesture = useMemo(
        () =>
            Gesture.Pan()
                .onStart(() => {
                    context.value = { x: translateX.value };
                })
                .onUpdate((event) => {
                    let nextX = context.value.x + event.translationX;
                    if (nextX < 0) nextX = 0;
                    if (nextX > maxTranslateX) nextX = maxTranslateX;
                    translateX.value = nextX;

                    const newValue = Math.round((nextX / maxTranslateX) * 9) + 1;
                    runOnJS(handleValueChange)(newValue);
                })
                .onEnd(() => {
                    const newValue = Math.round((translateX.value / maxTranslateX) * 9) + 1;
                    const snapX = ((newValue - 1) / 9) * maxTranslateX;
                    translateX.value = withSpring(snapX, theme.animation.springSnappy);
                    runOnJS(handleValueChange)(newValue);
                }),
        [maxTranslateX, translateX, context, handleValueChange],
    );

    const tickMarks = useMemo(() => [...Array(TICK_COUNT)].map((_, i) => i), []);

    const animatedThumbStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    const animatedFillStyle = useAnimatedStyle(() => ({
        // scaleX (GPU) instead of width (layout) — the fill is a full-width bar
        // anchored left, so scaling from the origin is a pure compositor op.
        transform: [{ scaleX: (translateX.value + THUMB_SIZE / 2) / SLIDER_WIDTH }],
    }));

    useEffect(() => {
        translateX.value = withSpring(((value - 1) / 9) * maxTranslateX, theme.animation.springSnappy);
        lastVibratedValue.current = value;
    }, [value, maxTranslateX, translateX]);

    return (
        <View style={sliderStyles.container}>
            <GestureDetector gesture={panGesture}>
                <View style={[sliderStyles.trackGestureArea, { width: SLIDER_WIDTH }]}>
                    <View style={[sliderStyles.trackBackground, { width: SLIDER_WIDTH }]} />
                    <Animated.View style={[sliderStyles.trackFill, animatedFillStyle]} />

                    {/* Tick marks */}
                    {tickMarks.map((i) => (
                        <View key={i} style={[sliderStyles.stepMarker, { left: i * stepSize + THUMB_SIZE / 2 - 1 }]} />
                    ))}

                    <Animated.View style={[sliderStyles.thumb, animatedThumbStyle]}>
                        <View style={sliderStyles.thumbInner} />
                    </Animated.View>
                </View>
            </GestureDetector>
            <View style={[sliderStyles.labelsContainer, { width: SLIDER_WIDTH }]}>
                <Text style={sliderStyles.labelText}>Off Track (1)</Text>
                <Text style={sliderStyles.labelText}>Best Self (10)</Text>
            </View>
        </View>
    );
});

const sliderStyles = StyleSheet.create({
    container: { alignItems: 'center', marginVertical: 35 },
    trackGestureArea: { height: 50, justifyContent: 'center' },
    trackBackground: {
        position: 'absolute',
        height: 6,
        backgroundColor: theme.colors.glassSurfaceMedium,
        borderRadius: 3,
    },
    trackFill: {
        position: 'absolute',
        left: 0,
        width: '100%',
        height: 6,
        backgroundColor: theme.colors.textPrimary,
        borderRadius: 3,
        shadowColor: theme.colors.textPrimary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
        elevation: 5,
    },
    stepMarker: { position: 'absolute', height: 6, width: 2, backgroundColor: theme.colors.grey },
    thumb: {
        position: 'absolute',
        width: 36,
        height: 36,
        backgroundColor: theme.colors.textPrimary,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: theme.colors.textPrimary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.8,
        shadowRadius: 15,
        elevation: 8,
    },
    thumbInner: { width: 14, height: 14, backgroundColor: theme.colors.background, borderRadius: 7 },
    labelsContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
    labelText: { color: theme.colors.textDim, fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
});
