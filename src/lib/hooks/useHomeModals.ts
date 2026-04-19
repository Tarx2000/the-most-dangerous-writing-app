import { useState, useCallback } from 'react';
import type { SavedNote, SavedVlog } from '@/types';
import type { LayoutRect } from '@/components/features/library/VlogViewerModal';
import type { VideoPlayer } from 'expo-video';

/**
 * useHomeModals — State management for the global modals on HomeScreen.
 *
 * Extracts the note/vlog viewer modal state and handlers into a single hook
 * so HomeScreen's render stays focused on layout and gesture logic.
 */
export function useHomeModals() {
    const [viewNoteModal, setViewNoteModal] = useState<SavedNote | null>(null);
    const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
    const [viewVlogModal, setViewVlogModal] = useState<SavedVlog | null>(null);
    const [vlogSourceRect, setVlogSourceRect] = useState<LayoutRect | null>(null);
    const [vlogPlayerInst, setVlogPlayerInst] = useState<VideoPlayer | null>(null);

    const handleOpenNoteModal = useCallback((note: SavedNote) => {
        setViewNoteModal(note);
    }, []);

    const handleCloseNoteModal = useCallback(() => {
        setViewNoteModal(null);
    }, []);

    const handleDeleteNoteModal = useCallback((id: string) => {
        setViewNoteModal(null);
        setNoteToDelete(id);
    }, []);

    const handleOpenVlogModal = useCallback((vlog: SavedVlog, rect?: LayoutRect, player?: VideoPlayer) => {
        setVlogSourceRect(rect || null);
        setVlogPlayerInst(player || null);
        setViewVlogModal(vlog);
    }, []);

    const handleCloseVlogModal = useCallback(() => {
        setViewVlogModal(null);
    }, []);

    return {
        viewNoteModal,
        noteToDelete,
        viewVlogModal,
        vlogSourceRect,
        vlogPlayerInst,
        handleOpenNoteModal,
        handleCloseNoteModal,
        handleDeleteNoteModal,
        handleOpenVlogModal,
        handleCloseVlogModal,
    };
}