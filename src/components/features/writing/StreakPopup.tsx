import React, { useEffect, useRef, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    TouchableOpacity,
    Modal,
} from 'react-native';
import { theme } from '@/styles/theme';

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
export const StreakPopup: React.FC<StreakPopupProps> = ({ visible, streak, streakHistory = [], onClose }) => {
    /* ── Animation refs ── */
    const overlayFade = useRef(new Animated.Value(0)).current;
    const iconScale = useRef(new Animated.Value(0.3)).current;
    const iconFade = useRef(new Animated.Value(0)).current;
    const textFade = useRef(new Animated.Value(0)).current;
    const textSlide = useRef(new Animated.Value(30)).current;
    const weekFade = useRef(new Animated.Value(0)).current;
    const buttonFade = useRef(new Animated.Value(0)).current;
    const buttonSlide = useRef(new Animated.Value(30)).current;

    /** Compute which days of the current week have streak records */
    const weekDots = useMemo(() => {
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
    }, [streakHistory]);

    const todayIndex = new Date().getDay();

    useEffect(() => {
        if (!visible) return;

        // Reset all animated values
        overlayFade.setValue(0);
        iconScale.setValue(0.3);
        iconFade.setValue(0);
        textFade.setValue(0);
        textSlide.setValue(30);
        weekFade.setValue(0);
        buttonFade.setValue(0);
        buttonSlide.setValue(30);

        // Staggered entrance using delays instead of sequence (more reliable)
        const animations = [
            // 1. Overlay fade in
            Animated.timing(overlayFade, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
            }),
            // 2. Icon appears with spring (started after short delay)
            Animated.parallel([
                Animated.spring(iconScale, {
                    toValue: 1,
                    friction: 5,
                    tension: 60,
                    useNativeDriver: true,
                }),
                Animated.timing(iconFade, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
            ]),
        ];

        // Start overlay, then icon after 200ms, then text after 500ms
        Animated.timing(overlayFade, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
        }).start();

        setTimeout(() => {
            Animated.parallel([
                Animated.spring(iconScale, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
                Animated.timing(iconFade, { toValue: 1, duration: 300, useNativeDriver: true }),
            ]).start();
        }, 200);

        setTimeout(() => {
            Animated.parallel([
                Animated.timing(textFade, { toValue: 1, duration: 350, useNativeDriver: true }),
                Animated.spring(textSlide, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }),
            ]).start();
        }, 500);

        setTimeout(() => {
            Animated.timing(weekFade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        }, 800);

        setTimeout(() => {
            Animated.parallel([
                Animated.timing(buttonFade, { toValue: 1, duration: 300, useNativeDriver: true }),
                Animated.spring(buttonSlide, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }),
            ]).start();
        }, 1000);
    }, [visible]);

    if (!visible) return null;

    return (
        <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
            <Animated.View style={[styles.overlay, { opacity: overlayFade }]}>
                <View style={styles.content}>

                    {/* ── Checkmark Icon ── */}
                    <Animated.View style={[
                        styles.iconContainer,
                        { opacity: iconFade, transform: [{ scale: iconScale }] }
                    ]}>
                        <View style={styles.iconRing}>
                            {/* Checkmark using Unicode — perfectly centered with flexbox */}
                            <Text style={styles.checkmarkText}>✓</Text>
                        </View>
                    </Animated.View>

                    {/* ── Title ── */}
                    <Animated.View style={[
                        styles.textContainer,
                        { opacity: textFade, transform: [{ translateY: textSlide }] }
                    ]}>
                        <Text style={styles.title}>Well done!</Text>
                        <Text style={styles.subtitle}>Streak completed today</Text>
                    </Animated.View>

                    {/* ── Week Dots ── */}
                    <Animated.View style={[styles.weekContainer, { opacity: weekFade }]}>
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
                <Animated.View style={[
                    styles.buttonWrapper,
                    { opacity: buttonFade, transform: [{ translateY: buttonSlide }] }
                ]}>
                    <TouchableOpacity style={styles.button} onPress={onClose} activeOpacity={0.8}>
                        <Text style={styles.buttonText}>Ok</Text>
                    </TouchableOpacity>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
};

/* ────────────────────────────────────────────────────────────────────────────
 * Styles
 * ──────────────────────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.92)',
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
        color: '#000000',
        fontSize: 17,
        fontWeight: '600',
        letterSpacing: 0.3,
    },
});
