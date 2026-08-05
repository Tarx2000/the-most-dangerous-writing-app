import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, StatusBar, Platform, Alert, AppState } from 'react-native';
import { vibrate } from '@/lib/haptics';
import { useKeepAwake } from 'expo-keep-awake';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    withSequence,
    withRepeat,
    cancelAnimation,
} from 'react-native-reanimated';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { BlurView } from 'expo-blur';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation.types';
import { CONFIG } from '@/config';
import { usePreferences, useVlogs } from '@/lib/hooks/useStorage';
import { SavedVlog } from '@/types';
import { theme } from '@/styles/theme';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { generateId } from '@/lib/utils';
import { isCompressionAvailable } from '@/lib/videoCompressor';
import { useCompressionQueueContext } from '@/lib/hooks/useCompressionQueueProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'VlogRecording'>;

/* ────────────────────────────────────────────────────────────────────────────
 * CONFIGURABLE: Recording & UI settings
 * ──────────────────────────────────────────────────────────────────────────── */
/** Seconds for the 3-2-1 countdown before recording starts */
const COUNTDOWN_SECONDS = 3;
/** Interval for the timer tick during recording (ms) */
const TIMER_TICK_MS = 1000;
/** Pulsing dot animation duration */
const PULSE_DURATION_MS = 1200;

/**
 * VlogRecordingScreen — Full-screen front camera video recording.
 *
 * UX Flow:
 * 1. Request camera + microphone permissions
 * 2. Show 3-2-1 countdown with smooth animation
 * 3. Start recording (front camera, 1080p, with audio)
 * 4. Display timer in liquid glass overlay
 *    - Regular mode: countdown timer (MM:SS remaining)
 *    - Quick Video mode: elapsed timer (MM:SS recorded)
 * 5. Regular mode: when timer reaches 0 → show stop button
 *    Quick Video mode: stop button visible from the start
 * 6. On stop → save video to private app storage, navigate home
 * 7. Compression (if enabled) runs asynchronously in the background
 *
 * The camera always faces the front (selfie mode).
 */
export const VlogRecordingScreen: React.FC<Props> = ({ route, navigation }) => {
    const { timeIndex, isQuickVideo } = route.params;

    /* ── Keep screen awake during the entire recording flow ──────────── */
    useKeepAwake();

    /* ── Timer duration from config ────────────────────────────────────── */
    const durationMin = CONFIG.VLOG_SESSION_OPTIONS_MINS[timeIndex] || 1;
    const totalDurationSec = isQuickVideo ? 0 : durationMin * 60;

    /* ── Permissions ───────────────────────────────────────────────────── */
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();
    const [micPermission, requestMicPermission] = useMicrophonePermissions();

    /* ── State machine ─────────────────────────────────────────────────── */
    type RecordingPhase = 'permissions' | 'countdown' | 'recording' | 'canStop' | 'idle';
    const [phase, setPhase] = useState<RecordingPhase>('permissions');
    const [countdownNum, setCountdownNum] = useState(COUNTDOWN_SECONDS);
    const [timeRemaining, setTimeRemaining] = useState(totalDurationSec);
    const [elapsedSec, setElapsedSec] = useState(0);

    /* ── Refs ──────────────────────────────────────────────────────────── */
    const cameraRef = useRef<CameraView>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const countdownRef = useRef<NodeJS.Timeout | null>(null);
    const permissionToCountdownRef = useRef<NodeJS.Timeout | null>(null);
    /** Track if recording is active to prevent double-stop */
    const isRecordingRef = useRef(false);
    /** Track actual elapsed seconds for saving real duration */
    const elapsedRef = useRef(0);
    /** Track if user cancelled (back button) to skip saving */
    const isCancelledRef = useRef(false);

    /* ── Animations ────────────────────────────────────────────────────── */
    const countdownScale = useSharedValue(0);
    const countdownOpacity = useSharedValue(0);
    const pulseAnim = useSharedValue(1);
    const stopBtnSlide = useSharedValue(100);

    const countdownStyle = useAnimatedStyle(() => ({
        transform: [{ scale: countdownScale.value }],
        opacity: countdownOpacity.value,
    }));
    const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseAnim.value }));
    const stopBtnStyle = useAnimatedStyle(() => ({ transform: [{ translateY: stopBtnSlide.value }] }));

    const { saveVlog } = useVlogs();
    const { vlogQuality, compressionPreset } = usePreferences();
    const { enqueueVlog } = useCompressionQueueContext();

    const compressionPresetRef = useRef(compressionPreset);
    compressionPresetRef.current = compressionPreset;

    /* ── Permission flow ───────────────────────────────────────────────── */
    useEffect(() => {
        const checkPermissions = async () => {
            let camGranted = cameraPermission?.granted;
            let micGranted = micPermission?.granted;

            if (!camGranted) {
                const result = await requestCameraPermission();
                camGranted = result.granted;
            }
            if (!micGranted) {
                const result = await requestMicPermission();
                micGranted = result.granted;
            }

            if (camGranted && micGranted) {
                // Stored in a ref so it can be cleared if the user leaves early
                // (avoids a post-unmount setPhase and duplicate timers on re-render).
                if (permissionToCountdownRef.current) clearTimeout(permissionToCountdownRef.current);
                permissionToCountdownRef.current = setTimeout(() => setPhase('countdown'), 500);
            }
        };

        if (phase === 'permissions') {
            checkPermissions();
        }

        // Clear the pending permission→countdown timeout on unmount / phase change
        return () => {
            if (permissionToCountdownRef.current) {
                clearTimeout(permissionToCountdownRef.current);
                permissionToCountdownRef.current = null;
            }
        };
    }, [phase, cameraPermission, micPermission, requestCameraPermission, requestMicPermission]);

    /* ── AppState: finalize recording if the app backgrounds mid-recording ─
       Without this, `recordAsync` can hang forever after a device sleep or app
       switch, leaving a permanent "recording" spinner and a ticking timer. */
    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => {
            if (state !== 'active' && isRecordingRef.current) {
                cameraRef.current?.stopRecording();
            }
        });
        return () => sub.remove();
    }, []);

    /* ── Save the vlog to storage and navigate home ───────────────────── */
    const saveAndNavigateHome = useCallback(
        async (newVlog: SavedVlog, streakResult: { streakIncreased: boolean; newStreak: number }) => {
            navigation.reset({
                index: 0,
                routes: [
                    {
                        name: 'Home',
                        params: {
                            streakIncreased: streakResult.streakIncreased,
                            newStreak: streakResult.newStreak,
                        },
                    },
                ],
            });
        },
        [navigation],
    );

    /* ── Background compression — enqueue via the centralized queue ──────── */
    const runBackgroundCompression = useCallback(
        async (vlogId: string, permanentPath: string) => {
            const currentPreset = compressionPresetRef.current;
            if (currentPreset === 'off' || !isCompressionAvailable()) return;
            await enqueueVlog(vlogId, permanentPath, currentPreset);
        },
        [enqueueVlog],
    );

    /* ── Handle completed recording — save immediately, compress later ─── */
    const handleRecordingComplete = useCallback(
        async (tempUri: string) => {
            isRecordingRef.current = false;

            if (isCancelledRef.current) {
                try {
                    await FileSystem.deleteAsync(tempUri, { idempotent: true });
                } catch (err) {
                    console.warn('[Vlog] Failed to delete temp file on cancel:', err);
                }
                navigation.goBack();
                return;
            }

            try {
                const vlogDir = `${FileSystem.documentDirectory}${CONFIG.VLOG_STORAGE_DIR}`;
                const dirInfo = await FileSystem.getInfoAsync(vlogDir);
                if (!dirInfo.exists) {
                    await FileSystem.makeDirectoryAsync(vlogDir, { intermediates: true });
                }

                const vlogId = generateId();
                const permanentPath = `${vlogDir}${vlogId}.mp4`;
                await FileSystem.moveAsync({ from: tempUri, to: permanentPath });

                const rawInfo = await FileSystem.getInfoAsync(permanentPath);
                const rawSizeBytes = 'size' in rawInfo ? (rawInfo as { size: number }).size : 0;

                const now = new Date();
                const currentPreset = compressionPresetRef.current;
                const shouldCompress = currentPreset !== 'off' && isCompressionAvailable();

                const newVlog: SavedVlog = {
                    id: vlogId,
                    filePath: permanentPath,
                    dateStr:
                        now.toLocaleDateString() +
                        ' ' +
                        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    timestamp: now.getTime(),
                    durationSec: elapsedRef.current,
                    fileSizeBytes: rawSizeBytes,
                    compressionPreset: shouldCompress ? currentPreset : 'off',
                    originalFileSizeBytes: shouldCompress ? rawSizeBytes : undefined,
                    compressionPending: shouldCompress,
                };

                const result = await saveVlog(newVlog);

                // Navigate home immediately — user doesn't wait for compression
                await saveAndNavigateHome(newVlog, result);

                // Fire-and-forget compression in the background
                if (shouldCompress) {
                    runBackgroundCompression(vlogId, permanentPath);
                }
            } catch (err) {
                console.error('Failed to save vlog:', err);
                setPhase('idle');
                Alert.alert('Save Failed', 'Unable to save your recording. Please try again.', [{ text: 'OK' }]);
            }
        },
        [saveVlog, saveAndNavigateHome, runBackgroundCompression, navigation],
    );

    /* ── Start recording ───────────────────────────────────────────────── */
    const startRecording = useCallback(async () => {
        if (!cameraRef.current || isRecordingRef.current) return;

        setPhase('recording');
        setTimeRemaining(totalDurationSec);
        setElapsedSec(0);
        isRecordingRef.current = true;
        isCancelledRef.current = false;
        elapsedRef.current = 0;

        // Quick Video: show stop button immediately
        if (isQuickVideo) {
            setPhase('canStop');
            stopBtnSlide.value = withSpring(0, theme.animation.springSnappy);
        }

        // Start the timer
        let remaining = totalDurationSec;
        timerRef.current = setInterval(() => {
            elapsedRef.current++;
            setElapsedSec(elapsedRef.current);

            if (!isQuickVideo) {
                remaining--;
                setTimeRemaining(remaining);

                if (remaining <= 0) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    timerRef.current = null;
                    setPhase('canStop');
                    vibrate([0, 100, 50, 100]);
                    stopBtnSlide.value = withSpring(0, theme.animation.springSnappy);
                }
            }
        }, TIMER_TICK_MS);

        try {
            const video = await cameraRef.current.recordAsync({});
            if (video?.uri) {
                await handleRecordingComplete(video.uri);
            }
        } catch (err) {
            console.error('Recording error:', err);
            isRecordingRef.current = false;
            Alert.alert('Recording Failed', 'Unable to record video. Please try again.', [{ text: 'OK' }]);
            navigation.goBack();
        }
    }, [totalDurationSec, isQuickVideo, handleRecordingComplete, navigation, stopBtnSlide]);

    /* ── Stop recording (user taps stop button) ────────────────────────── */
    const stopRecording = useCallback(() => {
        if (!isRecordingRef.current) return;
        cameraRef.current?.stopRecording();
    }, []);

    /**
     * Cancel recording — stops camera, discards the video file, and navigates back.
     */
    const cancelRecording = useCallback(() => {
        isCancelledRef.current = true;
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
        }
        if (isRecordingRef.current) {
            cameraRef.current?.stopRecording();
        } else {
            navigation.goBack();
        }
    }, [navigation]);

    /* ── 3-2-1 Countdown Animation ─────────────────────────────────────── */
    useEffect(() => {
        if (phase !== 'countdown') return;

        let count = COUNTDOWN_SECONDS;
        setCountdownNum(count);

        const animateNumber = () => {
            countdownScale.value = 0.3;
            countdownOpacity.value = 0;
            countdownScale.value = withSpring(1, theme.animation.springSnappy);
            countdownOpacity.value = withTiming(1, { duration: 200 });
            vibrate(50);
        };

        animateNumber();

        countdownRef.current = setInterval(() => {
            count--;
            if (count > 0) {
                setCountdownNum(count);
                animateNumber();
            } else {
                if (countdownRef.current) clearInterval(countdownRef.current);
                countdownRef.current = null;
                startRecording();
            }
        }, 1000);

        return () => {
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, startRecording]);

    /* ── Pulsing recording dot ─────────────────────────────────────────── */
    useEffect(() => {
        if (phase !== 'recording' && phase !== 'canStop') return;

        pulseAnim.value = withRepeat(
            withSequence(
                withTiming(0.4, { duration: PULSE_DURATION_MS / 2 }),
                withTiming(1, { duration: PULSE_DURATION_MS / 2 }),
            ),
            -1,
            false,
        );

        return () => {
            cancelAnimation(pulseAnim);
            pulseAnim.value = 1;
        };
    }, [phase, pulseAnim]);

    /* ── Cleanup timers on unmount ──────────────────────────────────────── */
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, []);

    /* ── Format time as MM:SS ──────────────────────────────────────────── */
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(Math.abs(seconds) / 60);
        const secs = Math.abs(seconds) % 60;
        const prefix = seconds < 0 ? '+' : '';
        return `${prefix}${mins}:${secs.toString().padStart(2, '0')}`;
    };

    /* ── Permissions denied state ──────────────────────────────────────── */
    if (cameraPermission && !cameraPermission.granted && !cameraPermission.canAskAgain) {
        return (
            <View style={styles.permissionDenied}>
                <MaterialCommunityIcons name="camera-off" size={64} color={theme.colors.textMuted} />
                <Text style={styles.permissionTitle}>Camera Access Required</Text>
                <Text style={styles.permissionSubtitle}>
                    Please enable camera and microphone access in your device settings to record vlogs.
                </Text>
                <AnimatedScaleButton style={styles.permissionBtn} onPress={() => navigation.goBack()}>
                    <Text style={styles.permissionBtnText}>Go Back</Text>
                </AnimatedScaleButton>
            </View>
        );
    }

    /* ── Render ─────────────────────────────────────────────────────────── */
    return (
        <View style={styles.container}>
            <StatusBar hidden />

            {/* Full-bleed front camera preview */}
            <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFillObject}
                facing="front"
                mode="video"
                videoQuality={(vlogQuality as '2160p' | '1080p' | '720p' | '480p' | '4:3') || CONFIG.VLOG_VIDEO_QUALITY}
                videoBitrate={CONFIG.VLOG_BITRATE_MAP[vlogQuality] || 4_500_000}
            />

            {/* 3-2-1 Countdown Overlay */}
            {phase === 'countdown' && (
                <View style={styles.countdownOverlay}>
                    <Animated.Text style={[styles.countdownText, countdownStyle]}>{countdownNum}</Animated.Text>
                    <Text style={styles.countdownLabel}>Get Ready</Text>
                </View>
            )}

            {/* Cancel button — visible during countdown and recording (before canStop) */}
            {(phase === 'countdown' || phase === 'recording') && (
                <AnimatedScaleButton style={styles.cancelBtn} onPress={cancelRecording}>
                    <View style={styles.cancelBtnInner}>
                        <MaterialCommunityIcons name="close" size={22} color={theme.colors.textPrimary} />
                    </View>
                </AnimatedScaleButton>
            )}

            {/* Recording UI — Timer bar + recording indicator */}
            {(phase === 'recording' || phase === 'canStop') && (
                <>
                    {/* Top glass bar — Timer + Recording dot */}
                    <View style={styles.topBarWrapper}>
                        <View style={styles.topBar}>
                            <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFillObject} />
                            <View style={styles.topBarTint} />

                            <View style={styles.topBarContent}>
                                {/* Pulsing recording dot */}
                                <View style={styles.recIndicator}>
                                    <Animated.View style={[styles.recDot, pulseStyle]} />
                                    <Text style={styles.recText}>
                                        {isQuickVideo ? 'REC' : phase === 'canStop' ? 'COMPLETE' : 'REC'}
                                    </Text>
                                </View>

                                {/* Timer display */}
                                <Text
                                    style={[
                                        styles.timerText,
                                        phase === 'canStop' && !isQuickVideo && styles.timerComplete,
                                    ]}
                                >
                                    {isQuickVideo
                                        ? formatTime(elapsedSec)
                                        : phase === 'canStop'
                                          ? formatTime(0)
                                          : formatTime(timeRemaining)}
                                </Text>

                                {/* Duration / mode badge */}
                                <View style={styles.durationBadge}>
                                    <Text style={styles.durationBadgeText}>
                                        {isQuickVideo ? 'Quick' : `${durationMin}m`}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* Bottom area — Stop button */}
                    {phase === 'canStop' && (
                        <Animated.View style={[styles.stopBtnWrapper, stopBtnStyle]}>
                            <View style={styles.stopBtnContainer}>
                                <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFillObject} />
                                <View style={styles.topBarTint} />

                                <Text style={styles.stopHintText}>
                                    {isQuickVideo
                                        ? 'Recording your quick video...'
                                        : 'Timer complete! You can continue or stop.'}
                                </Text>

                                <AnimatedScaleButton style={styles.stopBtn} onPress={stopRecording}>
                                    <View style={styles.stopBtnInner}>
                                        <MaterialCommunityIcons
                                            name="stop"
                                            size={32}
                                            color={theme.colors.textPrimary}
                                        />
                                    </View>
                                </AnimatedScaleButton>

                                <Text style={styles.stopBtnLabel}>Stop & Save</Text>
                            </View>
                        </Animated.View>
                    )}
                </>
            )}

            {/* Permissions loading state */}
            {phase === 'permissions' && (
                <View style={styles.permissionLoading}>
                    <MaterialCommunityIcons name="video-outline" size={48} color={theme.colors.textMuted} />
                    <Text style={styles.permissionSubtitle}>Setting up camera...</Text>
                </View>
            )}
        </View>
    );
};

/* ─────────────────────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },

    /* ── Countdown Overlay ─────────────────────────────────────────────── */
    countdownOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.modalBackground,
        zIndex: 10,
    },
    countdownText: {
        fontSize: 120,
        fontWeight: '200',
        color: theme.colors.textPrimary,
        letterSpacing: -2,
    },
    countdownLabel: {
        fontSize: 18,
        color: theme.colors.textSecondary,
        fontWeight: '600',
        marginTop: 20,
        letterSpacing: 2,
        textTransform: 'uppercase',
    },

    /* ── Top Glass Bar ─────────────────────────────────────────────────── */
    topBarWrapper: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 50 : 30,
        left: 20,
        right: 20,
        zIndex: 10,
    },
    topBar: {
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: theme.colors.glassBorderMedium,
    },
    topBarTint: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: theme.colors.modalBackground,
    },
    topBarContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 14,
    },

    /* ── Recording indicator (dot + label) ─────────────────────────────── */
    recIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    recDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: theme.colors.danger,
    },
    recText: {
        color: theme.colors.danger,
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: 1.5,
    },

    /* ── Timer ─────────────────────────────────────────────────────────── */
    timerText: {
        color: theme.colors.textPrimary,
        fontSize: 28,
        fontWeight: '200',
        letterSpacing: 2,
        fontVariant: ['tabular-nums'],
    },
    timerComplete: {
        color: theme.colors.green,
    },

    /* ── Duration badge ────────────────────────────────────────────────── */
    durationBadge: {
        backgroundColor: theme.colors.glassBackground,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.glassSurfaceMedium,
    },
    durationBadgeText: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        fontWeight: '600',
    },

    /* ── Stop Button (bottom area) ─────────────────────────────────────── */
    stopBtnWrapper: {
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 50 : 30,
        left: 20,
        right: 20,
        zIndex: 10,
    },
    stopBtnContainer: {
        borderRadius: 28,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: theme.colors.glassBorderMedium,
        alignItems: 'center',
        paddingVertical: 24,
    },
    stopHintText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 16,
        zIndex: 2,
    },
    stopBtn: {
        width: 72,
        height: 72,
        borderRadius: 36,
        borderWidth: 4,
        borderColor: theme.colors.danger,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2,
    },
    stopBtnInner: {
        width: 44,
        height: 44,
        borderRadius: 8,
        backgroundColor: theme.colors.danger,
        justifyContent: 'center',
        alignItems: 'center',
    },
    stopBtnLabel: {
        color: theme.colors.textPrimary,
        fontSize: 14,
        fontWeight: '700',
        marginTop: 12,
        letterSpacing: 0.5,
        zIndex: 2,
    },

    /* ── Permission States ─────────────────────────────────────────────── */
    permissionDenied: {
        flex: 1,
        backgroundColor: theme.colors.background,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    permissionTitle: {
        color: theme.colors.textPrimary,
        fontSize: 22,
        fontWeight: '900',
        marginTop: 20,
        marginBottom: 10,
    },
    permissionSubtitle: {
        color: theme.colors.textDim,
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 22,
    },
    permissionBtn: {
        backgroundColor: theme.colors.primaryAction,
        paddingHorizontal: 30,
        paddingVertical: 14,
        borderRadius: 30,
        marginTop: 30,
    },
    permissionBtnText: {
        color: theme.colors.textPrimary,
        fontWeight: 'bold',
        fontSize: 16,
    },
    permissionLoading: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.background,
    },

    /* ── Cancel Button ─────────────────────────────────────────────────── */
    cancelBtn: {
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 55 : 35,
        left: 24,
        zIndex: 15,
    },
    cancelBtnInner: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: theme.colors.glassBorderMedium,
        borderWidth: 1,
        borderColor: theme.colors.grey,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default VlogRecordingScreen;
