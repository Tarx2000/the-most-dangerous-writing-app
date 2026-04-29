import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { vibrate } from '@/lib/haptics';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    withSequence,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { usePinContext, type PinMode } from '@/lib/hooks/usePinProvider';
import { theme } from '@/styles/theme';
import { storage } from '@/lib/storage';
import { CONFIG } from '@/config';

/* ── PIN Rate Limiting Constants ─────────────────────────────────────── */
const {
    SECURITY_PIN_KEY,
    PIN_ATTEMPT_COUNT_KEY,
    PIN_LOCKOUT_UNTIL_KEY,
    PIN_MAX_ATTEMPTS,
    PIN_LOCKOUT_DURATION_MS,
} = CONFIG;

const DialButton = ({ num, onPress, icon, disabled }: { num?: number; onPress: () => void; icon?: string; disabled?: boolean }) => {
    return (
        <Pressable
            onPress={() => {
                if (disabled) return;
                vibrate(30);
                onPress();
            }}
            disabled={disabled}
            style={({ pressed }) => [
                styles.dialButton,
                disabled && styles.dialButtonDisabled,
                pressed && !disabled && { backgroundColor: theme.colors.glassHighlight }
            ]}
        >
            {icon ? (
                <MaterialCommunityIcons name={icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']} size={28} color={disabled ? theme.colors.textMuted : theme.colors.textPrimary} />
            ) : (
                <Text style={[styles.dialText, disabled && styles.dialTextDisabled]}>{num}</Text>
            )}
        </Pressable>
    );
};

export const PinPadModal: React.FC = () => {
    const { isVisible, mode, promptText, onSuccess, onCancel } = usePinContext();

    const [enteredPin, setEnteredPin] = useState('');
    const [tempPin, setTempPin] = useState('');
    const [localMode, setLocalMode] = useState<PinMode>(mode);
    const [localPrompt, setLocalPrompt] = useState(promptText);
    /** Lockout state — computed from stored timestamp, no background timer */
    const [isLockedOut, setIsLockedOut] = useState(false);
    const [lockoutSeconds, setLockoutSeconds] = useState(0);

    const opacitySV = useSharedValue(0);
    const translateYSV = useSharedValue(50);
    const shakeSV = useSharedValue(0);

    /**
     * Check lockout status from storage on every open or interaction.
     * Uses system time — no background timer needed.
     */
    const checkLockout = useCallback(async () => {
        try {
            const rawUntil = await storage.getItem(PIN_LOCKOUT_UNTIL_KEY);
            if (!rawUntil) {
                setIsLockedOut(false);
                return;
            }
            const lockoutUntil = parseInt(rawUntil, 10);
            const now = Date.now();
            if (now < lockoutUntil) {
                setIsLockedOut(true);
                setLockoutSeconds(Math.ceil((lockoutUntil - now) / 1000));
            } else {
                // Lockout expired — clear it
                setIsLockedOut(false);
                await storage.removeItem(PIN_LOCKOUT_UNTIL_KEY);
                await storage.removeItem(PIN_ATTEMPT_COUNT_KEY);
            }
        } catch (e) {
            console.warn('[PinPadModal] Failed to check lockout:', e);
            setIsLockedOut(false);
        }
    }, []);

    // Sync context state when opened
    useEffect(() => {
        if (isVisible) {
            setEnteredPin('');
            setTempPin('');
            setLocalMode(mode);
            setLocalPrompt(promptText);
            checkLockout(); // Check lockout every time modal opens
            opacitySV.value = withTiming(1, { duration: 300 });
            translateYSV.value = withSpring(0, theme.animation.springDefault);
        } else {
            opacitySV.value = withTiming(0, { duration: 200 });
            translateYSV.value = withSpring(50);
        }
    }, [isVisible, mode, promptText, opacitySV, translateYSV, checkLockout]);

    const triggerShake = useCallback(() => {
        vibrate([0, 50, 50, 50]); // Error vibration pattern
        shakeSV.value = withSequence(
            withTiming(-10, { duration: 50 }),
            withTiming(10, { duration: 50 }),
            withTiming(-10, { duration: 50 }),
            withTiming(10, { duration: 50 }),
            withTiming(0, { duration: 50 })
        );
    }, [shakeSV]);

    /**
     * Record a failed PIN attempt.
     * After PIN_MAX_ATTEMPTS failures, stores a lockout timestamp.
     */
    const recordFailedAttempt = useCallback(async () => {
        try {
            const rawCount = await storage.getItem(PIN_ATTEMPT_COUNT_KEY);
            const count = rawCount ? parseInt(rawCount, 10) : 0;
            const newCount = count + 1;

            if (newCount >= PIN_MAX_ATTEMPTS) {
                // Trigger lockout
                const lockoutUntil = Date.now() + PIN_LOCKOUT_DURATION_MS;
                await storage.setItem(PIN_LOCKOUT_UNTIL_KEY, String(lockoutUntil));
                await storage.removeItem(PIN_ATTEMPT_COUNT_KEY);
                setIsLockedOut(true);
                setLockoutSeconds(Math.ceil(PIN_LOCKOUT_DURATION_MS / 1000));
            } else {
                await storage.setItem(PIN_ATTEMPT_COUNT_KEY, String(newCount));
            }
        } catch (e) {
            console.warn('[PinPadModal] Failed to record attempt:', e);
        }
    }, []);

    /** Clear attempt tracking on successful authentication */
    const clearAttempts = useCallback(async () => {
        try {
            await storage.removeItem(PIN_ATTEMPT_COUNT_KEY);
            await storage.removeItem(PIN_LOCKOUT_UNTIL_KEY);
            setIsLockedOut(false);
        } catch (e) {
            console.warn('[PinPadModal] Failed to clear attempts:', e);
        }
    }, []);

    const handlePinComplete = useCallback(async (pin: string) => {
        // Re-check lockout before processing (defense in depth)
        await checkLockout();
        if (isLockedOut) return;

        if (localMode === 'setup_1') {
            setTempPin(pin);
            setEnteredPin('');
            setLocalMode('setup_2');
            setLocalPrompt('Confirm PIN');
        } else if (localMode === 'setup_2') {
            if (pin === tempPin) {
                await storage.setItem(SECURITY_PIN_KEY, pin);
                await clearAttempts();
                onSuccess();
            } else {
                triggerShake();
                setEnteredPin('');
                setLocalPrompt('PINs do not match. Try again.');
                setLocalMode('setup_1');
            }
        } else if (localMode === 'verify') {
            const savedPin = await storage.getItem(SECURITY_PIN_KEY);
            if (pin === savedPin) {
                await clearAttempts();
                onSuccess();
            } else {
                await recordFailedAttempt();
                triggerShake();
                setEnteredPin('');
            }
        }
    }, [localMode, tempPin, onSuccess, triggerShake, isLockedOut, checkLockout, recordFailedAttempt, clearAttempts]);

    const handlePress = useCallback(async (num: number) => {
        // Re-check lockout on every digit press (no background timer)
        await checkLockout();
        if (isLockedOut) return;

        if (enteredPin.length < 4) {
            const newPin = enteredPin + num;
            setEnteredPin(newPin);
            if (newPin.length === 4) {
                // Short delay to allow the 4th dot to render before processing
                setTimeout(() => {
                    handlePinComplete(newPin);
                }, CONFIG.PIN_DOT_DELAY_MS);
            }
        }
    }, [enteredPin, handlePinComplete, isLockedOut, checkLockout]);

    const handleDelete = useCallback(async () => {
        await checkLockout();
        if (isLockedOut) return;
        if (enteredPin.length > 0) {
            setEnteredPin(prev => prev.slice(0, -1));
        }
    }, [enteredPin, isLockedOut, checkLockout]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacitySV.value,
        transform: [{ translateY: translateYSV.value }],
        pointerEvents: isVisible ? 'auto' : 'none'
    }));

    const shakeStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: shakeSV.value }]
    }));

    return (
        <Animated.View style={[StyleSheet.absoluteFill, styles.container, animatedStyle, { pointerEvents: isVisible ? 'auto' : 'none' }]}>
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />

            <View style={styles.content}>
                <Text style={styles.prompt}>{localPrompt}</Text>

                {/* Lockout Banner */}
                {isLockedOut && (
                    <View style={styles.lockoutBanner}>
                        <MaterialCommunityIcons name="lock-clock" size={20} color={theme.colors.danger} />
                        <Text style={styles.lockoutText}>
                            Too many attempts. Try again in {lockoutSeconds}s.
                        </Text>
                    </View>
                )}

                <Animated.View style={[styles.dotsContainer, shakeStyle]}>
                    {[0, 1, 2, 3].map(i => (
                        <View
                            key={i}
                            style={[
                                styles.dot,
                                enteredPin.length > i && styles.dotFilled
                            ]}
                        />
                    ))}
                </Animated.View>

                <View style={[styles.padWrapper, isLockedOut && styles.padDisabled]}>
                    <View style={styles.row}>
                        <DialButton num={1} onPress={() => handlePress(1)} disabled={isLockedOut} />
                        <DialButton num={2} onPress={() => handlePress(2)} disabled={isLockedOut} />
                        <DialButton num={3} onPress={() => handlePress(3)} disabled={isLockedOut} />
                    </View>
                    <View style={styles.row}>
                        <DialButton num={4} onPress={() => handlePress(4)} disabled={isLockedOut} />
                        <DialButton num={5} onPress={() => handlePress(5)} disabled={isLockedOut} />
                        <DialButton num={6} onPress={() => handlePress(6)} disabled={isLockedOut} />
                    </View>
                    <View style={styles.row}>
                        <DialButton num={7} onPress={() => handlePress(7)} disabled={isLockedOut} />
                        <DialButton num={8} onPress={() => handlePress(8)} disabled={isLockedOut} />
                        <DialButton num={9} onPress={() => handlePress(9)} disabled={isLockedOut} />
                    </View>
                    <View style={styles.row}>
                        <Pressable onPress={onCancel} style={styles.dialButton}>
                            <Text style={styles.cancelText}>Cancel</Text>
                        </Pressable>
                        <DialButton num={0} onPress={() => handlePress(0)} disabled={isLockedOut} />
                        <DialButton icon="backspace-outline" onPress={handleDelete} disabled={isLockedOut} />
                    </View>
                </View>
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        zIndex: 1000,
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    content: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: theme.colors.surfaceDark,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        paddingTop: 32,
        paddingBottom: 48,
        alignItems: 'center',
        borderTopWidth: 1,
        borderColor: theme.colors.glassBorder,
    },
    prompt: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        fontWeight: '500',
        marginBottom: 32,
    },
    dotsContainer: {
        flexDirection: 'row',
        gap: 24,
        marginBottom: 48,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dot: {
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 1,
        borderColor: theme.colors.textDim,
    },
    dotFilled: {
        backgroundColor: theme.colors.textPrimary,
        borderColor: theme.colors.textPrimary,
    },
    padWrapper: {
        width: '80%',
        gap: 16,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 16,
    },
    lockoutBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: theme.colors.dangerSubtle,
        borderWidth: 1,
        borderColor: theme.colors.dangerBorder,
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 16,
        marginBottom: 24,
        width: '80%',
    },
    lockoutText: {
        color: theme.colors.danger,
        fontSize: 13,
        fontWeight: '600',
    },
    padDisabled: {
        opacity: 0.4,
    },
    dialButton: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: theme.colors.glassSurfaceSubtle,
        borderWidth: 1,
        borderColor: theme.colors.glassBorderSubtle,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dialText: {
        fontSize: 28,
        color: theme.colors.textPrimary,
        fontWeight: '400',
    },
    dialTextDisabled: {
        color: theme.colors.textMuted,
    },
    dialButtonDisabled: {
        backgroundColor: theme.colors.glassSurfaceMinimal,
        borderColor: theme.colors.glassBorderFaint,
    },
    cancelText: {
        fontSize: 16,
        color: theme.colors.textDim,
        fontWeight: '500',
    }
});