import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {View,
    Text,
    Pressable,
    ScrollView,
    Modal,
    StyleSheet,
    Platform,
    StatusBar,
    ActivityIndicator,
    DeviceEventEmitter,
import { vibrate } from '@/lib/haptics';
    useWindowDimensions,, vibrate} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { FlashList } from '@shopify/flash-list';
import { BlurView } from 'expo-blur';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { EmptyLibraryState } from '@/components/features/library/EmptyLibraryState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ActionSheet } from '@/components/ui/ActionSheet';
import { commonStyles } from '@/styles/commonStyles';
import { theme } from '@/styles/theme';
import { useNotes, usePersons, useVlogs, usePreferences } from '@/lib/hooks/useStorage';
import { CONFIG } from '@/config';
import { useSecurity } from '@/lib/hooks/useSecurity';
import { useAiQueueContext } from '@/lib/hooks/useAiQueueProvider';
import { NoteCard } from '@/components/features/library/NoteCard';
import { ExpandablePersonCard } from '@/components/features/library/ExpandablePersonCard';
import { PersonProfileModal } from '@/components/features/library/PersonProfileModal';
import { NoteViewerModal } from '@/components/features/library/NoteViewerModal';
import { VlogCalendarGallery } from '@/components/features/library/VlogCalendarGallery';
import { SortOption, SavedNote, Person, AiJobCategory, isAlignmentReflection as isAlignmentRef } from '@/types';
import { getAlignmentScoreDetails } from '@/lib/alignmentScores';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation.types';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { RichText } from '@/components/ui/RichText';

type Props = {
    navigation: NativeStackNavigationProp<RootStackParamList>;
    route: { params?: RootStackParamList['Home'] };
    onGoToStart: () => void;
    /** Shared session mode from HomeScreen — drives which content tab is shown */
    sessionMode: 'journal' | 'circles' | 'checkin' | 'vlog';
};

/** Sort options data — feeds into ActionSheet */
const SORT_OPTIONS_DATA: { id: SortOption, label: string, icon: any }[] = [
    { id: 'newest', label: 'Newest First', icon: 'sort-clock-descending-outline' },
    { id: 'oldest', label: 'Oldest First', icon: 'sort-clock-ascending-outline' },
    { id: 'longest', label: 'Longest Session', icon: 'timer-sand' },
    { id: 'shortest', label: 'Shortest Session', icon: 'timer-sand-empty' },
    { id: 'longest-text', label: 'Most Words', icon: 'text-long' },
];

const LibraryScreenInner: React.FC<Props> = ({ navigation, route, onGoToStart, sessionMode }) => {
    /**
     * Map shared sessionMode to library tab.
     * 'journal' -> 'notes', 'circles' -> 'circles', 'checkin' -> 'checkins', 'vlog' -> 'vlogs'
     */
    const libraryTab = sessionMode === 'journal' ? 'notes' 
                     : sessionMode === 'circles' ? 'circles' 
                     : sessionMode === 'vlog' ? 'vlogs'
                     : 'checkins';

    const [sortBy, setSortBy] = useState<SortOption>('newest');
    const [showSortModal, setShowSortModal] = useState(false);
    
    const { fontIndex, lockTimeoutMins } = usePreferences();
    const activeFont = CONFIG.FONTS[fontIndex]?.value || (Platform.OS === 'ios' ? 'System' : 'sans-serif');
    
    const [viewNoteModal, setViewNoteModal] = useState<SavedNote | null>(null);
    const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
    const [personToDelete, setPersonToDelete] = useState<string | null>(null);
    const [selectedCircleId, setSelectedCircleId] = useState<string | null>(null);
    /** Person whose profile modal is currently open */
    const [profilePerson, setProfilePerson] = useState<Person | null>(null);

    const { savedNotes, deleteNote } = useNotes();
    const { persons, deletePerson, updatePerson } = usePersons();
    const { savedVlogs, deleteVlog } = useVlogs();
    const security = useSecurity(lockTimeoutMins);

    /** Central AI Queue — single instance via AiQueueProvider */
    const { queueState, isNoteActive, isNoteQueued, enqueueNote } = useAiQueueContext();



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

    const sortedPersons = useMemo(() => {
        return [...persons].sort((a, b) => {
            const aCount = notesByPerson.get(a.id)?.length || 0;
            const bCount = notesByPerson.get(b.id)?.length || 0;
            return bCount - aCount;
        });
    }, [persons, notesByPerson]);

    const renderPersonItem = useCallback(({ item: p }: { item: Person }) => (
        <View style={styles.personItemWrapper}>
            <ExpandablePersonCard
                person={p}
                notes={notesByPerson.get(p.id) || []}
                isExpanded={selectedCircleId === p.id}
                isLocked={!security.isNotesUnlocked}
                onToggle={() => setSelectedCircleId(selectedCircleId === p.id ? null : p.id)}
                onNotePress={setViewNoteModal}
                onDelete={() => setPersonToDelete(p.id)}
                onProfilePress={() => setProfilePerson(p)}
                canDelete={security.isNotesUnlocked}
                isNoteActive={isNoteActive}
                isNoteQueued={isNoteQueued}
            />
        </View>
    ), [savedNotes, selectedCircleId, security.isNotesUnlocked, isNoteActive, isNoteQueued]);

    const getFlattenedNotes = useCallback((circleId?: string | null) => {
        let notesToGroup = [...savedNotes];
        
        if (libraryTab === 'checkins') {
            notesToGroup = notesToGroup.filter(n => isAlignmentRef(n));
        } else if (circleId) {
            notesToGroup = notesToGroup.filter(n => n.personId === circleId && !isAlignmentRef(n));
        } else {
            notesToGroup = notesToGroup.filter(n => !n.personId && !isAlignmentRef(n));
        }

        const sorted = notesToGroup.sort((a, b) => {
            switch (sortBy) {
                case 'newest': return b.timestamp - a.timestamp;
                case 'oldest': return a.timestamp - b.timestamp;
                case 'longest': return b.durationMin - a.durationMin;
                case 'shortest': return a.durationMin - b.durationMin;
                case 'longest-text': {
                    const getWordCount = (text: string) => (text || '').split(/\s+/).filter(Boolean).length;
                    return getWordCount(b.text) - getWordCount(a.text);
                }
                default: return b.timestamp - a.timestamp;
            }
        });

        const flatData: (string | SavedNote)[] = [];
        let currentGroup = '';

        sorted.forEach(note => {
            let groupTitle = '';
            if (sortBy === 'newest' || sortBy === 'oldest') {
                groupTitle = new Date(note.timestamp).toLocaleString('default', { month: 'long', year: 'numeric' });
            } else if (sortBy === 'longest-text') {
                groupTitle = 'By Length (Words)';
            } else {
                groupTitle = `${note.durationMin} Min Sessions`;
            }

            if (groupTitle !== currentGroup) {
                flatData.push(groupTitle);
                currentGroup = groupTitle;
            }
            flatData.push(note);
        });

        return flatData;
    }, [savedNotes, libraryTab, sortBy]);

    const getScoreDetails = getAlignmentScoreDetails;

    /**
     * Enqueue a note for AI processing via the central queue.
     * Replaces the old direct generateTitle/generateSummary calls.
     */
    const handleRegenerateAi = useCallback(async (note: SavedNote) => {
        vibrate(30);
        const category: AiJobCategory = isAlignmentRef(note)
            ? 'checkin'
            : note.personId
                ? 'circle'
                : 'journal';
        await enqueueNote(note.id, category);
    }, [enqueueNote]);

    /* ── Stable modal callbacks (prevents child re-renders) ────────── */
    const handleCloseViewNote = useCallback(() => setViewNoteModal(null), []);
    const handleDeleteFromViewer = useCallback((id: string) => {
        setViewNoteModal(null);
        setNoteToDelete(id);
    }, []);
    const handleCloseProfile = useCallback(() => setProfilePerson(null), []);
    const handleDeleteFromProfile = useCallback((id: string) => {
        setProfilePerson(null);
        setPersonToDelete(id);
    }, []);
    const handleConfirmDeleteNote = useCallback(() => {
        setNoteToDelete(prev => {
            if (prev) deleteNote(prev);
            return null;
        });
    }, [deleteNote]);
    const handleConfirmDeletePerson = useCallback(() => {
        setPersonToDelete(prev => {
            if (prev) {
                deletePerson(prev);
                setSelectedCircleId(current => current === prev ? null : current);
            }
            return null;
        });
    }, [deletePerson]);

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
                                        : 'AI'
                                    }
                                </Text>
                            </View>
                        )}
                    </View>
                    <Text style={[commonStyles.librarySubtitle, { marginBottom: 0 }]}>{savedNotes.length} Entries • {persons.length} Circles</Text>
                </View>
                {!security.isNotesUnlocked ? (
                    <AnimatedScaleButton
                        style={[commonStyles.iconButton, { paddingHorizontal: 15, paddingVertical: 10, backgroundColor: theme.colors.primaryAction, borderColor: theme.colors.primaryAction }]}
                        onPress={async () => {
                            const success = await security.unlockNotes();
                            if (success) vibrate(50);
                        }}
                    >
                        <MaterialCommunityIcons name="lock-open-variant" size={16} color={theme.colors.primaryActionText} style={styles.iconMarginRight} />
                        <Text style={[commonStyles.iconButtonText, { color: theme.colors.primaryActionText }]}>Unlock</Text>
                    </AnimatedScaleButton>
                ) : (
                    <AnimatedScaleButton
                        style={[commonStyles.iconButton, { paddingHorizontal: 15, paddingVertical: 10, backgroundColor: theme.colors.glassBackground, borderColor: theme.colors.glassBorder }]}
                        onPress={() => { security.lockAll(); }}
                    >
                        <MaterialCommunityIcons name="lock" size={16} color={theme.colors.textPrimary} style={styles.iconMarginRight} />
                        <Text style={[commonStyles.iconButtonText, { color: theme.colors.textPrimary }]}>Lock</Text>
                    </AnimatedScaleButton>
                )}
            </View>

            {/* Filter Toggle Action Button (Hidden for Circles/Vlogs view) */}
            {libraryTab !== 'circles' && libraryTab !== 'vlogs' && (
                <View style={styles.filterRow}>
                    <AnimatedScaleButton style={styles.filterDropdownBtn} onPress={() => setShowSortModal(true)}>
                        <MaterialCommunityIcons name="sort" size={18} color={theme.colors.textSecondary} style={styles.iconMarginRight8} />
                        <Text style={styles.filterDropdownText}>Sort by: <Text style={styles.filterDropdownActive}>{SORT_OPTIONS_DATA.find(o => o.id === sortBy)?.label}</Text></Text>
                        <MaterialCommunityIcons name="chevron-down" size={20} color={theme.colors.textSecondary} style={styles.iconMarginLeftAuto} />
                    </AnimatedScaleButton>
                </View>
            )}

            {/* Scrollable Content Area with Top & Bottom Fade Dissolve */}
            <View style={{ flex: 1 }}>
                {libraryTab !== 'vlogs' && (
                    <>
                        {/* Dissolve/Fade out mask at the top of the list to prevent the hard line */}
                        <LinearGradient
                            colors={[
                                'rgba(0,0,0, 1)', 
                                'rgba(0,0,0, 0.9)', 
                                'rgba(0,0,0, 0.7)', 
                                'rgba(0,0,0, 0.4)', 
                                'rgba(0,0,0, 0.1)', 
                                'rgba(0,0,0, 0)'
                            ]}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: -20,
                                right: -20,
                                height: 32,
                                zIndex: 10,
                            }}
                            pointerEvents="none"
                        />

                        {/* Dissolve/Fade out mask at the bottom of the list */}
                        <LinearGradient
                            colors={[
                                'rgba(0,0,0, 0)', 
                                'rgba(0,0,0, 0.1)', 
                                'rgba(0,0,0, 0.4)', 
                                'rgba(0,0,0, 0.7)', 
                                'rgba(0,0,0, 0.9)', 
                                'rgba(0,0,0, 1)'
                            ]}
                            style={{
                                position: 'absolute',
                                bottom: 0,
                                left: -20,
                                right: -20,
                                height: 60,
                                zIndex: 10,
                            }}
                            pointerEvents="none"
                        />
                    </>
                )}

                {/* Tab content — Notes & Check-ins */}
                {(libraryTab === 'notes' || libraryTab === 'checkins') && (
                    <>
                        {savedNotes.filter(n => libraryTab === 'checkins' ? isAlignmentRef(n) : (!n.personId && !isAlignmentRef(n))).length === 0 ? (
                            <EmptyLibraryState 
                                icon={libraryTab === 'checkins' ? "compass-outline" : "notebook-outline"}
                                title={libraryTab === 'checkins' ? "No check-ins yet" : "No entries found"}
                                description={libraryTab === 'checkins' ? "Start your weekly alignment check-in to track your progress over time." : "Start writing to build your library of dangerous sessions."}
                                actionLabel="Start Writing"
                                onAction={onGoToStart}
                            />
                        ) : (
                            <FlashList
                                style={{ marginHorizontal: -20 }}
                                data={getFlattenedNotes()}
                                keyExtractor={(item) => typeof item === 'string' ? `header-${item}` : item.id}
                                getItemType={(item) => typeof item === 'string' ? 'header' : 'card'}
                                contentContainerStyle={{ paddingBottom: 120, paddingTop: 12, paddingHorizontal: 20 }}
                                showsVerticalScrollIndicator={false}
                                renderItem={({ item }) => {
                                    if (typeof item === 'string') {
                                        return (
                                            <View style={styles.dateHeader}>
                                                <Text style={commonStyles.groupTitle}>{item}</Text>
                                            </View>
                                        );
                                    }

                                    const note = item as SavedNote;
                                    const _isAlignment = isAlignmentRef(note);

                                    return (
                                        <View>
                                            {_isAlignment ? (
                                                <AnimatedScaleButton 
                                                    style={styles.reflectionCard} 
                                                    onPress={() => setViewNoteModal(note)}
                                                    disabled={!security.isNotesUnlocked}
                                                >
                                                    <LinearGradient colors={[theme.colors.glassSurfaceSubtle, 'transparent']} style={StyleSheet.absoluteFillObject} />
                                                    <View style={styles.reflectionHeader}>
                                                        <View>
                                                            <Text style={styles.reflectionDate}>{note.dateStr}</Text>
                                                            <Text style={styles.reflectionScore}>Score: {isAlignmentRef(note) ? note.alignmentScore : 0}/10</Text>
                                                        </View>
                                                        <MaterialCommunityIcons name={getScoreDetails(isAlignmentRef(note) ? note.alignmentScore : 0).icon} size={36} color={getScoreDetails(isAlignmentRef(note) ? note.alignmentScore : 0).color} />
                                                    </View>
                                                    <Text style={[commonStyles.noteCardPreview, { fontFamily: activeFont }]} numberOfLines={2}>
                                                        {!security.isNotesUnlocked ? '•••• •••••••• •••••' : note.text}
                                                    </Text>
                                                </AnimatedScaleButton>
                                            ) : (
                                                <NoteCard
                                                    note={note}
                                                    onPress={setViewNoteModal}
                                                    personName={note.personId ? persons.find(p => p.id === note.personId)?.name : undefined}
                                                    isLocked={!security.isNotesUnlocked}
                                                    isProcessing={isNoteActive(note.id)}
                                                    isQueued={isNoteQueued(note.id)}
                                                />
                                            )}
                                        </View>
                                    );
                                }}
                            />
                        )}
                    </>
                )}

                {/* Tab content — Circles */}
                {libraryTab === 'circles' && (
                    <>
                        {!security.isCirclesUnlocked && !security.isNotesUnlocked ? (
                            <View style={styles.circlesLockOverlay}>
                                <View style={styles.circlesLockCard}>
                                    <MaterialCommunityIcons name="lock-outline" size={48} color={theme.colors.primaryAction} style={styles.iconMarginBottom16} />
                                    <Text style={styles.circlesLockTitle}>Circles Protected</Text>
                                    <Text style={styles.circlesLockSubtitle}>Verify your identity to view your circles</Text>
                                    <AnimatedScaleButton
                                        style={styles.circlesUnlockBtn}
                                        onPress={async () => {
                                            const success = await security.unlockCircles();
                                            if (success) vibrate(50);
                                        }}
                                    >
                                        <MaterialCommunityIcons name="fingerprint" size={22} color={theme.colors.textPrimary} style={styles.iconMarginRight10} />
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
                                    extraData={{ 
                                        selectedCircleId, 
                                        notesLength: savedNotes.length,
                                        isUnlocked: security.isNotesUnlocked 
                                    }}
                                    renderItem={renderPersonItem}
                                    showsVerticalScrollIndicator={false}
                                    contentContainerStyle={{ paddingBottom: 120, paddingTop: 16, paddingHorizontal: 20 }}
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
                        onDeleteVlog={deleteVlog}
                    />
                )}
            </View>

            {/* Sort Action Sheet — unified ActionSheet component */}
            <ActionSheet
                visible={showSortModal}
                title="Sort Library By"
                options={SORT_OPTIONS_DATA}
                activeId={sortBy}
                onSelect={(id) => { setSortBy(id as SortOption); setShowSortModal(false); }}
                onClose={() => setShowSortModal(false)}
            />

            {/* Premium Note View — Reusable Modal */}
            <NoteViewerModal
                note={viewNoteModal}
                visible={!!viewNoteModal}
                onClose={handleCloseViewNote}
                onDelete={handleDeleteFromViewer}
                isNoteActive={isNoteActive}
                onRegenerateAi={(note) => handleRegenerateAi(note)}
            />

            {/* Delete Note Confirmation — unified ConfirmDialog */}
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

            {/* Delete Person Confirmation — unified ConfirmDialog */}
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

            {/* Person Profile Modal */}
            <PersonProfileModal
                visible={!!profilePerson}
                onClose={() => setProfilePerson(null)}
                person={profilePerson}
                notes={profilePerson ? savedNotes.filter(n => n.personId === profilePerson.id) : []}
                isUnlocked={security.isProfileUnlocked || security.isNotesUnlocked}
                onUnlock={security.unlockProfile}
                onUpdatePerson={updatePerson}
                onDeletePerson={handleDeleteFromProfile}
                onNotePress={setViewNoteModal}
                isNotesUnlocked={security.isNotesUnlocked}
                isNoteActive={isNoteActive}
                isNoteQueued={isNoteQueued}
            />

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
        marginBottom: 20
    },
    filterDropdownBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'transparent',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder
    },
    filterDropdownText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
    },
    emptyStateContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 60
    },
    reflectionCard: {
        backgroundColor: theme.colors.glassSurfaceSubtle,
        padding: 18,
        borderRadius: 16,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: theme.colors.glassSurfaceMedium,
        overflow: 'hidden'
    },
    reflectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12
    },
    reflectionDate: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 4
    },
    reflectionScore: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5
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
    dateHeader: {
        paddingTop: 20,
        paddingBottom: 10,
    },
    flexFill: {
        flex: 1,
        width: '100%',
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
