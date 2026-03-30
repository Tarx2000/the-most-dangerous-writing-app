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
    Vibration,
    StyleSheet
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation.types';;
import { commonStyles } from '@/styles/commonStyles';
import { CONFIG, APP_VERSION, VERSION_HISTORY } from '@/config';
import { CarouselSelector } from '@/components/ui/CarouselSelector';
import { CustomSlider } from '@/components/features/alignment/CustomSlider';
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

    const [sessionMode, setSessionMode] = useState<'journal' | 'circles' | 'checkin'>('journal');
    const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
    const [score, setScore] = useState(5);

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
        if (sessionMode === 'checkin') {
            navigation.navigate('AlignmentWriting', {
                alignmentScore: score,
                timeIndex: timeIndex
            });
            return;
        }

        navigation.navigate('Writing', {
            timeIndex,
            diffIndex,
            mode: sessionMode,
            personId: selectedPersonId
        });
    };

    const getScoreDetails = (s: number) => {
        if (s <= 2) return { icon: 'emoticon-dead-outline' as const, text: 'struggling', color: '#ff4d4d', glow: 'rgba(255, 77, 77, 0.3)' };
        if (s <= 4) return { icon: 'emoticon-confused-outline' as const, text: 'drifting', color: '#ff9933', glow: 'rgba(255, 153, 51, 0.3)' };
        if (s === 5) return { icon: 'emoticon-neutral-outline' as const, text: 'okay', color: '#ffcc00', glow: 'rgba(255, 204, 0, 0.3)' };
        if (s <= 7) return { icon: 'emoticon-happy-outline' as const, text: 'good', color: '#a2ff66', glow: 'rgba(162, 255, 102, 0.3)' };
        if (s <= 9) return { icon: 'emoticon-excited-outline' as const, text: 'great', color: '#66ffcc', glow: 'rgba(102, 255, 204, 0.3)' };
        return { icon: 'emoticon-cool-outline' as const, text: 'perfectly aligned', color: '#00ccff', glow: 'rgba(0, 204, 255, 0.3)' };
    };
    
    const details = getScoreDetails(score);

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

            {/* Main Center Content */}
            <View style={{ flex: 1, paddingVertical: 10 }}>
                {/* Dynamic Hero Area */}
                <View style={styles.heroWidgetContainer}>
                    {sessionMode === 'journal' && (
                        <>
                            <MaterialCommunityIcons name="feather" size={42} color={theme.colors.primaryAction} style={{ marginBottom: 12 }} />
                            <Text style={styles.heroTitle}>Free Writing</Text>
                            <Text style={styles.heroSubtitle}>Write continuously, or all is lost.</Text>
                        </>
                    )}
                    {sessionMode === 'circles' && (
                        <>
                            <MaterialCommunityIcons name="account-group-outline" size={42} color={theme.colors.primaryAction} style={{ marginBottom: 12 }} />
                            <Text style={styles.heroTitle}>Relationship Journal</Text>
                            <TouchableOpacity style={styles.personSmallSelectBtn} onPress={() => setShowPersonSelect(true)}>
                                <Text style={styles.personSmallSelectText}>
                                    {selectedPersonId ? storage.persons.find(p => p.id === selectedPersonId)?.name : 'Select target person...'}
                                    <Text style={{ opacity: 0.5 }}> ▼</Text>
                                </Text>
                            </TouchableOpacity>
                            {selectedPersonId && (
                                <TouchableOpacity style={styles.quickNoteBtn} onPress={() => { navigation.navigate('Writing', { timeIndex: 0, diffIndex, mode: 'circles', personId: selectedPersonId, isQuickNote: true }); }}>
                                    <MaterialCommunityIcons name="lightning-bolt" size={16} color={theme.colors.background} />
                                    <Text style={styles.quickNoteText}>Quick Note</Text>
                                </TouchableOpacity>
                            )}
                        </>
                    )}
                    {sessionMode === 'checkin' && (
                        <>
                            <View style={[styles.glowRing, { backgroundColor: details.glow, shadowColor: details.color, marginTop: 15 }]}>
                                <View style={styles.iconCircle}>
                                    <MaterialCommunityIcons name={details.icon} size={64} color={details.color} />
                                </View>
                            </View>
                            <Text style={[styles.scoreText, { color: details.color, fontSize: 16, marginTop: 10 }]}>{details.text.toUpperCase()}</Text>
                            <View style={{ transform: [{ scale: 1.05 }], marginTop: -20, marginBottom: -40 }}>
                                <CustomSlider value={score} onValueChange={setScore} />
                            </View>
                        </>
                    )}
                </View>

                <View style={{ flex: 1, justifyContent: 'center' }}>
                    <TickDial
                        data={CONFIG.SESSION_OPTIONS_MINS}
                        selectedIndex={timeIndex}
                        onSelect={setTimeIndex}
                        unit="min"
                        setHomeScrollEnabled={setHomeScrollEnabled}
                    />

                    {/* Difficulty Pill Selector Inline (Hidden for Checkin) */}
                    {sessionMode !== 'checkin' && (
                        <View style={styles.diffSelectorContainer}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.diffScroll}>
                                {CONFIG.DIFFICULTIES.map((diff, i) => (
                                    <TouchableOpacity key={i} style={[styles.diffPill, diffIndex === i && styles.diffPillActive]} onPress={() => setDiffIndex(i)}>
                                        <Text style={[styles.diffPillText, diffIndex === i && styles.diffPillTextActive]}>{diff.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    )}
                </View>
            </View>

            {/* Bottom Glass Navigation Dock */}
            <View style={styles.bottomDockContainer}>
                {/* Massive Start Pill Overlapping the dock */}
                <View style={styles.massiveStartContainer}>
                    <TouchableOpacity style={styles.massiveStartBtn} onPress={handleStart}>
                        <Text style={styles.massiveStartBtnText}>
                            Start Writing
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Tide-style NavBar Ribbon */}
                <View style={styles.navRibbonWrapper}>
                    <LinearGradient colors={['rgba(30,30,30,0.8)', 'rgba(0,0,0,1)']} style={StyleSheet.absoluteFillObject} />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navRibbonScroll}>
                        <TouchableOpacity style={[styles.navItem, sessionMode === 'journal' && styles.navItemActive]} onPress={() => { setSessionMode('journal'); setSelectedPersonId(null); }}>
                            <MaterialCommunityIcons name="notebook-edit" size={26} color={sessionMode === 'journal' ? theme.colors.primaryAction : 'rgba(255,255,255,0.4)'} />
                            <Text style={[styles.navText, sessionMode === 'journal' && styles.navTextActive]}>Journal</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.navItem, sessionMode === 'circles' && styles.navItemActive]} onPress={() => setSessionMode('circles')}>
                            <MaterialCommunityIcons name="account-group" size={26} color={sessionMode === 'circles' ? theme.colors.primaryAction : 'rgba(255,255,255,0.4)'} />
                            <Text style={[styles.navText, sessionMode === 'circles' && styles.navTextActive]}>Circles</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.navItem, sessionMode === 'checkin' && styles.navItemActive]} onPress={() => setSessionMode('checkin')}>
                            <View style={(!storage.lastReflectionDate || (Date.now() - storage.lastReflectionDate > 7 * 24 * 60 * 60 * 1000)) ? styles.urgentGlowContainer : {}}>
                                {(!storage.lastReflectionDate || (Date.now() - storage.lastReflectionDate > 7 * 24 * 60 * 60 * 1000)) && (
                                    <View style={[styles.urgentDot, {top: 6, right: 6}]} />
                                )}
                                <MaterialCommunityIcons name="compass-outline" size={26} color={(!storage.lastReflectionDate || (Date.now() - storage.lastReflectionDate > 7 * 24 * 60 * 60 * 1000)) ? '#FFD700' : (sessionMode === 'checkin' ? '#FFF' : 'rgba(255,255,255,0.4)')} />
                            </View>
                            <Text style={[styles.navText, { color: (!storage.lastReflectionDate || (Date.now() - storage.lastReflectionDate > 7 * 24 * 60 * 60 * 1000)) ? '#FFD700' : (sessionMode === 'checkin' ? '#FFF' : 'rgba(255,255,255,0.4)'), marginTop: (!storage.lastReflectionDate || (Date.now() - storage.lastReflectionDate > 7 * 24 * 60 * 60 * 1000)) ? 2 : 0 }]}>Check-in</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                            style={styles.navItem} 
                            onPress={() => {
                                if (security.isNotesUnlocked) {
                                    navigation.navigate('VisionBoard');
                                } else {
                                    Vibration.vibrate([0, 50, 100, 50]); // Error feeling buzz
                                }
                            }}
                            onLongPress={async () => {
                                if (security.isNotesUnlocked) {
                                    security.lockAll();
                                    Vibration.vibrate(50);
                                } else {
                                    const success = await security.unlockNotes();
                                    if (success) Vibration.vibrate(50);
                                }
                            }}
                        >
                            <MaterialCommunityIcons name={!security.isNotesUnlocked ? "star-off-outline" : "star-four-points"} size={26} color={!security.isNotesUnlocked ? "rgba(255,100,100,0.8)" : "rgba(255,255,255,0.4)"} />
                            <Text style={[styles.navText, !security.isNotesUnlocked && { color: 'rgba(255,100,100,0.8)' }]}>{!security.isNotesUnlocked ? '🔒 ' : ''}Vision</Text>
                        </TouchableOpacity>
                    </ScrollView>
                    <TouchableOpacity style={{ position: 'absolute', bottom: 10, right: 15 }} onPress={() => setShowVersionHistory(true)}>
                        <Text style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, fontWeight: 'bold' }}>v{APP_VERSION}</Text>
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

            {/* Premium Full-Screen Person Select Modal */}
            <Modal visible={showPersonSelect} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowPersonSelect(false); setCircleSearch(''); }}>
                <View style={[styles.premiumPersonModal, { flex: 1 }]}>
                    <LinearGradient colors={['#1e1e1e', '#000000']} style={StyleSheet.absoluteFillObject} />
                    
                    {/* Header */}
                    <View style={styles.premiumPersonHeader}>
                        <Text style={styles.premiumPersonTitle}>Select Circle</Text>
                        <TouchableOpacity style={styles.premiumPersonCloseBtn} onPress={() => { setShowPersonSelect(false); setCircleSearch(''); }}>
                            <MaterialCommunityIcons name="close" size={24} color="#FFF" />
                        </TouchableOpacity>
                    </View>

                    {/* Content Area with Keyboard avoidance */}
                    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                        
                        {/* Search Input */}
                        <View style={{ paddingHorizontal: 20, paddingBottom: 15 }}>
                            <View style={styles.premiumSearchBox}>
                                <MaterialCommunityIcons name="magnify" size={20} color={theme.colors.textMuted} style={{ marginRight: 10 }} />
                                <TextInput
                                    style={styles.premiumSearchInput}
                                    placeholder="Search your circles..."
                                    placeholderTextColor={theme.colors.textMuted}
                                    value={circleSearch}
                                    onChangeText={setCircleSearch}
                                    keyboardAppearance="dark"
                                    autoCorrect={false}
                                />
                                {circleSearch.length > 0 && (
                                    <TouchableOpacity onPress={() => setCircleSearch('')}>
                                        <MaterialCommunityIcons name="close-circle" size={20} color={theme.colors.textMuted} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>

                        {/* List */}
                        <View style={{ flex: 1, width: '100%' }}>
                            {filteredPersons.length > 0 ? (
                                <FlashList
                                    data={filteredPersons}
                                    renderItem={({ item: p }) => (
                                        <TouchableOpacity
                                            style={styles.premiumPersonItem}
                                            onPress={() => { setSelectedPersonId(p.id); setShowPersonSelect(false); setCircleSearch(''); }}
                                        >
                                            <View style={styles.premiumPersonAvatar}>
                                                <Text style={styles.premiumPersonAvatarText}>{p.name.charAt(0).toUpperCase()}</Text>
                                            </View>
                                            <Text style={styles.premiumPersonName}>{p.name}</Text>
                                        </TouchableOpacity>
                                    )}
                                    keyExtractor={(p) => p.id}
                                    keyboardShouldPersistTaps="handled"
                                    keyboardDismissMode="on-drag"
                                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
                                />
                            ) : (
                                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 40, alignItems: 'center' }}>
                                    <MaterialCommunityIcons name="account-search-outline" size={48} color={theme.colors.textMuted} style={{ marginBottom: 15 }} />
                                    <Text style={{ color: theme.colors.textMuted, fontSize: 16, textAlign: 'center', marginBottom: 20 }}>
                                        {circleSearch.length > 0 ? 'No circle found with that name.' : 'Start typing to find or create a circle.'}
                                    </Text>
                                    
                                    {circleSearch.length > 0 && (
                                        <TouchableOpacity style={styles.premiumCreateBtn} onPress={() => { setNewPersonName(circleSearch); setShowPersonSelect(false); setTimeout(() => setShowAddPerson(true), 300); }}>
                                            <MaterialCommunityIcons name="plus" size={20} color="#000" />
                                            <Text style={styles.premiumCreateBtnText}>Create "{circleSearch}"</Text>
                                        </TouchableOpacity>
                                    )}
                                </ScrollView>
                            )}
                        </View>
                        
                        {/* Always visible float button if empty search query */}
                        {circleSearch.length === 0 && (
                            <TouchableOpacity style={styles.premiumFloatCreateBtn} onPress={() => { setShowPersonSelect(false); setTimeout(() => setShowAddPerson(true), 300); }}>
                                <MaterialCommunityIcons name="plus" size={24} color="#000" />
                                <Text style={styles.premiumFloatCreateBtnText}>New Circle</Text>
                            </TouchableOpacity>
                        )}
                    </KeyboardAvoidingView>
                </View>
            </Modal>

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

const styles = StyleSheet.create({
    heroWidgetContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        height: 200, // Exact height prevents jumps
        marginTop: 5
    },
    heroTitle: {
        fontSize: 28,
        fontWeight: '900',
        color: '#FFF',
        fontFamily: theme.typography.fontFamily,
        letterSpacing: -0.5,
        marginBottom: 6
    },
    heroSubtitle: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.6)',
        fontFamily: theme.typography.fontFamily
    },
    personSmallSelectBtn: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginTop: 5
    },
    personSmallSelectText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '600'
    },
    quickNoteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.primaryAction,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginTop: 15,
        gap: 6
    },
    quickNoteText: {
        color: theme.colors.background,
        fontWeight: 'bold',
        fontSize: 13
    },
    diffSelectorContainer: {
        width: '100%',
        alignItems: 'center',
        marginTop: 10,
        marginBottom: 35
    },
    diffScroll: {
        gap: 8,
        paddingHorizontal: 20
    },
    diffPill: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)'
    },
    diffPillActive: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderColor: 'rgba(255,255,255,0.4)'
    },
    diffPillText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 13,
        fontWeight: '600'
    },
    diffPillTextActive: {
        color: '#FFF'
    },
    bottomDockContainer: {
        position: 'absolute',
        bottom: 0,
        width: '100%',
        height: 140,
        justifyContent: 'flex-end'
    },
    massiveStartContainer: {
        position: 'absolute',
        top: -30,
        width: '100%',
        alignItems: 'center',
        zIndex: 10
    },
    massiveStartBtn: {
        backgroundColor: '#FFF',
        paddingHorizontal: 40,
        paddingVertical: 18,
        borderRadius: 30,
        shadowColor: '#FFF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 15,
        elevation: 10
    },
    massiveStartBtnText: {
        color: '#000',
        fontSize: 18,
        fontWeight: '900',
        letterSpacing: 1
    },
    navRibbonWrapper: {
        width: '100%',
        height: 100,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)'
    },
    navRibbonScroll: {
        flexGrow: 1,
        paddingHorizontal: 15,
        justifyContent: 'space-evenly',
        alignItems: 'center',
        paddingBottom: 20
    },
    navItem: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6
    },
    navItemActive: {
        opacity: 1
    },
    navText: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.4)',
        fontWeight: '700'
    },
    navTextActive: {
        color: '#FFF'
    },
    urgentDot: {
        position: 'absolute',
        top: -2,
        right: -4,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#FFD700',
        zIndex: 2,
        shadowColor: '#FFD700',
        shadowOpacity: 0.8,
        shadowRadius: 5
    },
    urgentGlowContainer: {
        backgroundColor: 'rgba(255, 215, 0, 0.1)',
        borderRadius: 20,
        padding: 8,
        shadowColor: '#FFD700',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 15,
        elevation: 10,
        marginBottom: -6,
        marginTop: -8,
        borderWidth: 1,
        borderColor: 'rgba(255, 215, 0, 0.3)'
    },
    // Inline Checkin specific styles
    glowRing: { width: 110, height: 110, borderRadius: 55, justifyContent: 'center', alignItems: 'center', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 30, elevation: 15 },
    iconCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)' },
    scoreText: { fontSize: 16, fontWeight: '900', marginTop: 15, letterSpacing: 2, fontFamily: theme.typography.fontFamily },

    // Premium UI Overrides for Select Person
    premiumPersonModal: { paddingTop: Platform.OS === 'ios' ? 20 : 0 },
    premiumPersonHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 25, paddingTop: 20, paddingBottom: 25 },
    premiumPersonTitle: { color: '#FFF', fontSize: 24, fontWeight: '900', letterSpacing: 0.5 },
    premiumPersonCloseBtn: { backgroundColor: 'rgba(255,255,255,0.1)', padding: 8, borderRadius: 20 },
    premiumSearchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, paddingHorizontal: 15, height: 55, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    premiumSearchInput: { flex: 1, color: '#FFF', fontSize: 16, paddingVertical: 0 },
    premiumPersonItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    premiumPersonAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255, 255, 255, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    premiumPersonAvatarText: { color: theme.colors.primaryAction, fontSize: 18, fontWeight: '800' },
    premiumPersonName: { color: '#FFF', fontSize: 17, fontWeight: '600' },
    premiumCreateBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.primaryAction, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 30 },
    premiumCreateBtnText: { color: '#000', fontSize: 16, fontWeight: 'bold', marginLeft: 6 },
    premiumFloatCreateBtn: { position: 'absolute', bottom: Platform.OS === 'ios' ? 40 : 20, right: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.primaryAction, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 30, shadowColor: '#FFF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 8 },
    premiumFloatCreateBtnText: { color: '#000', fontSize: 15, fontWeight: 'bold', marginLeft: 6 }
});
