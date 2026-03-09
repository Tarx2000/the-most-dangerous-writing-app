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
    Platform
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { commonStyles } from '../styles/commonStyles';
import { theme } from '../styles/theme';
import { useStorage } from '../hooks/useStorage';
import { useSecurity } from '../hooks/useSecurity';
import { NoteCard } from '../components/NoteCard';
import { SortOption, SavedNote } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Library'>;

export const LibraryScreen: React.FC<Props> = ({ navigation }) => {
    const [libraryTab, setLibraryTab] = useState<'notes' | 'circles'>('notes');
    const [sortBy, setSortBy] = useState<SortOption>('newest');
    const [viewNoteModal, setViewNoteModal] = useState<SavedNote | null>(null);

    const storage = useStorage();
    const security = useSecurity();

    useEffect(() => {
        storage.loadAllData();
        security.unlockNotes(); // Prompt for unlock on mount component
    }, []);

    const getGroupedNotes = () => {
        const sorted = [...storage.savedNotes].sort((a, b) => {
            switch (sortBy) {
                case 'newest': return b.timestamp - a.timestamp;
                case 'oldest': return a.timestamp - b.timestamp;
                case 'longest': return b.durationMin - a.durationMin;
                case 'shortest': return a.durationMin - b.durationMin;
                default: return b.timestamp - a.timestamp;
            }
        });

        const groups: { title: string, data: SavedNote[] }[] = [];
        sorted.forEach(note => {
            let groupTitle = (sortBy === 'newest' || sortBy === 'oldest')
                ? new Date(note.timestamp).toLocaleString('default', { month: 'long', year: 'numeric' })
                : `${note.durationMin} Min Sessions`;

            let group = groups.find(g => g.title === groupTitle);
            if (!group) { group = { title: groupTitle, data: [] }; groups.push(group); }
            group.data.push(note);
        });
        return groups;
    };

    if (!security.isNotesUnlocked) {
        // Render the Lock Screen / PIN Modal
        return (
            <View style={[commonStyles.startContainer, { justifyContent: 'center' }]}>
                <Text style={[commonStyles.heroTitleDanger, { fontSize: 44, fontWeight: 'bold' }]}>LOCKED</Text>
                <TouchableOpacity style={commonStyles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={commonStyles.backButtonText}>Return</Text>
                </TouchableOpacity>

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
                                <TouchableOpacity style={[commonStyles.closeVersionBtn, { flex: 1, backgroundColor: theme.colors.glassBackground }]} onPress={() => navigation.goBack()}>
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
                                <TouchableOpacity style={[commonStyles.closeVersionBtn, { flex: 1, backgroundColor: theme.colors.glassBackground }]} onPress={() => navigation.goBack()}>
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
    }

    // Render the actual Library
    return (
        <View style={commonStyles.libraryContainer}>
            <Text style={commonStyles.libraryTitle}>Library</Text>
            <Text style={commonStyles.librarySubtitle}>{storage.savedNotes.length} Entries • {storage.persons.length} Circles</Text>

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
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={commonStyles.sortScroll}>
                            {(['newest', 'oldest', 'longest', 'shortest'] as SortOption[]).map(opt => (
                                <TouchableOpacity key={opt} style={[commonStyles.sortBtn, sortBy === opt && commonStyles.sortBtnActive]} onPress={() => setSortBy(opt)}>
                                    <Text style={[commonStyles.sortBtnText, sortBy === opt && commonStyles.sortBtnTextActive]}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>

                    {storage.savedNotes.length === 0 ? (
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
                                        />
                                    ))}
                                </View>
                            )}
                            showsVerticalScrollIndicator={false}
                        />
                    )}
                </>
            ) : (
                <FlatList
                    data={storage.persons}
                    keyExtractor={p => p.id}
                    ListEmptyComponent={<Text style={commonStyles.emptyLibrary}>No people in your circles yet.</Text>}
                    renderItem={({ item: p }) => (
                        <View style={commonStyles.personCard}>
                            <View style={commonStyles.personAvatar}>
                                <Text style={commonStyles.personAvatarText}>{p.name.charAt(0)}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={commonStyles.personCardName}>{p.name}</Text>
                                <Text style={commonStyles.personCardMeta}>
                                    {storage.savedNotes.filter(n => n.personId === p.id).length} Entries
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={{ padding: 10 }}
                                onPress={() => {
                                    // Confirm deletion
                                    if (Platform.OS === 'web') {
                                        if (confirm(`Delete ${p.name}? This will unlink related notes.`)) storage.deletePerson(p.id);
                                    } else {
                                        storage.deletePerson(p.id); // Simple delete for now, or use Alert.alert if available
                                    }
                                }}
                            >
                                <Text style={{ color: theme.colors.danger, fontSize: 18 }}>🗑️</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                />
            )}

            <TouchableOpacity style={commonStyles.backButton} onPress={() => { security.lockInstantly(); navigation.navigate('Start'); }}>
                <Text style={commonStyles.backButtonText}>Lock & Return to Menu</Text>
            </TouchableOpacity>

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
                            <Text style={commonStyles.modalBody}>{viewNoteModal.text}</Text>
                        </ScrollView>
                        <TouchableOpacity style={[commonStyles.closeModalButton, { backgroundColor: theme.colors.danger, marginTop: 20 }]} onPress={() => storage.deleteNote(viewNoteModal.id).then(() => setViewNoteModal(null))}>
                            <Text style={commonStyles.closeModalText}>Delete Note</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </Modal>

        </View>
    );
};
