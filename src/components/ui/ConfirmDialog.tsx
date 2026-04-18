/**
 * ConfirmDialog — Reusable animated confirmation dialog.
 *
 * Replaces the multiple inline delete/confirm modals scattered across the app
 * with a single, unified component featuring:
 * - Spring-animated entrance (scale + fade)
 * - Animated scrim backdrop
 * - Configurable title, message, icon, confirm/cancel labels
 * - Destructive variant (red confirm) vs neutral (glass confirm)
 * - Consistent dark glassmorphic card design from theme tokens
 *
 * Usage:
 *   <ConfirmDialog
 *     visible={!!itemToDelete}
 *     title="Delete Entry?"
 *     message="Are you sure? This cannot be undone."
 *     confirmLabel="Delete"
 *     cancelLabel="Cancel"
 *     destructive
 *     icon="delete-outline"
 *     onConfirm={() => deleteItem(itemToDelete)}
 *     onCancel={() => setItemToDelete(null)}
 *   />
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { theme } from '@/styles/theme';

/* ── CONFIGURABLE: Animation physics ──────────────────────────────────── */

/** Spring config for the dialog card entrance */
const DIALOG_SPRING = { damping: 18, stiffness: 200, mass: 0.8 };

/** Duration (ms) for scrim fade-in */
const SCRIM_FADE_DURATION = 250;

/* ── Types ────────────────────────────────────────────────────────────── */

interface ConfirmDialogProps {
    /** Controls visibility of the dialog */
    visible: boolean;
    /** Dialog title (e.g. "Delete Entry?") */
    title: string;
    /** Descriptive message shown below the title */
    message: string;
    /** Label for the confirm action button */
    confirmLabel?: string;
    /** Label for the cancel button */
    cancelLabel?: string;
    /** Icon name (MaterialCommunityIcons) shown on the confirm button */
    icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    /** Icon for cancel button */
    cancelIcon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    /** If true, confirm button uses danger red styling */
    destructive?: boolean;
    /** Called when the user presses confirm */
    onConfirm: () => void;
    /** Called when the user presses cancel or the backdrop */
    onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = React.memo(({
    visible,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    icon = 'check',
    cancelIcon = 'close',
    destructive = false,
    onConfirm,
    onCancel,
}) => {
    /* ── Animation shared values ── */
    const scrimOpacity = useSharedValue(0);
    const cardScale = useSharedValue(0.85);
    const cardOpacity = useSharedValue(0);

    /**
     * Animate entrance when visible changes.
     * Scrim fades in with timing, card springs in with scale.
     */
    useEffect(() => {
        if (visible) {
            scrimOpacity.value = withTiming(1, { duration: SCRIM_FADE_DURATION });
            cardScale.value = withSpring(1, DIALOG_SPRING);
            cardOpacity.value = withTiming(1, { duration: 200 });
        } else {
            scrimOpacity.value = 0;
            cardScale.value = 0.85;
            cardOpacity.value = 0;
        }
    }, [visible, scrimOpacity, cardScale, cardOpacity]);

    const scrimStyle = useAnimatedStyle(() => ({
        opacity: scrimOpacity.value,
    }));

    const cardStyle = useAnimatedStyle(() => ({
        transform: [{ scale: cardScale.value }],
        opacity: cardOpacity.value,
    }));

    if (!visible) return null;

    return (
        <Modal visible transparent animationType="none" statusBarTranslucent>
            {/* Animated backdrop scrim */}
            <Animated.View style={[styles.backdrop, scrimStyle]}>
                {/* Tap backdrop to cancel */}
                <AnimatedScaleButton
                    style={StyleSheet.absoluteFillObject}
                    onPress={onCancel}
                >
                    <View style={StyleSheet.absoluteFillObject} />
                </AnimatedScaleButton>

                {/* Dialog card */}
                <Animated.View style={[styles.card, cardStyle]}>
                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.message}>{message}</Text>

                    <View style={styles.buttonRow}>
                        {/* Cancel button — always glass style */}
                        <AnimatedScaleButton
                            style={[styles.button, styles.cancelButton]}
                            onPress={onCancel}
                        >
                            <MaterialCommunityIcons
                                name={cancelIcon}
                                size={18}
                                color={theme.colors.textPrimary}
                            />
                            <Text style={styles.cancelText}>{cancelLabel}</Text>
                        </AnimatedScaleButton>

                        {/* Confirm button — destructive (red) or neutral (primary) */}
                        <AnimatedScaleButton
                            style={[
                                styles.button,
                                destructive ? styles.destructiveButton : styles.confirmButton,
                            ]}
                            onPress={onConfirm}
                        >
                            <MaterialCommunityIcons
                                name={icon}
                                size={18}
                                color="#FFF"
                            />
                            <Text style={styles.confirmText}>{confirmLabel}</Text>
                        </AnimatedScaleButton>
                    </View>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
});

/* ── Styles ────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
    /** Full-screen semi-transparent backdrop */
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    /** Glass-morphic dialog card */
    card: {
        backgroundColor: theme.colors.surfaceRaised,
        borderRadius: 20,
        padding: 28,
        width: '100%',
        maxWidth: 380,
        borderWidth: 1,
        borderColor: theme.colors.glassBorderMedium,
        /** Subtle shadow for depth */
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 24,
        elevation: 20,
    },
    title: {
        color: theme.colors.textPrimary,
        fontSize: 22,
        fontWeight: '800',
        textAlign: 'center',
        marginBottom: 10,
        letterSpacing: -0.3,
    },
    message: {
        color: theme.colors.textSecondary,
        fontSize: 15,
        lineHeight: 22,
        textAlign: 'center',
        marginBottom: 24,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 10,
    },
    /** Shared button base styles */
    button: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 15,
        borderRadius: 100,
        gap: 8,
    },
    /** Cancel: glass background */
    cancelButton: {
        backgroundColor: theme.colors.glassHighlight,
    },
    /** Destructive confirm: danger red */
    destructiveButton: {
        backgroundColor: theme.colors.danger,
    },
    /** Neutral confirm: primary action */
    confirmButton: {
        backgroundColor: theme.colors.primaryAction,
    },
    cancelText: {
        color: theme.colors.textPrimary,
        fontWeight: '700',
        fontSize: 15,
    },
    confirmText: {
        color: '#FFF',
        fontWeight: '700',
        fontSize: 15,
    },
});
