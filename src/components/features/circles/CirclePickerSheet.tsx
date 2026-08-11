/**
 * CirclePickerSheet — Circle/Person selection modal.
 *
 * UX Design:
 * - Android uses `softwareKeyboardLayoutMode: "pan"` so keyboard overlaps
 *   the screen without moving the modal or shrinking the window
 * - Modal stays perfectly fixed when keyboard opens
 * - No autoFocus to prevent initial jump
 * - Bottom blur gradient hides items under keyboard area
 * - Footer create-option only when no exact match
 * - Inline ConfirmDialog before creating
 */
import React, { useState, useRef, useMemo, useCallback } from 'react';
import { View, Text, TextInput, Vibration, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { BaseModal } from '@/components/ui/BaseModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { theme } from '@/styles/theme';
import type { Person } from '@/types';

interface CirclePickerSheetProps {
    visible: boolean;
    onClose: () => void;
    selectedPersonId: string | null;
    onSelectPerson: (personId: string) => void;
    persons: Person[];
    addPerson: (name: string) => Promise<string | null>;
    isCirclesUnlocked: boolean;
    isNotesUnlocked: boolean;
    unlockCircles: () => Promise<boolean>;
    setHomeScrollEnabled?: (enabled: boolean) => void;
}

type ListItem = { type: 'person'; person: Person } | { type: 'create'; searchText: string };

export const CirclePickerSheet: React.FC<CirclePickerSheetProps> = React.memo(
    ({
        visible,
        onClose,
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
        const [isCreating, setIsCreating] = useState(false);
        const [confirmName, setConfirmName] = useState<string | null>(null);

        const filteredPersons = useMemo(() => {
            if (!debouncedSearch.trim()) return persons;
            return persons.filter((p) => (p.name || '').toLowerCase().includes(debouncedSearch.toLowerCase()));
        }, [persons, debouncedSearch]);

        const listData: ListItem[] = useMemo(() => {
            const items: ListItem[] = filteredPersons.map((p) => ({ type: 'person', person: p }));
            const search = debouncedSearch.trim();
            if (search) {
                const exactMatch = persons.some((p) => (p.name || '').toLowerCase() === search.toLowerCase());
                if (!exactMatch) {
                    items.push({ type: 'create', searchText: debouncedSearch });
                }
            }
            return items;
        }, [filteredPersons, debouncedSearch, persons]);

        const handleSearchChange = useCallback((text: string) => {
            setSearchText(text);
            if (searchDebounceRef.current) {
                clearTimeout(searchDebounceRef.current);
            }
            searchDebounceRef.current = setTimeout(() => setDebouncedSearch(text), 150);
        }, []);

        const handleClose = useCallback(() => {
            if (searchDebounceRef.current) {
                clearTimeout(searchDebounceRef.current);
                searchDebounceRef.current = null;
            }
            setSearchText('');
            setDebouncedSearch('');
            setIsCreating(false);
            setConfirmName(null);
            onClose();
        }, [onClose]);

        const handleCreatePerson = useCallback(
            async (name: string) => {
                const trimmed = name.trim();
                if (!trimmed || isCreating) return;
                setIsCreating(true);
                try {
                    const newId = await addPerson(trimmed);
                    if (newId) {
                        onSelectPerson(newId);
                        handleClose();
                    }
                } finally {
                    setIsCreating(false);
                }
            },
            [addPerson, onSelectPerson, handleClose, isCreating],
        );

        const handleSelectPerson = useCallback(
            (personId: string) => {
                onSelectPerson(personId);
                handleClose();
            },
            [onSelectPerson, handleClose],
        );

        const clearSearch = useCallback(() => {
            setSearchText('');
            setDebouncedSearch('');
        }, []);

        const renderItem = useCallback(
            ({ item }: { item: ListItem }) => {
                if (item.type === 'person') {
                    const p = item.person;
                    return (
                        <AnimatedScaleButton style={styles.personItem} onPress={() => handleSelectPerson(p.id)}>
                            <View style={styles.personAvatar}>
                                <Text style={styles.personAvatarText}>{(p.name || '?').charAt(0).toUpperCase()}</Text>
                            </View>
                            <Text style={styles.personName}>{p.name}</Text>
                        </AnimatedScaleButton>
                    );
                }

                const search = item.searchText.trim();
                return (
                    <AnimatedScaleButton
                        style={styles.createOption}
                        onPress={() => setConfirmName(search)}
                        disabled={isCreating}
                    >
                        {isCreating ? (
                            <ActivityIndicator size={18} color={theme.colors.primaryAction} />
                        ) : (
                            <MaterialCommunityIcons name="account-plus" size={20} color={theme.colors.primaryAction} />
                        )}
                        <Text style={styles.createOptionText}>{isCreating ? 'Adding...' : `Add "${search}"`}</Text>
                    </AnimatedScaleButton>
                );
            },
            [handleSelectPerson, isCreating],
        );

        return (
            <BaseModal
                visible={visible}
                onClose={handleClose}
                title="Select Person"
                setHomeScrollEnabled={setHomeScrollEnabled}
                // Android uses adjustPan (sheet must not double-shift); on iOS the
                // keyboard covers the list without this, so enable resizing there.
                keyboardAvoiding={Platform.OS === 'android' ? false : true}
            >
                {!isCirclesUnlocked && !isNotesUnlocked ? (
                    <View style={styles.lockContainer}>
                        <MaterialCommunityIcons
                            name="lock-outline"
                            size={48}
                            color={theme.colors.primaryAction}
                            style={{ marginBottom: 16 }}
                        />
                        <Text style={styles.lockTitle}>Circles Protected</Text>
                        <Text style={styles.lockHint}>Verify your identity to view your circles</Text>
                        <AnimatedScaleButton
                            style={styles.lockBtn}
                            onPress={async () => {
                                const success = await unlockCircles();
                                if (success) Vibration.vibrate(50);
                            }}
                        >
                            <MaterialCommunityIcons
                                name="fingerprint"
                                size={20}
                                color={theme.colors.textPrimary}
                                style={{ marginRight: 8 }}
                            />
                            <Text style={styles.lockBtnText}>Unlock Circles</Text>
                        </AnimatedScaleButton>
                    </View>
                ) : (
                    <View style={styles.outer}>
                        {/* Search bar — fixed, never moves */}
                        <View style={styles.header}>
                            <View style={styles.searchBox}>
                                <MaterialCommunityIcons
                                    name="magnify"
                                    size={20}
                                    color={theme.colors.textMuted}
                                    style={{ marginRight: 10 }}
                                />
                                <TextInput
                                    style={styles.searchInput}
                                    placeholder="Search your circles..."
                                    placeholderTextColor={theme.colors.textMuted}
                                    value={searchText}
                                    onChangeText={handleSearchChange}
                                    keyboardAppearance="dark"
                                    autoCorrect={false}
                                />
                                {searchText.length > 0 && (
                                    <AnimatedScaleButton onPress={clearSearch}>
                                        <MaterialCommunityIcons
                                            name="close-circle"
                                            size={20}
                                            color={theme.colors.textMuted}
                                        />
                                    </AnimatedScaleButton>
                                )}
                            </View>
                        </View>

                        {/* Results list */}
                        <View style={styles.listFlex}>
                            <FlashList
                                data={listData}
                                renderItem={renderItem}
                                keyExtractor={(item, index) =>
                                    item.type === 'person' ? item.person.id : `footer-${index}`
                                }
                                keyboardShouldPersistTaps="handled"
                                keyboardDismissMode="on-drag"
                                contentContainerStyle={{
                                    paddingHorizontal: 20,
                                    paddingBottom: 40,
                                    flexGrow: 1,
                                }}
                                ListEmptyComponent={
                                    <View style={styles.emptyState}>
                                        <MaterialCommunityIcons
                                            name="account-group-outline"
                                            size={40}
                                            color={theme.colors.textMuted}
                                        />
                                        <Text style={styles.emptyTitle}>No circles yet</Text>
                                        <Text style={styles.emptyDesc}>
                                            Start typing a name above to create your first circle.
                                        </Text>
                                    </View>
                                }
                            />
                        </View>

                        {/* Bottom blur gradient — fades list into keyboard overlap area */}
                        <LinearGradient
                            colors={[
                                'transparent',
                                theme.colors.overlayLight,
                                theme.colors.overlaySoft,
                                theme.colors.surfaceDark,
                            ]}
                            style={styles.bottomFade}
                            pointerEvents="none"
                        />

                        {/* Confirmation dialog before creating */}
                        <ConfirmDialog
                            visible={!!confirmName}
                            title="New Person"
                            message={confirmName ? `Create a new circle for "${confirmName}"?` : ''}
                            confirmLabel="Create"
                            cancelLabel="Cancel"
                            icon="account-plus-outline"
                            cancelIcon="close"
                            onConfirm={() => {
                                if (confirmName) handleCreatePerson(confirmName);
                                setConfirmName(null);
                            }}
                            onCancel={() => setConfirmName(null)}
                        />
                    </View>
                )}
            </BaseModal>
        );
    },
);

const styles = StyleSheet.create({
    outer: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 20,
        paddingBottom: 12,
    },
    listFlex: {
        flex: 1,
        width: '100%',
    },
    bottomFade: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 56,
        zIndex: 10,
    },
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
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
        gap: 8,
    },
    emptyTitle: {
        color: theme.colors.textSecondary,
        fontSize: 15,
        fontWeight: theme.typography.weightBold,
    },
    emptyDesc: {
        color: theme.colors.textMuted,
        fontSize: 13,
        textAlign: 'center',
        paddingHorizontal: 24,
        lineHeight: 18,
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
    createOption: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 12,
        borderRadius: theme.borderRadius.md,
        marginTop: 8,
        marginBottom: 4,
        gap: 12,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        borderStyle: 'dashed',
    },
    createOptionText: {
        color: theme.colors.primaryAction,
        fontSize: 16,
        fontWeight: '700',
    },
});
