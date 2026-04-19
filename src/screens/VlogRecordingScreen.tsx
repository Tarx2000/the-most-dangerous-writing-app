import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    Vibration,
    Platform,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, withSequence, withRepeat, cancelAnimation } from 'react-native-reanimated';
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
import { compressVideo, addToPendingQueue, removeFromPendingQueue, isCompressionAvailable } from '@/lib/videoCompressor';

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
 * 4. Display countdown timer (MM:SS) in liquid glass overlay
 * 5. When timer reaches 0 → show stop button (user decides when to stop)
 * 6. On stop → save video to private app storage, update streak, navigate home
 *
 * The camera always faces the front (selfie mode).
 * No pause button exists. The user must complete the minimum timer duration.
 */
export const VlogRecordingScreen: React.FC<Props> = ({ route, navigation }) => {
    const { timeIndex } = route.params;

    /* ── Timer duration from config ────────────────────────────────────── */
    const durationMin = CONFIG.VLOG_SESSION_OPTIONS_MINS[timeIndex] || 1;
    const totalDurationSec = durationMin * 60;

    /* ── Permissions ───────────────────────────────────────────────────── */
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();
    const [micPermission, requestMicPermission] = useMicrophonePermissions();

    /* ── State machine ─────────────────────────────────────────────────── */
    type RecordingPhase = 'permissions' | 'countdown' | 'recording' | 'canStop' | 'compressing' | 'saving';
    const [phase, setPhase] = useState<RecordingPhase>('permissions');
    const [countdownNum, setCountdownNum] = useState(COUNTDOWN_SECONDS);
    const [timeRemaining, setTimeRemaining] = useState(totalDurationSec);

    /* ── Refs ──────────────────────────────────────────────────────────── */
    const cameraRef = useRef<CameraView>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const countdownRef = useRef<NodeJS.Timeout | null>(null);
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

    const { saveVlog, updateVlog } = useVlogs();
    const { vlogQuality, compressionPreset } = usePreferences();

    /* ── Compression progress (0.0 → 1.0) ─────────────────────────────── */
    const [compressionProgress, setCompressionProgress] = useState(0);
    const [compressionSavings, setCompressionSavings] = useState<string | null>(null);

    // Removed loadAllData call
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
                // Small delay so camera preview has time to initialize
                setTimeout(() => setPhase('countdown'), 500);
            }
        };

        if (phase === 'permissions') {
            checkPermissions();
        }
    }, [phase, cameraPermission, micPermission]);

    /* ── 3-2-1 Countdown Animation ─────────────────────────────────────── */
    useEffect(() => {
        if (phase !== 'countdown') return;

        let count = COUNTDOWN_SECONDS;
        setCountdownNum(count);

        /** Animate a single countdown number: scale up + fade in, then fade out */
        const animateNumber = () => {
            countdownScale.value = 0.3;
            countdownOpacity.value = 0;

            countdownScale.value = withSpring(1, { damping: 12, stiffness: 180 });
            countdownOpacity.value = withTiming(1, { duration: 200 });

            Vibration.vibrate(50);
        };

        animateNumber();

        countdownRef.current = setInterval(() => {
            count--;
            if (count > 0) {
                setCountdownNum(count);
                animateNumber();
            } else {
                // Countdown complete — start recording
                clearInterval(countdownRef.current!);
                countdownRef.current = null;
                startRecording();
            }
        }, 1000);

        return () => {
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, [phase]);

    /* ── Pulsing recording dot ─────────────────────────────────────────── */
    useEffect(() => {
        if (phase !== 'recording' && phase !== 'canStop') return;

        pulseAnim.value = withRepeat(
            withSequence(
                withTiming(0.4, { duration: PULSE_DURATION_MS / 2 }),
                withTiming(1, { duration: PULSE_DURATION_MS / 2 })
            ),
            -1,
            false
        );

        return () => {
            cancelAnimation(pulseAnim);
            pulseAnim.value = 1;
        };
    }, [phase, pulseAnim]);

    /* ── Start recording ───────────────────────────────────────────────── */
    const startRecording = useCallback(async () => {
        if (!cameraRef.current || isRecordingRef.current) return;

        setPhase('recording');
        setTimeRemaining(totalDurationSec);
        isRecordingRef.current = true;
        isCancelledRef.current = false;
        elapsedRef.current = 0;

        // Start the countdown timer
        let remaining = totalDurationSec;
        timerRef.current = setInterval(() => {
            remaining--;
            elapsedRef.current++;
            setTimeRemaining(remaining);

            if (remaining <= 0) {
                // Timer complete — show stop button, but DON'T stop recording
                clearInterval(timerRef.current!);
                timerRef.current = null;
                setPhase('canStop');
                Vibration.vibrate([0, 100, 50, 100]); // Double vibrate to signal timer done

                // Slide in the stop button
                stopBtnSlide.value = withSpring(0, { damping: 15, stiffness: 150 });
            }
        }, TIMER_TICK_MS);

        // Actually start the camera recording (no maxDuration — we control stopping)
        try {
            const video = await cameraRef.current.recordAsync({});

            // This promise resolves when stopRecording() is called
            if (video?.uri) {
                await handleRecordingComplete(video.uri);
            }
        } catch (err) {
            console.error('Recording error:', err);
            isRecordingRef.current = false;
            navigation.goBack();
        }
    }, [totalDurationSec]);

    /* ── Stop recording (user taps stop button after timer completes) ─── */
    const stopRecording = useCallback(() => {
        if (!isRecordingRef.current) return;
        setPhase('saving');
        cameraRef.current?.stopRecording();
    }, []);

    /**
     * Cancel recording — stops camera, discards the video file, and navigates back.
     * Called when user taps the X button before the timer completes.
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
            // Stop the camera — recordAsync promise will resolve, but handleRecordingComplete
            // will check isCancelledRef and skip saving
            cameraRef.current?.stopRecording();
        } else {
            // Not recording yet (still in countdown) — just navigate back
            navigation.goBack();
        }
    }, [navigation]);

    /* ── Handle completed recording — save to private storage ──────────── */
    const compressionPresetRef = useRef(compressionPreset);
    compressionPresetRef.current = compressionPreset;

    const handleRecordingComplete = useCallback(async (tempUri: string) => {
        isRecordingRef.current = false;

        // If user cancelled, just delete the temp file and go back
        if (isCancelledRef.current) {
            try {
                await FileSystem.deleteAsync(tempUri, { idempotent: true });
            } catch (_) {}
            navigation.goBack();
            return;
        }

        try {
            // Ensure the vlogs directory exists
            const vlogDir = `${FileSystem.documentDirectory}${CONFIG.VLOG_STORAGE_DIR}`;
            const dirInfo = await FileSystem.getInfoAsync(vlogDir);
            if (!dirInfo.exists) {
                await FileSystem.makeDirectoryAsync(vlogDir, { intermediates: true });
            }

            // Generate unique filename and move from cache to private storage
            const vlogId = generateId();
            const permanentPath = `${vlogDir}${vlogId}.mp4`;
            await FileSystem.moveAsync({
                from: tempUri,
                to: permanentPath,
            });

            // Get raw file size before compression
            const rawInfo = await FileSystem.getInfoAsync(permanentPath);
            const rawSizeBytes = ('size' in rawInfo ? (rawInfo as { size: number }).size : 0);

            // ── Compression phase ──────────────────────────────────────
            const currentPreset = compressionPresetRef.current;
            let finalSizeBytes = rawSizeBytes;
            let originalSizeBytes: number | undefined;

            if (currentPreset !== 'off' && isCompressionAvailable()) {
                setPhase('compressing');
                setCompressionProgress(0);

                // Add to pending queue so we can resume if interrupted
                await addToPendingQueue({
                    vlogId,
                    inputUri: permanentPath,
                    presetId: currentPreset,
                    createdAt: Date.now(),
                });

                const result = await compressVideo(
                    permanentPath,
                    currentPreset,
                    (progress) => setCompressionProgress(progress),
                );

                finalSizeBytes = result.outputSizeBytes;
                if (result.wasCompressed) {
                    originalSizeBytes = result.originalSizeBytes;
                    setCompressionSavings(
                        `Saved ${result.savingsPercent}% — ${(result.originalSizeBytes / 1024 / 1024).toFixed(0)}MB → ${(result.outputSizeBytes / 1024 / 1024).toFixed(0)}MB`
                    );
                }

                // Remove from pending queue — compression completed
                await removeFromPendingQueue(vlogId);
            }

            setPhase('saving');

            // Build the vlog metadata — use actual elapsed time, not the preset timer
            const now = new Date();
            const newVlog: SavedVlog = {
                id: vlogId,
                filePath: permanentPath,
                dateStr: now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                timestamp: now.getTime(),
                durationSec: elapsedRef.current,
                fileSizeBytes: finalSizeBytes,
                compressionPreset: currentPreset,
                originalFileSizeBytes: originalSizeBytes,
                compressionPending: false,
            };

            // Save to storage + update streak
            const result = await saveVlog(newVlog);

            // Navigate back to Home with streak info
            navigation.reset({
                index: 0,
                routes: [{
                    name: 'Home',
                    params: {
                        streakIncreased: result.streakIncreased,
                        newStreak: result.newStreak,
                    },
                }],
            });
        } catch (err) {
            console.error('Failed to save vlog:', err);
            navigation.goBack();
        }
    }, [saveVlog, navigation]);

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
                    <Animated.Text style={[
                        styles.countdownText,
                        countdownStyle
                    ]}>
                        {countdownNum}
                    </Animated.Text>
                    <Text style={styles.countdownLabel}>Get Ready</Text>
                </View>
            )}

            {/* Cancel button — visible during countdown and recording (before timer ends) */}
            {(phase === 'countdown' || phase === 'recording') && (
                <AnimatedScaleButton
                    style={styles.cancelBtn}
                    onPress={cancelRecording}
                >
                    <View style={styles.cancelBtnInner}>
                        <MaterialCommunityIcons name="close" size={22} color={theme.colors.textPrimary} />
                    </View>
                </AnimatedScaleButton>
            )}

            {/* Recording UI — Timer bar + recording indicator */}
            {(phase === 'recording' || phase === 'canStop' || phase === 'compressing' || phase === 'saving') && (
                <>
                    {/* Top glass bar — Timer + Recording dot */}
                    <View style={styles.topBarWrapper}>
                        <View style={styles.topBar}>
                            <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFillObject} />
                            <View style={styles.topBarTint} />

                            <View style={styles.topBarContent}>
                                {/* Pulsing recording dot */}
                                <View style={styles.recIndicator}>
                                    <Animated.View style={[
                                        styles.recDot,
                                        pulseStyle,
                                    ]} />
                                    <Text style={styles.recText}>
                                        {phase === 'compressing' ? 'OPTIMIZING...' : phase === 'canStop' ? 'COMPLETE' : phase === 'saving' ? 'SAVING...' : 'REC'}
                                    </Text>
                                </View>

                                {/* Timer countdown */}
                                <Text style={[
                                    styles.timerText,
                                    phase === 'canStop' && styles.timerComplete,
                                ]}>
                                    {phase === 'canStop'
                                        ? formatTime(0)
                                        : formatTime(timeRemaining)
                                    }
                                </Text>

                                {/* Duration badge */}
                                <View style={styles.durationBadge}>
                                    <Text style={styles.durationBadgeText}>{durationMin}m</Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* Bottom area — Stop button (only after timer completes) */}
                    {phase === 'canStop' && (
                        <Animated.View style={[
                            styles.stopBtnWrapper,
                            stopBtnStyle,
                        ]}>
                            <View style={styles.stopBtnContainer}>
                                <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFillObject} />
                                <View style={styles.topBarTint} />

                                <Text style={styles.stopHintText}>Timer complete! You can continue or stop.</Text>

                                <AnimatedScaleButton
                                    style={styles.stopBtn}
                                    onPress={stopRecording}
                                >
                                    <View style={styles.stopBtnInner}>
                                        <MaterialCommunityIcons name="stop" size={32} color={theme.colors.textPrimary} />
                                    </View>
                                </AnimatedScaleButton>

                                <Text style={styles.stopBtnLabel}>Stop & Save</Text>
                            </View>
                        </Animated.View>
                    )}

                    {/* Compression overlay — shown between recording and saving */}
                    {phase === 'compressing' && (
                        <View style={styles.savingOverlay}>
                            <View style={styles.savingCard}>
                                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} />
                                <View style={styles.topBarTint} />
                                <View style={styles.compressionRing}>
                                    <View style={[styles.compressionRingFill, { 
                                        transform: [{ rotate: `${compressionProgress * 360}deg` }],
                                    }]} />
                                    <Text style={styles.compressionPercent}>
                                        {Math.round(compressionProgress * 100)}%
                                    </Text>
                                </View>
                                <Text style={styles.savingText}>Optimizing your vlog...</Text>
                                <Text style={styles.compressionSubtext}>
                                    This keeps the quality but reduces file size
                                </Text>
                            </View>
                        </View>
                    )}

                    {/* Saving overlay */}
                    {(phase === 'saving') && (
                        <View style={styles.savingOverlay}>
                            <View style={styles.savingCard}>
                                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} />
                                <View style={styles.topBarTint} />
                                <MaterialCommunityIcons name="check-circle" size={48} color="#4ADE80" />
                                <Text style={styles.savingText}>Saving Vlog...</Text>
                                {compressionSavings && (
                                    <Text style={styles.compressionSavingsText}>{compressionSavings}</Text>
                                )}
                            </View>
                        </View>
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

/* ──────────────────────────────────────────────────────────────────────────── */
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

    /* ── Saving Overlay ────────────────────────────────────────────────── */
    savingOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.overlayVideoMuted,
        zIndex: 20,
    },
    savingCard: {
        borderRadius: 28,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: theme.colors.glassBorderMedium,
        padding: 40,
        alignItems: 'center',
        minWidth: 200,
    },
    savingText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: '700',
        marginTop: 16,
        zIndex: 2,
    },

    /* ── Compression Progress ──────────────────────────────────────────── */
    compressionRing: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 3,
        borderColor: theme.colors.glassHighlight,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2,
    },
    compressionRingFill: {
        position: 'absolute',
        top: -3,
        left: -3,
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 3,
        borderColor: theme.colors.green,
        borderTopColor: 'transparent',
        borderRightColor: 'transparent',
    },
    compressionPercent: {
        color: theme.colors.textPrimary,
        fontSize: 22,
        fontWeight: '800',
        fontVariant: ['tabular-nums'] as ('tabular-nums')[] | undefined,
    },
    compressionSubtext: {
        color: theme.colors.textDim,
        fontSize: 13,
        marginTop: 8,
        zIndex: 2,
        textAlign: 'center',
    },
    compressionSavingsText: {
        color: theme.colors.green,
        fontSize: 13,
        fontWeight: '600',
        marginTop: 8,
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
