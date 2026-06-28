import React, { useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
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
    onVersionPress?: (note: SavedNote) => void;
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

        // Skeleton calculations removed per user request (overlay covers whole card)

        // Shared value for tracking lock transition progress (1 = locked, 0 = unlocked)
        const lockProgress = useSharedValue(!isUnlocked ? 1 : 0);
        const isMountedRef = React.useRef(false);

        useEffect(() => {
            if (!isMountedRef.current) {
                isMountedRef.current = true;
                lockProgress.value = !isUnlocked ? 1 : 0;
                return;
            }
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
                </View>

                {/* Glass Blur Dissolve Overlay for Locked state */}
                {!isUnlocked && (
                    <Animated.View
                        pointerEvents={!isUnlocked ? 'auto' : 'none'}
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
        activeNoteIds,
        isNoteActive,
        isNoteQueued,
        activeFont,
        onPressNote,
        onGoToStart,
        onVersionPress,
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
                        onVersionPress={onVersionPress}
                        activeFont={activeFont}
                    />
                );
            },
            [isUnlocked, isNoteActive, isNoteQueued, activeFont, onPressNote, personMap, onVersionPress, activeNoteIds],
        );

        const getItemLayout = useCallback(
            (_: ArrayLike<NoteGroupItem> | null | undefined, index: number) => ({
                length: 120,
                offset: 120 * index,
                index,
            }),
            [],
        );

        const emptyIcon = libraryTab === 'checkins' ? 'pillar' : 'notebook-outline';
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
                    extraData={{ activeNoteIds, isUnlocked, activeFont, personMap }}
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
});
