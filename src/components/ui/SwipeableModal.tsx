import React, { useEffect, useCallback, useMemo } from 'react';
import {
    Modal,
    StyleSheet,
    View,
    Text,
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    TouchableWithoutFeedback
} from 'react-native';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    runOnJS
} from 'react-native-reanimated';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_THRESHOLD = 80;
const DISMISS_VELOCITY = 600;

interface Props {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
    title?: string;
    height?: number;
    setHomeScrollEnabled?: (enabled: boolean) => void;
}

export const SwipeableModal: React.FC<Props> = React.memo(({ visible, onClose, children, title, height = SCREEN_HEIGHT * 0.88, setHomeScrollEnabled }) => {
    const translateY = useSharedValue(SCREEN_HEIGHT);
    const overlayOpacity = useSharedValue(0);

    const handleClose = useCallback(() => {
        translateY.value = withTiming(SCREEN_HEIGHT, { duration: 300 });
        overlayOpacity.value = withTiming(0, { duration: 300 }, () => {
            runOnJS(onClose)();
            if (setHomeScrollEnabled) runOnJS(setHomeScrollEnabled)(true);
        });
    }, [onClose, setHomeScrollEnabled, translateY, overlayOpacity]);

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
    }, [visible, setHomeScrollEnabled, translateY, overlayOpacity]);

    /** Memoize gesture to avoid recreating on every render */
    const panGesture = useMemo(() => Gesture.Pan()
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
                translateY.value = withSpring(0, {
                    damping: 22,
                    stiffness: 220,
                });
                overlayOpacity.value = withTiming(1, { duration: 150 });
            }
        }), [handleClose, translateY, overlayOpacity]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
        height
    }));

    const overlayStyle = useAnimatedStyle(() => ({
        opacity: overlayOpacity.value
    }));

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
            <GestureHandlerRootView style={{ flex: 1 }}>
                <TouchableWithoutFeedback onPress={handleClose}>
                    <Animated.View style={[styles.scrim, overlayStyle]} />
                </TouchableWithoutFeedback>

                <KeyboardAvoidingView
                    style={StyleSheet.absoluteFill}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    pointerEvents="box-none"
                >
                    <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]} pointerEvents="box-none">
                        <Animated.View style={[styles.sheet, animatedStyle]}>
                            <GestureDetector gesture={panGesture}>
                                <View style={styles.dragZone}>
                                    <View style={styles.handlePill} />
                                    {title && <Text style={styles.sheetTitle}>{title}</Text>}
                                </View>
                            </GestureDetector>

                            <View style={styles.contentArea}>
                                {children}
                            </View>
                        </Animated.View>
                    </View>
                </KeyboardAvoidingView>
            </GestureHandlerRootView>
        </Modal>
    );
});

const styles = StyleSheet.create({
    scrim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
    },
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
    dragZone: {
        width: '100%',
        alignItems: 'center',
        paddingTop: 16,
        paddingBottom: 20,
    },
    handlePill: {
        width: 40,
        height: 5,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        borderRadius: 3,
        marginBottom: 12,
    },
    contentArea: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 8,
    },
    sheetTitle: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: '600',
        textAlign: 'center',
        letterSpacing: 0.3,
    },
});
