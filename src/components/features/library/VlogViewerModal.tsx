import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Modal, Pressable, TouchableWithoutFeedback } from 'react-native';

import { vibrate } from '@/lib/haptics';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    runOnJS,
    interpolate,
    Extrapolation,
    Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as LocalAuthentication from 'expo-local-authentication';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SavedVlog } from '@/types';
import { theme } from '@/styles/theme';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { usePreferences } from '@/lib/hooks/useStorage';
import { useCompressionQueueContext } from '@/lib/hooks/useCompressionQueueProvider';
import { logVlog } from '@/lib/logger';
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
    /** Called when user taps the Delete button — parent should show a ConfirmDialog */
    onRequestDelete?: (id: string) => void;
}

interface InternalVlogPlayerProps {
    uri: string;
    onPlayerReady?: (player: VideoPlayer) => void;
}

const InternalVlogPlayer = React.memo(({ uri, onPlayerReady }: InternalVlogPlayerProps) => {
    const player = useVideoPlayer(uri, (p) => {
        p.loop = true;
        p.play();
    });

    useEffect(() => {
        onPlayerReady?.(player);
    }, [player, onPlayerReady]);

    return (
        <VideoView
            style={styles.videoPlayer}
            player={player}
            nativeControls={false}
            contentFit="contain"
            pointerEvents="none"
        />
    );
});

/** Format seconds as "m:ss" (module-scope so the countdown badge can reuse it). */
const formatDuration = (sec: number) => {
    const totalSeconds = Math.floor(sec);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
};

interface DurationBadgeProps {
    player: VideoPlayer | null;
    durationSec: number;
}

/**
 * Live countdown badge, extracted into its OWN component.
 *
 * Previously `currentTime` was React state in the parent modal and was updated
 * on every native `timeUpdate` event + a 500ms poll — re-rendering the ENTIRE
 * modal (BlurView, morph card, gesture system, compression overlays) on every
 * tick while a video plays. Now only this tiny badge re-renders; the rest of
 * the modal stays untouched during playback.
 */
const DurationBadge = React.memo(({ player, durationSec }: DurationBadgeProps) => {
    const [remaining, setRemaining] = useState(() => {
        try {
            return Math.max(0, durationSec - (player?.currentTime ?? 0));
        } catch {
            return durationSec;
        }
    });

    useEffect(() => {
        if (!player) return undefined;
        let timeSub: { remove: () => void } | null = null;
        const pollTimer = setInterval(() => {
            try {
                setRemaining(Math.max(0, durationSec - player.currentTime));
            } catch {
                /* released player — ignore */
            }
        }, 500);

        // Native event listener (primary) — timeUpdate can be sparse on some devices.
        try {
            timeSub = player.addListener('timeUpdate', (event) => {
                const t = typeof event === 'number' ? event : (event?.currentTime ?? 0);
                setRemaining(Math.max(0, durationSec - t));
            });
        } catch {
            /* listener attach race on first open — polling fallback still active */
        }

        return () => {
            timeSub?.remove();
            clearInterval(pollTimer);
        };
    }, [player, durationSec]);

    return <Text style={styles.durationText}>{formatDuration(remaining)}</Text>;
});

interface VlogPlayerProps {
    uri: string;
    sharedPlayer?: VideoPlayer;
    onPlayerReady?: (player: VideoPlayer) => void;
}

/** Only creates an internal player when no shared player is provided.
 *  Prevents allocating an orphaned native player instance. */
const VlogPlayer = React.memo(({ uri, sharedPlayer, onPlayerReady }: VlogPlayerProps) => {
    if (sharedPlayer) {
        return (
            <VideoView
                style={styles.videoPlayer}
                player={sharedPlayer}
                nativeControls={false}
                contentFit="contain"
                pointerEvents="none"
            />
        );
    }
    return <InternalVlogPlayer uri={uri} onPlayerReady={onPlayerReady} />;
});

const VlogViewerModalInner: React.FC<VlogViewerModalProps> = ({
    visible,
    vlogs,
    initialIndex = 0,
    sourceRect,
    player: sharedPlayer,
    onClose,
    onRequestDelete,
}) => {
    const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
    const CARD_WIDTH = SCREEN_WIDTH - 32;
    const CARD_HEIGHT = SCREEN_HEIGHT * 0.75;
    const CARD_TARGET_X = 16;
    const CARD_TARGET_Y = (SCREEN_HEIGHT - CARD_HEIGHT) / 2;
    const [expandedIndex, setExpandedIndex] = useState(initialIndex);
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
    const [isDownloading, setIsDownloading] = useState(false);
    const [confirmDownload, setConfirmDownload] = useState(false);
    const [banner, setBanner] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    /** Internal player instance created by VlogPlayer when no shared player is provided */
    const [internalPlayer, setInternalPlayer] = useState<VideoPlayer | null>(null);
    const activePlayer = sharedPlayer || internalPlayer;

    /** Stable callback to receive the player from InternalVlogPlayer.
     *  We gate on `visible` to avoid setting state after the modal has
     *  already started closing (which would leak a released player). */
    const handlePlayerReady = useCallback(
        (player: VideoPlayer) => {
            if (visible) {
                logVlog('info', 'Internal player ready, storing in state');
                setInternalPlayer(player);
            } else {
                logVlog('info', 'Modal not visible, ignoring late player ready callback');
            }
        },
        [visible],
    );

    /** When the modal closes we MUST drop the internal player reference
     *  so that on the next open `activePlayer` is null until a fresh
     *  VideoPlayer is created.  expo-video releases the native player
     *  when InternalVlogPlayer unmounts; keeping the JS wrapper in state
     *  causes "shared object already released" on second open. */
    useEffect(() => {
        if (!visible && internalPlayer !== null) {
            logVlog('info', 'Modal closing — releasing internalPlayer reference');
            setInternalPlayer(null);
        }
    }, [visible, internalPlayer]);

    useEffect(() => {
        if (visible) {
            isClosingRef.current = false;
            setIsRendered(true);
            setExpandedIndex(initialIndex);
            try {
                setIsPlaying(activePlayer?.playing ?? true);
                setIsMuted((activePlayer?.volume ?? 1) === 0);
            } catch {
                /* activePlayer may be a released shared object —
                   fall back to defaults so the UI doesn't crash. */
                setIsPlaying(true);
                setIsMuted(false);
            }
            setShowControls(true);
            progress.value = 0;
            panX.value = 0;
            panY.value = 0;
            // Animate in — smooth easing, no spring bounce
            // Use built-in Easing worklet instead of inline arrow function
            // to avoid Reanimated "function not a worklet" runtime crash.
            progress.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) });
        } else {
            // Parent set visible=false — delegate to handleCloseInternal for consistent exit
            if (!isClosingRef.current) {
                runOnJS(handleCloseInternal)();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, initialIndex, panX, panY, progress, activePlayer]);

    /** Sync the play/pause icon with the native player.
     *  Note: timeUpdate/polling for the countdown badge lives in the isolated
     *  <DurationBadge/> component, so playback ticks never re-render this modal. */
    useEffect(() => {
        if (!activePlayer || !visible) return;

        logVlog('info', `Syncing listeners to player for vlog ${vlogs[expandedIndex]?.id}`);

        // Native event listener (primary)
        // Wrap in try/catch because addListener can throw if the native
        // player is not fully initialised yet (race on first open).
        let playSub: { remove: () => void } | null = null;
        try {
            playSub = activePlayer.addListener('playingChange', (event) => {
                setIsPlaying(event.isPlaying);
            });
        } catch (e) {
            logVlog('error', 'Failed to attach player listeners:', e);
        }

        return () => {
            logVlog('info', 'Removing player listeners');
            try {
                playSub?.remove();
            } catch {
                /* ignore */
            }
        };
    }, [activePlayer, visible, expandedIndex, vlogs]);

    /** Auto-hide controls after 3s of inactivity */
    const scheduleControlsHide = useCallback(() => {
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = setTimeout(() => {
            setShowControls(false);
        }, 3000);
    }, []);

    /** If vlogs array shrinks (e.g. parent deletes one), clamp expandedIndex so
     *  we never point to a removed element — which would crash the modal. */
    useEffect(() => {
        if (expandedIndex >= vlogs.length) {
            setExpandedIndex(Math.max(0, vlogs.length - 1));
        }
    }, [vlogs.length, expandedIndex]);

    useEffect(() => {
        if (showControls) scheduleControlsHide();
        return () => {
            if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
            if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
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

    // Handle swipe to dismiss (only on the card, not the backdrop)
    const panGesture = useMemo(
        () =>
            Gesture.Pan()
                .minDistance(10)
                .activeOffsetY(10)
                .onUpdate((e) => {
                    panX.value = e.translationX;
                    panY.value = e.translationY;
                })
                .onEnd((e) => {
                    const distance = Math.sqrt(e.translationX ** 2 + e.translationY ** 2);
                    if (distance > 80 || Math.abs(e.velocityY) > 800) {
                        // Trigger the same shared-element close animation as
                        // backdrop-tap / back-gesture so the card morphs back
                        // to the thumbnail in the calendar grid.
                        runOnJS(handleCloseInternal)();
                    } else {
                        panX.value = withSpring(0, theme.animation.springDefault);
                        panY.value = withSpring(0, theme.animation.springDefault);
                    }
                }),
        [handleCloseInternal, panX, panY],
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

    const handleManualCompress = async () => {
        const vlog = vlogs[expandedIndex];
        if (!vlog || isQueuedOrProcessing) return;
        logVlog('info', `Manual compress requested for vlog ${vlog.id}, preset ${activeCompressionPreset}`);
        await enqueueVlog(vlog.id, vlog.filePath, activeCompressionPreset);
        logVlog('info', `Vlog ${vlog.id} enqueued for compression`);
    };

    /** Show a temporary banner message at the top of the modal */
    const showBanner = useCallback((message: string, type: 'success' | 'error') => {
        if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
        setBanner({ message, type });
        bannerTimerRef.current = setTimeout(() => setBanner(null), 3000);
    }, []);

    /** Biometric gate: require fingerprint / face before any video leaves the app.
     *  Returns true if the user passed authentication, false otherwise. */
    const authenticateForDownload = useCallback(async (): Promise<boolean> => {
        try {
            const compatible = await LocalAuthentication.hasHardwareAsync();
            const enrolled = await LocalAuthentication.isEnrolledAsync();

            if (!compatible || !enrolled) {
                // No biometrics available — allow download without auth
                logVlog('info', 'Download auth skipped: no biometric hardware/enrollment');
                return true;
            }

            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Confirm identity to share video',
                cancelLabel: 'Cancel',
            });

            if (result.success) {
                vibrate(10);
                return true;
            }

            logVlog('warn', 'Download cancelled: biometric auth failed');
            return false;
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            logVlog('error', `Download auth error: ${msg}`);
            return false;
        }
    }, []);

    /** Save the current vlog to the device's photo gallery.
     *  Falls back to the system share sheet when gallery access is unavailable
     *  (e.g. in Expo Go, which lacks granular Android 14+ media permissions). */
    const handleDownload = useCallback(async () => {
        const vlog = vlogs[expandedIndex];
        if (!vlog || isDownloading) return;

        setIsDownloading(true);
        logVlog('info', `Starting download for vlog ${vlog.id}`);

        try {
            // Attempt gallery save — works in dev/standalone builds; fails in Expo Go
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status === 'granted') {
                const asset = await MediaLibrary.createAssetAsync(vlog.filePath);
                logVlog('info', `Download complete for vlog ${vlog.id}, asset id: ${asset.id}`);
                showBanner('Saved to gallery', 'success');
                vibrate(10);
                return;
            }

            // Permission denied — fall through to sharing
            logVlog('warn', `Download: permission ${status}, falling back to share sheet`);
        } catch (e) {
            // Expo Go rejects AUDIO permission — fall back to share sheet
            const msg = e instanceof Error ? e.message : String(e);
            logVlog('info', `Download: gallery unavailable (${msg}), falling back to share sheet`);
        }

        // Fallback: open system share sheet so the user can save to gallery manually
        try {
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(vlog.filePath, {
                    mimeType: 'video/mp4',
                    dialogTitle: 'Save video',
                    UTI: 'public.mpeg-4',
                });
                showBanner('Shared — you can save from the share sheet', 'success');
                vibrate(10);
            } else {
                showBanner('Sharing is not available on this device', 'error');
            }
        } catch (shareErr) {
            const msg = shareErr instanceof Error ? shareErr.message : String(shareErr);
            logVlog('error', `Download (share fallback) failed for vlog ${vlog.id}:`, msg);
            showBanner(`Download failed: ${msg}`, 'error');
        } finally {
            setIsDownloading(false);
        }
    }, [expandedIndex, vlogs, isDownloading, showBanner]);

    /** Called when user confirms the download dialog — runs biometric auth first,
     *  then proceeds to the actual download/share flow. */
    const handleConfirmDownload = useCallback(async () => {
        setConfirmDownload(false);
        const passed = await authenticateForDownload();
        if (passed) {
            handleDownload();
        }
    }, [authenticateForDownload, handleDownload]);

    /** Toggle play/pause on the active player.
     *  Uses pause() / play() — the correct methods on expo-video.
     *  The playingChange listener keeps the icon synced. */
    const togglePlayPause = useCallback(() => {
        if (!activePlayer) {
            logVlog('warn', 'togglePlayPause: no activePlayer');
            return;
        }
        try {
            if (activePlayer.playing) {
                logVlog('info', 'Pausing video');
                activePlayer.pause();
            } else {
                logVlog('info', 'Playing video');
                activePlayer.play();
            }
        } catch (e) {
            logVlog('error', 'togglePlayPause failed:', e);
        }
        vibrate(10);
        setShowControls(true);
        scheduleControlsHide();
    }, [activePlayer, scheduleControlsHide]);

    /** Toggle mute on the active player */
    const toggleMute = useCallback(() => {
        if (!activePlayer) {
            logVlog('warn', 'toggleMute: no activePlayer');
            return;
        }
        const nextMuted = activePlayer.volume === 0;
        try {
            activePlayer.volume = nextMuted ? 1 : 0;
            logVlog('info', nextMuted ? 'Unmuting video' : 'Muting video');
        } catch (e) {
            logVlog('error', 'toggleMute failed:', e);
        }
        setIsMuted(!nextMuted);
        vibrate(10);
        setShowControls(true);
        scheduleControlsHide();
    }, [activePlayer, scheduleControlsHide]);

    /** Skip forward/backward 10 seconds */
    const skip = useCallback(
        (seconds: number) => {
            if (!activePlayer) {
                logVlog('warn', `skip(${seconds}): no activePlayer`);
                return;
            }
            try {
                const target = Math.max(0, Math.min(activePlayer.duration, activePlayer.currentTime + seconds));
                activePlayer.currentTime = target;
                logVlog(
                    'info',
                    `Skipped ${seconds > 0 ? 'forward' : 'backward'} ${Math.abs(seconds)}s to ${target.toFixed(1)}s`,
                );
            } catch (e) {
                logVlog('error', 'skip failed:', e);
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
        <Modal
            visible
            transparent
            animationType="none"
            onRequestClose={handleCloseInternal}
            statusBarTranslucent
            navigationBarTranslucent
        >
            <GestureHandlerRootView style={{ flex: 1 }}>
                {/* Banner feedback — shows briefly after download actions */}
                {banner && (
                    <View style={[styles.banner, banner.type === 'error' && styles.bannerError]} pointerEvents="none">
                        <MaterialCommunityIcons
                            name={banner.type === 'success' ? 'check-circle-outline' : 'alert-circle-outline'}
                            size={18}
                            color={theme.colors.textPrimary}
                            style={{ marginRight: 8 }}
                        />
                        <Text style={styles.bannerText}>{banner.message}</Text>
                    </View>
                )}

                {/* Backdrop — tap to close, separate from card gestures */}
                <TouchableWithoutFeedback onPress={handleCloseInternal}>
                    <Animated.View style={[styles.expandedBackdrop, backdropAnimatedStyle]} />
                </TouchableWithoutFeedback>

                {/* Card — contains video, custom controls, info bar, swipe nav */}
                <GestureDetector gesture={panGesture}>
                    <Animated.View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
                        <Animated.View style={[styles.expandedCard, cardAnimatedStyle]} pointerEvents="auto">
                            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
                            <View style={styles.expandedTint} />

                            {/* Video Player Area with Custom Controls */}
                            <View style={styles.expandedVideoContainer}>
                                <VlogPlayer
                                    uri={currentVlog.filePath}
                                    sharedPlayer={sharedPlayer}
                                    onPlayerReady={handlePlayerReady}
                                />

                                {/* Tap overlay to toggle controls visibility */}
                                <Pressable
                                    style={StyleSheet.absoluteFillObject}
                                    onPress={() => {
                                        setShowControls((prev) => {
                                            const next = !prev;
                                            if (next) scheduleControlsHide();
                                            return next;
                                        });
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

                                {/* Live countdown badge — remaining time.
                                    Isolated in its own component so timeUpdate
                                    ticks don't re-render this whole modal. */}
                                <View style={styles.durationBadge} pointerEvents="none">
                                    <DurationBadge
                                        key={currentVlog.id}
                                        player={activePlayer}
                                        durationSec={currentVlog.durationSec}
                                    />
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

                            {/* Bottom-right icon-only actions */}
                            <View style={styles.actionsContainer} pointerEvents="box-none">
                                <AnimatedScaleButton
                                    style={[styles.controlIconBtn, isDownloading && styles.actionBtnDisabled]}
                                    onPress={() => setConfirmDownload(true)}
                                    disabled={isDownloading}
                                >
                                    <MaterialCommunityIcons
                                        name={isDownloading ? 'loading' : 'share-variant-outline'}
                                        size={20}
                                        color={theme.colors.primaryAction}
                                    />
                                </AnimatedScaleButton>

                                {onRequestDelete && (
                                    <AnimatedScaleButton
                                        style={styles.controlIconBtn}
                                        onPress={() => onRequestDelete(currentVlog.id)}
                                    >
                                        <MaterialCommunityIcons
                                            name="delete-outline"
                                            size={20}
                                            color={theme.colors.danger}
                                        />
                                    </AnimatedScaleButton>
                                )}
                            </View>
                        </Animated.View>
                    </Animated.View>
                </GestureDetector>

                {/* Download confirmation dialog — gates video export behind biometric auth */}
                <ConfirmDialog
                    visible={confirmDownload}
                    title="Share Video?"
                    message="This will allow the video to leave the app. Verify your identity to continue."
                    confirmLabel="Continue"
                    cancelLabel="Cancel"
                    confirmIcon="share-variant-outline"
                    onConfirm={handleConfirmDownload}
                    onCancel={() => setConfirmDownload(false)}
                />
            </GestureHandlerRootView>
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

    /* ── Banner ───────────────────────────────────────────────────────── */
    banner: {
        position: 'absolute',
        top: 50,
        left: 20,
        right: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.successFill,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.success,
        zIndex: 100,
    },
    bannerError: {
        backgroundColor: theme.colors.dangerFill,
        borderColor: theme.colors.danger,
    },
    bannerText: {
        color: theme.colors.textPrimary,
        fontSize: 14,
        fontWeight: '600',
    },

    /* ── Actions (icon-only, bottom-right) ────────────────────────────── */
    actionsContainer: {
        position: 'absolute',
        bottom: 12,
        right: 12,
        zIndex: 10,
        flexDirection: 'row',
        gap: 8,
    },
    actionBtnDisabled: {
        opacity: 0.4,
    },
});
