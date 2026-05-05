import React, { useCallback, useEffect, useMemo } from 'react';
import {
    Modal,
    StyleSheet,
    View,
    Text,
    useWindowDimensions,
    KeyboardAvoidingView,
    Platform,
    TouchableWithoutFeedback,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    runOnJS,
} from 'react-native-reanimated';
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
 *
 * Content (children) is rendered below the drag handle. Each feature modal
 * only provides its own content — never re-implements the shell.
 */
export const BaseModal: React.FC<BaseModalProps> = React.memo(({
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
    const resolvedHeight = height ?? SCREEN_HEIGHT * 0.88;

    const translateY = useSharedValue(SCREEN_HEIGHT);
    const overlayOpacity = useSharedValue(0);

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
            setHomeScrollEnabled?.(false);
            translateY.value = SCREEN_HEIGHT;
            overlayOpacity.value = 0;

            translateY.value = withSpring(0, {
                damping: 22,
                stiffness: 220,
                mass: 0.8,
            });
            overlayOpacity.value = withTiming(1, { duration: 300 });
        }
    }, [visible, setHomeScrollEnabled, translateY, overlayOpacity, SCREEN_HEIGHT]);

    /* ── Pan gesture: only activates on downward pull > 20px ── */
    const panGesture = useMemo(() => Gesture.Pan()
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
                translateY.value = withSpring(0, { damping: 22, stiffness: 220 });
                overlayOpacity.value = withTiming(1, { duration: 150 });
            }
        }), [handleClose, translateY, overlayOpacity, SCREEN_HEIGHT]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
        height: resolvedHeight,
    }));

    const overlayStyle = useAnimatedStyle(() => ({
        opacity: overlayOpacity.value,
    }));

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose} statusBarTranslucent>
            <GestureHandlerRootView style={{ flex: 1 }}>
                {showScrim && (
                    <TouchableWithoutFeedback onPress={handleClose}>
                        <Animated.View style={[styles.scrim, overlayStyle]} />
                    </TouchableWithoutFeedback>
                )}

                {keyboardAvoiding ? (
                    <KeyboardAvoidingView
                        style={StyleSheet.absoluteFill}
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        pointerEvents="box-none"
                    >
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

                                <View style={[styles.contentArea, { paddingBottom: insets.bottom + 10 }]}>
                                    {children}
                                </View>
                            </Animated.View>
                        </View>
                    </KeyboardAvoidingView>
                ) : (
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

                            <View style={[styles.contentArea, { paddingBottom: insets.bottom + 10 }]}>
                                {children}
                            </View>
                        </Animated.View>
                    </View>
                )}
            </GestureHandlerRootView>
        </Modal>
    );
});

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
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.glassBorderMedium,
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
        bottom: 0,
        left: 0,
        right: 0,
    },
    contentArea: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 8,
    },
});