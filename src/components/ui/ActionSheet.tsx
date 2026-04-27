/**
 * ActionSheet — Animated bottom sheet for option selection.
 *
 * Replaces the inline sort modal and AI model picker with a unified,
 * animated bottom sheet component featuring:
 * - Swipe-to-dismiss gesture from the handle zone
 * - Spring-animated entrance from bottom
 * - Glass-morphic dark card styling
 * - Selectable options with icons, labels, and active checkmarks
 * - Consistent with SwipeableModal design language
 *
 * Usage:
 *   <ActionSheet
 *     visible={showSort}
 *     title="Sort Library By"
 *     options={[
 *       { id: 'newest', label: 'Newest First', icon: 'sort-calendar-descending' },
 *       { id: 'oldest', label: 'Oldest First', icon: 'sort-calendar-ascending' },
 *     ]}
 *     activeId={sortBy}
 *     onSelect={(id) => { setSortBy(id); setShowSort(false); }}
 *     onClose={() => setShowSort(false)}
 *   />
 */
import React, { useEffect, useCallback, useMemo } from 'react';
import {Modal,
    StyleSheet,
    View,
    Text,
    useWindowDimensions,
    TouchableWithoutFeedback,
ScrollView
} from 'react-native';
import { vibrate } from '@/lib/haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    runOnJS,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { theme } from '@/styles/theme';

/* ── CONFIGURABLE: Gesture thresholds ─────────────────────────────────── */

/** Distance (px) user must swipe down before the sheet dismisses */
const DISMISS_THRESHOLD = 80;

/** Velocity (px/s) swipe speed to trigger instant dismiss */
const DISMISS_VELOCITY = 600;

/* ── Types ────────────────────────────────────────────────────────────── */

export interface ActionSheetOption {
    /** Unique identifier for this option */
    id: string;
    /** Display label */
    label: string;
    /** MaterialCommunityIcons icon name */
    icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}

interface ActionSheetProps {
    /** Controls visibility */
    visible: boolean;
    /** Sheet title displayed in the header */
    title: string;
    /** Array of selectable options */
    options: ActionSheetOption[];
    /** ID of the currently active/selected option */
    activeId?: string;
    /** Called when an option is selected — receives the option id */
    onSelect: (id: string) => void;
    /** Called when the sheet is dismissed (swipe, backdrop tap, or cancel) */
    onClose: () => void;
}

export const ActionSheet: React.FC<ActionSheetProps> = React.memo(({
    visible,
    title,
    options,
    activeId,
    onSelect,
    onClose,
}) => {
    const { height: SCREEN_HEIGHT } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const translateY = useSharedValue(SCREEN_HEIGHT);
    const overlayOpacity = useSharedValue(0);

    /* ── Close animation ── */
    const handleClose = useCallback(() => {
        translateY.value = withTiming(SCREEN_HEIGHT, { duration: 300 });
        overlayOpacity.value = withTiming(0, { duration: 300 }, () => {
            runOnJS(onClose)();
        });
    }, [onClose, translateY, overlayOpacity, SCREEN_HEIGHT]);

    /* ── Open animation ── */
    useEffect(() => {
        if (visible) {
            translateY.value = SCREEN_HEIGHT;
            overlayOpacity.value = 0;

            translateY.value = withSpring(0, {
                damping: 22,
                stiffness: 220,
                mass: 0.8,
            });
            overlayOpacity.value = withTiming(1, { duration: 300 });
        }
    }, [visible, translateY, overlayOpacity, SCREEN_HEIGHT]);

    /* ── Swipe-to-dismiss gesture on the handle zone ── */
    const panGesture = useMemo(() => Gesture.Pan()
        .activeOffsetY([-10000, 15])
        .onUpdate((e) => {
            if (e.translationY > 0) {
                translateY.value = e.translationY;
                const progress = Math.min(e.translationY / (SCREEN_HEIGHT * 0.4), 1);
                overlayOpacity.value = 1 - progress;
            }
        })
        .onEnd((e) => {
            if (e.translationY > DISMISS_THRESHOLD || e.velocityY > DISMISS_VELOCITY) {
                runOnJS(handleClose)();
            } else {
                translateY.value = withSpring(0, { damping: 22, stiffness: 220 });
                overlayOpacity.value = withTiming(1, { duration: 150 });
            }
        }), [handleClose, translateY, overlayOpacity, SCREEN_HEIGHT]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    const overlayStyle = useAnimatedStyle(() => ({
        opacity: overlayOpacity.value,
    }));

    /* ── Option press handler with haptic ── */
    const handleOptionPress = useCallback((id: string) => {
        vibrate(10);
        onSelect(id);
    }, [onSelect]);

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
            <GestureHandlerRootView style={{ flex: 1 }}>
                {/* Backdrop scrim */}
                <TouchableWithoutFeedback onPress={handleClose}>
                    <Animated.View style={[styles.scrim, overlayStyle]} />
                </TouchableWithoutFeedback>

                <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]} pointerEvents="box-none">
                    <Animated.View style={[styles.sheet, animatedStyle]}>
                        {/* Drag handle zone */}
                        <GestureDetector gesture={panGesture}>
                            <View style={styles.dragZone}>
                                <View style={styles.handlePill} />
                                <Text style={styles.sheetTitle}>{title}</Text>
                            </View>
                        </GestureDetector>

                        {/* Options list */}
                        <ScrollView
                            style={styles.optionsList}
                            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
                            showsVerticalScrollIndicator={false}
                            bounces={false}
                        >
                            {options.map((opt) => {
                                const isActive = opt.id === activeId;
                                return (
                                    <AnimatedScaleButton
                                        key={opt.id}
                                        style={[
                                            styles.optionRow,
                                            isActive && styles.optionRowActive,
                                        ]}
                                        onPress={() => handleOptionPress(opt.id)}
                                    >
                                        {opt.icon && (
                                            <MaterialCommunityIcons
                                                name={opt.icon}
                                                size={22}
                                                color={isActive ? theme.colors.primaryAction : theme.colors.textSecondary}
                                            />
                                        )}
                                        <Text style={[
                                            styles.optionLabel,
                                            isActive && styles.optionLabelActive,
                                        ]}>
                                            {opt.label}
                                        </Text>
                                        {isActive && (
                                            <MaterialCommunityIcons
                                                name="check"
                                                size={20}
                                                color={theme.colors.primaryAction}
                                                style={styles.checkIcon}
                                            />
                                        )}
                                    </AnimatedScaleButton>
                                );
                            })}
                        </ScrollView>
                    </Animated.View>
                </View>
            </GestureHandlerRootView>
        </Modal>
    );
});

/* ── Styles ────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
    /** Full-screen animated backdrop */
    scrim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: theme.colors.overlayDark,
    },
    /** Bottom sheet card */
    sheet: {
        backgroundColor: theme.colors.surfaceDark,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.glassBorderMedium,
        overflow: 'hidden',
        maxHeight: '75%',
    },
    /** Swipeable handle zone at the top */
    dragZone: {
        width: '100%',
        alignItems: 'center',
        paddingTop: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.glassBorderSubtle,
    },
    /** Small pill indicator for swipe hint */
    handlePill: {
        width: 40,
        height: 5,
        backgroundColor: theme.colors.glassHighlight,
        borderRadius: 3,
        marginBottom: 12,
    },
    sheetTitle: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    /** Scrollable options container */
    optionsList: {
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    /** Individual option row */
    optionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderRadius: 12,
        marginVertical: 2,
        gap: 14,
    },
    /** Active option gets subtle highlight */
    optionRowActive: {
        backgroundColor: theme.colors.dangerTint,
    },
    optionLabel: {
        color: theme.colors.textSecondary,
        fontSize: 16,
        fontWeight: '500',
        flex: 1,
    },
    optionLabelActive: {
        color: theme.colors.primaryAction,
        fontWeight: '700',
    },
    /** Checkmark pushed to trailing edge */
    checkIcon: {
        marginLeft: 'auto',
    },
});

