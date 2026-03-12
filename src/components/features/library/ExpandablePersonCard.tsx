import React, { useRef, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    Animated,
    StyleSheet,
} from 'react-native';
import { SavedNote } from '@/types';;
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
 * When collapsed: shows person name, avatar, entry count, and delete button.
 * When expanded: smoothly animates open to reveal their recent notes
 * in an embedded scrollable area (capped at EXPANDED_MAX_HEIGHT).
 *
 * Only one card should be expanded at a time (controlled by parent).
 */
interface Props {
    person: { id: string; name: string };
    notes: SavedNote[];
    isExpanded: boolean;
    isLocked: boolean;
    onToggle: () => void;
    onNotePress: (note: SavedNote) => void;
    onDelete: () => void;
    canDelete: boolean;
}

export const ExpandablePersonCard: React.FC<Props> = React.memo(({
    person,
    notes,
    isExpanded,
    isLocked,
    onToggle,
    onNotePress,
    onDelete,
    canDelete,
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


    // Sort notes by newest first
    const sortedNotes = [...notes].sort((a, b) => b.timestamp - a.timestamp);

    return (
        <View style={styles.cardContainer}>
            {/* Header row — tap to expand/collapse */}
            <TouchableOpacity
                style={styles.headerRow}
                onPress={onToggle}
                activeOpacity={0.7}
            >
                <View style={commonStyles.personAvatar}>
                    <Text style={commonStyles.personAvatarText}>
                        {person.name.charAt(0)}
                    </Text>
                </View>
                <View style={styles.headerInfo}>
                    <Text style={commonStyles.personCardName}>{person.name}</Text>
                </View>
                <TouchableOpacity
                    onPress={onDelete}
                    disabled={!canDelete}
                    style={{ opacity: canDelete ? 1 : 0.3, padding: 10 }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Text style={{ color: theme.colors.danger, fontSize: 18 }}>🗑️</Text>
                </TouchableOpacity>
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
