import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Modal, Pressable } from 'react-native';

import { vibrate } from '@/lib/haptics';
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
import { usePreferences } from '@/lib/hooks/useStorage';
import { useCompressionQueueContext } from '@/lib/hooks/useCompressionQueueProvider';
import type { VideoPlayer } from 'expo-video';

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
    player?: VideoPlayer;
    onClose: () => void;
    onDelete?: (id: string) => void;
}

interface InternalVlogPlayerProps {
    uri: string;
}

const InternalVlogPlayer = React.memo(({ uri }: InternalVlogPlayerProps) => {
    const player = useVideoPlayer(uri, (p) => {
        p.loop = true;
        p.play();
    });

    return <VideoView style={styles.videoPlayer} player={player} nativeControls={false} contentFit="contain" />;
});

interface VlogPlayerProps {
    uri: string;
    sharedPlayer?: VideoPlayer;
}

/** Only creates an internal player when no shared player is provided.
 *  Prevents allocating an orphaned native player instance. */
const VlogPlayer = React.memo(({ uri, sharedPlayer }: VlogPlayerProps) => {
    if (sharedPlayer) {
        return (
            <VideoView style={styles.videoPlayer} player={sharedPlayer} nativeControls={false} contentFit="contain" />
        );
    }
    return <InternalVlogPlayer uri={uri} />;
});

const VlogViewerModalInner: React.FC<VlogViewerModalProps> = ({
    visible,
    vlogs,
    initialIndex = 0,
    sourceRect,
    player: sharedPlayer,
    onClose,
    onDelete,
}) => {
    const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
    const CARD_WIDTH = SCREEN_WIDTH - 32;
    const CARD_HEIGHT = SCREEN_HEIGHT * 0.75;
    const CARD_TARGET_X = 16;
    const CARD_TARGET_Y = (SCREEN_HEIGHT - CARD_HEIGHT) / 2;
    const [expandedIndex, setExpandedIndex] = useState(initialIndex);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
    const { devMode, compressionPreset: activeCompressionPreset } = usePreferences();
    const { enqueueVlog, getJobForVlog } = useCompressionQueueContext();
    const activeJob = getJobForVlog(vlogs[expandedIndex]?.id ?? '');
    const isQueuedOrProcessing = !!activeJob;

    // Keep visible state synced locally for enter/exit animations
    const [isRendered, setIsRendered] = useState(visible);
    const isClosingRef = useRef(false);

    // Reanimated Shared Values
    const progress = useSharedValue(0); // 0 = shrinked to sourceRect, 1 = expanded
    const panX = useSharedValue(0);
    const panY = useSharedValue(0);

    // Player state for custom controls
    const [isPlaying, setIsPlaying] = useState(true);
    const [isMuted, setIsMuted] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const activePlayer = sharedPlayer || null;

    useEffect(() => {
        if (visible) {
            isClosingRef.current = false;
            setIsRendered(true);
            setExpandedIndex(initialIndex);
            setIsPlaying(activePlayer?.playing ?? true);
            setIsMuted((activePlayer?.volume ?? 1) === 0);
            setShowControls(true);
            setCurrentTime(activePlayer?.currentTime ?? 0);
            progress.value = 0;
            panX.value = 0;
            panY.value = 0;
            // Animate in
            progress.value = withSpring(1, { damping: 18, stiffness: 180 });
        } else {
            // Parent set visible=false — delegate to handleCloseInternal for consistent exit
            if (!isClosingRef.current) {
                runOnJS(handleCloseInternal)();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, initialIndex, panX, panY, progress, activePlayer]);

    /** Sync UI with native player.
     *  We use BOTH timeUpdate events AND a polling fallback because
     *  expo-video's timeUpdate event frequency varies by platform
     *  and can be sparse or missing entirely on some devices. */
    useEffect(() => {
        if (!activePlayer || !visible) return;

        // Native event listener (primary)
        const timeSub = activePlayer.addListener('timeUpdate', (event) => {
            const t = typeof event === 'number' ? event : (event?.currentTime ?? 0);
            setCurrentTime(t);
        });
        const playSub = activePlayer.addListener('playingChange', (event) => {
            setIsPlaying(event.isPlaying);
        });

        // Polling fallback (500ms) — catches timeUpdate gaps
        const pollTimer = setInterval(() => {
            try {
                setCurrentTime(activePlayer.currentTime);
            } catch {
                /* ignore */
            }
        }, 500);

        return () => {
            timeSub.remove();
            playSub.remove();
            clearInterval(pollTimer);
        };
    }, [activePlayer, visible, expandedIndex]);

    /** Auto-hide controls after 3s of inactivity */
    const scheduleControlsHide = useCallback(() => {
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = setTimeout(() => {
            setShowControls(false);
        }, 3000);
    }, []);

    useEffect(() => {
        if (showControls) scheduleControlsHide();
        return () => {
            if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        };
    }, [showControls, scheduleControlsHide]);

    /** Shared-element close: morph back to thumbnail (backdrop tap, back button). */
    const handleCloseInternal = useCallback(() => {
        if (isClosingRef.current) return;
        isClosingRef.current = true;
        progress.value = withTiming(0, { duration: 250 }, () => {
            runOnJS(setIsRendered)(false);
            runOnJS(onClose)();
        });
        panX.value = withTiming(0, { duration: 250 });
        panY.value = withTiming(0, { duration: 250 });
    }, [onClose, panX, panY, progress]);

    /** Swipe-down close: slide card down while fading backdrop via dragOpacity. */
    const handleSwipeDismiss = useCallback(() => {
        if (isClosingRef.current) return;
        isClosingRef.current = true;
        panX.value = withTiming(0, { duration: 300 });
        panY.value = withTiming(SCREEN_HEIGHT, { duration: 300 }, () => {
            runOnJS(setIsRendered)(false);
            runOnJS(onClose)();
        });
    }, [onClose, panX, panY, SCREEN_HEIGHT]);

    // Handle swipe to dismiss (only on the card, not the backdrop)
    const panGesture = useMemo(
        () =>
            Gesture.Pan()
                .onUpdate((e) => {
                    panX.value = e.translationX;
                    panY.value = e.translationY;
                })
                .onEnd((e) => {
                    const distance = Math.sqrt(e.translationX ** 2 + e.translationY ** 2);
                    if (distance > 80 || Math.abs(e.velocityY) > 800) {
                        runOnJS(handleSwipeDismiss)();
                    } else {
                        panX.value = withSpring(0, { damping: 20, stiffness: 200 });
                        panY.value = withSpring(0, { damping: 20, stiffness: 200 });
                    }
                }),
        [handleSwipeDismiss, panX, panY],
    );

    // Backdrop tap — only closes when tapping outside the card
    const backdropTapGesture = useMemo(
        () =>
            Gesture.Tap().onEnd(() => {
                runOnJS(handleCloseInternal)();
            }),
        [handleCloseInternal],
    );

    const swipeVlog = useCallback(
        (direction: number) => {
            const newIdx = expandedIndex + direction;
            if (newIdx >= 0 && newIdx < vlogs.length) {
                setExpandedIndex(newIdx);
                vibrate(10);
            }
        },
        [vlogs.length, expandedIndex],
    );

    const formatDuration = (sec: number) => {
        const totalSeconds = Math.floor(sec);
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const handleManualCompress = async () => {
        const vlog = vlogs[expandedIndex];
        if (!vlog || isQueuedOrProcessing) return;
        await enqueueVlog(vlog.id, vlog.filePath, activeCompressionPreset);
    };

    /** Toggle play/pause on the active player.
     *  Uses pause() / play() — the correct methods on expo-video.
     *  The playingChange listener keeps the icon synced. */
    const togglePlayPause = useCallback(() => {
        if (!activePlayer) return;
        if (activePlayer.playing) {
            try {
                activePlayer.pause();
            } catch {
                /* ignore */
            }
        } else {
            try {
                activePlayer.play();
            } catch {
                /* ignore */
            }
        }
        vibrate(10);
        setShowControls(true);
        scheduleControlsHide();
    }, [activePlayer, scheduleControlsHide]);

    /** Toggle mute on the active player */
    const toggleMute = useCallback(() => {
        if (!activePlayer) return;
        const nextMuted = activePlayer.volume === 0;
        try {
            activePlayer.volume = nextMuted ? 1 : 0;
        } catch {
            /* ignore */
        }
        setIsMuted(!nextMuted);
        vibrate(10);
        setShowControls(true);
        scheduleControlsHide();
    }, [activePlayer, scheduleControlsHide]);

    /** Skip forward/backward 10 seconds */
    const skip = useCallback(
        (seconds: number) => {
            if (!activePlayer) return;
            try {
                const target = Math.max(0, Math.min(activePlayer.duration, activePlayer.currentTime + seconds));
                activePlayer.currentTime = target;
                setCurrentTime(target);
            } catch {
                /* ignore */
            }
            vibrate(10);
            setShowControls(true);
            scheduleControlsHide();
        },
        [activePlayer, scheduleControlsHide],
    );

    // Card Animated Style (morphing width, height, top, left + pan dragging)
    const cardAnimatedStyle = useAnimatedStyle(() => {
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

        const dragDist = Math.sqrt(panX.value ** 2 + panY.value ** 2);
        const dragScale = interpolate(dragDist, [0, 300], [1, 0.85], Extrapolation.CLAMP);

        return {
            position: 'absolute',
            top: currentTop,
            left: currentLeft,
            width: currentWidth,
            height: currentHeight,
            borderRadius: currentBorderRadius,
            transform: [{ translateX: panX.value }, { translateY: panY.value }, { scale: dragScale }],
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

    const currentVlog = vlogs[expandedIndex];

    return (
        <Modal visible transparent animationType="none" onRequestClose={handleCloseInternal}>
            {/* Backdrop — tap to close, separate from card gestures */}
            <GestureDetector gesture={backdropTapGesture}>
                <Animated.View style={[styles.expandedBackdrop, backdropAnimatedStyle]} />
            </GestureDetector>

            {/* Card — contains video, custom controls, info bar, swipe nav */}
            <GestureDetector gesture={panGesture}>
                <Animated.View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
                    <Animated.View style={[styles.expandedCard, cardAnimatedStyle]} pointerEvents="auto">
                        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
                        <View style={styles.expandedTint} />

                        {/* Video Player Area with Custom Controls */}
                        <View style={styles.expandedVideoContainer}>
                            <VlogPlayer uri={currentVlog.filePath} sharedPlayer={sharedPlayer} />

                            {/* Tap overlay to toggle controls visibility */}
                            <Pressable
                                style={StyleSheet.absoluteFillObject}
                                onPress={() => {
                                    setShowControls((prev) => !prev);
                                    if (!showControls) scheduleControlsHide();
                                }}
                            />

                            {/* Top-right mute button */}
                            {showControls && (
                                <View style={styles.muteBtnContainer} pointerEvents="box-none">
                                    <AnimatedScaleButton style={styles.controlIconBtn} onPress={toggleMute}>
                                        <MaterialCommunityIcons
                                            name={isMuted ? 'volume-off' : 'volume-high'}
                                            size={20}
                                            color={theme.colors.textPrimary}
                                        />
                                    </AnimatedScaleButton>
                                </View>
                            )}

                            {/* Center play/pause + skip controls */}
                            {showControls && (
                                <View style={styles.centerControls} pointerEvents="box-none">
                                    <AnimatedScaleButton
                                        style={[styles.controlIconBtn, styles.skipBtn]}
                                        onPress={() => skip(-10)}
                                    >
                                        <MaterialCommunityIcons
                                            name="rewind-10"
                                            size={28}
                                            color={theme.colors.textPrimary}
                                        />
                                    </AnimatedScaleButton>

                                    <AnimatedScaleButton
                                        style={[styles.controlIconBtn, styles.playPauseBtn]}
                                        onPress={togglePlayPause}
                                    >
                                        <MaterialCommunityIcons
                                            name={isPlaying ? 'pause' : 'play'}
                                            size={36}
                                            color={theme.colors.textPrimary}
                                        />
                                    </AnimatedScaleButton>

                                    <AnimatedScaleButton
                                        style={[styles.controlIconBtn, styles.skipBtn]}
                                        onPress={() => skip(10)}
                                    >
                                        <MaterialCommunityIcons
                                            name="fast-forward-10"
                                            size={28}
                                            color={theme.colors.textPrimary}
                                        />
                                    </AnimatedScaleButton>
                                </View>
                            )}

                            {/* Live countdown badge — remaining time */}
                            <View style={styles.durationBadge} pointerEvents="none">
                                <Text style={styles.durationText}>
                                    {formatDuration(Math.max(0, currentVlog.durationSec - currentTime))}
                                </Text>
                            </View>

                            {/* Compression trigger / progress overlay */}
                            {activeJob && (activeJob.status === 'processing' || activeJob.status === 'queued') && (
                                <View style={styles.compressProgressOverlay} pointerEvents="box-none">
                                    <View style={styles.compressProgressPill}>
                                        <MaterialCommunityIcons
                                            name={activeJob.status === 'processing' ? 'loading' : 'clock-outline'}
                                            size={14}
                                            color={theme.colors.textPrimary}
                                            style={{ marginRight: 6 }}
                                        />
                                        <Text style={styles.compressProgressText}>
                                            {activeJob.status === 'processing'
                                                ? `Compressing… ${Math.round((activeJob.progress ?? 0) * 100)}%`
                                                : 'Queued for compression'}
                                        </Text>
                                    </View>
                                    {activeJob.status === 'processing' && (
                                        <View style={styles.compressProgressBarTrack}>
                                            <View
                                                style={[
                                                    styles.compressProgressBarFill,
                                                    { width: `${Math.round((activeJob.progress ?? 0) * 100)}%` },
                                                ]}
                                            />
                                        </View>
                                    )}
                                </View>
                            )}

                            {activeJob?.status === 'failed' && (
                                <View style={styles.compressProgressOverlay} pointerEvents="box-none">
                                    <View
                                        style={[
                                            styles.compressProgressPill,
                                            { backgroundColor: theme.colors.dangerFill },
                                        ]}
                                    >
                                        <MaterialCommunityIcons
                                            name="alert-circle-outline"
                                            size={14}
                                            color={theme.colors.danger}
                                            style={{ marginRight: 6 }}
                                        />
                                        <Text
                                            style={[styles.compressProgressText, { color: theme.colors.danger }]}
                                            numberOfLines={1}
                                        >
                                            Failed{activeJob.error ? `: ${activeJob.error}` : ''}
                                        </Text>
                                    </View>
                                </View>
                            )}

                            {(currentVlog.compressionPreset === 'off' ||
                                !currentVlog.compressionPreset ||
                                currentVlog.compressionPending) &&
                                !activeJob && (
                                    <View style={styles.compressBtnContainer} pointerEvents="box-none">
                                        <AnimatedScaleButton
                                            style={[styles.compressBtn, { opacity: 1 }]}
                                            onPress={handleManualCompress}
                                        >
                                            <MaterialCommunityIcons
                                                name="zip-box"
                                                size={16}
                                                color={theme.colors.textPrimary}
                                                style={{ marginRight: 6 }}
                                            />
                                            <Text style={styles.compressBtnText}>Compress Video</Text>
                                        </AnimatedScaleButton>
                                    </View>
                                )}

                            {/* Dev watermark overlay */}
                            {devMode && (
                                <View style={styles.devWatermark} pointerEvents="box-none">
                                    <Text style={styles.devWatermarkText}>
                                        DEV: {currentVlog.compressionPreset || 'Uncompressed'}{' '}
                                        {currentVlog.originalFileSizeBytes
                                            ? `(${Math.round(100 - (currentVlog.fileSizeBytes / currentVlog.originalFileSizeBytes) * 100)}% saved)`
                                            : ''}
                                        {currentVlog.compressionPending ? ' • PENDING' : ''}
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* Info bar */}
                        <View style={styles.expandedInfo}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.expandedDate}>{currentVlog.dateStr}</Text>
                                <Text style={styles.expandedMeta}>
                                    {formatDuration(currentVlog.durationSec)} •{' '}
                                    {(currentVlog.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB
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
                                        <MaterialCommunityIcons
                                            name="chevron-left"
                                            size={24}
                                            color={theme.colors.textPrimary}
                                        />
                                    </AnimatedScaleButton>
                                    <Text style={styles.swipeCounter}>
                                        {expandedIndex + 1}/{vlogs.length}
                                    </Text>
                                    <AnimatedScaleButton
                                        onPress={() => swipeVlog(1)}
                                        disabled={expandedIndex === vlogs.length - 1}
                                        style={[
                                            styles.swipeBtn,
                                            expandedIndex === vlogs.length - 1 && { opacity: 0.3 },
                                        ]}
                                    >
                                        <MaterialCommunityIcons
                                            name="chevron-right"
                                            size={24}
                                            color={theme.colors.textPrimary}
                                        />
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
                                    onPress={() => setShowDeleteConfirm(currentVlog.id)}
                                >
                                    <MaterialCommunityIcons
                                        name="delete-outline"
                                        size={18}
                                        color={theme.colors.danger}
                                    />
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
                                    <MaterialCommunityIcons
                                        name="close"
                                        size={18}
                                        color={theme.colors.textPrimary}
                                        style={{ marginRight: 6 }}
                                    />
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
                                    <MaterialCommunityIcons
                                        name="delete-outline"
                                        size={18}
                                        color={theme.colors.textPrimary}
                                        style={{ marginRight: 6 }}
                                    />
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

export const VlogViewerModal = React.memo(VlogViewerModalInner);

const styles = StyleSheet.create({
    expandedBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: theme.colors.overlayMedium,
    },
    expandedCard: {
        borderColor: theme.colors.glassBorderMedium,
        borderWidth: 1,
        overflow: 'hidden',
        shadowColor: theme.colors.background,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.5,
        shadowRadius: 30,
        elevation: 25,
    },
    expandedTint: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: theme.colors.surfaceOverlay,
    },
    expandedVideoContainer: {
        flex: 1,
        margin: 12,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: theme.colors.background,
        zIndex: 2,
        position: 'relative',
    },
    videoPlayer: {
        flex: 1,
        width: '100%',
    },

    /* ── Custom Controls ─────────────────────────────────────────────── */
    muteBtnContainer: {
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 10,
    },
    centerControls: {
        ...StyleSheet.absoluteFillObject,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 24,
        zIndex: 10,
    },
    controlIconBtn: {
        backgroundColor: theme.colors.overlayVideoStrong,
        padding: 10,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    playPauseBtn: {
        padding: 16,
        borderRadius: 50,
    },
    skipBtn: {
        padding: 12,
        borderRadius: 40,
    },
    durationBadge: {
        position: 'absolute',
        bottom: 12,
        left: 12,
        backgroundColor: theme.colors.overlayVideoStrong,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        zIndex: 5,
    },
    durationText: {
        color: theme.colors.textPrimary,
        fontSize: 12,
        fontWeight: '700',
    },

    compressProgressOverlay: {
        position: 'absolute',
        bottom: 12,
        left: 12,
        right: 12,
        zIndex: 10,
        alignItems: 'center',
    },
    compressProgressPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.overlayVideoStrong,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.colors.glassBorderMedium,
    },
    compressProgressText: {
        color: theme.colors.textPrimary,
        fontSize: 12,
        fontWeight: '600',
    },
    compressProgressBarTrack: {
        width: '100%',
        maxWidth: 200,
        height: 4,
        borderRadius: 2,
        backgroundColor: theme.colors.glassSurface,
        marginTop: 4,
    },
    compressProgressBarFill: {
        height: 4,
        borderRadius: 2,
        backgroundColor: theme.colors.primaryAction,
    },

    /* ── Compress Button ─────────────────────────────────────────────── */
    compressBtnContainer: {
        position: 'absolute',
        bottom: 12,
        right: 12,
        zIndex: 10,
    },
    compressBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.overlayVideoStrong,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.colors.glassBorderMedium,
    },
    compressBtnDisabled: {
        opacity: 0.6,
    },
    compressBtnText: {
        color: theme.colors.textPrimary,
        fontSize: 13,
        fontWeight: '700',
    },
    devWatermark: {
        position: 'absolute',
        top: 10,
        left: 10,
        backgroundColor: theme.colors.dangerOverlayStrong,
        padding: 6,
        borderRadius: 4,
        zIndex: 10,
        alignItems: 'flex-start',
    },
    devWatermarkText: {
        color: theme.colors.textPrimary,
        fontSize: 10,
        fontWeight: 'bold',
    },
    devCompressBtn: {
        marginTop: 6,
        backgroundColor: theme.colors.overlayVideoMuted,
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: theme.colors.grey,
    },
    devCompressBtnText: {
        color: theme.colors.textPrimary,
        fontSize: 10,
        fontWeight: 'bold',
    },

    /* ── Info & Navigation ────────────────────────────────────────────── */
    expandedInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: theme.colors.glassSurface,
        zIndex: 2,
    },
    expandedDate: {
        color: theme.colors.textPrimary,
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
        backgroundColor: theme.colors.glassSurfaceMedium,
        borderRadius: 14,
    },
    swipeCounter: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        fontWeight: '600',
        minWidth: 30,
        textAlign: 'center',
    },

    /* ── Actions ──────────────────────────────────────────────────────── */
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
        backgroundColor: theme.colors.dangerLight,
        paddingVertical: 10,
        paddingHorizontal: 18,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: theme.colors.dangerFill,
        gap: 6,
    },
    deleteBtnText: {
        color: theme.colors.danger,
        fontWeight: '600',
        fontSize: 14,
    },

    /* ── Delete Modal ─────────────────────────────────────────────────── */
    deleteModalOverlay: {
        flex: 1,
        backgroundColor: theme.colors.overlayMedium,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    deleteModalCard: {
        backgroundColor: theme.colors.surfaceRaised,
        borderRadius: 24,
        padding: 24,
        width: '100%',
        maxWidth: 340,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        alignItems: 'center',
    },
    deleteModalTitle: {
        color: theme.colors.textPrimary,
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    deleteModalSub: {
        color: theme.colors.textSecondary,
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 22,
    },
    deleteModalBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 16,
    },
    deleteModalBtnText: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        fontWeight: 'bold',
    },
});
