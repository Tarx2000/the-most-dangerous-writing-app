import React, { useCallback, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { commonStyles } from '@/styles/commonStyles';
import { theme } from '@/styles/theme';
import { NoteCard } from '@/components/features/library/NoteCard';
import { EmptyLibraryState } from '@/components/features/library/EmptyLibraryState';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { LinearGradient } from 'expo-linear-gradient';
import type { SavedNote } from '@/types';
import { isAlignmentReflection } from '@/types';
import { getAlignmentScoreDetails } from '@/lib/alignmentScores';
import type { NoteGroupItem } from '@/lib/hooks/useLibraryNotes';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { AnimatedLockIcon } from '@/components/ui/AnimatedLockIcon';

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface Props {
    groupedNotes: NoteGroupItem[];
    libraryTab: 'notes' | 'checkins';
    personMap: Map<string, string>;
    isUnlocked: boolean;
    activeNoteIds: string[];
    isProcessing: boolean;
    isNoteActive: (noteId: string) => boolean;
    isNoteQueued: (noteId: string) => boolean;
    activeFont: string;
    onPressNote: (note: SavedNote) => void;
    onGoToStart: () => void;
}

/* ── Stable sub-components (hoisted to avoid re-creation on every render) ─── */

const DateHeader = React.memo(({ title }: { title: string }) => (
    <View style={styles.dateHeader}>
        <Text style={commonStyles.groupTitle}>{title}</Text>
    </View>
));

const ReflectionCard = React.memo(
    ({
        note,
        isUnlocked,
        onPress,
        activeFont,
    }: {
        note: SavedNote;
        isUnlocked: boolean;
        onPress: (note: SavedNote) => void;
        activeFont: string;
    }) => {
        const score = isAlignmentReflection(note) ? note.alignmentScore : 0;
        const details = getAlignmentScoreDetails(score);

        // Determine number of lines based on text length to prevent card overflow
        const textLen = note.text ? note.text.length : 0;
        const bodySkeletonLines = textLen < 30 ? 1 : 2;

        // Shared value for tracking lock transition progress (1 = locked, 0 = unlocked)
        const lockProgress = useSharedValue(!isUnlocked ? 1 : 0);

        useEffect(() => {
            lockProgress.value = withTiming(!isUnlocked ? 1 : 0, {
                duration: 350,
                easing: Easing.out(Easing.cubic),
            });
        }, [isUnlocked, lockProgress]);

        const blurOverlayStyle = useAnimatedStyle(() => ({
            opacity: lockProgress.value,
        }));

        const contentStyle = useAnimatedStyle(() => ({
            opacity: 1 - lockProgress.value,
            transform: [{ scale: 0.96 + (1 - lockProgress.value) * 0.04 }],
        }));

        const placeholderStyle = useAnimatedStyle(() => ({
            opacity: lockProgress.value,
            transform: [{ scale: 0.98 + (1 - lockProgress.value) * 0.02 }],
        }));

        return (
            <AnimatedScaleButton style={styles.reflectionCard} onPress={() => onPress(note)} disabled={!isUnlocked}>
                <LinearGradient
                    colors={[theme.colors.glassSurfaceSubtle, 'transparent']}
                    style={StyleSheet.absoluteFillObject}
                />

                <View style={{ position: 'relative' }}>
                    {/* Real content (fades out when locked) */}
                    <Animated.View style={contentStyle}>
                        <View style={styles.reflectionHeader}>
                            <View>
                                <Text style={styles.reflectionDate}>{note.dateStr}</Text>
                                <Text style={styles.reflectionScore}>Score: {score}/10</Text>
                            </View>
                            <Text style={{ fontSize: 36, color: details.color }}>{details.emoji}</Text>
                        </View>
                        <Text style={[commonStyles.noteCardPreview, { fontFamily: activeFont }]} numberOfLines={2}>
                            {note.text}
                        </Text>
                    </Animated.View>

                    {/* Redacted Skeleton Blocks (fades in when locked) */}
                    <Animated.View style={[StyleSheet.absoluteFillObject, placeholderStyle]} pointerEvents="none">
                        <View style={styles.reflectionHeaderPlaceholder}>
                            <View style={{ gap: 6 }}>
                                <View style={styles.skeletonDate} />
                                <View style={styles.skeletonScore} />
                            </View>
                            <View style={styles.skeletonEmoji} />
                        </View>
                        {bodySkeletonLines > 0 && <View style={styles.skeletonLine} />}
                        {bodySkeletonLines > 1 && <View style={styles.skeletonLineShort} />}
                    </Animated.View>
                </View>

                {/* Glass Blur Dissolve Overlay for Locked state */}
                <Animated.View
                    pointerEvents={!isUnlocked ? 'auto' : 'none'}
                    style={[StyleSheet.absoluteFillObject, styles.blurOverlay, blurOverlayStyle]}
                >
                    <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
                    <View style={styles.lockIconContainer}>
                        <AnimatedLockIcon isUnlocked={false} color={theme.colors.textDim} size={24} />
                    </View>
                </Animated.View>
            </AnimatedScaleButton>
        );
    },
);

/* ── Component ────────────────────────────────────────────────────────────── */

export const LibraryNotesList: React.FC<Props> = React.memo(
    ({
        groupedNotes,
        libraryTab,
        personMap,
        isUnlocked,
        isNoteActive,
        isNoteQueued,
        activeFont,
        onPressNote,
        onGoToStart,
    }) => {
        const flashListStyle = React.useMemo(() => ({ marginHorizontal: -20 }), []);
        const contentContainerStyle = React.useMemo(
            () => ({ paddingBottom: 120, paddingTop: 12, paddingHorizontal: 20 }),
            [],
        );

        const renderItem = useCallback(
            ({ item }: { item: NoteGroupItem }) => {
                if (item.type === 'header') {
                    return <DateHeader title={item.title || ''} />;
                }

                const note = item.note as SavedNote;
                const _isAlignment = isAlignmentReflection(note);

                if (_isAlignment) {
                    return (
                        <ReflectionCard
                            note={note}
                            isUnlocked={isUnlocked}
                            onPress={onPressNote}
                            activeFont={activeFont}
                        />
                    );
                }

                return (
                    <NoteCard
                        note={note}
                        onPress={onPressNote}
                        personName={note.personId ? personMap.get(note.personId) : undefined}
                        isLocked={!isUnlocked}
                        isProcessing={isNoteActive(note.id)}
                        isQueued={isNoteQueued(note.id)}
                    />
                );
            },
            [isUnlocked, isNoteActive, isNoteQueued, activeFont, onPressNote, personMap],
        );

        const getItemLayout = useCallback(
            (_: ArrayLike<NoteGroupItem> | null | undefined, index: number) => ({
                length: 120,
                offset: 120 * index,
                index,
            }),
            [],
        );

        const emptyIcon = libraryTab === 'checkins' ? 'compass-outline' : 'notebook-outline';
        const emptyTitle = libraryTab === 'checkins' ? 'No check-ins yet' : 'No entries found';
        const emptyDesc =
            libraryTab === 'checkins'
                ? 'Start your weekly alignment check-in to track your progress over time.'
                : 'Start writing to build your library of dangerous sessions.';

        if (groupedNotes.length === 0) {
            return (
                <EmptyLibraryState
                    icon={emptyIcon}
                    title={emptyTitle}
                    description={emptyDesc}
                    actionLabel="Start Writing"
                    onAction={onGoToStart}
                />
            );
        }

        return (
            <>
                {/* Top fade mask */}
                <LinearGradient
                    colors={[
                        theme.colors.background,
                        theme.colors.overlayStrong,
                        theme.colors.overlayVideoStrong,
                        theme.colors.overlayDark,
                        theme.colors.overlaySubtle,
                        'transparent',
                    ]}
                    style={styles.fadeTop}
                    pointerEvents="none"
                />
                {/* Bottom fade mask */}
                <LinearGradient
                    colors={[
                        'transparent',
                        theme.colors.overlaySubtle,
                        theme.colors.overlayDark,
                        theme.colors.overlayVideoStrong,
                        theme.colors.overlayStrong,
                        theme.colors.background,
                    ]}
                    style={styles.fadeBottom}
                    pointerEvents="none"
                />
                <FlashList
                    style={flashListStyle}
                    data={groupedNotes}
                    keyExtractor={(item) =>
                        item.type === 'header' ? `header-${item.title}` : item.note?.id || `unknown-${Math.random()}`
                    }
                    getItemType={(item) => item.type}
                    estimatedItemSize={120}
                    contentContainerStyle={contentContainerStyle}
                    showsVerticalScrollIndicator={false}
                    renderItem={renderItem}
                    getItemLayout={getItemLayout}
                />
            </>
        );
    },
);

/* ── Styles ───────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
    dateHeader: {
        paddingTop: 20,
        paddingBottom: 10,
    },
    reflectionCard: {
        backgroundColor: theme.colors.glassSurfaceSubtle,
        padding: 18,
        borderRadius: 16,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: theme.colors.glassSurfaceMedium,
        overflow: 'hidden',
    },
    reflectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    reflectionDate: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    reflectionScore: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    fadeTop: {
        position: 'absolute',
        top: 0,
        left: -20,
        right: -20,
        height: 32,
        zIndex: 10,
    },
    fadeBottom: {
        position: 'absolute',
        bottom: 0,
        left: -20,
        right: -20,
        height: 60,
        zIndex: 10,
    },
    blurOverlay: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    lockIconContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.overlayDark,
    },
    reflectionHeaderPlaceholder: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    skeletonDate: {
        height: 12,
        width: 80,
        backgroundColor: theme.colors.glassSurfaceMedium,
        borderRadius: 4,
    },
    skeletonScore: {
        height: 14,
        width: 60,
        backgroundColor: theme.colors.glassSurfaceMedium,
        borderRadius: 4,
    },
    skeletonEmoji: {
        height: 36,
        width: 36,
        borderRadius: 18,
        backgroundColor: theme.colors.glassSurfaceMedium,
    },
    skeletonLine: {
        height: 8,
        width: '90%',
        backgroundColor: theme.colors.glassSurface,
        borderRadius: 4,
        marginBottom: 6,
    },
    skeletonLineShort: {
        height: 8,
        width: '70%',
        backgroundColor: theme.colors.glassSurface,
        borderRadius: 4,
    },
});
