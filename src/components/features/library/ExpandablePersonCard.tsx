import React, { useRef, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    Animated,
    StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SavedNote } from '@/types';
import { NoteCard } from '@/components/features/library/NoteCard';
import { commonStyles } from '@/styles/commonStyles';
import { theme } from '@/styles/theme';

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
    person: { id: string; name: string; relationship?: string; nickname?: string };
    notes: SavedNote[];
    isExpanded: boolean;
    isLocked: boolean;
    onToggle: () => void;
    onNotePress: (note: SavedNote) => void;
    onDelete: () => void;
    /** Open person profile modal */
    onProfilePress: () => void;
    canDelete: boolean;
    isNoteActive?: (id: string) => boolean;
    isNoteQueued?: (id: string) => boolean;
}

export const ExpandablePersonCard: React.FC<Props> = React.memo(({
    person,
    notes,
    isExpanded,
    isLocked,
    onToggle,
    onNotePress,
    onDelete,
    onProfilePress,
    canDelete,
    isNoteActive,
    isNoteQueued,
}) => {
    const animatedHeight = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(animatedHeight, {
            toValue: isExpanded ? 1 : 0,
            useNativeDriver: false, // height can't use native driver
            damping: 18,
            stiffness: 180,
            mass: 0.8,
        }).start();
    }, [isExpanded]);

    // Interpolate height from 0 to max
    const expandHeight = animatedHeight.interpolate({
        inputRange: [0, 1],
        outputRange: [0, EXPANDED_MAX_HEIGHT],
        extrapolate: 'clamp',
    });

    /** Total word count across all notes for this person */
    const totalWords = notes.reduce((sum, n) => {
        return sum + (n.text || '').split(/\s+/).filter(Boolean).length;
    }, 0);

    // Sort notes by newest first
    const sortedNotes = [...notes].sort((a, b) => b.timestamp - a.timestamp);

    return (
        <View style={styles.cardContainer}>
            {/* Subtle gradient overlay for depth */}
            <LinearGradient
                colors={['rgba(255,255,255,0.03)', 'transparent']}
                style={StyleSheet.absoluteFillObject}
            />

            {/* Header row — tap to expand/collapse */}
            <TouchableOpacity
                style={styles.headerRow}
                onPress={onToggle}
                activeOpacity={0.7}
            >
                {/* Avatar — tap to open profile (separate touchable to prevent toggle) */}
                <TouchableOpacity
                    style={commonStyles.personAvatar}
                    onPress={(e) => { e.stopPropagation(); onProfilePress(); }}
                    activeOpacity={0.6}
                >
                    <Text style={commonStyles.personAvatarText}>
                        {person.name.charAt(0)}
                    </Text>
                </TouchableOpacity>

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
                        {person.relationship && (
                            <Text style={styles.relationshipTag}>{person.relationship}</Text>
                        )}
                        {totalWords > 0 && (
                            <Text style={styles.wordCountText}>
                                {totalWords.toLocaleString()} words
                            </Text>
                        )}
                    </View>
                </View>


            </TouchableOpacity>

            {/* Expandable notes area — animated height */}
            <Animated.View style={[styles.expandArea, { maxHeight: expandHeight }]}>
                {notes.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>No notes yet</Text>
                    </View>
                ) : (
                    <ScrollView
                        style={styles.notesScroll}
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={false}
                    >
                        {sortedNotes.map(note => (
                            <NoteCard
                                key={note.id}
                                note={note}
                                onPress={onNotePress}
                                isLocked={isLocked}
                                isProcessing={isNoteActive ? isNoteActive(note.id) : undefined}
                                isQueued={isNoteQueued ? isNoteQueued(note.id) : undefined}
                            />
                        ))}
                        {/* Bottom padding to avoid last card being cut off */}
                        <View style={{ height: 10 }} />
                    </ScrollView>
                )}
            </Animated.View>
        </View>
    );
});

const styles = StyleSheet.create({
    /** Card wrapper — glassmorphism container */
    cardContainer: {
        backgroundColor: theme.colors.glassBackground,
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
        backgroundColor: 'rgba(255, 42, 42, 0.15)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(255, 42, 42, 0.25)',
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
