import React, { useState, useMemo, useCallback, useEffect, Activity, useRef } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator, useWindowDimensions } from 'react-native';
import { vibrate } from '@/lib/haptics';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import Animated, {
    useAnimatedStyle,
    withTiming,
    Easing,
    useSharedValue,
    withSpring,
    runOnJS,
} from 'react-native-reanimated';

// Customizable layout widths (in pixels) for characters in the morphing Lock/Unlock animation.
// UPPERCASE_L is calibrated to 7.2px to ensure perfect visual spacing (kerning) with the following text.
const ANIM_WIDTHS = {
    UN_PREFIX: 17.5,
    LOWERCASE_L: 4.5,
    UPPERCASE_L: 7.2,
};
import { AnimatedLockIcon } from '@/components/ui/AnimatedLockIcon';
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

const LibraryNotesTab = React.memo(
    ({
        visible,
        sortBy,
        isUnlocked,
        activeFont,
        onPressNote,
        onGoToStart,
    }: {
        visible: boolean;
        sortBy: SortOption;
        isUnlocked: boolean;
        activeFont: string;
        onPressNote: (note: SavedNote) => void;
        onGoToStart: () => void;
    }) => {
        const { savedNotes } = useNotes();
        const { persons } = usePersons();
        const { queueState, isNoteActive, isNoteQueued } = useAiQueueContext();

        const personMap = useMemo(() => {
            const map = new Map<string, string>();
            for (const p of persons) map.set(p.id, p.name);
            return map;
        }, [persons]);

        const { groupedNotes } = useLibraryNotes(savedNotes, 'notes', sortBy, null);
        const activeNoteIds = useMemo(() => queueState.jobs.map((j) => j.noteId), [queueState.jobs]);

        return (
            <Activity mode={visible ? 'visible' : 'hidden'}>
                <View style={{ flex: 1, display: visible ? 'flex' : 'none' }}>
                    <LibraryNotesList
                        groupedNotes={groupedNotes}
                        libraryTab="notes"
                        personMap={personMap}
                        isUnlocked={isUnlocked}
                        activeNoteIds={activeNoteIds}
                        isProcessing={queueState.isProcessing}
                        isNoteActive={isNoteActive}
                        isNoteQueued={isNoteQueued}
                        activeFont={activeFont}
                        onPressNote={onPressNote}
                        onGoToStart={onGoToStart}
                    />
                </View>
            </Activity>
        );
    },
);

const CheckinsTab = React.memo(
    ({
        visible,
        sortBy,
        isUnlocked,
        activeFont,
        onPressNote,
        onGoToStart,
    }: {
        visible: boolean;
        sortBy: SortOption;
        isUnlocked: boolean;
        activeFont: string;
        onPressNote: (note: SavedNote) => void;
        onGoToStart: () => void;
    }) => {
        const { savedNotes } = useNotes();
        const { persons } = usePersons();
        const { queueState, isNoteActive, isNoteQueued } = useAiQueueContext();

        const personMap = useMemo(() => {
            const map = new Map<string, string>();
            for (const p of persons) map.set(p.id, p.name);
            return map;
        }, [persons]);

        const { groupedNotes } = useLibraryNotes(savedNotes, 'checkins', sortBy, null);
        const activeNoteIds = useMemo(() => queueState.jobs.map((j) => j.noteId), [queueState.jobs]);

        return (
            <Activity mode={visible ? 'visible' : 'hidden'}>
                <View style={{ flex: 1, display: visible ? 'flex' : 'none' }}>
                    <LibraryNotesList
                        groupedNotes={groupedNotes}
                        libraryTab="checkins"
                        personMap={personMap}
                        isUnlocked={isUnlocked}
                        activeNoteIds={activeNoteIds}
                        isProcessing={queueState.isProcessing}
                        isNoteActive={isNoteActive}
                        isNoteQueued={isNoteQueued}
                        activeFont={activeFont}
                        onPressNote={onPressNote}
                        onGoToStart={onGoToStart}
                    />
                </View>
            </Activity>
        );
    },
);

const CirclesTab = React.memo(
    ({
        visible,
        onGoToStart,
        isCirclesUnlocked,
        isNotesUnlocked,
        unlockCircles,
        unlockProfile,
        isProfileUnlocked,
        selectedCircleId,
        onToggleCircle,
        onNotePress,
    }: {
        visible: boolean;
        onGoToStart: () => void;
        isCirclesUnlocked: boolean;
        isNotesUnlocked: boolean;
        unlockCircles: () => Promise<boolean>;
        unlockProfile: () => Promise<boolean>;
        isProfileUnlocked: boolean;
        selectedCircleId: string | null;
        onToggleCircle: (id: string | null) => void;
        onNotePress: (note: SavedNote) => void;
    }) => {
        const { persons, deletePerson, updatePerson } = usePersons();
        const { savedNotes } = useNotes();
        const { isNoteActive, isNoteQueued } = useAiQueueContext();

        const [profilePerson, setProfilePerson] = useState<Person | null>(null);
        const [personToDelete, setPersonToDelete] = useState<string | null>(null);

        const circlesListContentStyle = useMemo(
            () => ({ paddingBottom: 120, paddingTop: 16, paddingHorizontal: 20 }),
            [],
        );

        const circlesExtraData = useMemo(
            () => ({
                selectedCircleId,
                notesLength: savedNotes.length,
                isUnlocked: isNotesUnlocked,
            }),
            [selectedCircleId, savedNotes.length, isNotesUnlocked],
        );

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

        const renderPersonItem = useCallback(
            ({ item: p }: { item: Person }) => (
                <View style={styles.personItemWrapper}>
                    <ExpandablePersonCard
                        person={p}
                        notes={notesByPerson.get(p.id) || []}
                        isExpanded={selectedCircleId === p.id}
                        isLocked={!isNotesUnlocked}
                        onToggle={() => onToggleCircle(selectedCircleId === p.id ? null : p.id)}
                        onNotePress={onNotePress}
                        onProfilePress={() => setProfilePerson(p)}
                        isNoteActive={isNoteActive}
                        isNoteQueued={isNoteQueued}
                    />
                </View>
            ),
            [selectedCircleId, isNotesUnlocked, isNoteActive, isNoteQueued, notesByPerson, onToggleCircle, onNotePress],
        );

        const handleDeleteFromProfile = useCallback((id: string) => {
            setProfilePerson(null);
            setPersonToDelete(id);
        }, []);

        const handleConfirmDeletePerson = useCallback(() => {
            setPersonToDelete((prev) => {
                if (prev) {
                    deletePerson(prev);
                    onToggleCircle(null);
                }
                return null;
            });
        }, [deletePerson, onToggleCircle]);

        // Track active locked/unlocked state
        const isLocked = !isCirclesUnlocked && !isNotesUnlocked;
        const { height: SCREEN_HEIGHT } = useWindowDimensions();
        const unlockProgress = useSharedValue(isLocked ? 0 : 1);

        const [isAnimatingUnlock, setIsAnimatingUnlock] = useState(false);
        const [isAnimatingLock, setIsAnimatingLock] = useState(false);

        const prevVisibleRef = useRef(visible);
        const prevIsLockedRef = useRef(isLocked);

        // Render-phase state sync: if the lock status changes, determine if we need to animate.
        // If it was locked/unlocked while the tab was hidden/frozen, we do not animate and set flags false.
        const prevIsLocked = prevIsLockedRef.current;
        if (isLocked !== prevIsLocked) {
            prevIsLockedRef.current = isLocked;
            if (isLocked) {
                setIsAnimatingUnlock(false);
                // Only trigger the slide-in lock animation if the user locked it while actively viewing the tab.
                if (visible && prevVisibleRef.current) {
                    setIsAnimatingLock(true);
                } else {
                    setIsAnimatingLock(false);
                }
            } else {
                setIsAnimatingLock(false);
                // Only trigger the fade-out/slide-up animation if the user unlocked it while actively viewing the tab.
                if (visible && prevVisibleRef.current) {
                    setIsAnimatingUnlock(true);
                } else {
                    setIsAnimatingUnlock(false);
                }
            }
        }

        // Sync SharedValue to lock state changes and manage the unmounting of the lock overlay.
        useEffect(() => {
            if (isAnimatingLock) {
                unlockProgress.value = withSpring(
                    0,
                    {
                        damping: 30,
                        stiffness: 150,
                        mass: 0.8,
                    },
                    (finished) => {
                        if (finished) {
                            runOnJS(setIsAnimatingLock)(false);
                        }
                    },
                );
            } else if (isAnimatingUnlock) {
                unlockProgress.value = withSpring(
                    1,
                    {
                        damping: 30,
                        stiffness: 150,
                        mass: 0.8,
                    },
                    (finished) => {
                        if (finished) {
                            runOnJS(setIsAnimatingUnlock)(false);
                        }
                    },
                );
            } else {
                unlockProgress.value = isLocked ? 0 : 1;
            }

            prevVisibleRef.current = visible;
        }, [isLocked, isAnimatingUnlock, isAnimatingLock, visible, unlockProgress]);

        const isAnimating = isAnimatingLock || isAnimatingUnlock;

        // Content container starts at 0.95 scale and opacity 0, fades + scales to 1
        const contentAnimatedStyle = useAnimatedStyle(() => {
            if (!isAnimating) {
                return {
                    flex: 1,
                    opacity: isLocked ? 0 : 1,
                    transform: [{ scale: isLocked ? 0.95 : 1.0 }],
                };
            }
            return {
                flex: 1,
                opacity: unlockProgress.value,
                transform: [{ scale: 0.95 + 0.05 * unlockProgress.value }],
            };
        });

        // Lock card starts centered, slides up off screen and fades out
        const lockOverlayAnimatedStyle = useAnimatedStyle(() => {
            if (!isAnimating) {
                return {
                    ...StyleSheet.absoluteFillObject,
                    opacity: isLocked ? 1 : 0,
                    transform: [{ translateY: isLocked ? 0 : -SCREEN_HEIGHT }],
                    justifyContent: 'center',
                    alignItems: 'center',
                };
            }
            return {
                ...StyleSheet.absoluteFillObject,
                opacity: 1 - unlockProgress.value,
                transform: [{ translateY: -SCREEN_HEIGHT * unlockProgress.value }],
                justifyContent: 'center',
                alignItems: 'center',
            };
        });

        return (
            <Activity mode={visible ? 'visible' : 'hidden'}>
                <View style={{ flex: 1, display: visible ? 'flex' : 'none' }}>
                    {(!isLocked || isAnimatingUnlock || isAnimatingLock) && (
                        <Animated.View style={contentAnimatedStyle}>
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
                                        extraData={circlesExtraData}
                                        renderItem={renderPersonItem}
                                        showsVerticalScrollIndicator={false}
                                        contentContainerStyle={circlesListContentStyle}
                                    />
                                </View>
                            )}
                        </Animated.View>
                    )}

                    {/* Overlapping animated lock overlay */}
                    {(isLocked || isAnimatingUnlock || isAnimatingLock) && (
                        <Animated.View style={lockOverlayAnimatedStyle} pointerEvents={isLocked ? 'auto' : 'none'}>
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
                                        const success = await unlockCircles();
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
                        </Animated.View>
                    )}

                    {/* Person Profile Modal */}
                    <ErrorBoundary>
                        <PersonProfileModal
                            visible={!!profilePerson}
                            onClose={() => setProfilePerson(null)}
                            person={profilePerson}
                            notes={profilePerson ? savedNotes.filter((n) => n.personId === profilePerson.id) : []}
                            isUnlocked={isProfileUnlocked || isNotesUnlocked}
                            onUnlock={unlockProfile}
                            onUpdatePerson={updatePerson}
                            onDeletePerson={handleDeleteFromProfile}
                            onNotePress={onNotePress}
                            isNotesUnlocked={isNotesUnlocked}
                            isNoteActive={isNoteActive}
                            isNoteQueued={isNoteQueued}
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
                </View>
            </Activity>
        );
    },
);

const VlogsTab = React.memo(
    ({
        visible,
        isUnlocked,
        unlockCircles,
    }: {
        visible: boolean;
        isUnlocked: boolean;
        unlockCircles: () => Promise<boolean>;
    }) => {
        const { savedVlogs, deleteVlog } = useVlogs();
        const [vlogToDelete, setVlogToDelete] = useState<string | null>(null);

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

        return (
            <Activity mode={visible ? 'visible' : 'hidden'}>
                <View style={{ flex: 1, display: visible ? 'flex' : 'none' }}>
                    <VlogCalendarGallery
                        visible={visible}
                        vlogs={savedVlogs}
                        isLocked={!isUnlocked}
                        onUnlock={unlockCircles}
                        onRequestDeleteVlog={handleRequestDeleteVlog}
                    />

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
                </View>
            </Activity>
        );
    },
);

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
    const [selectedCircleId, setSelectedCircleId] = useState<string | null>(null);

    const { savedNotes, deleteNote } = useNotes();
    const { persons } = usePersons();
    const security = useSecurity(lockTimeoutMins);

    // Dynamic styles for the morphing lock/unlock button in the header
    const lockButtonAnimatedStyle = useAnimatedStyle(() => {
        const isUnlocked = security.isNotesUnlocked;
        return {
            backgroundColor: withTiming(isUnlocked ? theme.colors.glassBackground : theme.colors.primaryAction, {
                duration: 250,
                easing: Easing.out(Easing.cubic),
            }),
            borderColor: withTiming(isUnlocked ? theme.colors.glassBorder : theme.colors.primaryAction, {
                duration: 250,
                easing: Easing.out(Easing.cubic),
            }),
        };
    }, [security.isNotesUnlocked]);

    const lockTextAnimatedStyle = useAnimatedStyle(() => {
        const isUnlocked = security.isNotesUnlocked;
        return {
            color: withTiming(isUnlocked ? theme.colors.textPrimary : theme.colors.primaryActionText, {
                duration: 250,
                easing: Easing.out(Easing.cubic),
            }),
        };
    }, [security.isNotesUnlocked]);

    // Shared value for smooth transition of the 'Un' prefix in 'Unlock' to 'Lock'
    const prefixAnim = useSharedValue(security.isNotesUnlocked ? 0 : 1);

    useEffect(() => {
        prefixAnim.value = withTiming(security.isNotesUnlocked ? 0 : 1, {
            duration: 250,
            easing: Easing.out(Easing.cubic),
        });
    }, [security.isNotesUnlocked, prefixAnim]);

    // Animated style to collapse the width and fade the opacity of the 'Un' text prefix
    const unTextWrapperStyle = useAnimatedStyle(() => {
        return {
            width: prefixAnim.value * ANIM_WIDTHS.UN_PREFIX,
            opacity: prefixAnim.value,
        };
    });

    // Animated style for lowercase 'l' (visible when prefixAnim is 1, collapsed when 0)
    const lowercaseLStyle = useAnimatedStyle(() => {
        return {
            width: prefixAnim.value * ANIM_WIDTHS.LOWERCASE_L,
            opacity: prefixAnim.value,
        };
    });

    // Animated style for uppercase 'L' (collapsed when prefixAnim is 1, visible when 0)
    const uppercaseLStyle = useAnimatedStyle(() => {
        return {
            width: (1 - prefixAnim.value) * ANIM_WIDTHS.UPPERCASE_L,
            opacity: 1 - prefixAnim.value,
        };
    });

    /** Central AI Queue — single instance via AiQueueProvider */
    const { queueState, isNoteActive, enqueueNote } = useAiQueueContext();

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
    const handleConfirmDeleteNote = useCallback(() => {
        setNoteToDelete((prev) => {
            if (prev) deleteNote(prev);
            return null;
        });
    }, [deleteNote]);

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
                <AnimatedScaleButton
                    style={[
                        commonStyles.iconButton,
                        {
                            paddingHorizontal: 15,
                            paddingVertical: 10,
                        },
                        lockButtonAnimatedStyle,
                    ]}
                    onPress={async () => {
                        if (security.isNotesUnlocked) {
                            security.lockAll();
                        } else {
                            const success = await security.unlockNotes();
                            if (success) vibrate(50);
                        }
                    }}
                >
                    <AnimatedLockIcon isUnlocked={security.isNotesUnlocked} style={{ marginRight: 6 }} />
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {/* 'Un' prefix wrapper */}
                        <Animated.View style={[unTextWrapperStyle, { overflow: 'hidden', height: 20 }]}>
                            <Animated.Text
                                style={[
                                    commonStyles.iconButtonText,
                                    lockTextAnimatedStyle,
                                    { position: 'absolute', left: 0, width: 30 },
                                ]}
                                numberOfLines={1}
                            >
                                Un
                            </Animated.Text>
                        </Animated.View>

                        {/* Lowercase 'l' wrapper */}
                        <Animated.View style={[lowercaseLStyle, { overflow: 'hidden', height: 20 }]}>
                            <Animated.Text
                                style={[
                                    commonStyles.iconButtonText,
                                    lockTextAnimatedStyle,
                                    { position: 'absolute', left: 0, width: 10 },
                                ]}
                                numberOfLines={1}
                            >
                                l
                            </Animated.Text>
                        </Animated.View>

                        {/* Uppercase 'L' wrapper */}
                        <Animated.View style={[uppercaseLStyle, { overflow: 'hidden', height: 20 }]}>
                            <Animated.Text
                                style={[
                                    commonStyles.iconButtonText,
                                    lockTextAnimatedStyle,
                                    { position: 'absolute', left: 0, width: 15 },
                                ]}
                                numberOfLines={1}
                            >
                                L
                            </Animated.Text>
                        </Animated.View>

                        {/* 'ock' suffix */}
                        <Animated.Text style={[commonStyles.iconButtonText, lockTextAnimatedStyle]}>ock</Animated.Text>
                    </View>
                </AnimatedScaleButton>
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
                <LibraryNotesTab
                    visible={libraryTab === 'notes'}
                    sortBy={sortBy}
                    isUnlocked={security.isNotesUnlocked}
                    activeFont={activeFont}
                    onPressNote={setViewNoteModal}
                    onGoToStart={onGoToStart}
                />
                <CheckinsTab
                    visible={libraryTab === 'checkins'}
                    sortBy={sortBy}
                    isUnlocked={security.isNotesUnlocked}
                    activeFont={activeFont}
                    onPressNote={setViewNoteModal}
                    onGoToStart={onGoToStart}
                />
                <CirclesTab
                    visible={libraryTab === 'circles'}
                    onGoToStart={onGoToStart}
                    isCirclesUnlocked={security.isCirclesUnlocked}
                    isNotesUnlocked={security.isNotesUnlocked}
                    unlockCircles={security.unlockCircles}
                    unlockProfile={security.unlockProfile}
                    isProfileUnlocked={security.isProfileUnlocked}
                    selectedCircleId={selectedCircleId}
                    onToggleCircle={setSelectedCircleId}
                    onNotePress={setViewNoteModal}
                />
                <VlogsTab
                    visible={libraryTab === 'vlogs'}
                    isUnlocked={security.isCirclesUnlocked || security.isNotesUnlocked}
                    unlockCircles={security.unlockCircles}
                />
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
