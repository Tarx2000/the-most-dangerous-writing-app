import React, { useEffect, useRef, useCallback } from 'react';
import {
    Modal,
    Animated,
    Easing,
    PanResponder,
    TouchableWithoutFeedback,
    StyleSheet,
    View,
    Text,
    Dimensions,
    GestureResponderEvent,
    PanResponderGestureState,
    KeyboardAvoidingView,
    Platform
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * CONFIGURABLE: Minimum drag distance to dismiss the sheet.
 * Lower = easier to dismiss, higher = requires more deliberate swipe.
 */
const DISMISS_THRESHOLD = 80;

/** CONFIGURABLE: Minimum velocity to dismiss even with short drag */
const DISMISS_VELOCITY = 0.6;

/**
 * SwipeableModal - Premium iOS-style bottom sheet modal.
 *
 * Swipe-to-dismiss works via a large drag zone at the TOP of the sheet.
 * The drag zone covers the pill handle and title area (~80px).
 * This zone always captures touches, so swiping from there is 100% reliable.
 *
 * Content below the drag zone (ScrollViews, FlatLists, buttons) remains
 * fully interactive with no gesture conflicts.
 *
 * This is the same pattern used by iOS native sheets and @gorhom/bottom-sheet.
 */
interface Props {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
    title?: string;
    height?: number;
    /** Pass from HomeScreen to auto-disable background scroll while modal is open */
    setHomeScrollEnabled?: (enabled: boolean) => void;
}

export const SwipeableModal: React.FC<Props> = React.memo(({ visible, onClose, children, title, height = SCREEN_HEIGHT * 0.88, setHomeScrollEnabled }) => {
    const panY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const overlayOpacity = useRef(new Animated.Value(0)).current;

    // Animate in when visible becomes true
    useEffect(() => {
        if (visible) {
            // Disable HomeScreen scroll when ANY modal opens
            setHomeScrollEnabled?.(false);
            panY.setValue(SCREEN_HEIGHT);
            overlayOpacity.setValue(0);
            Animated.parallel([
                Animated.spring(panY, {
                    toValue: 0,
                    useNativeDriver: true,
                    damping: 22,
                    stiffness: 220,
                    mass: 0.8,
                }),
                Animated.timing(overlayOpacity, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                })
            ]).start();
        }
    }, [visible]);

    // Animate out then call onClose
    const handleClose = useCallback(() => {
        Animated.parallel([
            Animated.timing(panY, {
                toValue: SCREEN_HEIGHT,
                duration: 280,
                easing: Easing.bezier(0.25, 0.1, 0.25, 1),
                useNativeDriver: true,
            }),
            Animated.timing(overlayOpacity, {
                toValue: 0,
                duration: 280,
                useNativeDriver: true,
            })
        ]).start(() => {
            // Re-enable HomeScreen scroll when modal closes
            setHomeScrollEnabled?.(true);
            onClose();
        });
    }, [onClose, panY, overlayOpacity, setHomeScrollEnabled]);

    /**
     * PanResponder lives ONLY on the drag zone (top bar).
     *
     * - onStartShouldSet: TRUE — always captures the initial touch in this zone
     * - Follows the user's finger 1:1 (panY = gesture dy)
     * - Overlay fades proportionally as you drag down
     * - Dismisses on threshold distance OR velocity
     * - Snaps back with spring if released early
     *
     * Because this handler is ONLY on the drag zone View, it never
     * conflicts with ScrollViews, FlatLists, or buttons in the content.
     */
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderTerminationRequest: () => false,
            onPanResponderMove: (_: GestureResponderEvent, g: PanResponderGestureState) => {
                if (g.dy > 0) {
                    panY.setValue(g.dy);
                    const progress = Math.min(g.dy / (SCREEN_HEIGHT * 0.4), 1);
                    overlayOpacity.setValue(1 - progress);
                }
            },
            onPanResponderRelease: (_: GestureResponderEvent, g: PanResponderGestureState) => {
                if (g.dy > DISMISS_THRESHOLD || g.vy > DISMISS_VELOCITY) {
                    handleClose();
                } else {
                    Animated.parallel([
                        Animated.spring(panY, {
                            toValue: 0,
                            useNativeDriver: true,
                            damping: 22,
                            stiffness: 220,
                        }),
                        Animated.timing(overlayOpacity, {
                            toValue: 1,
                            duration: 150,
                            useNativeDriver: true,
                        })
                    ]).start();
                }
            },
        })
    ).current;

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
            {/* GestureHandlerRootView is REQUIRED inside Modal because Modal
                creates a separate native view hierarchy. Without this wrapper,
                react-native-gesture-handler gestures (like CalendarView's
                month swipe) won't have a root to register with and will
                silently fail. */}
            <GestureHandlerRootView style={{ flex: 1 }}>
                {/* Dark scrim — tap to dismiss */}
                <TouchableWithoutFeedback onPress={handleClose}>
                    <Animated.View style={[styles.scrim, { opacity: overlayOpacity }]} />
                </TouchableWithoutFeedback>

                {/* Keyboard avoidance wrapper */}
                <KeyboardAvoidingView
                    style={StyleSheet.absoluteFill}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    pointerEvents="box-none"
                >
                    {/* Sheet wrapper */}
                    <Animated.View
                        style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]}
                        pointerEvents="box-none"
                    >
                        <Animated.View style={[styles.sheet, { transform: [{ translateY: panY }], height }]}>

                            {/* ========== DRAG ZONE ========== */}
                            <View {...panResponder.panHandlers} style={styles.dragZone}>
                                <View style={styles.handlePill} />
                                {title && <Text style={styles.sheetTitle}>{title}</Text>}
                            </View>

                            {/* ========== CONTENT ZONE ========== */}
                            <View style={styles.contentArea}>
                                {children}
                            </View>

                        </Animated.View>
                    </Animated.View>
                </KeyboardAvoidingView>
            </GestureHandlerRootView>
        </Modal>
    );
});

const styles = StyleSheet.create({
    /** Semi-transparent scrim behind the sheet */
    scrim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
    },

    /** The bottom sheet — AMOLED-black, subtle top hairline */
    sheet: {
        backgroundColor: '#0A0A0A',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(255, 255, 255, 0.12)',
        borderLeftWidth: 0,
        borderRightWidth: 0,
        borderBottomWidth: 0,
        overflow: 'hidden',
    },

    /**
     * DRAG ZONE — The large touch target at the top of the sheet.
     * Generous vertical padding (~80px visible) so you can grab it easily.
     * No visible separator — the zone is invisible to the user.
     * Once your finger touches here, the gesture is locked to this responder
     * even as your finger moves down into the content area below.
     */
    dragZone: {
        width: '100%',
        alignItems: 'center',
        paddingTop: 16,
        paddingBottom: 20,
    },

    /** Pill handle — visual affordance indicating "drag here" */
    handlePill: {
        width: 40,
        height: 5,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        borderRadius: 3,
        marginBottom: 12,
    },

    /** Content fills remaining space */
    contentArea: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 8,
    },

    /** Sheet title inside the drag zone */
    sheetTitle: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: '600',
        textAlign: 'center',
        letterSpacing: 0.3,
    },
});
