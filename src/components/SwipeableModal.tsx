import React, { useEffect, useRef } from 'react';
import {
    Modal,
    Animated,
    Easing,
    PanResponder,
    TouchableWithoutFeedback,
    StyleSheet,
    View,
    Text,
    Dimensions
} from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
    title?: string;
}

export const SwipeableModal: React.FC<Props> = React.memo(({ visible, onClose, children, title }) => {
    const panY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const overlayOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(panY, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 2 }),
                Animated.timing(overlayOpacity, { toValue: 1, duration: 250, useNativeDriver: true })
            ]).start();
        }
    }, [visible]);

    const handleClose = () => {
        Animated.parallel([
            Animated.timing(panY, { toValue: SCREEN_HEIGHT, duration: 250, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            Animated.timing(overlayOpacity, { toValue: 0, duration: 250, useNativeDriver: true })
        ]).start(() => onClose());
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, g) => g.dy > 5 && Math.abs(g.dy) > Math.abs(g.dx),
            onPanResponderMove: (_, g) => { if (g.dy > 0) panY.setValue(g.dy); },
            onPanResponderRelease: (_, g) => {
                if (g.dy > 120 || g.vy > 1.2) handleClose();
                else Animated.spring(panY, { toValue: 0, useNativeDriver: true }).start();
            },
        })
    ).current;

    return (
        <Modal visible={visible} transparent={true} animationType="none" onRequestClose={handleClose}>
            <TouchableWithoutFeedback onPress={handleClose}>
                <Animated.View style={[styles.modalOverlay, { opacity: overlayOpacity }]} />
            </TouchableWithoutFeedback>
            <Animated.View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]} pointerEvents="box-none">
                <Animated.View style={[styles.modalContent, { transform: [{ translateY: panY }], maxHeight: SCREEN_HEIGHT * 0.9, flexShrink: 1 }]}>
                    <Animated.View {...panResponder.panHandlers} style={{ width: '100%', alignItems: 'center', paddingBottom: 15, paddingTop: 15, zIndex: 10 }}>
                        <View style={{ width: 40, height: 5, backgroundColor: '#555', borderRadius: 3, marginBottom: 15 }} />
                        {title && <Text style={styles.modalTitle}>{title}</Text>}
                    </Animated.View>
                    <View style={{ width: '100%', flexShrink: 1 }}>
                        {children}
                    </View>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
});

const styles = StyleSheet.create({
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 20, maxHeight: '80%', flexShrink: 1 },
    modalTitle: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
});
