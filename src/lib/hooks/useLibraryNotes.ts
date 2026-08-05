import { useMemo } from 'react';
import type { SavedNote, SortOption } from '@/types';
import { isAlignmentReflection } from '@/types';

export interface NoteGroupItem {
    type: 'header' | 'note';
    title?: string;
    note?: SavedNote;
}

/* ── Configurable ─────────────────────────────────────────────────────────── */

/**
 * `Intl.DateTimeFormat` + per-month label cache.
 *
 * Calling `new Date(ts).toLocaleString('default', { month: 'long', year: 'numeric' })`
 * per note is one of the most expensive JS operations in the library grouping
 * (it constructs a formatter per call). We reuse ONE formatter and cache the
 * label per `year-month` key so grouping 1000+ notes costs a handful of formats
 * instead of a thousand.
 */
const MONTH_LABEL_CACHE = new Map<string, string>();
let monthFormatter: Intl.DateTimeFormat | null = null;

function getMonthLabel(timestamp: number): string {
    const d = new Date(timestamp);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const cached = MONTH_LABEL_CACHE.get(key);
    if (cached !== undefined) return cached;
    if (!monthFormatter) {
        monthFormatter = new Intl.DateTimeFormat('default', { month: 'long', year: 'numeric' });
    }
    const label = monthFormatter.format(d);
    MONTH_LABEL_CACHE.set(key, label);
    return label;
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
            notes = notes.filter((n) => isAlignmentReflection(n));
        } else if (selectedCircleId) {
            notes = notes.filter((n) => n.personId === selectedCircleId && !isAlignmentReflection(n));
        } else if (libraryTab === 'notes') {
            notes = notes.filter((n) => !n.personId && !isAlignmentReflection(n));
        }
        return notes;
    }, [savedNotes, libraryTab, selectedCircleId]);

    const sortedNotes = useMemo(() => {
        const arr = [...filteredNotes];
        arr.sort((a, b) => {
            switch (sortBy) {
                case 'newest':
                    return b.timestamp - a.timestamp;
                case 'oldest':
                    return a.timestamp - b.timestamp;
                case 'longest':
                    return b.durationMin - a.durationMin;
                case 'shortest':
                    return a.durationMin - b.durationMin;
                case 'longest-text': {
                    const wc = (t: string) => (t || '').split(/\s+/).filter(Boolean).length;
                    return wc(b.text) - wc(a.text);
                }
                default:
                    return b.timestamp - a.timestamp;
            }
        });
        return arr;
    }, [filteredNotes, sortBy]);

    const groupedNotes = useMemo((): NoteGroupItem[] => {
        const flat: NoteGroupItem[] = [];
        let currentGroup = '';
        for (const note of sortedNotes) {
            let groupTitle: string;
            if (sortBy === 'newest' || sortBy === 'oldest') {
                groupTitle = getMonthLabel(note.timestamp);
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
