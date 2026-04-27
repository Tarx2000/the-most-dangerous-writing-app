import { useMemo, useCallback } from 'react';
import type { SavedNote, SortOption, AiJobCategory } from '@/types';
import { isAlignmentReflection } from '@/types';

export interface NoteGroupItem {
    type: 'header' | 'note';
    title?: string;
    note?: SavedNote;
}

export function useLibraryNotes(
    savedNotes: SavedNote[],
    libraryTab: 'notes' | 'circles' | 'checkins' | 'vlogs',
    sortBy: SortOption,
    selectedCircleId?: string | null,
) {
    const filteredNotes = useMemo(() => {
        let notes = [...savedNotes];
        if (libraryTab === 'checkins') {
            notes = notes.filter(n => isAlignmentReflection(n));
        } else if (selectedCircleId) {
            notes = notes.filter(n => n.personId === selectedCircleId && !isAlignmentReflection(n));
        } else if (libraryTab === 'notes') {
            notes = notes.filter(n => !n.personId && !isAlignmentReflection(n));
        }
        return notes;
    }, [savedNotes, libraryTab, selectedCircleId]);

    const sortedNotes = useMemo(() => {
        const arr = [...filteredNotes];
        arr.sort((a, b) => {
            switch (sortBy) {
                case 'newest': return b.timestamp - a.timestamp;
                case 'oldest': return a.timestamp - b.timestamp;
                case 'longest': return b.durationMin - a.durationMin;
                case 'shortest': return a.durationMin - b.durationMin;
                case 'longest-text': {
                    const wc = (t: string) => (t || '').split(/\s+/).filter(Boolean).length;
                    return wc(b.text) - wc(a.text);
                }
                default: return b.timestamp - a.timestamp;
            }
        });
        return arr;
    }, [filteredNotes, sortBy]);

    const groupedNotes = useMemo((): NoteGroupItem[] => {
        const flat: NoteGroupItem[] = [];
        let currentGroup = '';
        for (const note of sortedNotes) {
            let groupTitle = '';
            if (sortBy === 'newest' || sortBy === 'oldest') {
                groupTitle = new Date(note.timestamp).toLocaleString('default', { month: 'long', year: 'numeric' });
            } else if (sortBy === 'longest-text') {
                groupTitle = 'By Length (Words)';
            } else {
                groupTitle = `${note.durationMin} Min Sessions`;
            }
            if (groupTitle !== currentGroup) {
                flat.push({ type: 'header', title: groupTitle });
                currentGroup = groupTitle;
            }
            flat.push({ type: 'note', note });
        }
        return flat;
    }, [sortedNotes, sortBy]);

    return { filteredNotes, sortedNotes, groupedNotes };
}
