import React, { useState, useEffect, useRef } from 'react';
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
    ImageBackground,
    PanResponder,
    Dimensions
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { commonStyles } from '../styles/commonStyles';
import { CONFIG, APP_VERSION, VERSION_HISTORY } from '../config';
import { CarouselSelector } from '../components/CarouselSelector';
import { SwipeableModal } from '../components/SwipeableModal';
import { CalendarView } from '../components/CalendarView';
import { useStorage } from '../hooks/useStorage';
import { useSecurity } from '../hooks/useSecurity';
import { Person } from '../types';
import * as LocalAuthentication from 'expo-local-authentication';
import { theme } from '../styles/theme';

type Props = {
    navigation: any;
    route: any;
    onGoToLibrary: () => void;
    setHomeScrollEnabled?: (enabled: boolean) => void;
};

export const StartScreen: React.FC<Props> = ({ navigation, onGoToLibrary, setHomeScrollEnabled }) => {
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

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (evt, gestureState) => {
                // Activate on strong left swipe
                return gestureState.dx < -40 && Math.abs(gestureState.dy) < 40;
            },
            onPanResponderRelease: (evt, gestureState) => {
                if (gestureState.dx < -40) {
                    onGoToLibrary();
                }
            }
        })
    ).current;

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
        <View style={commonStyles.startContainer} {...panResponder.panHandlers}>
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
                    <TouchableOpacity onPress={onGoToLibrary} style={commonStyles.iconButton}>
                        <Text style={{ fontSize: 16, marginRight: 4 }}>📚</Text>
                        <Text style={commonStyles.iconButtonText}>Library</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={{ width: '100%', paddingBottom: 20, paddingTop: 10 }}>
                {/* Hero Logo / Title */}
                <View style={[commonStyles.heroContainer, { marginTop: 0, marginBottom: 15 }]}>
                    <Text style={[commonStyles.heroTitle, { fontSize: 24 }]}>The Most <Text style={commonStyles.heroTitleDanger}>Dangerous</Text></Text>
                    <Text style={commonStyles.heroSubtitle}>Don't stop, or all is lost.</Text>
                </View>

                {/* Session Type Grid */}
                <Text style={[commonStyles.sectionTitle, { marginTop: 10, marginBottom: 8 }]}>Session Type</Text>
                <View style={commonStyles.cardsRow}>
                    <TouchableOpacity style={[commonStyles.card, { padding: 15 }, sessionMode === 'journal' && commonStyles.cardActive]} onPress={() => { setSessionMode('journal'); setSelectedPersonId(null); }}>
                        <Text style={[commonStyles.cardTitle, sessionMode === 'journal' && commonStyles.cardTitleActive]}>Journal</Text>
                        <Text style={commonStyles.cardDesc}>Free Writing</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[commonStyles.card, { padding: 15 }, sessionMode === 'circles' && commonStyles.cardActive]} onPress={() => setSessionMode('circles')}>
                        <Text style={[commonStyles.cardTitle, sessionMode === 'circles' && commonStyles.cardTitleActive]}>Circles</Text>
                        <Text style={commonStyles.cardDesc}>For a Person</Text>
                    </TouchableOpacity>
                </View>

                {/* Circle Select (Only if active) */}
                {sessionMode === 'circles' && (
                    <View style={{ paddingHorizontal: 20 }}>
                        <TouchableOpacity style={[commonStyles.personSelectorBtn, { padding: 12, marginTop: 10 }]} onPress={() => setShowPersonSelect(true)}>
                            <Text style={commonStyles.personSelectorLabel}>Writing target</Text>
                            <View style={commonStyles.personSelectorRow}>
                                <Text style={commonStyles.personSelectorName}>
                                    {selectedPersonId ? storage.persons.find(p => p.id === selectedPersonId)?.name : 'Select a Person'}
                                </Text>
                                <Text style={{ color: theme.colors.textMuted, fontSize: 18 }}>▼</Text>
                            </View>
                        </TouchableOpacity>

                        {selectedPersonId && (
                            <TouchableOpacity
                                style={{ marginTop: 10, padding: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center' }}
                                onPress={() => {
                                    navigation.navigate('Writing', {
                                        timeIndex: 0,
                                        diffIndex,
                                        mode: 'circles',
                                        personId: selectedPersonId,
                                        isQuickNote: true
                                    });
                                }}
                            >
                                <Text style={{ color: theme.colors.textPrimary, fontWeight: theme.typography.weightMedium, fontSize: 14 }}>⚡ Quick Note</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </View>

            <View style={{ flex: 1, justifyContent: 'flex-start', paddingTop: 20 }}>
                {/* Center Dial for Time */}
                <Text style={[commonStyles.sectionTitle, { marginTop: 0, textAlign: 'center', marginLeft: 0 }]}>Duration</Text>
                <CarouselSelector
                    label="Goal Timer"
                    data={CONFIG.SESSION_OPTIONS_MINS}
                    selectedIndex={timeIndex}
                    onSelect={setTimeIndex}
                    renderItemText={(item) => <Text style={[commonStyles.carouselValueText, { fontSize: 40 }]}>{item} <Text style={{ fontSize: 20, color: theme.colors.textMuted }}>min</Text></Text>}
                    onInteractionStart={() => setHomeScrollEnabled?.(false)}
                    onInteractionEnd={() => setHomeScrollEnabled?.(true)}
                />
            </View>

            {/* Bottom Docked Anchor */}
            <View style={[commonStyles.bottomDock, { paddingHorizontal: 0, backgroundColor: theme.colors.background }]}>
                {/* Difficulty Grid */}
                <Text style={[commonStyles.sectionTitle, { marginTop: 0, marginBottom: 8 }]}>Difficulty</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 15, gap: 8, paddingBottom: 15, minWidth: '100%', justifyContent: 'center' }}>
                    {CONFIG.DIFFICULTIES.map((diff, i) => (
                        <TouchableOpacity key={i} style={[commonStyles.card, { padding: 10, flex: 1, alignItems: 'center' }, diffIndex === i && commonStyles.cardActive]} onPress={() => setDiffIndex(i)}>
                            <Text style={[commonStyles.cardTitle, { fontSize: 13, textAlign: 'center' }, diffIndex === i && commonStyles.cardTitleActive]}>{diff.label}</Text>
                            <Text style={[commonStyles.cardDesc, { fontSize: 10, textAlign: 'center' }]}>{diff.desc}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
                <View style={{ paddingHorizontal: 20 }}>
                    <TouchableOpacity style={[commonStyles.dockedStartBtn, { paddingVertical: 14 }]} onPress={handleStart}>
                        <Text style={commonStyles.dockedStartBtnText}>Start</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={{ position: 'absolute', bottom: -5, right: 15 }} onPress={() => setShowVersionHistory(true)}>
                        <Text style={[commonStyles.versionText, { fontSize: 10, opacity: 0.5 }]}>{APP_VERSION}</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Modals */}
            <SwipeableModal visible={showCalendar} onClose={() => setShowCalendar(false)} title="Writing Streak Log">
                <CalendarView />
            </SwipeableModal>

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

            <SwipeableModal visible={showSettings} onClose={() => setShowSettings(false)} title="Preferences">
                <ScrollView contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>

                    <View style={{ backgroundColor: theme.colors.glassBackground, borderRadius: theme.borderRadius.md, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: theme.colors.glassBorder }}>
                        <Text style={[commonStyles.settingsLabel, { marginTop: 0, color: theme.colors.textPrimary, fontSize: 16 }]}>Typography Collection</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginBottom: 15 }}>Choose your preferred writing style</Text>
                        <View style={commonStyles.settingsRow}>
                            {CONFIG.FONTS.map((f, i) => (
                                <TouchableOpacity
                                    key={i}
                                    style={[commonStyles.sortBtn, storage.fontIndex === i && commonStyles.sortBtnActive, { marginBottom: 10 }]}
                                    onPress={() => storage.savePreferences(i, storage.sizeIndex)}
                                >
                                    <Text style={[commonStyles.sortBtnText, { fontFamily: f.value }, storage.fontIndex === i && commonStyles.sortBtnTextActive]}>
                                        {f.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View style={{ height: 1, backgroundColor: theme.colors.glassBorder, marginVertical: 20 }} />

                        <Text style={[commonStyles.settingsLabel, { marginTop: 0, color: theme.colors.textPrimary, fontSize: 16 }]}>Reading Size</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginBottom: 15 }}>Adjust the text scale</Text>
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
                    </View>

                    <Text style={[commonStyles.settingsLabel, { marginLeft: 5, color: theme.colors.textPrimary }]}>Live Preview</Text>
                    <View style={commonStyles.previewContainer}>
                        <Text style={[commonStyles.previewText, {
                            fontFamily: CONFIG.FONTS[storage.fontIndex].value,
                            fontSize: CONFIG.SIZES[storage.sizeIndex].value
                        }]}>
                            The quick brown fox jumps over the lazy dog.
                        </Text>
                    </View>

                    <View style={{ backgroundColor: theme.colors.glassBackground, borderRadius: theme.borderRadius.md, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: theme.colors.glassBorder, marginTop: 10 }}>
                        <Text style={[commonStyles.settingsLabel, { marginTop: 0, color: theme.colors.textPrimary, fontSize: 16 }]}>Security & Privacy</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginBottom: 15 }}>Protect your dangerous thoughts</Text>
                        <TouchableOpacity
                            style={[commonStyles.closeVersionBtn, { backgroundColor: theme.colors.glassHighlight, marginTop: 0 }]}
                            onPress={() => { setShowSettings(false); security.changePinWithAuth(() => { }); }}
                        >
                            <Text style={commonStyles.closeVersionBtnText}>Change Security PIN</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SwipeableModal>

            {/* Person Select Modal */}
            <SwipeableModal
                visible={showPersonSelect}
                onClose={() => { setShowPersonSelect(false); setCircleSearch(''); }}
                title="Select Person"
                height={Dimensions.get('window').height * 0.55}
            >
                <TextInput
                    style={commonStyles.circleSearchInput}
                    placeholder="Search by name..."
                    placeholderTextColor={theme.colors.textMuted}
                    value={circleSearch}
                    onChangeText={setCircleSearch}
                />

                <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    {circleSearch.length > 0 ? (
                        <>
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

                            {filteredPersons.length === 0 && !showAddPerson && (
                                <TouchableOpacity style={commonStyles.addPersonSuggestion} onPress={() => { setNewPersonName(circleSearch); setShowAddPerson(true); }}>
                                    <Text style={commonStyles.addPersonSuggestionText}>+ Add "{circleSearch}"</Text>
                                </TouchableOpacity>
                            )}
                        </>
                    ) : (
                        <Text style={{ color: theme.colors.textMuted, textAlign: 'center', marginTop: 20 }}>
                            Start typing to find or create a circle.
                        </Text>
                    )}
                </ScrollView>

                <TouchableOpacity style={[commonStyles.addPersonFloatBtn, { marginTop: 10, marginBottom: 4 }]} onPress={() => setShowAddPerson(true)}>
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
