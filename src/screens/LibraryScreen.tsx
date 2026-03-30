import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    FlatList,
    Modal,
    StyleSheet,
    Vibration,
    Platform,
    StatusBar,
    Animated,
    PanResponder
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { commonStyles } from '@/styles/commonStyles';
import { theme } from '@/styles/theme';
import { useStorage } from '@/lib/hooks/useStorage';
import { useSecurity } from '@/lib/hooks/useSecurity';
import { NoteCard } from '@/components/features/library/NoteCard';
import { ExpandablePersonCard } from '@/components/features/library/ExpandablePersonCard';
import { SortOption, SavedNote } from '@/types';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

type Props = {
    navigation: any;
    route: any;
    onGoToStart: () => void;
};

const SORT_OPTIONS: { id: SortOption, label: string, icon: any }[] = [
    { id: 'newest', label: 'Newest First', icon: 'sort-clock-descending-outline' },
    { id: 'oldest', label: 'Oldest First', icon: 'sort-clock-ascending-outline' },
    { id: 'longest', label: 'Longest Session', icon: 'timer-sand' },
    { id: 'shortest', label: 'Shortest Session', icon: 'timer-sand-empty' },
    { id: 'longest-text', label: 'Most Words', icon: 'text-long' },
];

export const LibraryScreen: React.FC<Props> = ({ navigation, route, onGoToStart }) => {
    const [libraryTab, setLibraryTab] = useState<'notes' | 'circles' | 'checkins'>('notes');
    const [sortBy, setSortBy] = useState<SortOption>('newest');
    const [showSortModal, setShowSortModal] = useState(false);
    
    const [viewNoteModal, setViewNoteModal] = useState<SavedNote | null>(null);
    const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
    const [personToDelete, setPersonToDelete] = useState<string | null>(null);
    const [selectedCircleId, setSelectedCircleId] = useState<string | null>(null);

    const storage = useStorage();
    const security = useSecurity();

    // Custom PanResponder for Android wipe-to-dismiss on the fullscreen modal
    const panY = useRef(new Animated.Value(0)).current;
    const notePanResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, g) => g.dy > 0, // Only respond to downward swipes
            onPanResponderMove: (_, g) => {
                if (g.dy > 0) panY.setValue(g.dy);
            },
            onPanResponderRelease: (_, g) => {
                if (g.dy > 150 || g.vy > 1.5) {
                    // Swipe down passed threshold - close modal
                    setViewNoteModal(null);
                    setTimeout(() => panY.setValue(0), 300);
                } else {
                    // Snap back
                    Animated.spring(panY, {
                        toValue: 0,
                        useNativeDriver: true,
                        bounciness: 0
                    }).start();
                }
            }
        })
    ).current;

    useEffect(() => {
        storage.loadAllData();
    }, []);

    const handleCirclesTabPress = async () => {
        if (security.isCirclesUnlocked || security.isNotesUnlocked) {
            setLibraryTab('circles');
            return;
        }

        const success = await security.unlockCircles();
        if (success) {
            Vibration.vibrate(50);
            setLibraryTab('circles');
        }
    };

    const getGroupedNotes = (circleId?: string | null) => {
        let notesToGroup = [...storage.savedNotes];
        
        if (libraryTab === 'checkins') {
            notesToGroup = notesToGroup.filter(n => (n as any).isAlignmentReflection);
        } else if (circleId) {
            notesToGroup = notesToGroup.filter(n => n.personId === circleId && !(n as any).isAlignmentReflection);
        } else {
            notesToGroup = notesToGroup.filter(n => !n.personId && !(n as any).isAlignmentReflection);
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

        const groups: { title: string, data: SavedNote[] }[] = [];
        sorted.forEach(note => {
            let groupTitle = '';
            if (sortBy === 'newest' || sortBy === 'oldest') {
                groupTitle = new Date(note.timestamp).toLocaleString('default', { month: 'long', year: 'numeric' });
            } else if (sortBy === 'longest-text') {
                groupTitle = 'By Length (Words)';
            } else {
                groupTitle = `${note.durationMin} Min Sessions`;
            }

            let group = groups.find(g => g.title === groupTitle);
            if (!group) { group = { title: groupTitle, data: [] }; groups.push(group); }
            group.data.push(note);
        });
        return groups;
    };

    const getScoreDetails = (s: number) => {
        if (s <= 2) return { icon: 'emoticon-dead-outline' as const, color: '#ff4d4d' };
        if (s <= 4) return { icon: 'emoticon-confused-outline' as const, color: '#ff9933' };
        if (s === 5) return { icon: 'emoticon-neutral-outline' as const, color: '#ffcc00' };
        if (s <= 7) return { icon: 'emoticon-happy-outline' as const, color: '#a2ff66' };
        if (s <= 9) return { icon: 'emoticon-excited-outline' as const, color: '#66ffcc' };
        return { icon: 'emoticon-cool-outline' as const, color: '#00ccff' };
    };

    return (
        <View style={commonStyles.libraryContainer}>
            {/* Header row */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                <View>
                    <Text style={[commonStyles.libraryTitle, { marginBottom: 0 }]}>Library</Text>
                    <Text style={[commonStyles.librarySubtitle, { marginBottom: 0 }]}>{storage.savedNotes.length} Entries • {storage.persons.length} Circles</Text>
                </View>
                {!security.isNotesUnlocked ? (
                    <TouchableOpacity
                        style={[commonStyles.iconButton, { paddingHorizontal: 15, paddingVertical: 10, backgroundColor: theme.colors.primaryAction, borderColor: theme.colors.primaryAction }]}
                        onPress={async () => {
                            const success = await security.unlockNotes();
                            if (success) Vibration.vibrate(50);
                        }}
                    >
                        <MaterialCommunityIcons name="lock-open-variant" size={16} color={theme.colors.primaryActionText} style={{ marginRight: 6 }} />
                        <Text style={[commonStyles.iconButtonText, { color: theme.colors.primaryActionText }]}>Unlock</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        style={[commonStyles.iconButton, { paddingHorizontal: 15, paddingVertical: 10, backgroundColor: theme.colors.glassBackground, borderColor: theme.colors.glassBorder }]}
                        onPress={() => { security.lockAll(); setLibraryTab('notes'); }}
                    >
                        <MaterialCommunityIcons name="lock" size={16} color={theme.colors.textPrimary} style={{ marginRight: 6 }} />
                        <Text style={[commonStyles.iconButtonText, { color: theme.colors.textPrimary }]}>Lock</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Premium 3-Pill Tab Bar */}
            <View style={styles.premiumTabBar}>
                <TouchableOpacity style={[styles.premiumTabBtn, libraryTab === 'notes' && styles.premiumTabBtnActive]} onPress={() => setLibraryTab('notes')}>
                    <Text style={[styles.premiumTabBtnText, libraryTab === 'notes' && styles.premiumTabBtnTextActive]}>Notes</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.premiumTabBtn, libraryTab === 'circles' && styles.premiumTabBtnActive]} onPress={handleCirclesTabPress}>
                    <Text style={[styles.premiumTabBtnText, libraryTab === 'circles' && styles.premiumTabBtnTextActive]}>
                        {(!security.isCirclesUnlocked && !security.isNotesUnlocked) ? '🔒 ' : ''}Circles
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.premiumTabBtn, libraryTab === 'checkins' && styles.premiumTabBtnActive]} onPress={() => setLibraryTab('checkins')}>
                    <Text style={[styles.premiumTabBtnText, libraryTab === 'checkins' && styles.premiumTabBtnTextActive]}>Check-ins</Text>
                </TouchableOpacity>
            </View>

            {/* Filter Toggle Action Button (Hidden for Circles view where grouping is per person) */}
            {libraryTab !== 'circles' && (
                <View style={styles.filterRow}>
                    <TouchableOpacity style={styles.filterDropdownBtn} onPress={() => setShowSortModal(true)}>
                        <MaterialCommunityIcons name="sort" size={18} color={theme.colors.textSecondary} style={{ marginRight: 8 }} />
                        <Text style={styles.filterDropdownText}>Sort by: <Text style={{ color: theme.colors.textPrimary, fontWeight: 'bold' }}>{SORT_OPTIONS.find(o => o.id === sortBy)?.label}</Text></Text>
                        <MaterialCommunityIcons name="chevron-down" size={20} color={theme.colors.textSecondary} style={{ marginLeft: 'auto' }} />
                    </TouchableOpacity>
                </View>
            )}

            {/* Tab content */}
            {libraryTab === 'notes' || libraryTab === 'checkins' ? (
                <>
                    {storage.savedNotes.filter(n => libraryTab === 'checkins' ? (n as any).isAlignmentReflection : (!n.personId && !(n as any).isAlignmentReflection)).length === 0 ? (
                        <View style={styles.emptyStateContainer}>
                            <MaterialCommunityIcons name={libraryTab === 'checkins' ? "compass-outline" : "notebook-outline"} size={48} color={theme.colors.glassBorder} style={{ marginBottom: 15 }} />
                            <Text style={commonStyles.emptyLibrary}>No {libraryTab === 'checkins' ? 'check-ins' : 'notes'} found.</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={getGroupedNotes()}
                            keyExtractor={item => item.title}
                            renderItem={({ item }) => (
                                <View style={commonStyles.groupContainer}>
                                    <Text style={commonStyles.groupTitle}>{item.title}</Text>
                                    {item.data.map(note => (
                                        <View key={note.id}>
                                            {(note as any).isAlignmentReflection ? (
                                                <TouchableOpacity 
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
                                                </TouchableOpacity>
                                            ) : (
                                                <NoteCard
                                                    note={note}
                                                    onPress={setViewNoteModal}
                                                    personName={note.personId ? storage.persons.find(p => p.id === note.personId)?.name : undefined}
                                                    isLocked={!security.isNotesUnlocked}
                                                />
                                            )}
                                        </View>
                                    ))}
                                </View>
                            )}
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingBottom: 100 }}
                        />
                    )}
                </>
            ) : (
                <>
                    {storage.persons.length === 0 ? (
                        <View style={styles.emptyStateContainer}>
                            <MaterialCommunityIcons name="account-group-outline" size={48} color={theme.colors.glassBorder} style={{ marginBottom: 15 }} />
                            <Text style={commonStyles.emptyLibrary}>No circles yet.</Text>
                        </View>
                    ) : (
                        <View style={{ flex: 1, width: '100%' }}>
                            <FlashList
                                data={storage.persons}
                                keyExtractor={(p) => p.id}
                                extraData={{ 
                                    selectedCircleId, 
                                    notesLength: storage.savedNotes.length,
                                    isUnlocked: security.isNotesUnlocked 
                                }}
                                renderItem={({ item: p }) => (
                                    <View style={{ marginBottom: 10 }}>
                                    <ExpandablePersonCard
                                        key={p.id}
                                        person={p}
                                        notes={storage.savedNotes.filter(n => n.personId === p.id)}
                                        isExpanded={selectedCircleId === p.id}
                                        isLocked={!security.isNotesUnlocked}
                                        onToggle={() => setSelectedCircleId(selectedCircleId === p.id ? null : p.id)}
                                        onNotePress={setViewNoteModal}
                                        onDelete={() => setPersonToDelete(p.id)}
                                        canDelete={security.isNotesUnlocked}
                                    />
                                    </View>
                                )}
                                showsVerticalScrollIndicator={false}
                            />
                        </View>
                    )}
                </>
            )}

            {/* Return to Menu button (when locked) */}
            {!security.isNotesUnlocked && (
                <View style={styles.floatingFooter}>
                    <TouchableOpacity style={styles.returnBtn} onPress={() => { security.lockAll(); onGoToStart(); }}>
                        <Text style={styles.returnBtnText}>Return to Home</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Sort Action Sheet Modal */}
            <Modal visible={showSortModal} transparent animationType="fade">
                <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowSortModal(false)}>
                    <View style={styles.actionSheetContainer}>
                        <View style={styles.actionSheetHeader}>
                            <Text style={styles.actionSheetTitle}>Sort Library By</Text>
                            <TouchableOpacity onPress={() => setShowSortModal(false)}>
                                <MaterialCommunityIcons name="close-circle-outline" size={24} color={theme.colors.textMuted} />
                            </TouchableOpacity>
                        </View>
                        {SORT_OPTIONS.map((opt) => (
                            <TouchableOpacity 
                                key={opt.id} 
                                style={[styles.actionSheetOption, sortBy === opt.id && styles.actionSheetOptionActive]} 
                                onPress={() => { setSortBy(opt.id); setShowSortModal(false); Vibration.vibrate(10); }}
                            >
                                <MaterialCommunityIcons name={opt.icon} size={22} color={sortBy === opt.id ? theme.colors.primaryAction : theme.colors.textSecondary} />
                                <Text style={[styles.actionSheetOptionText, sortBy === opt.id && styles.actionSheetOptionTextActive]}>{opt.label}</Text>
                                {sortBy === opt.id && <MaterialCommunityIcons name="check" size={20} color={theme.colors.primaryAction} style={{ marginLeft: 'auto' }} />}
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Premium Note View Modal */}
            <Modal visible={!!viewNoteModal} animationType="slide" transparent={true} presentationStyle="overFullScreen" onRequestClose={() => setViewNoteModal(null)}>
                {viewNoteModal && (
                    <Animated.View style={[styles.premiumNoteModalContainer, { transform: [{ translateY: panY }] }]}>
                        <LinearGradient colors={['#1e1e1e', '#000000']} style={StyleSheet.absoluteFillObject} />
                        
                        {/* Swipeable Header Zone */}
                        <View {...notePanResponder.panHandlers} style={styles.premiumNoteHeader}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.premiumNoteDate}>{viewNoteModal.dateStr}</Text>
                                <Text style={styles.premiumNoteMeta}>
                                    {viewNoteModal.text.split(/\s+/).filter(Boolean).length} words • {viewNoteModal.durationMin > 0 ? `${viewNoteModal.durationMin} min` : 'Quick Note'}
                                </Text>
                            </View>
                            <TouchableOpacity style={styles.premiumNoteCloseBtn} onPress={() => setViewNoteModal(null)}>
                                <MaterialCommunityIcons name="close" size={24} color="#FFF" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={styles.premiumNoteScroll} showsVerticalScrollIndicator={false}>
                            <Text style={styles.premiumNoteBody} selectable={true}>{viewNoteModal.text}</Text>
                        </ScrollView>

                        <View style={styles.premiumNoteFooter}>
                            <TouchableOpacity style={styles.premiumNoteDeleteBtn} onPress={() => { setViewNoteModal(null); setNoteToDelete(viewNoteModal.id); }}>
                                <MaterialCommunityIcons name="delete-outline" size={20} color={theme.colors.danger} />
                                <Text style={styles.premiumNoteDeleteText}>Delete Entry</Text>
                            </TouchableOpacity>
                        </View>
                    </Animated.View>
                )}
            </Modal>

            {/* Delete Note Confirmation */}
            <Modal visible={!!noteToDelete} transparent animationType="fade">
                <View style={commonStyles.modalOverlay}>
                    <View style={commonStyles.versionModalContent}>
                        <Text style={commonStyles.versionModalTitle}>Delete Entry?</Text>
                        <Text style={[commonStyles.addPersonSuggestionText, { textAlign: 'center', marginBottom: 20 }]}>
                            Are you sure you want to permanently delete this session? This cannot be undone.
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TouchableOpacity style={[commonStyles.closeVersionBtn, { flex: 1, backgroundColor: theme.colors.glassBackground }]} onPress={() => setNoteToDelete(null)}>
                                <Text style={commonStyles.closeVersionBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[commonStyles.closeVersionBtn, { flex: 1, backgroundColor: theme.colors.danger }]} onPress={() => {
                                if (noteToDelete) {
                                    storage.deleteNote(noteToDelete).then(() => {
                                        setNoteToDelete(null);
                                        setViewNoteModal(null);
                                    });
                                }
                            }}>
                                <Text style={commonStyles.closeVersionBtnText}>Delete</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Delete Person Confirmation */}
            <Modal visible={!!personToDelete} transparent animationType="fade">
                <View style={commonStyles.modalOverlay}>
                    <View style={commonStyles.versionModalContent}>
                        <Text style={commonStyles.versionModalTitle}>Delete Circle?</Text>
                        <Text style={[commonStyles.addPersonSuggestionText, { textAlign: 'center', marginBottom: 20 }]}>
                            Are you sure you want to delete this Person? This will also permanently delete ALL writing sessions written for them!
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TouchableOpacity style={[commonStyles.closeVersionBtn, { flex: 1, backgroundColor: theme.colors.glassBackground }]} onPress={() => setPersonToDelete(null)}>
                                <Text style={commonStyles.closeVersionBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[commonStyles.closeVersionBtn, { flex: 1, backgroundColor: theme.colors.danger }]} onPress={() => {
                                if (personToDelete) {
                                    storage.deletePerson(personToDelete).then(() => {
                                        setPersonToDelete(null);
                                        if (selectedCircleId === personToDelete) {
                                            setSelectedCircleId(null);
                                        }
                                    });
                                }
                            }}>
                                <Text style={commonStyles.closeVersionBtnText}>Delete All</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

        </View>
    );
};

const styles = StyleSheet.create({
    premiumTabBar: {
        flexDirection: 'row',
        backgroundColor: theme.colors.glassBackground,
        borderRadius: 100,
        padding: 4,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder
    },
    premiumTabBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 100,
        alignItems: 'center',
        justifyContent: 'center'
    },
    premiumTabBtnActive: {
        backgroundColor: 'rgba(255,255,255,0.1)'
    },
    premiumTabBtnText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        fontWeight: '600'
    },
    premiumTabBtnTextActive: {
        color: '#FFF',
        fontWeight: '800'
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
    floatingFooter: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        padding: 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20,
        backgroundColor: theme.colors.background,
        borderTopWidth: 1,
        borderTopColor: theme.colors.glassBorder
    },
    returnBtn: {
        backgroundColor: theme.colors.glassHighlight,
        padding: 18,
        borderRadius: 100,
        alignItems: 'center'
    },
    returnBtnText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 16
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
    premiumNoteModalContainer: {
        flex: 1,
        paddingTop: Platform.OS === 'ios' ? 40 : 20,
        paddingHorizontal: 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    },
    premiumNoteHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 20,
        marginBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
        zIndex: 10
    },
    premiumNoteDate: {
        color: '#FFF',
        fontSize: 24,
        fontWeight: '900',
        letterSpacing: 0.5,
        marginBottom: 6
    },
    premiumNoteMeta: {
        color: theme.colors.primaryAction,
        fontSize: 14,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1
    },
    premiumNoteCloseBtn: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)'
    },
    premiumNoteScroll: {
        flex: 1,
        zIndex: 10
    },
    premiumNoteBody: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 18,
        lineHeight: 32,
        fontFamily: theme.typography.fontFamily
    },
    premiumNoteFooter: {
        marginTop: 20,
        paddingTop: 20,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        zIndex: 10
    },
    premiumNoteDeleteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 77, 77, 0.1)',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(255, 77, 77, 0.2)'
    },
    premiumNoteDeleteText: {
        color: theme.colors.danger,
        fontWeight: 'bold',
        marginLeft: 8,
        fontSize: 15
    }
});
