import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    TextInput,
    StyleSheet,
    Vibration,
    Platform,
    Dimensions,
    KeyboardAvoidingView,
} from 'react-native';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SwipeableModal } from '@/components/ui/SwipeableModal';
import { NoteCard } from '@/components/features/library/NoteCard';
import { Person, SavedNote, RELATIONSHIP_OPTIONS } from '@/types';
import { theme } from '@/styles/theme';

/**
 * CONFIGURABLE: Max number of recent notes to preview in the profile.
 */
const MAX_RECENT_NOTES = 3;

/**
 * CONFIGURABLE: Gradient colors for the avatar ring.
 * Creates a premium glowing border effect around the initials.
 */
const AVATAR_GRADIENT = ['#FF2A2A', '#FF6B35', '#FF2A2A'] as const;

/**
 * PersonProfileModal — Premium full-screen profile sheet for a person in Circles.
 *
 * Design inspired by TIDE app profiles:
 * - Large centered avatar with gradient ring
 * - Name + relationship tag
 * - Stats row (entries, words, member since)
 * - Editable profile fields (only populated fields displayed)
 * - Recent entries preview
 *
 * Security: Full profile content requires biometric auth.
 * Empty fields are hidden in view mode — only shown when editing.
 * Closable by swiping down (uses SwipeableModal wrapper).
 */
interface Props {
    visible: boolean;
    onClose: () => void;
    person: Person | null;
    notes: SavedNote[];
    /** Whether the profile is unlocked (biometric passed) */
    isUnlocked: boolean;
    /** Trigger biometric to unlock profile details */
    onUnlock: () => Promise<boolean>;
    /** Save profile field changes */
    onUpdatePerson: (id: string, updates: Partial<Person>) => Promise<void>;
    /** Delete this person entirely (available in edit mode) */
    onDeletePerson?: (id: string) => void;
    /** Callback when a note is tapped */
    onNotePress: (note: SavedNote) => void;
    /** Whether notes content is unlocked (Stage 2) */
    isNotesUnlocked: boolean;
    /** Pass to SwipeableModal for scroll control */
    setHomeScrollEnabled?: (enabled: boolean) => void;
    isNoteActive?: (id: string) => boolean;
    isNoteQueued?: (id: string) => boolean;
}

export const PersonProfileModal: React.FC<Props> = React.memo(({
    visible,
    onClose,
    person,
    notes,
    isUnlocked,
    onUnlock,
    onUpdatePerson,
    onDeletePerson,
    onNotePress,
    isNotesUnlocked,
    setHomeScrollEnabled,
    isNoteActive,
    isNoteQueued,
}) => {
    /* ── Edit mode state ──────────────────────────────────────────────── */
    const [isEditing, setIsEditing] = useState(false);

    /**
     * Controlled edit fields — using useState (not useRef) so the keyboard
     * never fights with stale defaultValues during parent re-renders.
     * This eliminates the flickering bug when the keyboard opens/closes.
     */
    const [editNickname, setEditNickname] = useState('');
    const [editRelationship, setEditRelationship] = useState('');
    const [editBirthday, setEditBirthday] = useState('');
    const [editBio, setEditBio] = useState('');
    const [showRelationshipPicker, setShowRelationshipPicker] = useState(false);

    /** Ref for the custom relationship input (doesn't need re-renders) */
    const customRelInputRef = useRef('');

    /**
     * Prevents the sync useEffect from overwriting a just-saved value.
     * Without this, the person prop hasn't updated yet when the effect fires,
     * causing the old value to flash momentarily.
     */
    const justSavedRef = useRef(false);

    /* ── Derived: all available relationship options (predefined + custom) */
    const allRelationshipOptions = useMemo(() => {
        const custom = person?.customRelationships || [];
        return [...RELATIONSHIP_OPTIONS, ...custom];
    }, [person?.customRelationships]);

    /**
     * Initialize edit fields ONLY when entering edit mode.
     * Values are set atomically from the current person prop,
     * never re-synced mid-edit (which caused the stale-data bug).
     */
    const startEditing = () => {
        if (!person) return;
        setEditNickname(person.nickname || '');
        setEditRelationship(person.relationship || '');
        setEditBirthday(person.birthday || '');
        setEditBio(person.bio || '');
        setShowRelationshipPicker(false);
        justSavedRef.current = false;
        setIsEditing(true);
    };

    /* ── Reset edit mode when modal closes ─────────────────────────── */
    useEffect(() => {
        if (!visible) {
            setIsEditing(false);
            setShowRelationshipPicker(false);
        }
    }, [visible]);

    /* ── Auto-calculated stats ─────────────────────────────────────── */
    const stats = useMemo(() => {
        if (!person || notes.length === 0) {
            return { totalEntries: 0, totalWords: 0, firstDate: null, lastDate: null };
        }
        const sorted = [...notes].sort((a, b) => a.timestamp - b.timestamp);
        const totalWords = notes.reduce((sum, n) => {
            return sum + (n.text || '').split(/\s+/).filter(Boolean).length;
        }, 0);
        return {
            totalEntries: notes.length,
            totalWords,
            firstDate: new Date(sorted[0].timestamp),
            lastDate: new Date(sorted[sorted.length - 1].timestamp),
        };
    }, [notes, person]);

    /** Recent notes (newest first, capped) */
    const recentNotes = useMemo(() => {
        return [...notes]
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, MAX_RECENT_NOTES);
    }, [notes]);

    if (!person) return null;

    /* ── Save profile edits ────────────────────────────────────────── */
    const handleSave = async () => {
        justSavedRef.current = true;
        await onUpdatePerson(person.id, {
            nickname: editNickname.trim() || undefined,
            relationship: editRelationship.trim() || undefined,
            birthday: editBirthday.trim() || undefined,
            bio: editBio.trim() || undefined,
        });
        Vibration.vibrate(30);
        setIsEditing(false);
    };

    /** Add a custom relationship option */
    const handleAddCustomRelationship = () => {
        const trimmed = customRelInputRef.current.trim();
        if (!trimmed || allRelationshipOptions.includes(trimmed)) return;

        const updated = [...(person.customRelationships || []), trimmed];
        onUpdatePerson(person.id, { customRelationships: updated });
        setEditRelationship(trimmed);
        customRelInputRef.current = '';
    };

    /** Format a date string (YYYY-MM-DD) into a readable format */
    const formatBirthday = (dateStr: string) => {
        try {
            const parts = dateStr.split('-');
            if (parts.length !== 3) return dateStr;
            const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            return date.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' });
        } catch {
            return dateStr;
        }
    };

    /** Format a Date into a short month + year string */
    const formatShortDate = (date: Date) => {
        return date.toLocaleDateString('default', { month: 'short', year: 'numeric' });
    };

    /* ── Render: Locked state (before biometric) ───────────────────── */
    const renderLockedView = () => (
        <View style={styles.lockedContainer}>
            {/* Avatar (always visible) */}
            <View style={styles.avatarOuter}>
                <LinearGradient colors={[...AVATAR_GRADIENT]} style={styles.avatarGradientRing}>
                    <View style={styles.avatarInner}>
                        <Text style={styles.avatarText}>{person.name.charAt(0).toUpperCase()}</Text>
                    </View>
                </LinearGradient>
            </View>

            <Text style={styles.lockedName}>{person.name}</Text>
            <Text style={styles.lockedHint}>Verify your identity to view this profile</Text>

            <AnimatedScaleButton style={styles.unlockBtn} onPress={async () => {
                const success = await onUnlock();
                if (success) Vibration.vibrate(50);
            }}>
                <MaterialCommunityIcons name="fingerprint" size={24} color="#FFF" style={{ marginRight: 10 }} />
                <Text style={styles.unlockBtnText}>Unlock Profile</Text>
            </AnimatedScaleButton>
        </View>
    );

    /* ── Render: Edit mode ─────────────────────────────────────────── */
    const renderEditMode = () => (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
        >
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 60 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
            >
                {/* Section: Nickname */}
                <Text style={styles.editLabel}>Nickname</Text>
                <TextInput
                    style={styles.editInput}
                    value={editNickname}
                    onChangeText={setEditNickname}
                    placeholder="Optional display name..."
                    placeholderTextColor={theme.colors.textMuted}
                    keyboardAppearance="dark"
                />

                {/* Section: Relationship */}
                <Text style={styles.editLabel}>Relationship</Text>
                <AnimatedScaleButton
                    style={styles.editDropdown}
                    onPress={() => setShowRelationshipPicker(!showRelationshipPicker)}
                >
                    <Text style={[styles.editDropdownText, !editRelationship && { color: theme.colors.textMuted }]}>
                        {editRelationship || 'Select relationship...'}
                    </Text>
                    <MaterialCommunityIcons
                        name={showRelationshipPicker ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color={theme.colors.textSecondary}
                    />
                </AnimatedScaleButton>

                {showRelationshipPicker && (
                    <View style={styles.relPickerContainer}>
                        {allRelationshipOptions.map((rel) => (
                            <AnimatedScaleButton
                                key={rel}
                                style={[styles.relOption, editRelationship === rel && styles.relOptionActive]}
                                onPress={() => {
                                    setEditRelationship(rel);
                                    setShowRelationshipPicker(false);
                                }}
                            >
                                <Text style={[styles.relOptionText, editRelationship === rel && styles.relOptionTextActive]}>
                                    {rel}
                                </Text>
                                {editRelationship === rel && (
                                    <MaterialCommunityIcons name="check" size={18} color={theme.colors.primaryAction} />
                                )}
                            </AnimatedScaleButton>
                        ))}

                        {/* Add custom relationship */}
                        <View style={styles.addCustomRelRow}>
                            <TextInput
                                style={styles.addCustomRelInput}
                                defaultValue={customRelInputRef.current}
                                onChangeText={(text) => customRelInputRef.current = text}
                                placeholder="Add custom..."
                                placeholderTextColor={theme.colors.textMuted}
                                keyboardAppearance="dark"
                            />
                            <AnimatedScaleButton
                                style={[styles.addCustomRelBtn, !customRelInputRef.current.trim() && { opacity: 0.3 }]}
                                onPress={handleAddCustomRelationship}
                                disabled={!customRelInputRef.current.trim()}
                            >
                                <MaterialCommunityIcons name="plus" size={20} color="#000" />
                            </AnimatedScaleButton>
                        </View>
                    </View>
                )}

                {/* Section: Birthday */}
                <Text style={styles.editLabel}>Birthday</Text>
                <TextInput
                    style={styles.editInput}
                    value={editBirthday}
                    onChangeText={setEditBirthday}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.colors.textMuted}
                    keyboardAppearance="dark"
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                />
                <Text style={styles.editHint}>Format: 2000-05-15</Text>

                {/* Section: Bio / Notes */}
                <Text style={styles.editLabel}>Personal Notes</Text>
                <TextInput
                    style={[styles.editInput, styles.editTextArea]}
                    value={editBio}
                    onChangeText={setEditBio}
                    placeholder="Write personal notes about this person..."
                    placeholderTextColor={theme.colors.textMuted}
                    keyboardAppearance="dark"
                    multiline
                    textAlignVertical="top"
                />

                {/* Action buttons — full-width stacked: Save on top, Cancel below */}
                <View style={styles.editActions}>
                    <AnimatedScaleButton
                        style={styles.editSaveBtn}
                        onPress={handleSave}
                    >
                        <MaterialCommunityIcons name="check" size={20} color="#FFF" style={{ marginRight: 8 }} />
                        <Text style={styles.editSaveBtnText}>Save Changes</Text>
                    </AnimatedScaleButton>
                    <AnimatedScaleButton
                        style={styles.editCancelBtn}
                        onPress={() => setIsEditing(false)}
                    >
                        <Text style={styles.editCancelBtnText}>Cancel</Text>
                    </AnimatedScaleButton>
                </View>

                {/* Delete Person — danger zone, only in edit mode */}
                {onDeletePerson && (
                    <AnimatedScaleButton
                        style={styles.deleteDangerBtn}
                        onPress={() => {
                            onDeletePerson(person.id);
                            onClose();
                        }}
                    >
                        <MaterialCommunityIcons name="delete-outline" size={18} color={theme.colors.danger} style={{ marginRight: 8 }} />
                        <Text style={styles.deleteDangerBtnText}>Delete Person</Text>
                    </AnimatedScaleButton>
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );

    /* ── Render: Full unlocked profile view ─────────────────────────── */
    const renderProfileView = () => (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Avatar */}
            <View style={styles.profileAvatarContainer}>
                <View style={styles.avatarOuter}>
                    <LinearGradient colors={[...AVATAR_GRADIENT]} style={styles.avatarGradientRing}>
                        <View style={styles.avatarInner}>
                            <Text style={styles.avatarText}>{person.name.charAt(0).toUpperCase()}</Text>
                        </View>
                    </LinearGradient>
                </View>

                <Text style={styles.profileName}>{person.nickname || person.name}</Text>
                {person.nickname && (
                    <Text style={styles.profileRealName}>{person.name}</Text>
                )}
                {person.relationship && (
                    <View style={styles.relationshipBadge}>
                        <Text style={styles.relationshipBadgeText}>{person.relationship}</Text>
                    </View>
                )}
            </View>

            {/* Stats Row */}
            <View style={styles.statsRow}>
                <View style={styles.statCard}>
                    <Text style={styles.statValue}>{stats.totalEntries}</Text>
                    <Text style={styles.statLabel}>Entries</Text>
                </View>
                <View style={[styles.statCard, styles.statCardMiddle]}>
                    <Text style={styles.statValue}>{stats.totalWords.toLocaleString()}</Text>
                    <Text style={styles.statLabel}>Words</Text>
                </View>
                <View style={styles.statCard}>
                    <Text style={styles.statValue}>
                        {stats.firstDate ? formatShortDate(stats.firstDate) : '—'}
                    </Text>
                    <Text style={styles.statLabel}>Since</Text>
                </View>
            </View>

            {/* Quick Info — Only show populated fields */}
            {(person.birthday || person.bio) && (
                <View style={styles.infoSection}>
                    <Text style={styles.sectionTitle}>About</Text>

                    {person.birthday && (
                        <View style={styles.infoRow}>
                            <MaterialCommunityIcons name="cake-variant-outline" size={20} color={theme.colors.textSecondary} />
                            <Text style={styles.infoText}>{formatBirthday(person.birthday)}</Text>
                        </View>
                    )}

                    {person.bio && (
                        <View style={styles.bioContainer}>
                            <Text style={styles.bioText}>{person.bio}</Text>
                        </View>
                    )}
                </View>
            )}

            {/* Edit Profile button */}
            <AnimatedScaleButton style={styles.editProfileBtn} onPress={startEditing}>
                <MaterialCommunityIcons name="pencil-outline" size={18} color={theme.colors.primaryAction} style={{ marginRight: 8 }} />
                <Text style={styles.editProfileBtnText}>Edit Profile</Text>
            </AnimatedScaleButton>

            {/* Recent Entries */}
            {recentNotes.length > 0 && (
                <View style={styles.recentSection}>
                    <Text style={styles.sectionTitle}>Recent Entries</Text>
                    {recentNotes.map(note => (
                        <NoteCard
                            key={note.id}
                            note={note}
                            onPress={onNotePress}
                            isLocked={!isNotesUnlocked}
                            isProcessing={isNoteActive ? isNoteActive(note.id) : undefined}
                            isQueued={isNoteQueued ? isNoteQueued(note.id) : undefined}
                        />
                    ))}
                </View>
            )}

            {/* Member since footer */}
            <View style={styles.memberSince}>
                <MaterialCommunityIcons name="clock-outline" size={14} color={theme.colors.textMuted} style={{ marginRight: 6 }} />
                <Text style={styles.memberSinceText}>
                    Added {new Date(person.createdAt).toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' })}
                </Text>
            </View>
        </ScrollView>
    );

    return (
        <SwipeableModal
            visible={visible}
            onClose={onClose}
            title={isEditing ? 'Edit Profile' : person.name}
            setHomeScrollEnabled={setHomeScrollEnabled}
        >
            {!isUnlocked ? renderLockedView() : (isEditing ? renderEditMode() : renderProfileView())}
        </SwipeableModal>
    );
});

/* ═══════════════════════════════════════════════════════════════════
   STYLES — Premium dark UI matching the app's AMOLED aesthetic
   ═══════════════════════════════════════════════════════════════════ */
const styles = StyleSheet.create({
    /* ── Locked state ──────────────────────────────────────────────── */
    lockedContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 30,
    },
    lockedName: {
        color: '#FFF',
        fontSize: 28,
        fontWeight: '900',
        marginTop: 20,
        marginBottom: 8,
    },
    lockedHint: {
        color: theme.colors.textMuted,
        fontSize: 15,
        textAlign: 'center',
        marginBottom: 30,
    },
    unlockBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.primaryAction,
        paddingVertical: 16,
        paddingHorizontal: 28,
        borderRadius: 100,
        shadowColor: theme.colors.primaryAction,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    unlockBtnText: {
        color: '#FFF',
        fontSize: 17,
        fontWeight: '800',
    },

    /* ── Avatar ─────────────────────────────────────────────────────── */
    avatarOuter: {
        alignItems: 'center',
    },
    avatarGradientRing: {
        width: 100,
        height: 100,
        borderRadius: 50,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 3,
    },
    avatarInner: {
        width: 94,
        height: 94,
        borderRadius: 47,
        backgroundColor: '#0A0A0A',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 36,
        fontWeight: '900',
        color: '#FFF',
    },

    /* ── Profile view ──────────────────────────────────────────────── */
    profileAvatarContainer: {
        alignItems: 'center',
        marginBottom: 25,
        paddingTop: 5,
    },
    profileName: {
        color: '#FFF',
        fontSize: 28,
        fontWeight: '900',
        marginTop: 16,
        letterSpacing: -0.3,
    },
    profileRealName: {
        color: theme.colors.textSecondary,
        fontSize: 15,
        marginTop: 4,
    },
    relationshipBadge: {
        backgroundColor: 'rgba(255, 42, 42, 0.12)',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 100,
        marginTop: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 42, 42, 0.25)',
    },
    relationshipBadgeText: {
        color: theme.colors.primaryAction,
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.5,
    },

    /* ── Stats row ─────────────────────────────────────────────────── */
    statsRow: {
        flexDirection: 'row',
        marginBottom: 25,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: theme.colors.glassBackground,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
    },
    statCard: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 18,
    },
    statCardMiddle: {
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: theme.colors.glassBorder,
    },
    statValue: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: '800',
        marginBottom: 4,
    },
    statLabel: {
        color: theme.colors.textMuted,
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },

    /* ── Info section ───────────────────────────────────────────────── */
    infoSection: {
        marginBottom: 20,
    },
    sectionTitle: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1.2,
        marginBottom: 12,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.glassBackground,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        gap: 12,
    },
    infoText: {
        color: '#FFF',
        fontSize: 15,
        fontWeight: '500',
    },
    bioContainer: {
        backgroundColor: theme.colors.glassBackground,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        marginTop: 4,
    },
    bioText: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 15,
        lineHeight: 24,
    },

    /* ── Edit Profile button ───────────────────────────────────────── */
    editProfileBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 42, 42, 0.08)',
        paddingVertical: 14,
        borderRadius: 100,
        marginBottom: 25,
        borderWidth: 1,
        borderColor: 'rgba(255, 42, 42, 0.2)',
    },
    editProfileBtnText: {
        color: theme.colors.primaryAction,
        fontSize: 15,
        fontWeight: '700',
    },

    /* ── Recent entries section ─────────────────────────────────────── */
    recentSection: {
        marginBottom: 20,
    },

    /* ── Member since footer ───────────────────────────────────────── */
    memberSince: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
    },
    memberSinceText: {
        color: theme.colors.textMuted,
        fontSize: 13,
    },

    /* ── Edit mode ─────────────────────────────────────────────────── */
    editLabel: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 8,
        marginTop: 18,
    },
    editInput: {
        backgroundColor: 'rgba(255,255,255,0.06)',
        color: '#FFF',
        fontSize: 16,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    editTextArea: {
        minHeight: 120,
        textAlignVertical: 'top',
    },
    editHint: {
        color: theme.colors.textMuted,
        fontSize: 12,
        marginTop: 6,
        marginLeft: 4,
    },
    editDropdown: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255,255,255,0.06)',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    editDropdownText: {
        color: '#FFF',
        fontSize: 16,
    },

    /* ── Relationship picker ───────────────────────────────────────── */
    relPickerContainer: {
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 12,
        marginTop: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
    },
    relOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    relOptionActive: {
        backgroundColor: 'rgba(255, 42, 42, 0.08)',
    },
    relOptionText: {
        color: theme.colors.textSecondary,
        fontSize: 15,
        fontWeight: '500',
    },
    relOptionTextActive: {
        color: theme.colors.primaryAction,
        fontWeight: '700',
    },
    addCustomRelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        gap: 8,
    },
    addCustomRelInput: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
        color: '#FFF',
        fontSize: 14,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    addCustomRelBtn: {
        backgroundColor: theme.colors.primaryAction,
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },

    /* ── Edit action buttons — full-width stacked layout ────────────── */
    editActions: {
        marginTop: 30,
        gap: 10,
    },
    editSaveBtn: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 16,
        borderRadius: 100,
        backgroundColor: theme.colors.primaryAction,
        shadowColor: theme.colors.primaryAction,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    editSaveBtnText: {
        color: '#FFF',
        fontWeight: '800',
        fontSize: 16,
    },
    editCancelBtn: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 16,
        borderRadius: 100,
        backgroundColor: theme.colors.glassBackground,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
    },
    editCancelBtnText: {
        color: theme.colors.textPrimary,
        fontWeight: '700',
        fontSize: 15,
    },

    /* ── Delete danger button (only shown in edit mode) ───────────── */
    deleteDangerBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        marginTop: 20,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(255, 60, 60, 0.2)',
        backgroundColor: 'rgba(255, 60, 60, 0.06)',
    },
    deleteDangerBtnText: {
        color: theme.colors.danger,
        fontSize: 15,
        fontWeight: '700',
    },
});
