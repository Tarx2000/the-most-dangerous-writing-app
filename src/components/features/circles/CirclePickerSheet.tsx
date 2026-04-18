/**
 * CirclePickerSheet — Extracted from StartScreen.
 *
 * Manages the circle/person selection SwipeableModal including:
 * - Biometric lock screen when circles are protected
 * - Search and filter existing circles
 * - Inline creation form for new circles
 * - Person selection callback
 *
 * Extracted to reduce StartScreen's state management burden and
 * improve maintainability of the circle selection flow.
 */

import React, { useState, useRef, useMemo } from 'react';
import {
    View,
    Text,
    TextInput,
    ScrollView,
    Vibration,
    StyleSheet,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { SwipeableModal } from '@/components/ui/SwipeableModal';
import { theme } from '@/styles/theme';
import { commonStyles } from '@/styles/commonStyles';
import type { Person } from '@/types';

interface CirclePickerSheetProps {
    visible: boolean;
    onClose: () => void;
    /** Currently selected person ID */
    selectedPersonId: string | null;
    /** Callback when a person is selected */
    onSelectPerson: (personId: string) => void;
    /** All persons from storage */
    persons: Person[];
    /** Add a new person to storage */
    addPerson: (name: string) => Promise<string | null>;
    /** Whether circles are unlocked via biometric */
    isCirclesUnlocked: boolean;
    /** Whether full access is unlocked */
    isNotesUnlocked: boolean;
    /** Unlock circles via biometric */
    unlockCircles: () => Promise<boolean>;
    /** Callback to enable/disable home screen scroll */
    setHomeScrollEnabled?: (enabled: boolean) => void;
}

export const CirclePickerSheet: React.FC<CirclePickerSheetProps> = React.memo(({
    visible,
    onClose,
    selectedPersonId,
    onSelectPerson,
    persons,
    addPerson,
    isCirclesUnlocked,
    isNotesUnlocked,
    unlockCircles,
    setHomeScrollEnabled,
}) => {
    const [searchText, setSearchText] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const [creatingNewCircle, setCreatingNewCircle] = useState(false);
    const newPersonNameRef = useRef('');

    const filteredPersons = useMemo(() => {
        return persons.filter(p =>
            p.name.toLowerCase().includes(debouncedSearch.toLowerCase())
        );
    }, [persons, debouncedSearch]);

    const handleSearchChange = (text: string) => {
        setSearchText(text);
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = setTimeout(() => setDebouncedSearch(text), 150);
    };

    const handleClose = () => {
        onClose();
        searchDebounceRef.current = null;
        setSearchText('');
        setDebouncedSearch('');
        setCreatingNewCircle(false);
    };

    const handleCreatePerson = async () => {
        if (newPersonNameRef.current.trim()) {
            const newId = await addPerson(newPersonNameRef.current);
            newPersonNameRef.current = '';
            setCreatingNewCircle(false);
            handleSearchChange('');
            if (newId) onSelectPerson(newId);
        }
    };

    return (
        <SwipeableModal
            visible={visible}
            onClose={handleClose}
            title={creatingNewCircle ? 'New Circle' : 'Select Circle'}
            setHomeScrollEnabled={setHomeScrollEnabled}
        >
            {!isCirclesUnlocked && !isNotesUnlocked ? (
                <View style={styles.lockContainer}>
                    <MaterialCommunityIcons name="lock-outline" size={48} color={theme.colors.primaryAction} style={{ marginBottom: 16 }} />
                    <Text style={styles.lockTitle}>Circles Protected</Text>
                    <Text style={styles.lockHint}>Verify your identity to view your circles</Text>
                    <AnimatedScaleButton
                        style={styles.lockBtn}
                        onPress={async () => {
                            const success = await unlockCircles();
                            if (success) Vibration.vibrate(50);
                        }}
                    >
                        <MaterialCommunityIcons name="fingerprint" size={20} color={theme.colors.textPrimary} style={{ marginRight: 8 }} />
                        <Text style={styles.lockBtnText}>Unlock Circles</Text>
                    </AnimatedScaleButton>
                </View>
            ) : creatingNewCircle ? (
                <View style={styles.createForm}>
                    <TextInput
                        style={commonStyles.addPersonInput}
                        placeholder="Person's Name"
                        placeholderTextColor={theme.colors.textMuted}
                        defaultValue={newPersonNameRef.current}
                        onChangeText={(text) => newPersonNameRef.current = text}
                        autoFocus
                        keyboardAppearance="dark"
                    />
                    <View style={{ gap: 10, marginTop: 20 }}>
                        <AnimatedScaleButton
                            style={styles.createBtn}
                            onPress={handleCreatePerson}
                        >
                            <MaterialCommunityIcons name="check" size={20} color={theme.colors.textPrimary} style={{ marginRight: 8 }} />
                            <Text style={styles.createBtnText}>Create Circle</Text>
                        </AnimatedScaleButton>
                        <AnimatedScaleButton
                            style={styles.backBtn}
                            onPress={() => setCreatingNewCircle(false)}
                        >
                            <Text style={styles.backBtnText}>Back to List</Text>
                        </AnimatedScaleButton>
                    </View>
                </View>
            ) : (
                <>
                    {/* Search Input */}
                    <View style={{ paddingHorizontal: 20, paddingBottom: 15 }}>
                        <View style={styles.searchBox}>
                            <MaterialCommunityIcons name="magnify" size={20} color={theme.colors.textMuted} style={{ marginRight: 10 }} />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search your circles..."
                                placeholderTextColor={theme.colors.textMuted}
                                defaultValue={searchText}
                                onChangeText={handleSearchChange}
                                keyboardAppearance="dark"
                                autoCorrect={false}
                            />
                            {searchText.length > 0 && (
                                <AnimatedScaleButton onPress={() => { setSearchText(''); handleSearchChange(''); }}>
                                    <MaterialCommunityIcons name="close-circle" size={20} color={theme.colors.textMuted} />
                                </AnimatedScaleButton>
                            )}
                        </View>
                    </View>

                    {/* List */}
                    <View style={{ flex: 1, width: '100%' }}>
                        {filteredPersons.length > 0 ? (
                            <FlashList
                                data={filteredPersons}
                                renderItem={({ item: p }: { item: Person }) => (
                                    <AnimatedScaleButton
                                        style={styles.personItem}
                                        onPress={() => { onSelectPerson(p.id); handleClose(); }}
                                    >
                                        <View style={styles.personAvatar}>
                                            <Text style={styles.personAvatarText}>{p.name.charAt(0).toUpperCase()}</Text>
                                        </View>
                                        <Text style={styles.personName}>{p.name}</Text>
                                    </AnimatedScaleButton>
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
                                    {debouncedSearch.length > 0 ? 'No circle found with that name.' : 'Start typing to find or create a circle.'}
                                </Text>

                                {debouncedSearch.length > 0 && (
                                    <AnimatedScaleButton style={styles.createBtn} onPress={() => { newPersonNameRef.current = debouncedSearch; setCreatingNewCircle(true); }}>
                                        <MaterialCommunityIcons name="plus" size={20} color={theme.colors.background} />
                                        <Text style={styles.createBtnText}>Create "{debouncedSearch}"</Text>
                                    </AnimatedScaleButton>
                                )}
                            </ScrollView>
                        )}
                    </View>

                    {/* Float create button */}
                    {debouncedSearch.length === 0 && (
                        <AnimatedScaleButton style={styles.floatCreateBtn} onPress={() => { newPersonNameRef.current = ''; setCreatingNewCircle(true); }}>
                            <MaterialCommunityIcons name="plus" size={24} color={theme.colors.background} />
                            <Text style={styles.floatCreateBtnText}>New Circle</Text>
                        </AnimatedScaleButton>
                    )}
                </>
            )}
        </SwipeableModal>
    );
});

const styles = StyleSheet.create({
    lockContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
        paddingBottom: 60,
    },
    lockTitle: {
        color: theme.colors.textPrimary,
        fontSize: 22,
        fontWeight: '900',
        marginBottom: 8,
    },
    lockHint: {
        color: theme.colors.textMuted,
        fontSize: 15,
        textAlign: 'center',
        marginBottom: 24,
    },
    lockBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.primaryAction,
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 100,
    },
    lockBtnText: {
        color: theme.colors.textPrimary,
        fontWeight: 'bold',
    },
    createForm: {
        paddingHorizontal: 20,
        paddingTop: 20,
    },
    createBtn: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.primaryAction,
        paddingVertical: 16,
        borderRadius: 100,
        shadowColor: theme.colors.primaryAction,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    createBtnText: {
        color: theme.colors.textPrimary,
        fontWeight: '800',
        fontSize: 16,
    },
    backBtn: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.glassBackground,
        paddingVertical: 16,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
    },
    backBtnText: {
        color: theme.colors.textPrimary,
        fontWeight: '700',
        fontSize: 15,
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.glassBackground,
        borderRadius: theme.borderRadius.md,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
    },
    searchInput: {
        flex: 1,
        color: theme.colors.textPrimary,
        fontSize: 16,
        paddingVertical: 0,
    },
    personItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: theme.borderRadius.md,
        marginBottom: 4,
    },
    personAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: theme.colors.glassHighlight,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    personAvatarText: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        fontWeight: theme.typography.weightBold,
    },
    personName: {
        color: theme.colors.textPrimary,
        fontSize: 17,
        fontWeight: '600',
    },
    floatCreateBtn: {
        position: 'absolute',
        bottom: 40,
        right: 20,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.glassHighlight,
        padding: 16,
        borderRadius: 30,
    },
    floatCreateBtnText: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        fontWeight: theme.typography.weightBold,
    },
});