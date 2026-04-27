import { useState, useCallback, useMemo, useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
    useSharedValue,
    useAnimatedStyle,
    useAnimatedReaction,
    withSpring,
    cancelAnimation,
    runOnJS,
} from 'react-native-reanimated';
import { theme } from '@/styles/theme';

/**
 * useHomeGestures — Extracted Feed pull-down/up gesture logic.
 *
 * Encapsulates all Reanimated gesture handling for the HomeScreen's
 * Feed reveal interaction. This hook owns:
 * - feedProgress SharedValue (0 = closed, 1 = fully open)
 * - Gesture coordination SharedValues
 * - Pan gesture definition
 * - Animated styles for main content, feed layer, and nav bar
 * - open/close callbacks and safety-net reaction
 *
 * Reanimated hooks MUST be called in the same render cycle as the
 * consuming component — this hook satisfies that constraint.
 */
export function useHomeGestures(currentPage: number) {
    const { height: screenHeight } = useWindowDimensions();
    const screenHeightSV = useSharedValue(screenHeight);

    // Keep SharedValue in sync when window resizes (e.g. rotation)
    // SharedValues must be updated inside useEffect, not during render,
    // to avoid "Writing to value during component render" strict-mode warnings.
    useEffect(() => {
        screenHeightSV.value = screenHeight;
    }, [screenHeight, screenHeightSV]);

    /** Animated progress for the feed reveal (0 to 1) */
    const feedProgress = useSharedValue(0);

    /** Gesture coordination SharedValues */
    const gestureStartProgress = useSharedValue(0);
    const startTranslationOffset = useSharedValue(0);
    const isFeedGestureActive = useSharedValue(false);
    const listScrollY = useSharedValue(0);

    /** Whether the Feed page is currently revealed */
    const [feedVisible, setFeedVisible] = useState(false);
    const [scrollEnabled, setScrollEnabled] = useState(true);

    /** JS callbacks — lightweight state-only commits, called on spring completion */
    const openFeed = useCallback(() => {
        setFeedVisible(true);
        setScrollEnabled(false);
    }, []);

    const closeFeed = useCallback(() => {
        setFeedVisible(false);
        setScrollEnabled(true);
    }, []);

    /**
     * Pan gesture: follow-finger feed reveal on the Start page.
     * UPWARD-only activation (activeOffsetY) + fail on horizontal (failOffsetX)
     * ensures strictly vertical swipes only — no diagonal.
     */
    const feedPanGesture = useMemo(() => Gesture.Pan()
        .activeOffsetY([-15, 10000])   // Only activate on UPWARD movement
        .failOffsetX([-12, 12])         // Fail on any horizontal movement
        .enabled(currentPage === 0)
        .onStart(() => {
            cancelAnimation(feedProgress);
            gestureStartProgress.value = feedProgress.value;
            startTranslationOffset.value = 0;
            isFeedGestureActive.value = false;
        })
        .onUpdate((e) => {
            if (!isFeedGestureActive.value) {
                // Activate on upward swipe from any position (including mid-rescue)
                if (e.translationY < -8) {
                    isFeedGestureActive.value = true;
                    gestureStartProgress.value = feedProgress.value;
                    startTranslationOffset.value = e.translationY;
                }
                return;
            }
            const delta = e.translationY - startTranslationOffset.value;
            const progressDelta = -delta / screenHeightSV.value;
            const newProgress = Math.max(0, Math.min(1, gestureStartProgress.value + progressDelta));
            feedProgress.value = newProgress;
        })
        .onEnd((e) => {
            if (!isFeedGestureActive.value) return;
            isFeedGestureActive.value = false;
            const shouldOpen = feedProgress.value > 0.5 || e.velocityY < -500;
            const target = shouldOpen ? 1 : 0;
            feedProgress.value = withSpring(target, theme.animation.springFeed);
            if (shouldOpen) runOnJS(openFeed)();
            else runOnJS(closeFeed)();
        })
        .onFinalize(() => {
            isFeedGestureActive.value = false;
        }), [currentPage, feedProgress, screenHeightSV, openFeed, closeFeed, gestureStartProgress, isFeedGestureActive, startTranslationOffset]);

    /** Main content animates UP (to -screenHeight) when feed opens */
    const mainContentAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: feedProgress.value * -screenHeightSV.value }],
        pointerEvents: feedProgress.value > 0.5 ? 'none' : 'auto',
    }));

    /** Feed layer animates UP (from screenHeight to 0) */
    const feedAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: (1 - feedProgress.value) * screenHeightSV.value }],
        pointerEvents: feedProgress.value > 0.5 ? 'auto' : 'none',
    }));

    /** Nav bar fades out and slides down as feed opens — driven by feedProgress */
    const navAnimStyle = useAnimatedStyle(() => ({
        opacity: 1 - feedProgress.value,
        transform: [{ translateY: feedProgress.value * 80 }],
        pointerEvents: feedProgress.value > 0.5 ? 'none' : 'auto',
    }));

    /**
     * Safety net: if feedProgress is stranded at a mid-value with no gesture
     * active and no animation running, snap to the nearest end.
     */
    useAnimatedReaction(
        () => {
            const p = feedProgress.value;
            if (isFeedGestureActive.value) return 0;
            if (p < 0.01 || p > 0.99) return 0;
            return p;
        },
        (current, prev) => {
            if (current === prev || current === 0) return;
            const target = current > 0.5 ? 1 : 0;
            feedProgress.value = withSpring(target, theme.animation.springFeed);
            if (target === 0) runOnJS(closeFeed)();
            else runOnJS(openFeed)();
        }
    );

    /** Close the feed — cancel in-flight animation, spring closed, set state immediately */
    const handleCloseFeed = useCallback(() => {
        cancelAnimation(feedProgress);
        feedProgress.value = withSpring(0, theme.animation.springFeed);
        closeFeed();
    }, [closeFeed, feedProgress]);

    return {
        feedProgress,
        feedVisible,
        feedPanGesture,
        mainContentAnimStyle,
        feedAnimStyle,
        navAnimStyle,
        handleCloseFeed,
        openFeed,
        closeFeed,
        scrollEnabled,
        setScrollEnabled,
        screenHeight,
        screenHeightSV,
        listScrollY,
    };
}
