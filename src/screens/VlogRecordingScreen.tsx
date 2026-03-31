import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Dimensions,
    StatusBar,
    Vibration,
    Platform,
    Animated,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { BlurView } from 'expo-blur';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation.types';
import { CONFIG } from '@/config';
import { useStorage } from '@/lib/hooks/useStorage';
import { SavedVlog } from '@/types';
import { theme } from '@/styles/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'VlogRecording'>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
    type RecordingPhase = 'permissions' | 'countdown' | 'recording' | 'canStop' | 'saving';
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
    const countdownScale = useRef(new Animated.Value(0)).current;
    const countdownOpacity = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const stopBtnSlide = useRef(new Animated.Value(100)).current;

    const { saveVlog, loadAllData } = useStorage();

    useEffect(() => {
        loadAllData();
    }, []);

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
            countdownScale.setValue(0.3);
            countdownOpacity.setValue(0);

            Animated.parallel([
                Animated.spring(countdownScale, {
                    toValue: 1,
                    useNativeDriver: true,
                    damping: 12,
                    stiffness: 180,
                }),
                Animated.timing(countdownOpacity, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start();

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

        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 0.4,
                    duration: PULSE_DURATION_MS / 2,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: PULSE_DURATION_MS / 2,
                    useNativeDriver: true,
                }),
            ])
        );
        pulse.start();

        return () => pulse.stop();
    }, [phase]);

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
                Animated.spring(stopBtnSlide, {
                    toValue: 0,
                    useNativeDriver: true,
                    damping: 15,
                    stiffness: 150,
                }).start();
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
    const handleRecordingComplete = async (tempUri: string) => {
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
            const vlogId = Date.now().toString();
            const permanentPath = `${vlogDir}${vlogId}.mp4`;
            await FileSystem.moveAsync({
                from: tempUri,
                to: permanentPath,
            });

            // Get file size for storage tracking
            const fileInfo = await FileSystem.getInfoAsync(permanentPath);
            const fileSizeBytes = (fileInfo as any).size || 0;

            // Build the vlog metadata — use actual elapsed time, not the preset timer
            const now = new Date();
            const newVlog: SavedVlog = {
                id: vlogId,
                filePath: permanentPath,
                dateStr: now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                timestamp: now.getTime(),
                durationSec: elapsedRef.current,
                fileSizeBytes,
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
    };

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
                <TouchableOpacity style={styles.permissionBtn} onPress={() => navigation.goBack()}>
                    <Text style={styles.permissionBtnText}>Go Back</Text>
                </TouchableOpacity>
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
                videoQuality={CONFIG.VLOG_VIDEO_QUALITY}
                videoBitrate={6_000_000}
            />

            {/* 3-2-1 Countdown Overlay */}
            {phase === 'countdown' && (
                <View style={styles.countdownOverlay}>
                    <Animated.Text style={[
                        styles.countdownText,
                        {
                            transform: [{ scale: countdownScale }],
                            opacity: countdownOpacity,
                        },
                    ]}>
                        {countdownNum}
                    </Animated.Text>
                    <Text style={styles.countdownLabel}>Get Ready</Text>
                </View>
            )}

            {/* Cancel button — visible during countdown and recording (before timer ends) */}
            {(phase === 'countdown' || phase === 'recording') && (
                <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={cancelRecording}
                    activeOpacity={0.7}
                >
                    <View style={styles.cancelBtnInner}>
                        <MaterialCommunityIcons name="close" size={22} color="#FFF" />
                    </View>
                </TouchableOpacity>
            )}

            {/* Recording UI — Timer bar + recording indicator */}
            {(phase === 'recording' || phase === 'canStop' || phase === 'saving') && (
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
                                        { opacity: pulseAnim },
                                    ]} />
                                    <Text style={styles.recText}>
                                        {phase === 'canStop' ? 'COMPLETE' : phase === 'saving' ? 'SAVING...' : 'REC'}
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
                            { transform: [{ translateY: stopBtnSlide }] },
                        ]}>
                            <View style={styles.stopBtnContainer}>
                                <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFillObject} />
                                <View style={styles.topBarTint} />

                                <Text style={styles.stopHintText}>Timer complete! You can continue or stop.</Text>

                                <TouchableOpacity
                                    style={styles.stopBtn}
                                    onPress={stopRecording}
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.stopBtnInner}>
                                        <MaterialCommunityIcons name="stop" size={32} color="#FFF" />
                                    </View>
                                </TouchableOpacity>

                                <Text style={styles.stopBtnLabel}>Stop & Save</Text>
                            </View>
                        </Animated.View>
                    )}

                    {/* Saving overlay */}
                    {phase === 'saving' && (
                        <View style={styles.savingOverlay}>
                            <View style={styles.savingCard}>
                                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} />
                                <View style={styles.topBarTint} />
                                <MaterialCommunityIcons name="check-circle" size={48} color="#4ADE80" />
                                <Text style={styles.savingText}>Saving Vlog...</Text>
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
        backgroundColor: '#000',
    },

    /* ── Countdown Overlay ─────────────────────────────────────────────── */
    countdownOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 10,
    },
    countdownText: {
        fontSize: 120,
        fontWeight: '200',
        color: '#FFF',
        letterSpacing: -2,
    },
    countdownLabel: {
        fontSize: 18,
        color: 'rgba(255, 255, 255, 0.6)',
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
        borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    topBarTint: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
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
        backgroundColor: '#FF2A2A',
    },
    recText: {
        color: '#FF2A2A',
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: 1.5,
    },

    /* ── Timer ─────────────────────────────────────────────────────────── */
    timerText: {
        color: '#FFF',
        fontSize: 28,
        fontWeight: '200',
        letterSpacing: 2,
        fontVariant: ['tabular-nums'],
    },
    timerComplete: {
        color: '#4ADE80',
    },

    /* ── Duration badge ────────────────────────────────────────────────── */
    durationBadge: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    durationBadgeText: {
        color: 'rgba(255, 255, 255, 0.6)',
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
        borderColor: 'rgba(255, 255, 255, 0.12)',
        alignItems: 'center',
        paddingVertical: 24,
    },
    stopHintText: {
        color: 'rgba(255, 255, 255, 0.6)',
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
        borderColor: '#FF2A2A',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2,
    },
    stopBtnInner: {
        width: 44,
        height: 44,
        borderRadius: 8,
        backgroundColor: '#FF2A2A',
        justifyContent: 'center',
        alignItems: 'center',
    },
    stopBtnLabel: {
        color: '#FFF',
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
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        zIndex: 20,
    },
    savingCard: {
        borderRadius: 28,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
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

    /* ── Permission States ─────────────────────────────────────────────── */
    permissionDenied: {
        flex: 1,
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    permissionTitle: {
        color: '#FFF',
        fontSize: 22,
        fontWeight: '900',
        marginTop: 20,
        marginBottom: 10,
    },
    permissionSubtitle: {
        color: 'rgba(255, 255, 255, 0.5)',
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
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
    permissionLoading: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000',
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
        backgroundColor: 'rgba(255, 255, 255, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default VlogRecordingScreen;
