import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SavedNote } from '../types';
import { commonStyles } from '../styles/commonStyles';

interface Props {
    note: SavedNote;
    onPress: (note: SavedNote) => void;
    personName?: string;
    isLocked?: boolean;
}

export const NoteCard: React.FC<Props> = React.memo(({ note, onPress, personName, isLocked }) => {
    return (
        <TouchableOpacity style={commonStyles.noteCard} onPress={() => !isLocked && onPress(note)} activeOpacity={isLocked ? 1 : 0.2}>
            <View style={commonStyles.noteCardHeader}>
                <Text style={commonStyles.noteCardDate}>{note.dateStr}</Text>
                <Text style={commonStyles.noteCardDuration}>
                    {note.durationMin} Min {note.won ? '🔥' : '💀'}
                </Text>
            </View>
            <Text style={commonStyles.noteCardPreview} numberOfLines={3}>
                {isLocked ? '•••• •••••••• ••••• ••• •••' : note.text}
            </Text>
            {personName && (
                <Text style={{ ...commonStyles.noteCardPreview, marginTop: 8, color: '#aaa', fontStyle: 'italic' }}>
                    Linked to: {personName}
                </Text>
            )}
        </TouchableOpacity>
    );
});
