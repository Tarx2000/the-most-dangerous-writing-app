import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { vibrate } from '@/lib/haptics';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { EmptyLibraryState } from '@/components/features/library/EmptyLibraryState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ActionSheet } from '@/components/ui/ActionSheet';
import { commonStyles } from '@/styles/commonStyles';
import { theme } from '@/styles/theme';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useNotes, usePersons, useVlogs, usePreferences } from '@/lib/hooks/useStorage';
import { CONFIG } from '@/config';
import { useSecurity } from '@/lib/hooks/useSecurity';
import { useAiQueueContext } from '@/lib/hooks/useAiQueueProvider';
import { ExpandablePersonCard } from '@/components/features/library/ExpandablePersonCard';
import { PersonProfileModal } from '@/components/features/library/PersonProfileModal';
import { NoteViewerModal } from '@/components/features/library/NoteViewerModal';
import { VlogCalendarGallery } from '@/components/features/library/VlogCalendarGallery';
import { LibraryNotesList } from '@/components/features/library/LibraryNotesList';
import { FlashList } from '@shopify/flash-list';
import { SortOption, SavedNote, Person, AiJobCategory, isAlignmentReflection as isAlignmentRef } from '@/types';
import { useLibraryNotes } from '@/lib/hooks/useLibraryNotes';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation.types';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { logger } from '@/lib/logger';

type Props = {
    navigation: NativeStackNavigationProp<RootStackParamList>;
    route: { params?: RootStackParamList['Home'] };
    onGoToStart: () => void;
    /** Shared session mode from HomeScreen — drives which content tab is shown */
    sessionMode: 'journal' | 'circles' | 'checkin' | 'vlog';
};

/** Sort options data — feeds into ActionSheet */
const SORT_OPTIONS_DATA = [
    { id: 'newest' as SortOption, label: 'Newest First', icon: 'sort-clock-descending-outline' as const },
    { id: 'oldest' as SortOption, label: 'Oldest First', icon: 'sort-clock-ascending-outline' as const },
    { id: 'longest' as SortOption, label: 'Longest Session', icon: 'timer-sand' as const },
    { id: 'shortest' as SortOption, label: 'Shortest Session', icon: 'timer-sand-empty' as const },
    { id: 'longest-text' as SortOption, label: 'Most Words', icon: 'text-long' as const },
] as const;

const LibraryScreenInner: React.FC<Props> = ({ onGoToStart, sessionMode }) => {
    /**
     * Map shared sessionMode to library tab.
     * 'journal' -> 'notes', 'circles' -> 'circles', 'checkin' -> 'checkins', 'vlog' -> 'vlogs'
     */
    const libraryTab =
        sessionMode === 'journal'
            ? 'notes'
            : sessionMode === 'circles'
              ? 'circles'
              : sessionMode === 'vlog'
                ? 'vlogs'
                : 'checkins';

    const [sortBy, setSortBy] = useState<SortOption>('newest');
    const [showSortModal, setShowSortModal] = useState(false);

    const { fontIndex, lockTimeoutMins } = usePreferences();
    const activeFont = CONFIG.FONTS[fontIndex]?.value || (Platform.OS === 'ios' ? 'System' : 'sans-serif');

    const [viewNoteModal, setViewNoteModal] = useState<SavedNote | null>(null);
    const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
    const [personToDelete, setPersonToDelete] = useState<string | null>(null);
    const [vlogToDelete, setVlogToDelete] = useState<string | null>(null);
    const [selectedCircleId, setSelectedCircleId] = useState<string | null>(null);
    /** Person whose profile modal is currently open */
    const [profilePerson, setProfilePerson] = useState<Person | null>(null);

    const { savedNotes, deleteNote } = useNotes();
    const { persons, deletePerson, updatePerson } = usePersons();
    const { savedVlogs, deleteVlog } = useVlogs();
    const security = useSecurity(lockTimeoutMins);

    /** Central AI Queue — single instance via AiQueueProvider */
    const { queueState, isNoteActive, isNoteQueued, enqueueNote } = useAiQueueContext();

    /* ── Memoized FlashList props to prevent re-create on every render ─ */
    const circlesListContentStyle = useMemo(() => ({ paddingBottom: 120, paddingTop: 16, paddingHorizontal: 20 }), []);

    const circlesExtraData = useMemo(
        () => ({
            selectedCircleId,
            notesLength: savedNotes.length,
            isUnlocked: security.isNotesUnlocked,
        }),
        [selectedCircleId, savedNotes.length, security.isNotesUnlocked],
    );

    /**
     * Precompute notes grouped by person for O(1) lookups.
     * Avoids O(n*m) filtering inside renderPersonItem.
     */
    const notesByPerson = useMemo(() => {
        const map = new Map<string, typeof savedNotes>();
        for (const n of savedNotes) {
            if (n.personId) {
                const arr = map.get(n.personId) || [];
                arr.push(n);
                map.set(n.personId, arr);
            }
        }
        return map;
    }, [savedNotes]);

    /**
     * O(1) person name lookup map.
     * Previously, every NoteCard did `persons.find(p => p.id === note.personId)`.
     * That was O(persons.length) per visible row — with many circles, this adds up.
     */
    const personMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const p of persons) map.set(p.id, p.name);
        return map;
    }, [persons]);

    const sortedPersons = useMemo(() => {
        return [...persons].sort((a, b) => {
            const aCount = notesByPerson.get(a.id)?.length || 0;
            const bCount = notesByPerson.get(b.id)?.length || 0;
            return bCount - aCount;
        });
    }, [persons, notesByPerson]);

    const renderPersonItem = useCallback(
        ({ item: p }: { item: Person }) => (
            <View style={styles.personItemWrapper}>
                <ExpandablePersonCard
                    person={p}
                    notes={notesByPerson.get(p.id) || []}
                    isExpanded={selectedCircleId === p.id}
                    isLocked={!security.isNotesUnlocked}
                    onToggle={() => setSelectedCircleId(selectedCircleId === p.id ? null : p.id)}
                    onNotePress={setViewNoteModal}
                    onProfilePress={() => setProfilePerson(p)}
                    isNoteActive={isNoteActive}
                    isNoteQueued={isNoteQueued}
                />
            </View>
        ),
        [selectedCircleId, security.isNotesUnlocked, isNoteActive, isNoteQueued, notesByPerson],
    );

    const { groupedNotes } = useLibraryNotes(savedNotes, libraryTab, sortBy, selectedCircleId);

    const handleRegenerateAi = useCallback(
        async (note: SavedNote) => {
            vibrate(30);
            const category: AiJobCategory = isAlignmentRef(note) ? 'checkin' : note.personId ? 'circle' : 'journal';
            await enqueueNote(note.id, category);
        },
        [enqueueNote],
    );

    /* ── Stable modal callbacks (prevents child re-renders) ────────── */
    const handleCloseViewNote = useCallback(() => setViewNoteModal(null), []);
    const handleDeleteFromViewer = useCallback((id: string) => {
        setViewNoteModal(null);
        setNoteToDelete(id);
    }, []);
    const handleDeleteFromProfile = useCallback((id: string) => {
        setProfilePerson(null);
        setPersonToDelete(id);
    }, []);
    const handleConfirmDeleteNote = useCallback(() => {
        setNoteToDelete((prev) => {
            if (prev) deleteNote(prev);
            return null;
        });
    }, [deleteNote]);
    const handleConfirmDeletePerson = useCallback(() => {
        setPersonToDelete((prev) => {
            if (prev) {
                deletePerson(prev);
                setSelectedCircleId((current) => (current === prev ? null : current));
            }
            return null;
        });
    }, [deletePerson]);
    const handleRequestDeleteVlog = useCallback((id: string) => {
        logger('info', 'LibraryScreen', `Vlog delete requested: ${id}`);
        setVlogToDelete(id);
    }, []);
    const handleConfirmDeleteVlog = useCallback(() => {
        setVlogToDelete((prev) => {
            if (prev) {
                logger('info', 'LibraryScreen', `Confirming vlog delete: ${prev}`);
                deleteVlog(prev);
            }
            return null;
        });
    }, [deleteVlog]);

    const activeNoteIds = useMemo(() => queueState.jobs.map((j) => j.noteId), [queueState.jobs]);

    return (
        <View style={commonStyles.libraryContainer}>
            {/* Header row */}
            <View style={styles.headerRow}>
                <View>
                    <View style={styles.headerTitleRow}>
                        <Text style={[commonStyles.libraryTitle, { marginBottom: 0 }]}>Library</Text>
                        {/* AI Processing badge — compact indicator */}
                        {queueState.isProcessing && (
                            <View style={styles.aiBadge}>
                                <ActivityIndicator size={10} color={theme.colors.primaryAction} />
                                <Text style={styles.aiBadgeText}>
                                    {queueState.batchProgress
                                        ? `${queueState.batchProgress.current}/${queueState.batchProgress.total}`
                                        : 'AI'}
                                </Text>
                            </View>
                        )}
                    </View>
                    <Text style={[commonStyles.librarySubtitle, { marginBottom: 0 }]}>
                        {savedNotes.length} Entries • {persons.length} Circles
                    </Text>
                </View>
                {!security.isNotesUnlocked ? (
                    <AnimatedScaleButton
                        style={[
                            commonStyles.iconButton,
                            {
                                paddingHorizontal: 15,
                                paddingVertical: 10,
                                backgroundColor: theme.colors.primaryAction,
                                borderColor: theme.colors.primaryAction,
                            },
                        ]}
                        onPress={async () => {
                            const success = await security.unlockNotes();
                            if (success) vibrate(50);
                        }}
                    >
                        <MaterialCommunityIcons
                            name="lock-open-variant"
                            size={16}
                            color={theme.colors.primaryActionText}
                            style={styles.iconMarginRight}
                        />
                        <Text style={[commonStyles.iconButtonText, { color: theme.colors.primaryActionText }]}>
                            Unlock
                        </Text>
                    </AnimatedScaleButton>
                ) : (
                    <AnimatedScaleButton
                        style={[
                            commonStyles.iconButton,
                            {
                                paddingHorizontal: 15,
                                paddingVertical: 10,
                                backgroundColor: theme.colors.glassBackground,
                                borderColor: theme.colors.glassBorder,
                            },
                        ]}
                        onPress={() => {
                            security.lockAll();
                        }}
                    >
                        <MaterialCommunityIcons
                            name="lock"
                            size={16}
                            color={theme.colors.textPrimary}
                            style={styles.iconMarginRight}
                        />
                        <Text style={[commonStyles.iconButtonText, { color: theme.colors.textPrimary }]}>Lock</Text>
                    </AnimatedScaleButton>
                )}
            </View>

            {/* Filter Toggle Action Button (Hidden for Circles/Vlogs view) */}
            {libraryTab !== 'circles' && libraryTab !== 'vlogs' && (
                <View style={styles.filterRow}>
                    <AnimatedScaleButton style={styles.filterDropdownBtn} onPress={() => setShowSortModal(true)}>
                        <MaterialCommunityIcons
                            name="sort"
                            size={18}
                            color={theme.colors.textSecondary}
                            style={styles.iconMarginRight8}
                        />
                        <Text style={styles.filterDropdownText}>
                            Sort by:{' '}
                            <Text style={styles.filterDropdownActive}>
                                {SORT_OPTIONS_DATA.find((o) => o.id === sortBy)?.label}
                            </Text>
                        </Text>
                        <MaterialCommunityIcons
                            name="chevron-down"
                            size={20}
                            color={theme.colors.textSecondary}
                            style={styles.iconMarginLeftAuto}
                        />
                    </AnimatedScaleButton>
                </View>
            )}

            {/* Scrollable Content Area */}
            <View style={{ flex: 1 }}>
                {/* Tab content — Notes & Check-ins */}
                {(libraryTab === 'notes' || libraryTab === 'checkins') && (
                    <LibraryNotesList
                        groupedNotes={groupedNotes}
                        libraryTab={libraryTab}
                        personMap={personMap}
                        isUnlocked={security.isNotesUnlocked}
                        activeNoteIds={activeNoteIds}
                        isProcessing={queueState.isProcessing}
                        isNoteActive={isNoteActive}
                        isNoteQueued={isNoteQueued}
                        activeFont={activeFont}
                        onPressNote={setViewNoteModal}
                        onGoToStart={onGoToStart}
                    />
                )}

                {/* Tab content — Circles */}
                {libraryTab === 'circles' && (
                    <>
                        {!security.isCirclesUnlocked && !security.isNotesUnlocked ? (
                            <View style={styles.circlesLockOverlay}>
                                <View style={styles.circlesLockCard}>
                                    <MaterialCommunityIcons
                                        name="lock-outline"
                                        size={48}
                                        color={theme.colors.primaryAction}
                                        style={styles.iconMarginBottom16}
                                    />
                                    <Text style={styles.circlesLockTitle}>Circles Protected</Text>
                                    <Text style={styles.circlesLockSubtitle}>
                                        Verify your identity to view your circles
                                    </Text>
                                    <AnimatedScaleButton
                                        style={styles.circlesUnlockBtn}
                                        onPress={async () => {
                                            const success = await security.unlockCircles();
                                            if (success) vibrate(50);
                                        }}
                                    >
                                        <MaterialCommunityIcons
                                            name="fingerprint"
                                            size={22}
                                            color={theme.colors.textPrimary}
                                            style={styles.iconMarginRight10}
                                        />
                                        <Text style={styles.circlesUnlockBtnText}>Unlock Circles</Text>
                                    </AnimatedScaleButton>
                                </View>
                            </View>
                        ) : (
                            <>
                                {persons.length === 0 ? (
                                    <EmptyLibraryState
                                        icon="account-group-outline"
                                        title="No circles yet"
                                        description="Create circles to organize your writing sessions by the people who matter most."
                                        actionLabel="Start Writing"
                                        onAction={onGoToStart}
                                    />
                                ) : (
                                    <View style={styles.fullFlexWidth}>
                                        <FlashList
                                            style={{ marginHorizontal: -20 }}
                                            data={sortedPersons}
                                            keyExtractor={(p) => p.id}
                                            estimatedItemSize={80}
                                            getItemLayout={(
                                                _: ArrayLike<Person> | null | undefined,
                                                index: number,
                                            ) => ({
                                                length: 80,
                                                offset: 80 * index,
                                                index,
                                            })}
                                            extraData={circlesExtraData}
                                            renderItem={renderPersonItem}
                                            showsVerticalScrollIndicator={false}
                                            contentContainerStyle={circlesListContentStyle}
                                        />
                                    </View>
                                )}
                            </>
                        )}
                    </>
                )}

                {/* Tab content — Vlogs Calendar Gallery */}
                {libraryTab === 'vlogs' && (
                    <VlogCalendarGallery
                        vlogs={savedVlogs}
                        isLocked={!security.isCirclesUnlocked && !security.isNotesUnlocked}
                        onUnlock={security.unlockCircles}
                        onRequestDeleteVlog={handleRequestDeleteVlog}
                    />
                )}
            </View>

            {/* Sort Action Sheet — unified ActionSheet component */}
            <ActionSheet
                visible={showSortModal}
                title="Sort Library By"
                options={[...SORT_OPTIONS_DATA]}
                activeId={sortBy}
                onSelect={(id) => {
                    setSortBy(id as SortOption);
                    setShowSortModal(false);
                }}
                onClose={() => setShowSortModal(false)}
            />

            {/* Premium Note View — Reusable Modal */}
            <ErrorBoundary>
                <NoteViewerModal
                    note={viewNoteModal}
                    visible={!!viewNoteModal}
                    onClose={handleCloseViewNote}
                    onDelete={handleDeleteFromViewer}
                    isNoteActive={isNoteActive}
                    onRegenerateAi={(note) => handleRegenerateAi(note)}
                />
            </ErrorBoundary>

            {/* Delete Note Confirmation — unified ConfirmDialog */}
            <ErrorBoundary>
                <ConfirmDialog
                    visible={!!noteToDelete}
                    title="Delete Entry?"
                    message="Are you sure you want to permanently delete this session? This cannot be undone."
                    confirmLabel="Delete"
                    cancelLabel="Cancel"
                    icon="delete-outline"
                    cancelIcon="close"
                    destructive
                    onConfirm={handleConfirmDeleteNote}
                    onCancel={() => setNoteToDelete(null)}
                />
            </ErrorBoundary>

            {/* Delete Person Confirmation — unified ConfirmDialog */}
            <ErrorBoundary>
                <ConfirmDialog
                    visible={!!personToDelete}
                    title="Delete Circle?"
                    message="Are you sure you want to delete this Person? This will also permanently delete ALL writing sessions written for them!"
                    confirmLabel="Delete All"
                    cancelLabel="Cancel"
                    icon="delete-alert-outline"
                    cancelIcon="close"
                    destructive
                    onConfirm={handleConfirmDeletePerson}
                    onCancel={() => setPersonToDelete(null)}
                />
            </ErrorBoundary>

            {/* Delete Vlog Confirmation — unified ConfirmDialog */}
            <ErrorBoundary>
                <ConfirmDialog
                    visible={!!vlogToDelete}
                    title="Delete Vlog?"
                    message="This will permanently delete this video. This cannot be undone."
                    confirmLabel="Delete"
                    cancelLabel="Cancel"
                    icon="delete-outline"
                    cancelIcon="close"
                    destructive
                    onConfirm={handleConfirmDeleteVlog}
                    onCancel={() => setVlogToDelete(null)}
                />
            </ErrorBoundary>

            {/* Person Profile Modal */}
            <ErrorBoundary>
                <PersonProfileModal
                    visible={!!profilePerson}
                    onClose={() => setProfilePerson(null)}
                    person={profilePerson}
                    notes={profilePerson ? savedNotes.filter((n) => n.personId === profilePerson.id) : []}
                    isUnlocked={security.isProfileUnlocked || security.isNotesUnlocked}
                    onUnlock={security.unlockProfile}
                    onUpdatePerson={updatePerson}
                    onDeletePerson={handleDeleteFromProfile}
                    onNotePress={setViewNoteModal}
                    isNotesUnlocked={security.isNotesUnlocked}
                    isNoteActive={isNoteActive}
                    isNoteQueued={isNoteQueued}
                />
            </ErrorBoundary>
        </View>
    );
};

const styles = StyleSheet.create({
    /** Compact AI processing badge next to Library title */
    aiBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: theme.colors.dangerTint,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.dangerBorder,
    },
    aiBadgeText: {
        color: theme.colors.primaryAction,
        fontSize: 10,
        fontWeight: '800',
    },
    filterRow: {
        marginBottom: 20,
    },
    filterDropdownBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'transparent',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
    },
    filterDropdownText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
    },
    emptyStateContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 60,
    },

    /* ── Circles Lock Overlay ────────────────────────────────────────── */
    circlesLockOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 30,
    },
    circlesLockCard: {
        backgroundColor: theme.colors.glassBackground,
        borderRadius: 24,
        padding: 40,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        width: '100%',
    },
    circlesLockTitle: {
        color: theme.colors.textPrimary,
        fontSize: 22,
        fontWeight: '900',
        marginBottom: 8,
    },
    circlesLockSubtitle: {
        color: theme.colors.textMuted,
        fontSize: 15,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22,
    },
    circlesUnlockBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.primaryAction,
        paddingVertical: 16,
        paddingHorizontal: 28,
        borderRadius: 100,
        shadowColor: theme.colors.primaryAction,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    circlesUnlockBtnText: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        fontWeight: '800',
    },

    /* ── Extracted inline styles ──────────────────────────────────── */
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    personItemWrapper: {
        marginBottom: 10,
    },
    iconMarginRight: {
        marginRight: 6,
    },
    iconMarginRight8: {
        marginRight: 8,
    },
    iconMarginRight10: {
        marginRight: 10,
    },
    filterDropdownActive: {
        color: theme.colors.textPrimary,
        fontWeight: 'bold',
    },
    iconMarginLeftAuto: {
        marginLeft: 'auto',
    },
    iconMarginBottom16: {
        marginBottom: 16,
    },
    fullFlexWidth: {
        flex: 1,
        width: '100%',
    },
});

/**
 * Memoized export — prevents re-renders from HomeScreen scroll events
 * and useTransition-deferred updates from causing layout thrashing.
 */
export const LibraryScreen = React.memo(LibraryScreenInner);
