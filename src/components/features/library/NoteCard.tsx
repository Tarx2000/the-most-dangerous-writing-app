import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SavedNote } from '@/types';
import { commonStyles } from '@/styles/commonStyles';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '@/styles/theme';
import { RichText } from '@/components/ui/RichText';

interface Props {
    note: SavedNote;
    onPress: (note: SavedNote) => void;
    personName?: string;
    isLocked?: boolean;
}

/**
 * NoteCard — Library entry card.
 *
 * When AI title is available, shows it as the primary preview (bold, larger).
 * Falls back to a truncated raw text preview if no AI title exists.
 * A small sparkle icon indicates AI-processed entries.
 */
export const NoteCard: React.FC<Props> = React.memo(({ note, onPress, personName, isLocked }) => {
    const hasAi = !!note.aiTitle;

    return (
        <TouchableOpacity style={commonStyles.noteCard} onPress={() => !isLocked && onPress(note)} activeOpacity={isLocked ? 1 : 0.2}>
            <View style={commonStyles.noteCardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <Text style={commonStyles.noteCardDate}>{note.dateStr}</Text>
                </View>
                <Text style={commonStyles.noteCardDuration}>
                    {note.durationMin} Min {note.won && note.durationMin >= 3 && !note.isQuickNote ? '🔥' : (!note.won ? '💀' : '')}
                </Text>
            </View>

            {isLocked ? (
                <Text style={commonStyles.noteCardPreview} numberOfLines={3}>
                    •••• •••••••• ••••• ••• •••
                </Text>
            ) : note.aiProcessing ? (
                <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <MaterialCommunityIcons name="brain" size={14} color={theme.colors.primaryAction} />
                        <Text style={{ color: theme.colors.primaryAction, fontSize: 13, fontWeight: '700' }}>AI Generating Insights...</Text>
                    </View>
                    <RichText style={commonStyles.noteCardPreview} numberOfLines={1} text={note.text} />
                </>
            ) : hasAi ? (
                <>
                    <RichText style={{ color: '#FFF', fontSize: 16, fontWeight: '700', lineHeight: 22, marginBottom: 4 }} numberOfLines={2} text={note.aiTitle!} />
                    <RichText style={commonStyles.noteCardPreview} numberOfLines={1} text={note.text} />
                </>
            ) : (
                <RichText style={commonStyles.noteCardPreview} numberOfLines={3} text={note.text} />
            )}

            {personName && (
                <Text style={{ ...commonStyles.noteCardPreview, marginTop: 8, color: '#aaa', fontStyle: 'italic' }}>
                    Linked to: {personName}
                </Text>
            )}
        </TouchableOpacity>
    );
});
