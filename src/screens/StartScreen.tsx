import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StatusBar,
    TextInput,
    ScrollView,
    Platform,
    Modal,
    KeyboardAvoidingView,
    ImageBackground
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { commonStyles } from '../styles/commonStyles';
import { CONFIG, APP_VERSION, VERSION_HISTORY } from '../config';
import { CarouselSelector } from '../components/CarouselSelector';
import { SwipeableModal } from '../components/SwipeableModal';
import { useStorage } from '../hooks/useStorage';
import { useSecurity } from '../hooks/useSecurity';
import { Person } from '../types';
import * as LocalAuthentication from 'expo-local-authentication';
import { theme } from '../styles/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Start'>;

export const StartScreen: React.FC<Props> = ({ navigation }) => {
    const [timeIndex, setTimeIndex] = useState(1);
    const [diffIndex, setDiffIndex] = useState(1);

    const [sessionMode, setSessionMode] = useState<'journal' | 'circles'>('journal');
    const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

    const [showSettings, setShowSettings] = useState(false);
    const [showCalendar, setShowCalendar] = useState(false);
    const [showVersionHistory, setShowVersionHistory] = useState(false);
    const [showPersonSelect, setShowPersonSelect] = useState(false);

    const [circleSearch, setCircleSearch] = useState('');
    const [showAddPerson, setShowAddPerson] = useState(false);
    const [newPersonName, setNewPersonName] = useState('');

    const storage = useStorage();
    const security = useSecurity();

    useEffect(() => {
        storage.loadAllData();
    }, []);

    const handleStart = () => {
        navigation.navigate('Writing', {
            timeIndex,
            diffIndex,
            mode: sessionMode,
            personId: selectedPersonId
        });
    };

    const filteredPersons = storage.persons.filter(p =>
        p.name.toLowerCase().includes(circleSearch.toLowerCase())
    );

    return (
        <View style={commonStyles.startContainer}>
            <StatusBar barStyle="light-content" backgroundColor="#000000" />

            {/* Premium Header */}
            <View style={commonStyles.topBar}>
                <TouchableOpacity onPress={() => setShowCalendar(true)} style={commonStyles.iconButton}>
                    <Text style={{ color: theme.colors.danger, fontSize: 16 }}>🔥</Text>
                    <Text style={commonStyles.streakText}>{storage.currentStreak}</Text>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity onPress={() => setShowSettings(true)} style={commonStyles.iconButton}>
                        <Text style={commonStyles.iconButtonText}>⚙️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => security.unlockNotes().then(() => navigation.navigate('Library'))} style={commonStyles.iconButton}>
                        <Text style={commonStyles.iconButtonText}>📚 Library</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView style={{ flex: 1, width: '100%' }} contentContainerStyle={{ paddingBottom: 120 }}>
                {/* Hero Logo / Title */}
                <View style={commonStyles.heroContainer}>
                    <Text style={commonStyles.heroTitle}>The Most <Text style={commonStyles.heroTitleDanger}>Dangerous</Text></Text>
                    <Text style={commonStyles.heroSubtitle}>Don't stop, or all is lost.</Text>
                </View>

                {/* Session Type Grid */}
                <Text style={commonStyles.sectionTitle}>Session Type</Text>
                <View style={commonStyles.cardsRow}>
                    <TouchableOpacity style={[commonStyles.card, sessionMode === 'journal' && commonStyles.cardActive]} onPress={() => { setSessionMode('journal'); setSelectedPersonId(null); }}>
                        <Text style={[commonStyles.cardTitle, sessionMode === 'journal' && commonStyles.cardTitleActive]}>Journal</Text>
                        <Text style={commonStyles.cardDesc}>Free Practice</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[commonStyles.card, sessionMode === 'circles' && commonStyles.cardActive]} onPress={() => setSessionMode('circles')}>
                        <Text style={[commonStyles.cardTitle, sessionMode === 'circles' && commonStyles.cardTitleActive]}>Circles</Text>
                        <Text style={commonStyles.cardDesc}>For a Person</Text>
                    </TouchableOpacity>
                </View>

                {/* Circle Select (Only if active) */}
                {sessionMode === 'circles' && (
                    <View style={{ paddingHorizontal: 20, marginTop: 15 }}>
                        <TouchableOpacity style={commonStyles.personSelectorBtn} onPress={() => setShowPersonSelect(true)}>
                            <Text style={commonStyles.personSelectorLabel}>Writing target</Text>
                            <View style={commonStyles.personSelectorRow}>
                                <Text style={commonStyles.personSelectorName}>
                                    {selectedPersonId ? storage.persons.find(p => p.id === selectedPersonId)?.name : 'Select a Person'}
                                </Text>
                                <Text style={{ color: theme.colors.textMuted, fontSize: 18 }}>▼</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Center Dial for Time */}
                <Text style={[commonStyles.sectionTitle, { marginTop: 40, textAlign: 'center', marginLeft: 0 }]}>Duration</Text>
                <CarouselSelector
                    label="Goal Timer"
                    data={CONFIG.SESSION_OPTIONS_MINS}
                    selectedIndex={timeIndex}
                    onSelect={setTimeIndex}
                    renderItemText={(item) => <Text style={commonStyles.carouselValueText}>{item} <Text style={{ fontSize: 24, color: theme.colors.textMuted }}>min</Text></Text>}
                />

                {/* Difficulty Grid */}
                <Text style={commonStyles.sectionTitle}>Difficulty</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 20 }}>
                    {CONFIG.DIFFICULTIES.map((diff, i) => (
                        <TouchableOpacity key={i} style={[commonStyles.card, diffIndex === i && commonStyles.cardActive]} onPress={() => setDiffIndex(i)}>
                            <Text style={[commonStyles.cardTitle, diffIndex === i && commonStyles.cardTitleActive]}>{diff.label}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </ScrollView>

            {/* Bottom Docked Start Button */}
            <View style={commonStyles.bottomDock}>
                <TouchableOpacity style={commonStyles.dockedStartBtn} onPress={handleStart}>
                    <Text style={commonStyles.dockedStartBtnText}>Start</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ position: 'absolute', top: -30, right: 20 }} onPress={() => setShowVersionHistory(true)}>
                    <Text style={commonStyles.versionText}>v{APP_VERSION}</Text>
                </TouchableOpacity>
            </View>

            {/* Modals */}
            <SwipeableModal visible={showVersionHistory} onClose={() => setShowVersionHistory(false)} title="Version History">
                <ScrollView style={{ maxHeight: 400 }}>
                    {VERSION_HISTORY.map((v, i) => (
                        <View key={i} style={commonStyles.versionHistoryBlock}>
                            <Text style={commonStyles.versionHistoryHeader}>{v.version}</Text>
                            {v.changes.map((c, j) => <Text key={j} style={commonStyles.versionHistoryItem}>• {c}</Text>)}
                        </View>
                    ))}
                </ScrollView>
            </SwipeableModal>

            <SwipeableModal visible={showSettings} onClose={() => setShowSettings(false)} title="Settings">
                <View style={{ paddingBottom: 20 }}>
                    <Text style={commonStyles.settingsLabel}>Font Family</Text>
                    <View style={commonStyles.settingsRow}>
                        {CONFIG.FONTS.map((f, i) => (
                            <TouchableOpacity
                                key={i}
                                style={[commonStyles.sortBtn, storage.fontIndex === i && commonStyles.sortBtnActive]}
                                onPress={() => storage.savePreferences(i, storage.sizeIndex)}
                            >
                                <Text style={[commonStyles.sortBtnText, { fontFamily: f.value }, storage.fontIndex === i && commonStyles.sortBtnTextActive]}>
                                    {f.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <Text style={[commonStyles.settingsLabel, { marginTop: 20 }]}>Font Size</Text>
                    <View style={commonStyles.settingsRow}>
                        {CONFIG.SIZES.map((s, i) => (
                            <TouchableOpacity
                                key={i}
                                style={[commonStyles.sortBtn, storage.sizeIndex === i && commonStyles.sortBtnActive]}
                                onPress={() => storage.savePreferences(storage.fontIndex, i)}
                            >
                                <Text style={[commonStyles.sortBtnText, storage.sizeIndex === i && commonStyles.sortBtnTextActive]}>
                                    {s.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View style={commonStyles.previewContainer}>
                        <Text style={[commonStyles.previewText, {
                            fontFamily: CONFIG.FONTS[storage.fontIndex].value,
                            fontSize: CONFIG.SIZES[storage.sizeIndex].value
                        }]}>
                            The quick brown fox jumps over the lazy dog.
                        </Text>
                    </View>

                    <TouchableOpacity
                        style={[commonStyles.closeVersionBtn, { backgroundColor: theme.colors.danger }]}
                        onPress={() => security.changePinWithAuth(() => { })}
                    >
                        <Text style={commonStyles.closeVersionBtnText}>Change Security PIN</Text>
                    </TouchableOpacity>
                </View>
            </SwipeableModal>

            {/* Person Select Modal */}
            <SwipeableModal
                visible={showPersonSelect}
                onClose={() => { setShowPersonSelect(false); setCircleSearch(''); }}
                title="Select Person"
            >
                <TextInput
                    style={commonStyles.circleSearchInput}
                    placeholder="Search by name..."
                    placeholderTextColor={theme.colors.textMuted}
                    value={circleSearch}
                    onChangeText={setCircleSearch}
                />

                <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
                    {filteredPersons.map(p => (
                        <TouchableOpacity
                            key={p.id}
                            style={[commonStyles.personSelectItem, selectedPersonId === p.id && commonStyles.personSelectItemActive]}
                            onPress={() => { setSelectedPersonId(p.id); setShowPersonSelect(false); }}
                        >
                            <View style={commonStyles.personAvatar}>
                                <Text style={commonStyles.personAvatarText}>{p.name.charAt(0)}</Text>
                            </View>
                            <Text style={commonStyles.personSelectName}>{p.name}</Text>
                        </TouchableOpacity>
                    ))}

                    {filteredPersons.length === 0 && circleSearch.length > 0 && !showAddPerson && (
                        <TouchableOpacity style={commonStyles.addPersonSuggestion} onPress={() => { setNewPersonName(circleSearch); setShowAddPerson(true); }}>
                            <Text style={commonStyles.addPersonSuggestionText}>+ Add "{circleSearch}"</Text>
                        </TouchableOpacity>
                    )}
                </ScrollView>

                <TouchableOpacity style={commonStyles.addPersonFloatBtn} onPress={() => setShowAddPerson(true)}>
                    <Text style={commonStyles.addPersonFloatBtnText}>+ Create New Circle</Text>
                </TouchableOpacity>
            </SwipeableModal>

            {/* Add Person Modal */}
            <Modal visible={showAddPerson} transparent animationType="fade">
                <KeyboardAvoidingView style={commonStyles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <View style={commonStyles.versionModalContent}>
                        <Text style={commonStyles.versionModalTitle}>New Circle</Text>
                        <TextInput
                            style={commonStyles.addPersonInput}
                            placeholder="Person's Name"
                            placeholderTextColor={theme.colors.textMuted}
                            value={newPersonName}
                            onChangeText={setNewPersonName}
                            autoFocus
                        />
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                            <TouchableOpacity style={[commonStyles.closeVersionBtn, { flex: 1, backgroundColor: theme.colors.glassBackground }]} onPress={() => setShowAddPerson(false)}>
                                <Text style={commonStyles.closeVersionBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[commonStyles.closeVersionBtn, { flex: 1, backgroundColor: theme.colors.primaryAction }]}
                                onPress={async () => {
                                    if (newPersonName.trim()) {
                                        await storage.addPerson(newPersonName);
                                        setNewPersonName('');
                                        setShowAddPerson(false);
                                        setCircleSearch('');
                                    }
                                }}
                            >
                                <Text style={[commonStyles.closeVersionBtnText, { color: theme.colors.primaryActionText }]}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

        </View>
    );
};
