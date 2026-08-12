import { useState, useCallback } from 'react';
import { DeviceEventEmitter } from 'react-native';
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
    const [vlogPlayerInst, setVlogPlayerInst] = useState<VideoPlayer | undefined>(undefined);

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

    /** Clear the pending note-delete state (cancel or after confirmed delete). */
    const clearNoteToDelete = useCallback(() => {
        setNoteToDelete(null);
    }, []);

    const handleOpenVlogModal = useCallback((vlog: SavedVlog, rect?: LayoutRect, player?: VideoPlayer) => {
        setVlogSourceRect(rect || null);
        setVlogPlayerInst(player || undefined);
        setViewVlogModal(vlog);
    }, []);

    const handleCloseVlogModal = useCallback(() => {
        // Emit event so the originating FeedVideoCard knows the shared player
        // is being returned and must force-remount its VideoView.
        if (viewVlogModal) {
            DeviceEventEmitter.emit('VLOG_MODAL_CLOSED', { vlogId: viewVlogModal.id });
        }
        setViewVlogModal(null);
    }, [viewVlogModal]);

    return {
        viewNoteModal,
        noteToDelete,
        viewVlogModal,
        vlogSourceRect,
        vlogPlayerInst,
        handleOpenNoteModal,
        handleCloseNoteModal,
        handleDeleteNoteModal,
        clearNoteToDelete,
        handleOpenVlogModal,
        handleCloseVlogModal,
    };
}
