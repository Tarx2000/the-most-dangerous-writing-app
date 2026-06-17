import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Modal,
    StyleSheet,
    View,
    Text,
    useWindowDimensions,
    Platform,
    TouchableWithoutFeedback,
    Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS } from 'react-native-reanimated';
import { theme } from '@/styles/theme';

const DISMISS_THRESHOLD = 80;
const DISMISS_VELOCITY = 600;

export interface BaseModalProps {
    /** Controls modal visibility */
    visible: boolean;
    /** Called after exit animation completes */
    onClose: () => void;
    /** Content rendered inside the sheet */
    children: React.ReactNode;
    /** Optional title shown in the drag zone */
    title?: string;
    /** Explicit sheet height, or defaults to 88% of screen */
    height?: number;
    /** Whether to show the drag handle pill (default: true) */
    showHandle?: boolean;
    /** Whether to show the dark backdrop scrim (default: true) */
    showScrim?: boolean;
    /** Optional callback to disable/enable parent scroll (e.g. HomeScreen pager) */
    setHomeScrollEnabled?: (enabled: boolean) => void;
    /** Whether to wrap in KeyboardAvoidingView (default: true) */
    keyboardAvoiding?: boolean;
}

/**
 * BaseModal — Unified bottom-sheet modal shell for the entire app.
 *
 * All bottom-sheet modals MUST use this component. It handles:
 * - RN Modal with proper onRequestClose (back gesture = dismiss, not exit app)
 * - Dark backdrop scrim with tap-to-dismiss
 * - Spring-animated entry from bottom
 * - Spring-animated exit to bottom BEFORE calling onClose
 * - Swipe-down-to-dismiss from the drag handle zone
 * - Pan gesture activeOffsetY gating (won't interfere with button taps/scroll)
 * - Dynamic keyboard avoidance and resizing on both iOS and Android (translucent modals)
 *
 * Content (children) is rendered below the drag handle. Each feature modal
 * only provides its own content — never re-implements the shell.
 */
export const BaseModal: React.FC<BaseModalProps> = React.memo(
    ({
        visible,
        onClose,
        children,
        title,
        height,
        showHandle = true,
        showScrim = true,
        setHomeScrollEnabled,
        keyboardAvoiding = true,
    }) => {
        const { height: SCREEN_HEIGHT } = useWindowDimensions();
        const insets = useSafeAreaInsets();
        const [keyboardHeight, setKeyboardHeight] = useState(0);
        const keyboardHeightSV = useSharedValue(0);

        // Keep track of the baseline screen height (keyboard closed) to detect window resizes automatically
        const screenHeightBaseline = useRef(SCREEN_HEIGHT);
        if (keyboardHeight === 0 && SCREEN_HEIGHT !== screenHeightBaseline.current) {
            screenHeightBaseline.current = SCREEN_HEIGHT;
        }

        useEffect(() => {
            const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
            const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

            const showSubscription = Keyboard.addListener(showEvent, (e) => {
                setKeyboardHeight(e.endCoordinates.height);
            });
            const hideSubscription = Keyboard.addListener(hideEvent, () => {
                setKeyboardHeight(0);
            });

            return () => {
                showSubscription.remove();
                hideSubscription.remove();
            };
        }, []);

        useEffect(() => {
            keyboardHeightSV.value = withTiming(keyboardHeight, { duration: 250 });
        }, [keyboardHeight, keyboardHeightSV]);

        const translateY = useSharedValue(SCREEN_HEIGHT);
        const overlayOpacity = useSharedValue(0);
        const hasAnimatedIn = useRef(false);

        /* ── Exit animation: slide down, then notify parent ── */
        const handleClose = useCallback(() => {
            translateY.value = withTiming(SCREEN_HEIGHT, { duration: 300 });
            overlayOpacity.value = withTiming(0, { duration: 300 }, () => {
                runOnJS(onClose)();
                if (setHomeScrollEnabled) runOnJS(setHomeScrollEnabled)(true);
            });
        }, [onClose, setHomeScrollEnabled, translateY, overlayOpacity, SCREEN_HEIGHT]);

        /* ── Entry animation ── */
        useEffect(() => {
            if (visible) {
                if (!hasAnimatedIn.current) {
                    hasAnimatedIn.current = true;
                    setHomeScrollEnabled?.(false);
                    translateY.value = SCREEN_HEIGHT;
                    overlayOpacity.value = 0;

                    translateY.value = withSpring(0, theme.animation.springDefault);
                    overlayOpacity.value = withTiming(1, { duration: 300 });
                }
            } else {
                hasAnimatedIn.current = false;
            }
        }, [visible, setHomeScrollEnabled, translateY, overlayOpacity, SCREEN_HEIGHT]);

        /* ── Pan gesture: only activates on downward pull > 20px ── */
        const panGesture = useMemo(
            () =>
                Gesture.Pan()
                    .activeOffsetY([-10000, 20])
                    .onUpdate((e) => {
                        if (e.translationY > 0) {
                            translateY.value = e.translationY;
                            const progress = Math.min(e.translationY / (SCREEN_HEIGHT * 0.4), 1);
                            overlayOpacity.value = 1 - progress;
                        }
                    })
                    .onEnd((e) => {
                        if (e.translationY > DISMISS_THRESHOLD || e.velocityY > DISMISS_VELOCITY) {
                            runOnJS(handleClose)();
                        } else {
                            translateY.value = withSpring(0, theme.animation.springDefault);
                            overlayOpacity.value = withTiming(1, { duration: 150 });
                        }
                    }),
            [handleClose, translateY, overlayOpacity, SCREEN_HEIGHT],
        );

        const animatedStyle = useAnimatedStyle(() => {
            // Compute how much the window has already shrunk (e.g. Android adjustResize)
            const windowResize = Math.max(0, screenHeightBaseline.current - SCREEN_HEIGHT);
            // Calculate the remaining keyboard height that needs manual layout adjustments
            const remainingKeyboardHeight = keyboardAvoiding ? Math.max(0, keyboardHeightSV.value - windowResize) : 0;

            const currentHeight = Math.min(
                height ?? SCREEN_HEIGHT * 0.88,
                SCREEN_HEIGHT - insets.top - remainingKeyboardHeight - 20,
            );

            return {
                transform: [{ translateY: translateY.value }],
                bottom: -20 + remainingKeyboardHeight,
                height: currentHeight,
            };
        });

        const overlayStyle = useAnimatedStyle(() => ({
            opacity: overlayOpacity.value,
        }));

        if (!visible) return null;

        return (
            <Modal
                visible={visible}
                transparent
                animationType="none"
                onRequestClose={handleClose}
                statusBarTranslucent
                navigationBarTranslucent
            >
                <GestureHandlerRootView style={{ flex: 1 }}>
                    {showScrim && (
                        <TouchableWithoutFeedback onPress={handleClose}>
                            <Animated.View style={[styles.scrim, overlayStyle]} />
                        </TouchableWithoutFeedback>
                    )}

                    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                        <Animated.View style={[styles.sheet, animatedStyle, styles.sheetAbsolute]}>
                            {showHandle && (
                                <GestureDetector gesture={panGesture}>
                                    <View style={styles.dragZone}>
                                        <View style={styles.handlePill} />
                                        {title && <Text style={styles.sheetTitle}>{title}</Text>}
                                    </View>
                                </GestureDetector>
                            )}

                            {/*
                              Added +20 padding to compensate for the bottom: -20 offset of styles.sheetAbsolute,
                              which hides the bottom border off-screen. insets.bottom handles safe area above the translucent nav bar.
                            */}
                            <View style={[styles.contentArea, { paddingBottom: insets.bottom + 20 + 10 }]}>
                                {children}
                            </View>
                        </Animated.View>
                    </View>
                </GestureHandlerRootView>
            </Modal>
        );
    },
);

/* ── Styles ──────────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
    scrim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: theme.colors.overlayDark,
    },
    sheet: {
        backgroundColor: theme.colors.surfaceDark,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        // Using a full border rather than borderTopWidth to fix Android border corner rendering issues.
        // The side and bottom borders are hidden off-screen using the offsets in sheetAbsolute.
        borderWidth: 1,
        borderColor: theme.colors.glassBorderMedium,
        overflow: 'hidden',
    },
    dragZone: {
        width: '100%',
        alignItems: 'center',
        paddingTop: 16,
        paddingBottom: 20,
    },
    handlePill: {
        width: 40,
        height: 5,
        backgroundColor: theme.colors.grey,
        borderRadius: 3,
        marginBottom: 12,
    },
    sheetTitle: {
        color: theme.colors.textPrimary,
        fontSize: 20,
        fontWeight: '600',
        textAlign: 'center',
        letterSpacing: 0.3,
    },
    sheetAbsolute: {
        position: 'absolute',
        // Positioned 20px below screen bottom and 1px off-screen on left/right to hide borders.
        bottom: -20,
        left: -1,
        right: -1,
    },
    contentArea: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 8,
    },
});
