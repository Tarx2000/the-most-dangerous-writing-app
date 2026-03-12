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
    Dimensions,
    Vibration
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation.types';;
import { commonStyles } from '@/styles/commonStyles';
import { CONFIG, APP_VERSION, VERSION_HISTORY } from '@/config';
import { CarouselSelector } from '@/components/ui/CarouselSelector';
import { SwipeableModal } from '@/components/ui/SwipeableModal';
import { CalendarView } from '@/components/features/library/CalendarView';
import { StreakPopup } from '@/components/features/writing/StreakPopup';
import { TickDial } from '@/components/ui/TickDial';
import { useStorage } from '@/lib/hooks/useStorage';
import { useSecurity } from '@/lib/hooks/useSecurity';
import { Person } from '@/types';;
import * as LocalAuthentication from 'expo-local-authentication';
import { theme } from '@/styles/theme';

type Props = {
    navigation: any;
    route: any;
    onGoToLibrary: () => void;
    setHomeScrollEnabled?: (enabled: boolean) => void;
};

export const StartScreen: React.FC<Props> = ({ navigation, route, onGoToLibrary, setHomeScrollEnabled }) => {
    const [timeIndex, setTimeIndex] = useState(1);
    const [diffIndex, setDiffIndex] = useState(1);

    const [sessionMode, setSessionMode] = useState<'journal' | 'circles'>('journal');
    const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

    const [showSettings, setShowSettings] = useState(false);
    const [showCalendar, setShowCalendar] = useState(false);
    const [showVersionHistory, setShowVersionHistory] = useState(false);
    const [showPersonSelect, setShowPersonSelect] = useState(false);
    const [showStreakPopup, setShowStreakPopup] = useState(false);
    const [newStreakParam, setNewStreakParam] = useState(0);
    const [devModeUnlocked, setDevModeUnlocked] = useState(false);
    /** Toast message for dev mode unlock feedback */
    const [devToast, setDevToast] = useState<string | null>(null);

    /** Ref for the 5-second long-press timer on the settings button */
    const settingsLongPressTimer = useRef<NodeJS.Timeout | null>(null);

    const [circleSearch, setCircleSearch] = useState('');
    const [showAddPerson, setShowAddPerson] = useState(false);
    const [newPersonName, setNewPersonName] = useState('');

    const isModalOpen = showSettings || showCalendar || showVersionHistory || showPersonSelect || showStreakPopup;
    const isModalOpenRef = useRef(isModalOpen);
    isModalOpenRef.current = isModalOpen;

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (evt, gestureState) => {
                // Activate on strong left swipe ONLY when no modals are open
                if (isModalOpenRef.current) return false;
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

    useEffect(() => {
        if (route.params?.streakIncreased) {
            setNewStreakParam(route.params.newStreak || storage.currentStreak + 1);
            setShowStreakPopup(true);
            navigation.setParams({ streakIncreased: undefined, newStreak: undefined });
        }
    }, [route.params?.streakIncreased]);

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

    const activeFont = CONFIG.FONTS[storage.fontIndex]?.value || (Platform.OS === 'ios' ? 'System' : 'sans-serif');
    const activeSize = CONFIG.SIZES[storage.sizeIndex]?.value || 18;

    return (
        <View style={commonStyles.startContainer} {...panResponder.panHandlers}>
            <StatusBar barStyle="light-content" backgroundColor="#000000" />

            {/* Dev Mode Toast Notification */}
            {devToast && (
                <View style={{
                    position: 'absolute', top: 50, alignSelf: 'center', zIndex: 9999,
                    backgroundColor: '#1A1A1A', paddingHorizontal: 20, paddingVertical: 12,
                    borderRadius: 25, borderWidth: 1, borderColor: 'rgba(255, 215, 0, 0.3)',
                }}>
                    <Text style={{ color: '#FFD700', fontSize: 14, fontWeight: '600' }}>{devToast}</Text>
                </View>
            )}

            {/* Premium Header */}
            <View style={commonStyles.topBar}>
                <TouchableOpacity onPress={() => setShowCalendar(true)} style={commonStyles.iconButton}>
                    <Text style={{ color: theme.colors.danger, fontSize: 16 }}>🔥</Text>
                    <Text style={commonStyles.streakText}>{storage.currentStreak}</Text>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                        onPress={() => setShowSettings(true)}
                        onPressIn={() => {
                            // Start 5s timer to unlock dev tools
                            settingsLongPressTimer.current = setTimeout(() => {
                                const newState = !devModeUnlocked;
                                setDevModeUnlocked(newState);
                                // Haptic feedback: short vibration
                                Vibration.vibrate(100);
                                // Show toast notification
                                setDevToast(newState ? '🛠 Developer Mode Unlocked' : '🔒 Developer Mode Locked');
                                setTimeout(() => setDevToast(null), 2000);
                            }, 5000);
                        }}
                        onPressOut={() => {
                            // Cancel timer if released early
                            if (settingsLongPressTimer.current) {
                                clearTimeout(settingsLongPressTimer.current);
                                settingsLongPressTimer.current = null;
                            }
                        }}
                        style={commonStyles.iconButton}
                    >
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
                <TickDial
                    data={CONFIG.SESSION_OPTIONS_MINS}
                    selectedIndex={timeIndex}
                    onSelect={setTimeIndex}
                    unit="min"
                    setHomeScrollEnabled={setHomeScrollEnabled}
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
            <SwipeableModal visible={showCalendar} onClose={() => setShowCalendar(false)} setHomeScrollEnabled={setHomeScrollEnabled}>
                <CalendarView currentStreak={storage.currentStreak} streakHistory={storage.streakHistory} />
            </SwipeableModal>

            <SwipeableModal visible={showVersionHistory} onClose={() => setShowVersionHistory(false)} title="Version History" setHomeScrollEnabled={setHomeScrollEnabled}>
                <View style={{ height: 400, width: '100%' }}>
                    <FlashList
                        data={VERSION_HISTORY}
                        keyExtractor={(v) => v.version}
                        renderItem={({ item: v }) => (
                            <View style={commonStyles.versionHistoryBlock}>
                                <Text style={commonStyles.versionHistoryHeader}>{v.version}</Text>
                                {v.changes.map((c, j) => <Text key={j} style={commonStyles.versionHistoryItem}>• {c}</Text>)}
                            </View>
                        )}
                    />
                </View>
            </SwipeableModal>

            <SwipeableModal visible={showSettings} onClose={() => setShowSettings(false)} title="Preferences" setHomeScrollEnabled={setHomeScrollEnabled}>
                <ScrollView contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>

                    <View style={{ backgroundColor: theme.colors.glassBackground, borderRadius: theme.borderRadius.md, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: theme.colors.glassBorder }}>
                        <Text style={[commonStyles.settingsLabel, { marginTop: 0, color: theme.colors.textPrimary, fontSize: 16 }]}>Typography Collection</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginBottom: 15 }}>Choose your preferred writing style</Text>
                        <View style={commonStyles.settingsRow}>
                            {CONFIG.FONTS.map((f, i) => {
                                const fontValue = f.value;
                                return (
                                    <TouchableOpacity
                                        key={i}
                                        style={[commonStyles.sortBtn, storage.fontIndex === i && commonStyles.sortBtnActive, { marginBottom: 10 }]}
                                        onPress={() => storage.savePreferences(i, storage.sizeIndex)}
                                    >
                                        <Text style={[commonStyles.sortBtnText, { fontFamily: fontValue }, storage.fontIndex === i && commonStyles.sortBtnTextActive]}>
                                            {f.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
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
                            fontFamily: activeFont,
                            fontSize: activeSize
                        }]}>
                            The quick brown fox jumps over the lazy dog.
                        </Text>
                    </View>

                    <View style={{ backgroundColor: theme.colors.glassBackground, borderRadius: theme.borderRadius.md, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: theme.colors.glassBorder, marginTop: 10 }}>
                        <Text style={[commonStyles.settingsLabel, { marginTop: 0, color: theme.colors.textPrimary, fontSize: 16 }]}>Security & Privacy</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginBottom: 5 }}>Notes and Circles are protected by biometric authentication (fingerprint / face).</Text>
                    </View>

                    {/* ── Developer Tools Section (only visible after 5s long-press on ⚙️) ── */}
                    {devModeUnlocked && (
                    <View style={{ backgroundColor: storage.devMode ? 'rgba(255, 215, 0, 0.08)' : theme.colors.glassBackground, borderRadius: theme.borderRadius.md, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: storage.devMode ? 'rgba(255, 215, 0, 0.3)' : theme.colors.glassBorder, marginTop: 10 }}>
                        <Text style={[commonStyles.settingsLabel, { marginTop: 0, color: storage.devMode ? '#FFD700' : theme.colors.textPrimary, fontSize: 16 }]}>🛠 Developer Tools</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginBottom: 15 }}>Debug features for testing</Text>

                        {/* Dev Mode Toggle */}
                        <TouchableOpacity
                            style={[commonStyles.closeVersionBtn, { backgroundColor: storage.devMode ? 'rgba(255, 215, 0, 0.2)' : theme.colors.glassHighlight, marginTop: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                            onPress={storage.toggleDevMode}
                        >
                            <Text style={[commonStyles.closeVersionBtnText, storage.devMode && { color: '#FFD700' }]}>Dev Mode</Text>
                            <Text style={{ color: storage.devMode ? '#FFD700' : theme.colors.textMuted, fontSize: 13, fontWeight: 'bold' }}>{storage.devMode ? 'ON' : 'OFF'}</Text>
                        </TouchableOpacity>

                        {/* Dev Actions (only visible when dev mode is active) */}
                        {storage.devMode && (
                            <View style={{ marginTop: 15, gap: 10 }}>
                                {/* Simulate Streak Popup */}
                                <TouchableOpacity
                                    style={[commonStyles.closeVersionBtn, { backgroundColor: 'rgba(255, 215, 0, 0.15)', marginTop: 0 }]}
                                    onPress={() => {
                                        setNewStreakParam(storage.currentStreak || 1);
                                        setShowStreakPopup(true);
                                        setShowSettings(false);
                                    }}
                                >
                                    <Text style={[commonStyles.closeVersionBtnText, { color: '#FFD700' }]}>🎯 Simulate Streak Popup</Text>
                                </TouchableOpacity>

                                {/* Clear All Data */}
                                <TouchableOpacity
                                    style={[commonStyles.closeVersionBtn, { backgroundColor: 'rgba(255, 77, 77, 0.15)', marginTop: 0 }]}
                                    onPress={() => {
                                        storage.clearAllData();
                                        setShowSettings(false);
                                    }}
                                >
                                    <Text style={[commonStyles.closeVersionBtnText, { color: theme.colors.danger }]}>🗑 Clear All Data</Text>
                                </TouchableOpacity>

                                {/* Storage Info */}
                                <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: theme.borderRadius.sm, padding: 12, marginTop: 5 }}>
                                    <Text style={{ color: '#FFD700', fontSize: 12, fontWeight: 'bold', marginBottom: 8 }}>📊 Storage Info</Text>
                                    <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>Notes: {storage.savedNotes.length}</Text>
                                    <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>Circles: {storage.persons.length}</Text>
                                    <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>Current Streak: {storage.currentStreak}</Text>
                                    <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>Last Win: {storage.lastWinDate || 'Never'}</Text>
                                    <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>Streak History: {storage.streakHistory.length} days</Text>
                                    <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>Font: {CONFIG.FONTS[storage.fontIndex]?.label || 'Default'} | Size: {CONFIG.SIZES[storage.sizeIndex]?.label || 'Default'}</Text>
                                </View>
                            </View>
                        )}
                    </View>
                    )}
                </ScrollView>
            </SwipeableModal>

            {/* Person Select Modal */}
            <SwipeableModal
                visible={showPersonSelect}
                onClose={() => { setShowPersonSelect(false); setCircleSearch(''); }}
                title="Select Person"
                height={Dimensions.get('window').height * 0.55}
                setHomeScrollEnabled={setHomeScrollEnabled}
            >
                <TextInput
                    style={commonStyles.circleSearchInput}
                    placeholder="Search by name..."
                    placeholderTextColor={theme.colors.textMuted}
                    value={circleSearch}
                    onChangeText={setCircleSearch}
                />

                {circleSearch.length > 0 ? (
                    <View style={{ height: 200, width: '100%' }}>
                        <FlashList
                            data={filteredPersons}
                            renderItem={({ item: p }) => (
                                <TouchableOpacity
                                    style={[commonStyles.personSelectItem, selectedPersonId === p.id && commonStyles.personSelectItemActive]}
                                    onPress={() => { setSelectedPersonId(p.id); setShowPersonSelect(false); }}
                                >
                                    <View style={commonStyles.personAvatar}>
                                        <Text style={commonStyles.personAvatarText}>{p.name.charAt(0)}</Text>
                                    </View>
                                    <Text style={commonStyles.personSelectName}>{p.name}</Text>
                                </TouchableOpacity>
                            )}
                            keyExtractor={(p) => p.id}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                            ListEmptyComponent={
                                !showAddPerson ? (
                                    <TouchableOpacity style={commonStyles.addPersonSuggestion} onPress={() => { setNewPersonName(circleSearch); setShowAddPerson(true); }}>
                                        <Text style={commonStyles.addPersonSuggestionText}>+ Add "{circleSearch}"</Text>
                                    </TouchableOpacity>
                                ) : <></>
                            }
                        />
                    </View>
                ) : (
                    <Text style={{ color: theme.colors.textMuted, textAlign: 'center', marginTop: 20 }}>
                        Start typing to find or create a circle.
                    </Text>
                )}

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

            {/* Streak Popup Overlay */}
            <StreakPopup
                visible={showStreakPopup}
                streak={newStreakParam}
                streakHistory={storage.streakHistory}
                onClose={() => setShowStreakPopup(false)}
            />

        </View>
    );
};
