import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    FlatList,
    Modal,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Alert,
    Vibration
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { BlurView } from 'expo-blur';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation.types';;
import { commonStyles } from '@/styles/commonStyles';
import { theme } from '@/styles/theme';
import { useStorage } from '@/lib/hooks/useStorage';
import { useSecurity } from '@/lib/hooks/useSecurity';
import { NoteCard } from '@/components/features/library/NoteCard';
import { ExpandablePersonCard } from '@/components/features/library/ExpandablePersonCard';
import { SortOption, SavedNote } from '@/types';;

type Props = {
    navigation: any;
    route: any;
    onGoToStart: () => void;
};

/**
 * LibraryScreen — Two tabs: Notes and Circles.
 *
 * Security stages:
 *   Stage 0 — Default locked: notes blurred, Circles tab shows 🔒 icon
 *   Stage 1 — Circles unlocked: Circles tab accessible (biometric)
 *   Stage 2 — Full unlock: notes readable, delete enabled (biometric via "Unlock View")
 *
 * Note: Stage 2 automatically grants Stage 1 access.
 */
export const LibraryScreen: React.FC<Props> = ({ navigation, route, onGoToStart }) => {
    const [libraryTab, setLibraryTab] = useState<'notes' | 'circles'>('notes');
    const [sortBy, setSortBy] = useState<SortOption>('newest');
    const [viewNoteModal, setViewNoteModal] = useState<SavedNote | null>(null);
    const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
    const [personToDelete, setPersonToDelete] = useState<string | null>(null);
    const [selectedCircleId, setSelectedCircleId] = useState<string | null>(null);

    const storage = useStorage();
    const security = useSecurity();

    useEffect(() => {
        storage.loadAllData();
    }, []);

    /**
     * Handle Circles tab press — requires Stage 1 auth if not yet unlocked.
     * Only switches tab on successful authentication.
     */
    const handleCirclesTabPress = async () => {
        // Already unlocked (either Stage 1 or Stage 2) — just switch tab
        if (security.isCirclesUnlocked || security.isNotesUnlocked) {
            setLibraryTab('circles');
            return;
        }

        // Prompt biometric for Stage 1
        const success = await security.unlockCircles();
        if (success) {
            Vibration.vibrate(50);
            setLibraryTab('circles');
        }
        // On cancel/fail — nothing changes, stay on current tab
    };

    /** Group and sort notes for display */
    const getGroupedNotes = (circleId?: string | null) => {
        let notesToGroup = [...storage.savedNotes];
        if (circleId) {
            notesToGroup = notesToGroup.filter(n => n.personId === circleId);
        } else {
            notesToGroup = notesToGroup.filter(n => !n.personId);
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

    return (
        <View style={commonStyles.libraryContainer}>
            {/* Header row: title + unlock/lock button */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
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
                        <Text style={{ fontSize: 16, marginRight: 4 }}>🔓</Text>
                        <Text style={[commonStyles.iconButtonText, { color: theme.colors.primaryActionText }]}>Unlock View</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        style={[commonStyles.iconButton, { paddingHorizontal: 15, paddingVertical: 10, backgroundColor: theme.colors.glassBackground, borderColor: theme.colors.glassBorder }]}
                        onPress={() => { security.lockAll(); setLibraryTab('notes'); }}
                    >
                        <Text style={{ fontSize: 16, marginRight: 4 }}>🔒</Text>
                        <Text style={[commonStyles.iconButtonText, { color: theme.colors.textPrimary }]}>Lock View</Text>
                    </TouchableOpacity>
                )}
            </View>
            <View style={{ height: 15 }} />

            {/* Tab bar — Circles shows lock icon when not authenticated */}
            <View style={commonStyles.tabBar}>
                <TouchableOpacity style={[commonStyles.tabBtn, libraryTab === 'notes' && commonStyles.tabBtnActive]} onPress={() => setLibraryTab('notes')}>
                    <Text style={[commonStyles.tabBtnText, libraryTab === 'notes' && commonStyles.tabBtnTextActive]}>Notes</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[commonStyles.tabBtn, libraryTab === 'circles' && commonStyles.tabBtnActive]}
                    onPress={handleCirclesTabPress}
                >
                    <Text style={[commonStyles.tabBtnText, libraryTab === 'circles' && commonStyles.tabBtnTextActive]}>
                        {(!security.isCirclesUnlocked && !security.isNotesUnlocked) ? '🔒 ' : ''}Circles
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Tab content */}
            {libraryTab === 'notes' ? (
                <>
                    <View style={commonStyles.sortContainer}>
                        <Text style={commonStyles.sortLabel}>Sort By:</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={commonStyles.sortScroll} contentContainerStyle={{ paddingRight: 40 }}>
                            {(['newest', 'oldest', 'longest', 'shortest', 'longest-text'] as SortOption[]).map(opt => (
                                <TouchableOpacity key={opt} style={[commonStyles.sortBtn, sortBy === opt && commonStyles.sortBtnActive]} onPress={() => setSortBy(opt)}>
                                    <Text style={[commonStyles.sortBtnText, sortBy === opt && commonStyles.sortBtnTextActive]}>
                                        {opt === 'longest-text' ? 'Longest Text' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>

                    {storage.savedNotes.filter(n => !n.personId).length === 0 ? (
                        <Text style={commonStyles.emptyLibrary}>No saved notes yet.</Text>
                    ) : (
                        <FlatList
                            data={getGroupedNotes()}
                            keyExtractor={item => item.title}
                            renderItem={({ item }) => (
                                <View style={commonStyles.groupContainer}>
                                    <Text style={commonStyles.groupTitle}>{item.title}</Text>
                                    {item.data.map(note => (
                                        <NoteCard
                                            key={note.id}
                                            note={note}
                                            onPress={setViewNoteModal}
                                            personName={note.personId ? storage.persons.find(p => p.id === note.personId)?.name : undefined}
                                            isLocked={!security.isNotesUnlocked}
                                        />
                                    ))}
                                </View>
                            )}
                            showsVerticalScrollIndicator={false}
                        />
                    )}
                </>
            ) : (
                <>
                    {storage.persons.length === 0 ? (
                        <Text style={commonStyles.emptyLibrary}>No people in your circles yet.</Text>
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
                <TouchableOpacity style={[commonStyles.backButton, { zIndex: 20 }]} onPress={() => { security.lockAll(); onGoToStart(); }}>
                    <Text style={commonStyles.backButtonText}>Return to Menu</Text>
                </TouchableOpacity>
            )}

            {/* Note View Modal */}
            <Modal visible={!!viewNoteModal} animationType="slide">
                {viewNoteModal && (
                    <View style={commonStyles.modalContainer}>
                        <View style={commonStyles.modalHeader}>
                            <Text style={commonStyles.modalTitle}>{viewNoteModal.dateStr}</Text>
                            <TouchableOpacity style={commonStyles.closeModalButton} onPress={() => setViewNoteModal(null)}>
                                <Text style={commonStyles.closeModalText}>Close</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={commonStyles.modalScroll}>
                            <Text style={commonStyles.modalBody} selectable={true}>{viewNoteModal.text}</Text>
                        </ScrollView>
                        <TouchableOpacity style={[commonStyles.closeModalButton, { backgroundColor: theme.colors.danger, marginTop: 20 }]} onPress={() => setNoteToDelete(viewNoteModal.id)}>
                            <Text style={commonStyles.closeModalText}>Delete Note</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </Modal>

            {/* Delete Note Confirmation */}
            <Modal visible={!!noteToDelete} transparent animationType="fade">
                <View style={commonStyles.modalOverlay}>
                    <View style={commonStyles.versionModalContent}>
                        <Text style={commonStyles.versionModalTitle}>Delete Entry?</Text>
                        <Text style={[commonStyles.addPersonSuggestionText, { textAlign: 'center', marginBottom: 20 }]}>
                            Are you sure you want to permanently delete this writing session? This cannot be undone.
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
