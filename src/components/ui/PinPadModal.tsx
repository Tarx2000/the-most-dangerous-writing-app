import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Vibration, Dimensions } from 'react-native';
import Animated, { 
    useSharedValue, 
    useAnimatedStyle, 
    withSpring, 
    withTiming, 
    withSequence,
    runOnJS
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { usePinContext, type PinMode } from '@/lib/hooks/usePinProvider';
import { theme } from '@/styles/theme';
import { storage } from '@/lib/storage';
import { CONFIG } from '@/config';

const { width } = Dimensions.get('window');

const DialButton = ({ num, onPress, icon }: { num?: number; onPress: () => void; icon?: string }) => {
    return (
        <Pressable 
            onPress={() => {
                Vibration.vibrate(30);
                onPress();
            }}
            style={({ pressed }) => [
                styles.dialButton,
                pressed && { backgroundColor: theme.colors.glassHighlight }
            ]}
        >
            {icon ? (
                <MaterialCommunityIcons name={icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']} size={28} color={theme.colors.textPrimary} />
            ) : (
                <Text style={styles.dialText}>{num}</Text>
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

    const opacitySV = useSharedValue(0);
    const translateYSV = useSharedValue(50);
    const shakeSV = useSharedValue(0);

    // Sync context state when opened
    useEffect(() => {
        if (isVisible) {
            setEnteredPin('');
            setTempPin('');
            setLocalMode(mode);
            setLocalPrompt(promptText);
            opacitySV.value = withTiming(1, { duration: 300 });
            translateYSV.value = withSpring(0, theme.animation.springDefault);
        } else {
            opacitySV.value = withTiming(0, { duration: 200 });
            translateYSV.value = withSpring(50);
        }
    }, [isVisible, mode, promptText]);

    const triggerShake = useCallback(() => {
        Vibration.vibrate([0, 50, 50, 50]); // Error vibration pattern
        shakeSV.value = withSequence(
            withTiming(-10, { duration: 50 }),
            withTiming(10, { duration: 50 }),
            withTiming(-10, { duration: 50 }),
            withTiming(10, { duration: 50 }),
            withTiming(0, { duration: 50 })
        );
    }, [shakeSV]);

    const handlePinComplete = useCallback(async (pin: string) => {
        if (localMode === 'setup_1') {
            setTempPin(pin);
            setEnteredPin('');
            setLocalMode('setup_2');
            setLocalPrompt('Confirm PIN');
        } else if (localMode === 'setup_2') {
            if (pin === tempPin) {
                await storage.setItem(CONFIG.SECURITY_PIN_KEY, pin);
                onSuccess();
            } else {
                triggerShake();
                setEnteredPin('');
                setLocalPrompt('PINs do not match. Try again.');
                setLocalMode('setup_1');
            }
        } else if (localMode === 'verify') {
            const savedPin = await storage.getItem(CONFIG.SECURITY_PIN_KEY);
            if (pin === savedPin) {
                onSuccess();
            } else {
                triggerShake();
                setEnteredPin('');
            }
        }
    }, [localMode, tempPin, onSuccess, triggerShake]);

    const handlePress = useCallback((num: number) => {
        if (enteredPin.length < 4) {
            const newPin = enteredPin + num;
            setEnteredPin(newPin);
            if (newPin.length === 4) {
                // Short timeout to allow the 4th dot to render before resetting
                setTimeout(() => {
                    handlePinComplete(newPin);
                }, 150);
            }
        }
    }, [enteredPin, handlePinComplete]);

    const handleDelete = useCallback(() => {
        if (enteredPin.length > 0) {
            setEnteredPin(prev => prev.slice(0, -1));
        }
    }, [enteredPin]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacitySV.value,
        transform: [{ translateY: translateYSV.value }],
        pointerEvents: isVisible ? 'auto' : 'none'
    }));

    const shakeStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: shakeSV.value }]
    }));

    if (!isVisible && opacitySV.value === 0) return null;

    return (
        <Animated.View style={[StyleSheet.absoluteFill, styles.container, animatedStyle, { pointerEvents: isVisible ? 'auto' : 'none' }]}>
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
            
            <View style={styles.content}>
                <Text style={styles.prompt}>{localPrompt}</Text>
                
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

                <View style={styles.padWrapper}>
                    <View style={styles.row}>
                        <DialButton num={1} onPress={() => handlePress(1)} />
                        <DialButton num={2} onPress={() => handlePress(2)} />
                        <DialButton num={3} onPress={() => handlePress(3)} />
                    </View>
                    <View style={styles.row}>
                        <DialButton num={4} onPress={() => handlePress(4)} />
                        <DialButton num={5} onPress={() => handlePress(5)} />
                        <DialButton num={6} onPress={() => handlePress(6)} />
                    </View>
                    <View style={styles.row}>
                        <DialButton num={7} onPress={() => handlePress(7)} />
                        <DialButton num={8} onPress={() => handlePress(8)} />
                        <DialButton num={9} onPress={() => handlePress(9)} />
                    </View>
                    <View style={styles.row}>
                        <Pressable onPress={onCancel} style={styles.dialButton}>
                            <Text style={styles.cancelText}>Cancel</Text>
                        </Pressable>
                        <DialButton num={0} onPress={() => handlePress(0)} />
                        <DialButton icon="backspace-outline" onPress={handleDelete} />
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
    cancelText: {
        fontSize: 16,
        color: theme.colors.textDim,
        fontWeight: '500',
    }
});
