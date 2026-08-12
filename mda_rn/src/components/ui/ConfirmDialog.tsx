/**
 * ConfirmDialog — Reusable animated confirmation dialog.
 *
 * A clean, robust implementation using:
 * - RN Modal with Reanimated card entrance
 * - Direct Pressable buttons (no AnimatedScaleButton wrapping inside modal)
 * - Guaranteed-visible text with explicit white color and no-shrink rules
 * - Spring-animated scale + fade on the card only
 *
 * Usage:
 *   <ConfirmDialog
 *     visible={!!itemToDelete}
 *     title="Delete Entry?"
 *     message="Are you sure? This cannot be undone."
 *     confirmLabel="Delete"
 *     cancelLabel="Cancel"
 *     destructive
 *     onConfirm={() => deleteItem(itemToDelete)}
 *     onCancel={() => setItemToDelete(null)}
 *   />
 */
import React, { useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '@/styles/theme';

/* ── Animation constants ──────────────────────────────────────────────── */

const SPRING = theme.animation.springDefault;
const SCRIM_DURATION = 250;

/* ── Types ────────────────────────────────────────────────────────────── */

interface ConfirmDialogProps {
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    /** @deprecated No longer used — icons are now fixed per button type */
    icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    /** @deprecated No longer used — cancel icon is always 'close' */
    cancelIcon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    /** If true, confirm uses danger red */
    destructive?: boolean;
    /** Optional icon name for the confirm button (overrides the destructive/default icon) */
    confirmIcon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    /** Called when confirm is pressed */
    onConfirm: () => void;
    /** Called when cancel or backdrop is pressed */
    onCancel: () => void;
}

/* ── Component ────────────────────────────────────────────────────────── */

export const ConfirmDialog: React.FC<ConfirmDialogProps> = React.memo(
    ({
        visible,
        title,
        message,
        confirmLabel = 'Confirm',
        cancelLabel = 'Cancel',
        destructive = false,
        confirmIcon,
        onConfirm,
        onCancel,
    }) => {
        const { width: screenWidth } = useWindowDimensions();

        /* ── Shared values ── */
        const scrimOpacity = useSharedValue(0);
        const cardScale = useSharedValue(0.9);
        const cardOpacity = useSharedValue(0);

        /* ── Animate in / out ── */
        useEffect(() => {
            if (visible) {
                scrimOpacity.value = withTiming(1, { duration: SCRIM_DURATION });
                cardScale.value = withSpring(1, SPRING);
                cardOpacity.value = withTiming(1, { duration: 200 });
            } else {
                scrimOpacity.value = withTiming(0, { duration: 180 });
                cardScale.value = withTiming(0.9, { duration: 180 });
                cardOpacity.value = withTiming(0, { duration: 180 });
            }
        }, [visible, scrimOpacity, cardScale, cardOpacity]);

        /* ── Animated styles ── */
        const scrimStyle = useAnimatedStyle(() => ({
            opacity: scrimOpacity.value,
        }));

        const cardStyle = useAnimatedStyle(() => ({
            transform: [{ scale: cardScale.value }],
            opacity: cardOpacity.value,
        }));

        /* ── Handlers ── */
        const handleConfirm = useCallback(() => onConfirm(), [onConfirm]);
        const handleCancel = useCallback(() => onCancel(), [onCancel]);

        if (!visible) return null;

        return (
            <Modal
                visible
                transparent
                animationType="none"
                statusBarTranslucent
                navigationBarTranslucent
                onRequestClose={handleCancel}
            >
                {/* Scrim backdrop */}
                <Animated.View style={[styles.scrim, scrimStyle]}>
                    {/* Backdrop tap to dismiss */}
                    <Pressable style={styles.scrimHitArea} onPress={handleCancel} />

                    {/* Dialog card */}
                    <Animated.View style={[styles.card, cardStyle, { maxWidth: Math.min(380, screenWidth - 48) }]}>
                        {/* Title */}
                        <Text style={styles.title}>{title}</Text>

                        {/* Message */}
                        <Text style={styles.message}>{message}</Text>

                        {/* Button row */}
                        <View style={styles.buttonRow}>
                            {/* Cancel */}
                            <Pressable
                                style={({ pressed }) => [
                                    styles.buttonBase,
                                    styles.cancelBtn,
                                    pressed && styles.cancelBtnPressed,
                                ]}
                                onPress={handleCancel}
                            >
                                <MaterialCommunityIcons name="close" size={18} color={theme.colors.textPrimary} />
                                <Text style={styles.btnText}>{cancelLabel}</Text>
                            </Pressable>

                            {/* Confirm */}
                            <Pressable
                                style={({ pressed }) => [
                                    styles.buttonBase,
                                    destructive ? styles.destructiveBtn : styles.confirmBtn,
                                    pressed && (destructive ? styles.destructiveBtnPressed : styles.confirmBtnPressed),
                                ]}
                                onPress={handleConfirm}
                            >
                                <MaterialCommunityIcons
                                    name={confirmIcon ?? (destructive ? 'trash-can-outline' : 'check')}
                                    size={18}
                                    color={theme.colors.textPrimary}
                                />
                                <Text style={styles.btnText}>{confirmLabel}</Text>
                            </Pressable>
                        </View>
                    </Animated.View>
                </Animated.View>
            </Modal>
        );
    },
);

/* ── Styles ───────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
    scrim: {
        flex: 1,
        backgroundColor: theme.colors.modalBackground,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    scrimHitArea: {
        ...StyleSheet.absoluteFillObject,
    },
    card: {
        backgroundColor: theme.colors.surfaceRaised,
        borderRadius: 20,
        padding: 28,
        width: '100%',
        borderWidth: 1,
        borderColor: theme.colors.glassBorderMedium,
        shadowColor: theme.colors.shadowDark,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.5,
        shadowRadius: 30,
        elevation: 24,
        zIndex: 1,
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
        gap: 12,
    },
    /** Shared button shell */
    buttonBase: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 14,
        gap: 8,
    },
    /** Cancel — glass */
    cancelBtn: {
        backgroundColor: theme.colors.glassHighlight,
    },
    cancelBtnPressed: {
        backgroundColor: theme.colors.glassBorderMedium,
    },
    /** Confirm — primary */
    confirmBtn: {
        backgroundColor: theme.colors.primaryAction,
    },
    confirmBtnPressed: {
        backgroundColor: theme.colors.dangerPressed,
    },
    /** Confirm — destructive */
    destructiveBtn: {
        backgroundColor: theme.colors.danger,
    },
    destructiveBtnPressed: {
        backgroundColor: theme.colors.dangerPressed,
    },
    /** Button text — explicit white, no-shrink */
    btnText: {
        color: theme.colors.textPrimary,
        fontWeight: '700',
        fontSize: 15,
        letterSpacing: 0.2,
        flexShrink: 0,
    },
});
