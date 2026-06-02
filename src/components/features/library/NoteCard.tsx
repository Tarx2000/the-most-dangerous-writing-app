import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    withRepeat,
    withSequence,
    interpolateColor,
    Easing,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { SavedNote } from '@/types';
import { commonStyles } from '@/styles/commonStyles';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '@/styles/theme';
import { RichText } from '@/components/ui/RichText';
import { AnimatedLockIcon } from '@/components/ui/AnimatedLockIcon';
import { usePreferences } from '@/lib/hooks/useStorage';
import { CONFIG } from '@/config';
import { Platform } from 'react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props {
    note: SavedNote;
    onPress: (note: SavedNote) => void;
    personName?: string;
    isLocked?: boolean;
    isProcessing?: boolean;
    isQueued?: boolean;
    onLongPress?: () => void;
    isSelected?: boolean;
    onVersionPress?: (note: SavedNote) => void;
}

export const NoteCard: React.FC<Props> = React.memo(
    ({ note, onPress, onLongPress, personName, isLocked, isProcessing, isQueued, isSelected, onVersionPress }) => {
        const hasAi = !!note.aiTitle;
        const { fontIndex } = usePreferences();
        const activeFont = CONFIG.FONTS[fontIndex]?.value || (Platform.OS === 'ios' ? 'System' : 'sans-serif');

        // Skeleton calculations removed per user request (overlay covers whole card)

        /* ━━ Pulsing Glow Animation ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
        const pulse = useSharedValue(0);
        const scale = useSharedValue(1);

        useEffect(() => {
            if (isProcessing) {
                pulse.value = withRepeat(
                    withSequence(withTiming(1, { duration: 1200 }), withTiming(0, { duration: 1200 })),
                    -1,
                    false,
                );
            } else {
                pulse.value = withTiming(0, { duration: 300 });
            }
            return () => {
                pulse.value = 0;
            };
        }, [isProcessing, pulse]);

        const overlayStyle = useAnimatedStyle(() => {
            return {
                borderColor: interpolateColor(
                    pulse.value,
                    [0, 1],
                    [theme.colors.dangerTint, theme.colors.dangerOverlayLight],
                ),
                backgroundColor: interpolateColor(pulse.value, [0, 1], ['transparent', theme.colors.dangerSubtle]),
            };
        });

        const pressStyle = useAnimatedStyle(() => ({
            transform: [{ scale: scale.value }],
        }));

        // Shared value for tracking lock transition progress (1 = fully locked, 0 = fully unlocked)
        const lockProgress = useSharedValue(isLocked ? 1 : 0);

        useEffect(() => {
            lockProgress.value = withTiming(isLocked ? 1 : 0, {
                duration: 350,
                easing: Easing.out(Easing.cubic),
            });
        }, [isLocked, lockProgress]);

        const blurOverlayStyle = useAnimatedStyle(() => ({
            opacity: lockProgress.value,
        }));

        const contentStyle = useAnimatedStyle(() => ({
            opacity: 1 - lockProgress.value,
            transform: [{ scale: 0.96 + (1 - lockProgress.value) * 0.04 }],
        }));

        return (
            <AnimatedPressable
                style={[
                    commonStyles.noteCard,
                    isSelected && {
                        borderColor: theme.colors.primaryAction,
                        backgroundColor: theme.colors.glassSurface,
                    },
                    pressStyle,
                ]}
                onPress={() => !isLocked && onPress(note)}
                onLongPress={onLongPress}
                onPressIn={() => {
                    if (!isLocked) scale.value = withSpring(0.97, { damping: 20, stiffness: 300 });
                }}
                onPressOut={() => {
                    scale.value = withSpring(1, { damping: 20, stiffness: 300 });
                }}
                delayLongPress={400}
            >
                {/* Animated processing overlay — sits behind content */}
                {isProcessing && (
                    <Animated.View style={[StyleSheet.absoluteFillObject, styles.processingOverlay, overlayStyle]} />
                )}

                <View style={commonStyles.noteCardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <Text style={commonStyles.noteCardDate}>{note.dateStr}</Text>
                        {(note.pillarVersion || note.pillarId) && (
                            <Pressable
                                onPress={(e) => {
                                    e.stopPropagation();
                                    onVersionPress?.(note);
                                }}
                                style={styles.versionTag}
                            >
                                <Text style={styles.versionTagText}>v{note.pillarVersion || 1}</Text>
                            </Pressable>
                        )}
                        {isQueued && !isProcessing && (
                            <View
                                style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: 3,
                                    backgroundColor: theme.colors.textMuted,
                                    opacity: 0.5,
                                }}
                            />
                        )}
                    </View>
                    <Text style={commonStyles.noteCardDuration}>
                        {/* Display custom labels for tweets and quick notes instead of raw minutes to keep UI descriptive */}
                        {note.isTweet ? '🐦 Tweet' : note.isQuickNote ? 'Quick Note' : `${note.durationMin} Min`}{' '}
                        {note.won && note.durationMin >= 3 && !note.isQuickNote && !note.isTweet
                            ? '🔥'
                            : !note.won
                              ? '💀'
                              : ''}
                    </Text>
                </View>

                <View style={{ position: 'relative' }}>
                    {/* Real text content (fades out when locked) */}
                    <Animated.View style={contentStyle}>
                        {isProcessing ? (
                            <>
                                <View style={styles.processingRow}>
                                    <MaterialCommunityIcons name="brain" size={13} color={theme.colors.primaryAction} />
                                    <Text style={styles.processingText}>Processing...</Text>
                                </View>
                                <RichText
                                    style={[commonStyles.noteCardPreview, { fontFamily: activeFont }]}
                                    numberOfLines={1}
                                    text={note.text}
                                />
                            </>
                        ) : hasAi ? (
                            <>
                                <RichText
                                    style={{
                                        color: theme.colors.textPrimary,
                                        fontSize: 16,
                                        fontWeight: '700',
                                        lineHeight: 22,
                                        fontFamily: activeFont,
                                        marginBottom: 4,
                                    }}
                                    numberOfLines={2}
                                    text={note.aiTitle || ''}
                                />
                                <RichText
                                    style={[commonStyles.noteCardPreview, { fontFamily: activeFont }]}
                                    numberOfLines={1}
                                    text={note.text}
                                />
                            </>
                        ) : (
                            <RichText
                                style={[commonStyles.noteCardPreview, { fontFamily: activeFont }]}
                                numberOfLines={3}
                                text={note.text}
                            />
                        )}

                        {personName && (
                            <Text
                                style={{
                                    ...commonStyles.noteCardPreview,
                                    fontFamily: activeFont,
                                    marginTop: 8,
                                    color: theme.colors.textMuted,
                                    fontStyle: 'italic',
                                }}
                            >
                                Linked to: {personName}
                            </Text>
                        )}
                    </Animated.View>
                </View>

                {/* Glass Blur Dissolve Overlay covering the entire card */}
                {isLocked && (
                    <Animated.View
                        pointerEvents={isLocked ? 'auto' : 'none'}
                        style={[StyleSheet.absoluteFillObject, styles.blurOverlay, blurOverlayStyle]}
                    >
                        {Platform.OS === 'ios' ? (
                            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
                        ) : (
                            <View
                                style={[
                                    StyleSheet.absoluteFillObject,
                                    { backgroundColor: theme.colors.overlayLockAndroid },
                                ]}
                            />
                        )}
                        <View style={styles.lockIconContainer}>
                            <AnimatedLockIcon isUnlocked={false} color={theme.colors.textDim} size={24} />
                        </View>
                    </Animated.View>
                )}
            </AnimatedPressable>
        );
    },
);

/* ━━ Styles ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const styles = StyleSheet.create({
    processingOverlay: {
        borderRadius: 16,
        borderWidth: 1,
    },
    processingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginBottom: 4,
    },
    processingText: {
        color: theme.colors.primaryAction,
        fontSize: 12,
        fontWeight: '700',
    },
    blurOverlay: {
        borderRadius: theme.borderRadius.md,
        overflow: 'hidden',
    },
    lockIconContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.overlayDark,
    },
    versionTag: {
        backgroundColor: theme.colors.glassSurface,
        borderColor: theme.colors.glassBorder,
        borderWidth: 1,
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 1,
        marginLeft: 4,
    },
    versionTagText: {
        color: theme.colors.primaryAction,
        fontSize: 10,
        fontWeight: 'bold',
    },
});
