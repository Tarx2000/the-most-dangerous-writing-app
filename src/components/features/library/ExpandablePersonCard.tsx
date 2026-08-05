import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { SavedNote, Person } from '@/types';
import { NoteCard } from '@/components/features/library/NoteCard';
import { commonStyles } from '@/styles/commonStyles';
import { theme } from '@/styles/theme';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';

/**
 * CONFIGURABLE: Max height of the embedded notes scroll area.
 * Shows ~3 notes by default, scrollable for more.
 */
const EXPANDED_MAX_HEIGHT = 320;

/**
 * ExpandablePersonCard - An accordion-style person card for the Circles tab.
 *
 * When collapsed: shows person name, avatar, entry count, word count,
 *   relationship badge, profile button, and delete button.
 * When expanded: smoothly animates open to reveal their recent notes
 *   in an embedded scrollable area (capped at EXPANDED_MAX_HEIGHT).
 *
 * Only one card should be expanded at a time (controlled by parent).
 */
interface Props {
    person: Person;
    notes: SavedNote[];
    isExpanded: boolean;
    isLocked: boolean;
    onToggle: (personId: string) => void;
    onNotePress: (note: SavedNote) => void;
    /** Open person profile modal */
    onProfilePress: (person: Person) => void;
    isNoteActive?: (id: string) => boolean;
    isNoteQueued?: (id: string) => boolean;
    activeFont?: string;
}

export const ExpandablePersonCard: React.FC<Props> = React.memo(
    ({
        person,
        notes,
        isExpanded,
        isLocked,
        onToggle,
        onNotePress,
        onProfilePress,
        isNoteActive,
        isNoteQueued,
        activeFont,
    }) => {
        const [shouldRenderContent, setShouldRenderContent] = useState(isExpanded);
        const expandHeight = useSharedValue(isExpanded ? EXPANDED_MAX_HEIGHT : 0);

        // Stabilize callbacks to prevent child re-renders
        const handleToggle = React.useCallback(() => {
            onToggle(person.id);
        }, [person.id, onToggle]);

        const handleProfilePress = React.useCallback(() => {
            onProfilePress(person);
        }, [person, onProfilePress]);

        useEffect(() => {
            if (isExpanded) {
                setShouldRenderContent(true);
            }
            expandHeight.value = withTiming(
                isExpanded ? EXPANDED_MAX_HEIGHT : 0,
                {
                    duration: 250,
                    easing: Easing.out(Easing.cubic),
                },
                (finished) => {
                    if (finished && !isExpanded) {
                        runOnJS(setShouldRenderContent)(false);
                    }
                },
            );
        }, [isExpanded, expandHeight]);

        const animatedStyle = useAnimatedStyle(() => {
            return {
                maxHeight: expandHeight.value,
                opacity: expandHeight.value / EXPANDED_MAX_HEIGHT,
            };
        });

        /** Total word count across all notes for this person */
        const totalWords = useMemo(() => {
            return notes.reduce((sum, n) => {
                return sum + (n.text || '').split(/\s+/).filter(Boolean).length;
            }, 0);
        }, [notes]);

        // Sort notes by newest first
        const sortedNotes = useMemo(() => {
            return [...notes].sort((a, b) => b.timestamp - a.timestamp);
        }, [notes]);

        // Stable rendering function for FlatList items
        const renderNoteItem = React.useCallback(
            ({ item: note }: { item: SavedNote }) => (
                <NoteCard
                    note={note}
                    onPress={onNotePress}
                    isLocked={isLocked}
                    isProcessing={isNoteActive ? isNoteActive(note.id) : undefined}
                    isQueued={isNoteQueued ? isNoteQueued(note.id) : undefined}
                    activeFont={activeFont}
                />
            ),
            [onNotePress, isLocked, isNoteActive, isNoteQueued, activeFont],
        );

        return (
            <View style={styles.cardContainer}>
                {/* Header row — tap to expand/collapse */}
                <AnimatedScaleButton style={styles.headerRow} onPress={handleToggle}>
                    {/* Avatar — tap to open profile (separate touchable to prevent toggle) */}
                    <AnimatedScaleButton
                        style={commonStyles.personAvatar}
                        onPress={(e) => {
                            e?.stopPropagation?.();
                            handleProfilePress();
                        }}
                    >
                        <Text style={commonStyles.personAvatarText}>{(person.name || '?').charAt(0)}</Text>
                    </AnimatedScaleButton>

                    {/* Name + meta info */}
                    <View style={styles.headerInfo}>
                        <View style={styles.nameRow}>
                            <Text style={commonStyles.personCardName} numberOfLines={1}>
                                {person.nickname || person.name}
                            </Text>
                            {/* Note count badge — visual indicator of how much you've written */}
                            <View style={styles.countBadge}>
                                <Text style={styles.countBadgeText}>{notes.length}</Text>
                            </View>
                        </View>

                        {/* Meta row: relationship tag + word count */}
                        <View style={styles.metaRow}>
                            {person.relationship && <Text style={styles.relationshipTag}>{person.relationship}</Text>}
                            {totalWords > 0 && (
                                <Text style={styles.wordCountText}>{totalWords.toLocaleString()} words</Text>
                            )}
                        </View>
                    </View>
                </AnimatedScaleButton>

                {/* Expandable notes area — animated height */}
                <Animated.View style={[styles.expandArea, animatedStyle]}>
                    {shouldRenderContent &&
                        (notes.length === 0 ? (
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyText}>No notes yet</Text>
                            </View>
                        ) : (
                            <FlatList
                                data={sortedNotes}
                                keyExtractor={(item) => item.id}
                                renderItem={renderNoteItem}
                                style={styles.notesScroll}
                                nestedScrollEnabled
                                showsVerticalScrollIndicator={false}
                                initialNumToRender={3}
                                maxToRenderPerBatch={3}
                                windowSize={2}
                                removeClippedSubviews={Platform.OS === 'android'}
                                ListFooterComponent={<View style={{ height: 10 }} />}
                            />
                        ))}
                </Animated.View>
            </View>
        );
    },
);

const styles = StyleSheet.create({
    /** Card wrapper — glassmorphism container */
    cardContainer: {
        backgroundColor: theme.colors.surfaceCard,
        borderRadius: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        overflow: 'hidden',
    },

    /** Tappable header row */
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },

    /** Name + meta column */
    headerInfo: {
        flex: 1,
    },

    /** Name + badge row */
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },

    /** Note count badge — pill showing entry count */
    countBadge: {
        backgroundColor: theme.colors.dangerAccent,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: theme.colors.dangerBorderMedium,
    },
    countBadgeText: {
        color: theme.colors.primaryAction,
        fontSize: 12,
        fontWeight: '800',
    },

    /** Meta row below name (relationship + word count) */
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 4,
    },
    relationshipTag: {
        color: theme.colors.textMuted,
        fontSize: 12,
        fontWeight: '600',
    },
    wordCountText: {
        color: theme.colors.textMuted,
        fontSize: 12,
        fontWeight: '500',
    },

    /** The collapsible area below the header */
    expandArea: {
        overflow: 'hidden',
    },

    /** Scrollable notes list inside the expanded area */
    notesScroll: {
        paddingHorizontal: 12,
    },

    /** Empty state when person has no notes */
    emptyState: {
        padding: 20,
        alignItems: 'center',
    },
    emptyText: {
        color: theme.colors.textMuted,
        fontSize: 14,
    },
});
