import React, { useEffect, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, withDelay } from 'react-native-reanimated';
import { theme } from '@/styles/theme';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';

/* ────────────────────────────────────────────────────────────────────────────
 * CONFIGURABLE: Icon and dot sizing
 * ──────────────────────────────────────────────────────────────────────────── */
const ICON_SIZE = 64;
const DOT_SIZE = 10;

/** Week day labels */
const WEEK_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface StreakPopupProps {
    visible: boolean;
    streak: number;
    streakHistory?: string[];
    onClose: () => void;
}

/**
 * StreakPopup — Full-screen motivational overlay shown when a streak increases.
 *
 * Inspired by the Tide app's "Streak completed today" screen.
 * Features:
 * - Minimalistic checkmark icon (centered with flexbox, no absolute positioning)
 * - Staggered fade + scale entrance animations using Animated API
 * - Week day indicator with filled/empty dots
 * - AMOLED dark overlay with white-on-black design language
 */
export const StreakPopup = React.memo(({ visible, streakHistory = [], onClose }: StreakPopupProps) => {
    /* ── Animation refs ── */
    const overlayFade = useSharedValue(0);
    const iconScale = useSharedValue(0.3);
    const iconFade = useSharedValue(0);
    const textFade = useSharedValue(0);
    const textSlide = useSharedValue(30);
    const weekFade = useSharedValue(0);
    const buttonFade = useSharedValue(0);
    const buttonSlide = useSharedValue(30);

    /** Compute which days of the current week have streak records */
    const weekDots = useMemo(() => {
        if (!visible) return [];
        const histSet = new Set<string>(streakHistory);
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0=Sun
        const dots: boolean[] = [];

        for (let i = 0; i < 7; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() - dayOfWeek + i);
            const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            dots.push(histSet.has(key));
        }
        return dots;
    }, [streakHistory, visible]);

    const todayIndex = new Date().getDay();

    useEffect(() => {
        if (!visible) {
            // Reset all animated values
            overlayFade.value = 0;
            iconScale.value = 0.3;
            iconFade.value = 0;
            textFade.value = 0;
            textSlide.value = 30;
            weekFade.value = 0;
            buttonFade.value = 0;
            buttonSlide.value = 30;
            return;
        }

        // Staggered entrance using withDelay from Reanimated
        overlayFade.value = withTiming(1, { duration: 400 });

        iconScale.value = withDelay(200, withSpring(1, { damping: 10, mass: 1, stiffness: 100 }));
        iconFade.value = withDelay(200, withTiming(1, { duration: 300 }));

        textFade.value = withDelay(500, withTiming(1, { duration: 350 }));
        textSlide.value = withDelay(500, withSpring(0, { damping: 12, mass: 1, stiffness: 80 }));

        weekFade.value = withDelay(800, withTiming(1, { duration: 300 }));

        buttonFade.value = withDelay(1000, withTiming(1, { duration: 300 }));
        buttonSlide.value = withDelay(1000, withSpring(0, { damping: 12, mass: 1, stiffness: 80 }));
    }, [visible, overlayFade, iconScale, iconFade, textFade, textSlide, weekFade, buttonFade, buttonSlide]);

    const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayFade.value }));
    const iconStyle = useAnimatedStyle(() => ({
        opacity: iconFade.value,
        transform: [{ scale: iconScale.value }]
    }));
    const textStyle = useAnimatedStyle(() => ({
        opacity: textFade.value,
        transform: [{ translateY: textSlide.value }]
    }));
    const weekStyle = useAnimatedStyle(() => ({ opacity: weekFade.value }));
    const buttonStyle = useAnimatedStyle(() => ({
        opacity: buttonFade.value,
        transform: [{ translateY: buttonSlide.value }]
    }));

    if (!visible) return null;

    return (
        <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
            <Animated.View style={[styles.overlay, overlayStyle]}>
                <View style={styles.content}>

                    {/* ── Checkmark Icon ── */}
                    <Animated.View style={[styles.iconContainer, iconStyle]}>
                        <View style={styles.iconRing}>
                            {/* Checkmark using Unicode — perfectly centered with flexbox */}
                            <Text style={styles.checkmarkText}>✓</Text>
                        </View>
                    </Animated.View>

                    {/* ── Title ── */}
                    <Animated.View style={[styles.textContainer, textStyle]}>
                        <Text style={styles.title}>Well done!</Text>
                        <Text style={styles.subtitle}>Streak completed today</Text>
                    </Animated.View>

                    {/* ── Week Dots ── */}
                    <Animated.View style={[styles.weekContainer, weekStyle]}>
                        <View style={styles.weekLabelsRow}>
                            {WEEK_LABELS.map((label, i) => (
                                <Text
                                    key={`wl-${i}`}
                                    style={[styles.weekLabel, i === todayIndex && styles.weekLabelToday]}
                                >
                                    {label}
                                </Text>
                            ))}
                        </View>
                        <View style={styles.weekDotsRow}>
                            {weekDots.map((filled, i) => (
                                <View
                                    key={`dot-${i}`}
                                    style={[styles.dot, filled ? styles.dotFilled : styles.dotEmpty]}
                                />
                            ))}
                        </View>
                    </Animated.View>
                </View>

                {/* ── Button ── */}
                <Animated.View style={[styles.buttonWrapper, buttonStyle]}>
                    <AnimatedScaleButton style={styles.button} onPress={onClose}>
                        <Text style={styles.buttonText}>Ok</Text>
                    </AnimatedScaleButton>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
});

/* ────────────────────────────────────────────────────────────────────────────
 * Styles
 * ──────────────────────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: theme.colors.overlayPopup,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 30,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },

    /* ── Icon ── */
    iconContainer: {
        marginBottom: 30,
    },
    iconRing: {
        width: ICON_SIZE,
        height: ICON_SIZE,
        borderRadius: ICON_SIZE / 2,
        borderWidth: 2.5,
        borderColor: theme.colors.textPrimary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkmarkText: {
        color: theme.colors.textPrimary,
        fontSize: 30,
        fontWeight: '300',
        // Small offset to optically center the checkmark glyph
        marginTop: -2,
        marginLeft: 1,
    },

    /* ── Text ── */
    textContainer: {
        alignItems: 'center',
        marginBottom: 40,
    },
    title: {
        color: theme.colors.textPrimary,
        fontSize: 26,
        fontWeight: '300',
        marginBottom: 8,
        letterSpacing: 0.5,
    },
    subtitle: {
        color: theme.colors.textSecondary,
        fontSize: 20,
        fontWeight: '300',
        letterSpacing: 0.3,
    },

    /* ── Week ── */
    weekContainer: {
        alignItems: 'center',
    },
    weekLabelsRow: {
        flexDirection: 'row',
        gap: DOT_SIZE + 8,
        marginBottom: 10,
    },
    weekLabel: {
        color: theme.colors.textMuted,
        fontSize: 12,
        fontWeight: theme.typography.weightMedium,
        width: DOT_SIZE,
        textAlign: 'center',
    },
    weekLabelToday: {
        color: theme.colors.danger,
        fontWeight: theme.typography.weightBold,
    },
    weekDotsRow: {
        flexDirection: 'row',
        gap: DOT_SIZE + 8,
    },
    dot: {
        width: DOT_SIZE,
        height: DOT_SIZE,
        borderRadius: DOT_SIZE / 2,
    },
    dotFilled: {
        backgroundColor: theme.colors.textPrimary,
    },
    dotEmpty: {
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderColor: theme.colors.textMuted,
    },

    /* ── Button ── */
    buttonWrapper: {
        width: '100%',
        paddingBottom: 60,
        alignItems: 'center',
    },
    button: {
        backgroundColor: theme.colors.textPrimary,
        paddingVertical: 16,
        paddingHorizontal: 50,
        borderRadius: 30,
        minWidth: 180,
        alignItems: 'center',
    },
    buttonText: {
        color: theme.colors.background,
        fontSize: 17,
        fontWeight: '600',
        letterSpacing: 0.3,
    },
});
