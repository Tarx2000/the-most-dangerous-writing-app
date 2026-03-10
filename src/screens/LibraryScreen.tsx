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
    Alert
} from 'react-native';
import { BlurView } from 'expo-blur';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { commonStyles } from '../styles/commonStyles';
import { theme } from '../styles/theme';
import { useStorage } from '../hooks/useStorage';
import { useSecurity } from '../hooks/useSecurity';
import { NoteCard } from '../components/NoteCard';
import { ExpandablePersonCard } from '../components/ExpandablePersonCard';
import { SortOption, SavedNote } from '../types';

type Props = {
    navigation: any;
    route: any;
    onGoToStart: () => void;
};

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

    // Render the Library
    return (
        <View style={commonStyles.libraryContainer}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <View>
                    <Text style={[commonStyles.libraryTitle, { marginBottom: 0 }]}>Library</Text>
                    <Text style={[commonStyles.librarySubtitle, { marginBottom: 0 }]}>{storage.savedNotes.length} Entries • {storage.persons.length} Circles</Text>
                </View>
                {!security.isNotesUnlocked ? (
                    <TouchableOpacity style={[commonStyles.iconButton, { paddingHorizontal: 15, paddingVertical: 10, backgroundColor: theme.colors.primaryAction, borderColor: theme.colors.primaryAction }]} onPress={() => security.unlockNotes()}>
                        <Text style={{ fontSize: 16, marginRight: 4 }}>🔓</Text>
                        <Text style={[commonStyles.iconButtonText, { color: theme.colors.primaryActionText }]}>Unlock View</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity style={[commonStyles.iconButton, { paddingHorizontal: 15, paddingVertical: 10, backgroundColor: theme.colors.glassBackground, borderColor: theme.colors.glassBorder }]} onPress={() => security.lockInstantly()}>
                        <Text style={{ fontSize: 16, marginRight: 4 }}>🔒</Text>
                        <Text style={[commonStyles.iconButtonText, { color: theme.colors.textPrimary }]}>Lock View</Text>
                    </TouchableOpacity>
                )}
            </View>
            <View style={{ height: 15 }} />

            <View style={commonStyles.tabBar}>
                <TouchableOpacity style={[commonStyles.tabBtn, libraryTab === 'notes' && commonStyles.tabBtnActive]} onPress={() => setLibraryTab('notes')}>
                    <Text style={[commonStyles.tabBtnText, libraryTab === 'notes' && commonStyles.tabBtnTextActive]}>Notes</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[commonStyles.tabBtn, libraryTab === 'circles' && commonStyles.tabBtnActive]} onPress={() => setLibraryTab('circles')}>
                    <Text style={[commonStyles.tabBtnText, libraryTab === 'circles' && commonStyles.tabBtnTextActive]}>Circles</Text>
                </TouchableOpacity>
            </View>

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
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {storage.persons.map(p => (
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
                            ))}
                        </ScrollView>
                    )}
                </>
            )}

            {!security.isNotesUnlocked && (
                <TouchableOpacity style={[commonStyles.backButton, { zIndex: 20 }]} onPress={() => { security.lockInstantly(); onGoToStart(); }}>
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

            {/* Custom Delete Confirmation Modal */}
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

            {/* Custom Person Delete Confirmation Modal */}
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
                                        // If we happen to have this circle actively filtered, clear it.
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

            {/* Lock Modals */}
            <Modal visible={security.showPinEnterModal} transparent animationType="slide">
                <KeyboardAvoidingView style={commonStyles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <View style={[commonStyles.versionModalContent, { alignItems: 'center' }]}>
                        <Text style={commonStyles.versionModalTitle}>Enter PIN</Text>
                        <TextInput
                            style={commonStyles.addPersonInput}
                            keyboardType="number-pad"
                            secureTextEntry
                            maxLength={4}
                            placeholder="****"
                            placeholderTextColor="#333"
                            value={security.tempPinInput}
                            onChangeText={security.setTempPinInput}
                            autoFocus
                        />
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20, width: '100%' }}>
                            <TouchableOpacity style={[commonStyles.closeVersionBtn, { flex: 1, backgroundColor: theme.colors.glassBackground }]} onPress={() => { security.setTempPinInput(''); navigation.goBack(); }}>
                                <Text style={commonStyles.closeVersionBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[commonStyles.closeVersionBtn, { flex: 1, backgroundColor: theme.colors.primaryAction }]}
                                onPress={security.handlePinEnterSubmit}
                            >
                                <Text style={[commonStyles.closeVersionBtnText, { color: theme.colors.primaryActionText }]}>Unlock</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <Modal visible={security.showPinSetupModal} transparent animationType="slide">
                <KeyboardAvoidingView style={commonStyles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <View style={[commonStyles.versionModalContent, { alignItems: 'center' }]}>
                        <Text style={commonStyles.versionModalTitle}>
                            {security.pinSetupStep === 1 ? 'Create 4-Digit PIN' : 'Confirm PIN'}
                        </Text>
                        <TextInput
                            style={commonStyles.addPersonInput}
                            keyboardType="number-pad"
                            secureTextEntry
                            maxLength={4}
                            placeholder="****"
                            placeholderTextColor="#333"
                            value={security.tempPinInput}
                            onChangeText={security.setTempPinInput}
                            autoFocus
                        />
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20, width: '100%' }}>
                            <TouchableOpacity style={[commonStyles.closeVersionBtn, { flex: 1, backgroundColor: theme.colors.glassBackground }]} onPress={() => { security.setTempPinInput(''); navigation.goBack(); }}>
                                <Text style={commonStyles.closeVersionBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[commonStyles.closeVersionBtn, { flex: 1, backgroundColor: theme.colors.primaryAction }]}
                                onPress={security.handlePinSetupSubmit}
                            >
                                <Text style={[commonStyles.closeVersionBtnText, { color: theme.colors.primaryActionText }]}>
                                    {security.pinSetupStep === 1 ? 'Next' : 'Save PIN'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

        </View>
    );
};
