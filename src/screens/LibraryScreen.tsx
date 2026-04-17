import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    View,
    Text,
    Pressable,
    ScrollView,
    Modal,
    StyleSheet,
    Vibration,
    Platform,
    StatusBar,
    Dimensions,
    ActivityIndicator,
    DeviceEventEmitter,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { FlashList } from '@shopify/flash-list';
import { BlurView } from 'expo-blur';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { EmptyLibraryState } from '@/components/features/library/EmptyLibraryState';
import { commonStyles } from '@/styles/commonStyles';
import { theme } from '@/styles/theme';
import { useNotes, usePersons, useVlogs } from '@/lib/hooks/useStorage';
import { useSecurity } from '@/lib/hooks/useSecurity';
import { useAiQueueContext } from '@/lib/hooks/useAiQueueProvider';
import { NoteCard } from '@/components/features/library/NoteCard';
import { ExpandablePersonCard } from '@/components/features/library/ExpandablePersonCard';
import { PersonProfileModal } from '@/components/features/library/PersonProfileModal';
import { NoteViewerModal } from '@/components/features/library/NoteViewerModal';
import { VlogCalendarGallery } from '@/components/features/library/VlogCalendarGallery';
import { SortOption, SavedNote, Person, AiJobCategory, isAlignmentReflection as isAlignmentRef } from '@/types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation.types';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { RichText } from '@/components/ui/RichText';

/** Static fallback for StyleSheet defaults — dynamic dimensions come from useWindowDimensions */
const { height: DEFAULT_HEIGHT } = Dimensions.get('window');

type Props = {
    navigation: NativeStackNavigationProp<RootStackParamList>;
    route: { params?: RootStackParamList['Home'] };
    onGoToStart: () => void;
    /** Shared session mode from HomeScreen — drives which content tab is shown */
    sessionMode: 'journal' | 'circles' | 'checkin' | 'vlog';
};

const SORT_OPTIONS: { id: SortOption, label: string, icon: any }[] = [
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
    
    const [viewNoteModal, setViewNoteModal] = useState<SavedNote | null>(null);
    const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
    const [personToDelete, setPersonToDelete] = useState<string | null>(null);
    const [selectedCircleId, setSelectedCircleId] = useState<string | null>(null);
    /** Person whose profile modal is currently open */
    const [profilePerson, setProfilePerson] = useState<Person | null>(null);

    const { savedNotes, deleteNote } = useNotes();
    const { persons, deletePerson, updatePerson } = usePersons();
    const { savedVlogs, deleteVlog } = useVlogs();
    const security = useSecurity();

    /** Central AI Queue — single instance via AiQueueProvider */
    const { queueState, isNoteActive, isNoteQueued, enqueueNote } = useAiQueueContext();

    // Custom GestureDetector for wipe-to-dismiss on the fullscreen modal
    const panY = useSharedValue(0);

    const notePanGesture = useMemo(() => 
        Gesture.Pan()
            .activeOffsetY([-10, 10])
            .onUpdate((event) => {
                if (event.translationY > 0) {
                    panY.value = event.translationY;
                }
            })
            .onEnd((event) => {
                if (event.translationY > 150 || event.velocityY > 1500) {
                    runOnJS(setViewNoteModal)(null);
                    panY.value = withTiming(0, { duration: 300 });
                } else {
                    panY.value = withSpring(0, { damping: 15, stiffness: 150 });
                }
            })
    , [panY, setViewNoteModal]);

    const animatedCardStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: panY.value }]
    }));

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

    /** Pure function — score to icon/color mapping. Memoized to avoid recreation. */
    const getScoreDetails = useCallback((s: number) => {
        if (s <= 2) return { icon: 'emoticon-dead-outline' as const, color: '#ff4d4d' };
        if (s <= 4) return { icon: 'emoticon-confused-outline' as const, color: '#ff9933' };
        if (s === 5) return { icon: 'emoticon-neutral-outline' as const, color: '#ffcc00' };
        if (s <= 7) return { icon: 'emoticon-happy-outline' as const, color: '#a2ff66' };
        if (s <= 9) return { icon: 'emoticon-excited-outline' as const, color: '#66ffcc' };
        return { icon: 'emoticon-cool-outline' as const, color: '#00ccff' };
    }, []);

    /**
     * Enqueue a note for AI processing via the central queue.
     * Replaces the old direct generateTitle/generateSummary calls.
     */
    const handleRegenerateAi = useCallback(async (note: SavedNote) => {
        Vibration.vibrate(30);
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
                            if (success) Vibration.vibrate(50);
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
                        <Text style={styles.filterDropdownText}>Sort by: <Text style={styles.filterDropdownActive}>{SORT_OPTIONS.find(o => o.id === sortBy)?.label}</Text></Text>
                        <MaterialCommunityIcons name="chevron-down" size={20} color={theme.colors.textSecondary} style={styles.iconMarginLeftAuto} />
                    </AnimatedScaleButton>
                </View>
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
                            data={getFlattenedNotes()}
                            keyExtractor={(item) => typeof item === 'string' ? `header-${item}` : item.id}
                            getItemType={(item) => typeof item === 'string' ? 'header' : 'card'}
                            contentContainerStyle={{ paddingBottom: 120 }}
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
                                                <LinearGradient colors={['rgba(255,255,255,0.03)', 'transparent']} style={StyleSheet.absoluteFillObject} />
                                                <View style={styles.reflectionHeader}>
                                                    <View>
                                                        <Text style={styles.reflectionDate}>{note.dateStr}</Text>
                                                        <Text style={styles.reflectionScore}>Score: {(note as any).alignmentScore}/10</Text>
                                                    </View>
                                                    <MaterialCommunityIcons name={getScoreDetails((note as any).alignmentScore).icon} size={36} color={getScoreDetails((note as any).alignmentScore).color} />
                                                </View>
                                                <Text style={commonStyles.noteCardPreview} numberOfLines={2}>
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
                                        if (success) Vibration.vibrate(50);
                                    }}
                                >
                                    <MaterialCommunityIcons name="fingerprint" size={22} color="#FFF" style={styles.iconMarginRight10} />
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
                                data={sortedPersons}
                                keyExtractor={(p) => p.id}
                                extraData={{ 
                                    selectedCircleId, 
                                    notesLength: savedNotes.length,
                                    isUnlocked: security.isNotesUnlocked 
                                }}
                                renderItem={renderPersonItem}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={{ paddingBottom: 120 }}
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

            {/* Sort Action Sheet Modal */}
            <Modal visible={showSortModal} transparent animationType="fade">
                <View style={styles.modalBackdrop}>
                    {/* Backdrop dismiss — sits behind content, doesn't intercept child presses */}
                    <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowSortModal(false)} />
                    <View style={styles.actionSheetContainer}>
                        <View style={styles.actionSheetHeader}>
                            <Text style={styles.actionSheetTitle}>Sort Library By</Text>
                            <AnimatedScaleButton onPress={() => setShowSortModal(false)}>
                                <MaterialCommunityIcons name="close-circle-outline" size={24} color={theme.colors.textMuted} />
                            </AnimatedScaleButton>
                        </View>
                        {SORT_OPTIONS.map((opt) => (
                            <AnimatedScaleButton 
                                key={opt.id} 
                                style={[styles.actionSheetOption, sortBy === opt.id && styles.actionSheetOptionActive]} 
                                onPress={() => { setSortBy(opt.id); setShowSortModal(false); Vibration.vibrate(10); }}
                            >
                                <MaterialCommunityIcons name={opt.icon} size={22} color={sortBy === opt.id ? theme.colors.primaryAction : theme.colors.textSecondary} />
                                <Text style={[styles.actionSheetOptionText, sortBy === opt.id && styles.actionSheetOptionTextActive]}>{opt.label}</Text>
                                {sortBy === opt.id && <MaterialCommunityIcons name="check" size={20} color={theme.colors.primaryAction} style={styles.iconMarginLeftAuto} />}
                            </AnimatedScaleButton>
                        ))}
                    </View>
                </View>
            </Modal>

            {/* Premium Note View — Reusable Modal */}
            <NoteViewerModal
                note={viewNoteModal}
                visible={!!viewNoteModal}
                onClose={handleCloseViewNote}
                onDelete={handleDeleteFromViewer}
                isNoteActive={isNoteActive}
                onRegenerateAi={(note) => handleRegenerateAi(note)}
            />

            {/* Delete Note Confirmation */}
            <Modal visible={!!noteToDelete} transparent animationType="fade">
                <View style={commonStyles.modalOverlay}>
                    <View style={commonStyles.versionModalContent}>
                        <Text style={commonStyles.versionModalTitle}>Delete Entry?</Text>
                        <Text style={[commonStyles.addPersonSuggestionText, { textAlign: 'center', marginBottom: 20 }]}>
                            Are you sure you want to permanently delete this session? This cannot be undone.
                        </Text>
                        <View style={styles.confirmRow}>
                            <AnimatedScaleButton style={[commonStyles.closeVersionBtn, styles.cancelBtn]} onPress={() => setNoteToDelete(null)}>
                                <MaterialCommunityIcons name="close" size={18} color={theme.colors.textPrimary} />
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </AnimatedScaleButton>
                            <AnimatedScaleButton style={[commonStyles.closeVersionBtn, styles.deleteBtn]} onPress={handleConfirmDeleteNote}>
                                <MaterialCommunityIcons name="delete-outline" size={18} color="#FFF" />
                                <Text style={styles.deleteBtnText}>Delete</Text>
                            </AnimatedScaleButton>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Delete Person Confirmation */}
            <Modal visible={!!personToDelete} transparent animationType="fade">
                <View style={commonStyles.modalOverlay}>
                    <View style={commonStyles.versionModalContent}>
                        <Text style={commonStyles.versionModalTitle}>Delete Circle?</Text>
                        <Text style={styles.confirmText}>
                            Are you sure you want to delete this Person? This will also permanently delete ALL writing sessions written for them!
                        </Text>
                        <View style={styles.modalBtnRow}>
                            <AnimatedScaleButton style={[commonStyles.closeVersionBtn, styles.cancelBtnGlass]} onPress={() => setPersonToDelete(null)}>
                                <MaterialCommunityIcons name="close" size={18} color={theme.colors.textPrimary} />
                                <Text style={styles.modalBtnTextPrimary}>Cancel</Text>
                            </AnimatedScaleButton>
                            <AnimatedScaleButton style={[commonStyles.closeVersionBtn, styles.cancelBtnDanger]} onPress={handleConfirmDeletePerson}>
                                <MaterialCommunityIcons name="delete-alert-outline" size={18} color="#FFF" />
                                <Text style={styles.modalBtnTextWhite}>Delete All</Text>
                            </AnimatedScaleButton>
                        </View>
                    </View>
                </View>
            </Modal>

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
        borderColor: 'rgba(255,255,255,0.1)'
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
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        padding: 18,
        borderRadius: 16,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        overflow: 'hidden'
    },
    reflectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12
    },
    reflectionDate: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 4
    },
    reflectionScore: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 13,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5
    },

    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end'
    },
    actionSheetContainer: {
        backgroundColor: '#1E1E1E',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 25,
        paddingBottom: Platform.OS === 'ios' ? 50 : 30
    },
    actionSheetHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20
    },
    actionSheetTitle: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold'
    },
    actionSheetOption: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)'
    },
    actionSheetOptionActive: {
        backgroundColor: 'rgba(255,255,255,0.02)'
    },
    actionSheetOptionText: {
        color: theme.colors.textSecondary,
        fontSize: 16,
        marginLeft: 15,
        fontWeight: '500'
    },
    actionSheetOptionTextActive: {
        color: theme.colors.primaryAction,
        fontWeight: 'bold'
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
        color: '#FFF',
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
        color: '#FFF',
        fontSize: 16,
        fontWeight: '800',
    },

    /* ── Card Popup (Liquid Glass Note Viewer) ────────────────────── */
    cardPopupBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    cardPopupContainer: {
        width: '100%',
        height: DEFAULT_HEIGHT * 0.88,
        borderRadius: 28,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.5,
        shadowRadius: 30,
        elevation: 25,
    },
    cardPopupTint: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: theme.colors.surfaceMedium,
    },
    cardPopupHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        alignSelf: 'center',
        marginTop: 12,
        marginBottom: 8,
    },
    cardPopupHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    cardPopupScroll: {
        paddingHorizontal: 24,
        paddingTop: 16,
        flex: 1,
    },

    /* ── Note Content Styles ──────────────────────────────────────── */
    premiumNoteDate: {
        color: '#FFF',
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: 0.3,
        marginBottom: 4
    },
    premiumNoteMeta: {
        color: theme.colors.primaryAction,
        fontSize: 13,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.8
    },
    premiumNoteCloseBtn: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        width: 38,
        height: 38,
        borderRadius: 19,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)'
    },
    premiumNoteBody: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 17,
        lineHeight: 30,
        fontFamily: theme.typography.fontFamily,
        paddingBottom: 20,
    },
    premiumNoteFooter: {
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
        alignItems: 'center',
    },
    premiumNoteDeleteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 77, 77, 0.08)',
        paddingVertical: 10,
        paddingHorizontal: 18,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(255, 77, 77, 0.15)'
    },
    premiumNoteDeleteText: {
        color: theme.colors.danger,
        fontWeight: 'bold',
        marginLeft: 8,
        fontSize: 14
    },

    /* ── AI Title in Note Viewer ──────────────────────────────────── */
    premiumNoteAiTitle: {
        color: '#FFF',
        fontSize: 22,
        fontWeight: '900',
        lineHeight: 28,
        marginBottom: 6,
        letterSpacing: -0.3,
    },

    /* ── AI Summary Card ─────────────────────────────────────────── */
    aiSummaryCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderRadius: 18,
        padding: 16,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    aiSummaryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    aiSummaryHeaderText: {
        color: theme.colors.primaryAction,
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    aiSummaryBulletRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        marginBottom: 6,
    },
    aiSummaryBulletDot: {
        color: theme.colors.primaryAction,
        fontSize: 16,
        fontWeight: 'bold',
        lineHeight: 22,
    },
    aiSummaryBulletText: {
        color: 'rgba(255, 255, 255, 0.85)',
        fontSize: 14,
        lineHeight: 22,
        flex: 1,
    },

    /* ── Regenerate AI Button ─────────────────────────────────────── */
    regenerateBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: theme.colors.dangerSubtle,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.dangerBorderLight,
        marginBottom: 16,
    },
    regenerateBtnText: {
        color: theme.colors.primaryAction,
        fontSize: 13,
        fontWeight: '700',
    },
    /** Small icon-only regenerate button for the footer (when AI data already exists) */
    regenerateSmallBtn: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
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
    confirmText: {
        textAlign: 'center',
        marginBottom: 20,
        color: 'rgba(255,255,255,0.7)',
        fontSize: 16,
        lineHeight: 22,
    },
    modalBtnRow: {
        flexDirection: 'row',
        gap: 10,
    },
    fullFlexWidth: {
        flex: 1,
        width: '100%',
    },
    confirmRow: {
        flexDirection: 'row',
        gap: 10,
    },
    cancelBtn: {
        flex: 1,
        backgroundColor: theme.colors.glassBackground,
        marginTop: 0,
    },
    deleteBtn: {
        flex: 1,
        backgroundColor: theme.colors.danger,
        marginTop: 0,
    },
    cancelBtnGlass: {
        flex: 1,
        backgroundColor: theme.colors.glassBackground,
        marginTop: 0,
    },
    cancelBtnDanger: {
        flex: 1,
        backgroundColor: theme.colors.danger,
        marginTop: 0,
    },
    cancelBtnText: {
        color: theme.colors.textPrimary,
        fontWeight: 'bold',
        fontSize: 15,
    },
    deleteBtnText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 15,
    },
    modalBtnTextPrimary: {
        color: theme.colors.textPrimary,
        fontWeight: 'bold',
        fontSize: 15,
    },
    modalBtnTextWhite: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 15,
    },
});

/**
 * Memoized export — prevents re-renders from HomeScreen scroll events
 * and useTransition-deferred updates from causing layout thrashing.
 */
export const LibraryScreen = React.memo(LibraryScreenInner);
