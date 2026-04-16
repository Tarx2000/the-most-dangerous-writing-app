import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    Modal,
    Platform,
    Vibration,
} from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    runOnJS,
    interpolate,
    Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { useVideoPlayer, VideoView } from 'expo-video';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SavedVlog } from '@/types';
import { theme } from '@/styles/theme';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/** Represents a bounding box in window coordinates (from view.measureInWindow) */
export interface LayoutRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface VlogViewerModalProps {
    visible: boolean;
    vlogs: SavedVlog[];
    sourceRect: LayoutRect | null;
    initialIndex?: number;
    player?: any; // Shared expo-video player for perfect sync
    onClose: () => void;
    onDelete?: (id: string) => void;
}

const CARD_WIDTH = SCREEN_WIDTH - 32;
const CARD_HEIGHT = SCREEN_HEIGHT * 0.75;
const CARD_TARGET_X = 16;
const CARD_TARGET_Y = (SCREEN_HEIGHT - CARD_HEIGHT) / 2;

const VlogPlayer: React.FC<{ uri: string, sharedPlayer?: any }> = ({ uri, sharedPlayer }) => {
    const internalPlayer = useVideoPlayer(uri, p => {
        if (!sharedPlayer) {
            p.loop = true;
            p.play();
        }
    });

    const activePlayer = sharedPlayer || internalPlayer;

    return (
        <VideoView
            style={styles.videoPlayer}
            player={activePlayer}
            nativeControls
        />
    );
};

export const VlogViewerModal: React.FC<VlogViewerModalProps> = ({
    visible,
    vlogs,
    initialIndex = 0,
    sourceRect,
    player,
    onClose,
    onDelete,
}) => {
    const [expandedIndex, setExpandedIndex] = useState(initialIndex);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

    // Keep visible state synced locally for enter/exit animations
    const [isRendered, setIsRendered] = useState(visible);

    // Reanimated Shared Values
    const progress = useSharedValue(0); // 0 = shrinked to sourceRect, 1 = expanded
    const panX = useSharedValue(0);
    const panY = useSharedValue(0);

    useEffect(() => {
        if (visible) {
            setIsRendered(true);
            setExpandedIndex(initialIndex);
            progress.value = 0;
            panX.value = 0;
            panY.value = 0;
            // Animate in
            progress.value = withSpring(1, { damping: 18, stiffness: 180 });
        } else {
            // Animate out, then unmount (if called externally)
            progress.value = withTiming(0, { duration: 250 }, (finished) => {
                if (finished) runOnJS(setIsRendered)(false);
            });
        }
    }, [visible, initialIndex]);

    const handleCloseInternal = useCallback(() => {
        // Animate out natively, then tell parent to close
        // We only animate the scale/progress back to 0
        progress.value = withTiming(0, { duration: 250 }, (finished) => {
            if (finished) {
                runOnJS(setIsRendered)(false);
                runOnJS(onClose)();
            }
        });
        // Reset pan translation to origin smoothly
        panX.value = withTiming(0, { duration: 250 });
        panY.value = withTiming(0, { duration: 250 });
    }, [onClose]);

    // Handle swipe to dismiss
    const panGesture = useMemo(() => Gesture.Pan()
        .onUpdate((e) => {
            panX.value = e.translationX;
            panY.value = e.translationY;
        })
        .onEnd((e) => {
            const distance = Math.sqrt(e.translationX ** 2 + e.translationY ** 2);
            if (distance > 80 || Math.abs(e.velocityY) > 800) {
                runOnJS(handleCloseInternal)();
            } else {
                panX.value = withSpring(0, { damping: 20, stiffness: 200 });
                panY.value = withSpring(0, { damping: 20, stiffness: 200 });
            }
        }), [handleCloseInternal, panX, panY]);

    const backdropTapGesture = useMemo(() => Gesture.Tap()
        .onEnd(() => {
            runOnJS(handleCloseInternal)();
        }), [handleCloseInternal]);

    const combinedGesture = Gesture.Simultaneous(panGesture, backdropTapGesture);

    const swipeVlog = useCallback((direction: number) => {
        const newIdx = expandedIndex + direction;
        if (newIdx >= 0 && newIdx < vlogs.length) {
            setExpandedIndex(newIdx);
            Vibration.vibrate(10);
        }
    }, [vlogs.length, expandedIndex]);

    const formatDuration = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    // Card Animated Style (morphing width, height, top, left + pan dragging)
    const cardAnimatedStyle = useAnimatedStyle(() => {
        // Fallback rect if none provided (e.g., center screen scale effect)
        const sr = sourceRect || {
            x: SCREEN_WIDTH / 2 - 10,
            y: SCREEN_HEIGHT / 2 - 10,
            width: 20,
            height: 20,
        };

        const currentTop = interpolate(progress.value, [0, 1], [sr.y, CARD_TARGET_Y]);
        const currentLeft = interpolate(progress.value, [0, 1], [sr.x, CARD_TARGET_X]);
        const currentWidth = interpolate(progress.value, [0, 1], [sr.width, CARD_WIDTH]);
        const currentHeight = interpolate(progress.value, [0, 1], [sr.height, CARD_HEIGHT]);
        const currentBorderRadius = interpolate(progress.value, [0, 1], [12, 28]);

        // Drag effect: scale down slightly based on pan drag distance
        const dragDist = Math.sqrt(panX.value ** 2 + panY.value ** 2);
        const dragScale = interpolate(dragDist, [0, 300], [1, 0.85], Extrapolation.CLAMP);

        return {
            position: 'absolute',
            top: currentTop,
            left: currentLeft,
            width: currentWidth,
            height: currentHeight,
            borderRadius: currentBorderRadius,
            transform: [
                { translateX: panX.value },
                { translateY: panY.value },
                { scale: dragScale },
            ],
            opacity: interpolate(progress.value, [0, 0.1], [0, 1], Extrapolation.CLAMP),
        };
    });

    const backdropAnimatedStyle = useAnimatedStyle(() => {
        const dragDist = Math.sqrt(panX.value ** 2 + panY.value ** 2);
        const dragOpacity = interpolate(dragDist, [0, 300], [1, 0], Extrapolation.CLAMP);

        return {
            opacity: progress.value * dragOpacity,
        };
    });

    if (!isRendered || !vlogs[expandedIndex]) return null;

    return (
        <Modal visible transparent animationType="none" onRequestClose={handleCloseInternal}>
            <Animated.View style={[styles.expandedBackdrop, backdropAnimatedStyle]} />

            <GestureDetector gesture={combinedGesture}>
                <Animated.View style={StyleSheet.absoluteFillObject}>
                    <Animated.View 
                        style={[styles.expandedCard, cardAnimatedStyle]}
                        onStartShouldSetResponder={() => true}
                        onResponderTerminationRequest={() => false}
                    >
                        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
                        <View style={styles.expandedTint} />

                        {/* Video Player Area */}
                        <View style={styles.expandedVideoContainer} pointerEvents="auto">
                            <VlogPlayer uri={vlogs[expandedIndex].filePath} sharedPlayer={player} />
                        </View>

                        {/* Info bar */}
                        <View style={styles.expandedInfo}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.expandedDate}>{vlogs[expandedIndex].dateStr}</Text>
                                <Text style={styles.expandedMeta}>
                                    {formatDuration(vlogs[expandedIndex].durationSec)} • {(vlogs[expandedIndex].fileSizeBytes / (1024 * 1024)).toFixed(1)} MB
                                </Text>
                            </View>

                            {/* Swipe navigation */}
                            {vlogs.length > 1 && (
                                <View style={styles.swipeNav}>
                                    <AnimatedScaleButton
                                        onPress={() => swipeVlog(-1)}
                                        disabled={expandedIndex === 0}
                                        style={[styles.swipeBtn, expandedIndex === 0 && { opacity: 0.3 }]}
                                    >
                                        <MaterialCommunityIcons name="chevron-left" size={24} color={theme.colors.textPrimary} />
                                    </AnimatedScaleButton>
                                    <Text style={styles.swipeCounter}>
                                        {expandedIndex + 1}/{vlogs.length}
                                    </Text>
                                    <AnimatedScaleButton
                                        onPress={() => swipeVlog(1)}
                                        disabled={expandedIndex === vlogs.length - 1}
                                        style={[styles.swipeBtn, expandedIndex === vlogs.length - 1 && { opacity: 0.3 }]}
                                    >
                                        <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.textPrimary} />
                                    </AnimatedScaleButton>
                                </View>
                            )}
                        </View>

                        {/* Actions */}
                        {onDelete && (
                            <View style={styles.expandedActions}>
                                <View style={{ flex: 1 }} />
                                <AnimatedScaleButton
                                    style={styles.deleteBtn}
                                    onPress={() => setShowDeleteConfirm(vlogs[expandedIndex].id)}
                                >
                                    <MaterialCommunityIcons name="delete-outline" size={18} color={theme.colors.danger} />
                                    <Text style={styles.deleteBtnText}>Delete</Text>
                                </AnimatedScaleButton>
                            </View>
                        )}
                    </Animated.View>
                </Animated.View>
            </GestureDetector>

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <Modal visible transparent animationType="fade">
                    <View style={styles.deleteModalOverlay}>
                        <View style={styles.deleteModalCard}>
                            <Text style={styles.deleteModalTitle}>Delete Vlog?</Text>
                            <Text style={styles.deleteModalSub}>
                                This will permanently delete this video. This cannot be undone.
                            </Text>
                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                                <AnimatedScaleButton
                                    style={[styles.deleteModalBtn, { backgroundColor: theme.colors.glassBackground }]}
                                    onPress={() => setShowDeleteConfirm(null)}
                                >
                                    <MaterialCommunityIcons name="close" size={18} color="#FFF" style={{ marginRight: 6 }} />
                                    <Text style={styles.deleteModalBtnText}>Cancel</Text>
                                </AnimatedScaleButton>
                                <AnimatedScaleButton
                                    style={[styles.deleteModalBtn, { backgroundColor: theme.colors.danger }]}
                                    onPress={() => {
                                        if (onDelete && showDeleteConfirm) {
                                            onDelete(showDeleteConfirm);
                                            setShowDeleteConfirm(null);
                                            if (vlogs.length <= 1) {
                                                handleCloseInternal();
                                            } else if (expandedIndex >= vlogs.length - 1) {
                                                setExpandedIndex(Math.max(0, expandedIndex - 1));
                                            }
                                        }
                                    }}
                                >
                                    <MaterialCommunityIcons name="delete-outline" size={18} color="#FFF" style={{ marginRight: 6 }} />
                                    <Text style={styles.deleteModalBtnText}>Delete</Text>
                                </AnimatedScaleButton>
                            </View>
                        </View>
                    </View>
                </Modal>
            )}
        </Modal>
    );
};

const styles = StyleSheet.create({
    expandedBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
    },
    expandedCard: {
        borderColor: 'rgba(255, 255, 255, 0.12)',
        borderWidth: 1,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.5,
        shadowRadius: 30,
        elevation: 25,
    },
    expandedTint: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(18, 18, 18, 0.85)',
    },
    expandedVideoContainer: {
        flex: 1,
        margin: 12,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#000',
        zIndex: 2,
    },
    videoPlayer: {
        flex: 1,
        width: '100%',
    },
    expandedInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
        zIndex: 2,
    },
    expandedDate: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '800',
    },
    expandedMeta: {
        color: theme.colors.primaryAction,
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginTop: 2,
    },
    swipeNav: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    swipeBtn: {
        padding: 6,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 14,
    },
    swipeCounter: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 13,
        fontWeight: '600',
        minWidth: 30,
        textAlign: 'center',
    },
    expandedActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 16,
        zIndex: 2,
    },
    deleteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 77, 77, 0.08)',
        paddingVertical: 10,
        paddingHorizontal: 18,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(255, 77, 77, 0.15)',
        gap: 6,
    },
    deleteBtnText: {
        color: theme.colors.danger,
        fontWeight: '600',
        fontSize: 14,
    },

    deleteModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    deleteModalCard: {
        backgroundColor: '#1E1E1E',
        borderRadius: 24,
        padding: 24,
        width: '100%',
        maxWidth: 340,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center'
    },
    deleteModalTitle: {
        color: '#FFF',
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 8
    },
    deleteModalSub: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 22
    },
    deleteModalBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 16
    },
    deleteModalBtnText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold'
    }
});
