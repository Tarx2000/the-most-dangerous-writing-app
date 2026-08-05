import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Platform, Alert, Keyboard } from 'react-native';
import { usePillars } from '@/lib/hooks/useStorage';
import { theme } from '@/styles/theme';
import { vibrate } from '@/lib/haptics';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { generateId } from '@/lib/utils';
import type { Pillar, AdviceCard } from '@/types';

export const PillarsSettingsPanel: React.FC = () => {
    const { pillars, adviceCards, savePillar, deletePillar, saveAdviceCard, deleteAdviceCard } = usePillars();

    // Pillar Form States
    const [pillarTitle, setPillarTitle] = useState('');
    const [pillarType, setPillarType] = useState<Pillar['type']>('rating');
    const [pillarScope, setPillarScope] = useState<Pillar['scope']>('daily');
    const [adaptiveDays, setAdaptiveDays] = useState('14');

    // Advice Form States
    const [adviceText, setAdviceText] = useState('');

    const handleAddPillar = async () => {
        // Dismiss keyboard first to avoid focus or layout glitches on save
        Keyboard.dismiss();

        if (!pillarTitle.trim()) {
            Alert.alert('Error', 'Please enter a title for your Pillar.');
            return;
        }

        const days = parseInt(adaptiveDays, 10);
        if (pillarScope === 'adaptive' && (isNaN(days) || days <= 0)) {
            Alert.alert('Error', 'Please enter a valid number of days for Adaptive scope.');
            return;
        }

        const newPillar: Pillar = {
            id: generateId(),
            title: pillarTitle.trim(),
            type: pillarType,
            scope: pillarScope,
            createdAt: Date.now(),
            lastEditedAt: Date.now(),
            adaptiveDays: pillarScope === 'adaptive' ? days : 14,
            isActive: true,
            version: 1,
        };

        try {
            await savePillar(newPillar);
            vibrate(30);
            setPillarTitle('');
            // Reset to defaults
            setPillarType('rating');
            setPillarScope('daily');
            setAdaptiveDays('14');
        } catch {
            Alert.alert('Error', 'Failed to save Pillar. Please try again.');
        }
    };

    /** Confirm before permanently deleting a mastery (removes all its history). */
    const confirmDeletePillar = useCallback(
        (item: Pillar) => {
            Alert.alert(
                'Delete Mastery?',
                `"${item.title}" and all of its check-in history will be permanently deleted. This cannot be undone.`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => {
                            deletePillar(item.id).catch(() => {
                                Alert.alert('Error', 'Could not delete the mastery. Please try again.');
                            });
                        },
                    },
                ],
            );
        },
        [deletePillar],
    );

    /** Confirm before deleting an advice card. */
    const confirmDeleteAdvice = useCallback(
        (item: AdviceCard) => {
            Alert.alert(
                'Delete Advice Card?',
                'This advice card and its reflection count will be permanently deleted.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => {
                            deleteAdviceCard(item.id).catch(() => {
                                Alert.alert('Error', 'Could not delete the advice card. Please try again.');
                            });
                        },
                    },
                ],
            );
        },
        [deleteAdviceCard],
    );

    const handleAddAdvice = async () => {
        // Dismiss keyboard first to avoid focus or layout glitches on save
        Keyboard.dismiss();

        if (!adviceText.trim()) {
            Alert.alert('Error', 'Please enter advice text.');
            return;
        }

        const newAdvice: AdviceCard = {
            id: generateId(),
            text: adviceText.trim(),
            createdAt: Date.now(),
            lastReflectedAt: null,
            reflectionCount: 0,
            isActive: true,
        };

        try {
            await saveAdviceCard(newAdvice);
            vibrate(30);
            setAdviceText('');
        } catch {
            Alert.alert('Error', 'Failed to save Advice Card.');
        }
    };

    const getTypeIcon = (type: Pillar['type']) => {
        switch (type) {
            case 'rating':
                return 'star-half-full';
            case 'time':
                return 'clock-outline';
            case 'boolean':
                return 'checkbox-marked-circle-outline';
            case 'text':
                return 'text-box-outline';
        }
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.sectionHeader}>
                <MaterialCommunityIcons name="pillar" size={20} color={theme.colors.primaryAction} />
                <Text style={styles.sectionTitle}>Masteries of Growth</Text>
            </View>
            <Text style={styles.subtext}>
                Masteries represent habits, stats, or mindset rules you are tracking. They start as "Daily" (active
                practice) and graduate to "Weekly" maintenance.
            </Text>

            {/* List of active pillars */}
            <View style={styles.listContainer}>
                {pillars.length === 0 ? (
                    <Text style={styles.emptyText}>No active Masteries. Add one below!</Text>
                ) : (
                    pillars.map((item) => (
                        <View key={item.id} style={styles.itemRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}>
                                <MaterialCommunityIcons
                                    name={getTypeIcon(item.type)}
                                    size={18}
                                    color={theme.colors.textSecondary}
                                />
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.itemTitle}>{item.title}</Text>
                                    <Text style={styles.itemMeta}>
                                        {item.type.toUpperCase()} • {item.scope.toUpperCase()}
                                        {item.scope === 'adaptive' ? ` (${item.adaptiveDays} days)` : ''}
                                    </Text>
                                </View>
                            </View>
                            <Pressable
                                onPress={() => {
                                    vibrate(10);
                                    confirmDeletePillar(item);
                                }}
                                style={styles.deleteBtn}
                            >
                                <MaterialCommunityIcons
                                    name="trash-can-outline"
                                    size={18}
                                    color={theme.colors.danger}
                                />
                            </Pressable>
                        </View>
                    ))
                )}
            </View>

            {/* Form to add a Pillar */}
            <View style={styles.formCard}>
                <Text style={styles.formTitle}>Add New Mastery</Text>

                <TextInput
                    style={styles.input}
                    value={pillarTitle}
                    onChangeText={setPillarTitle}
                    placeholder="Mastery Name (e.g. Sleep Duration)"
                    placeholderTextColor={theme.colors.placeholder}
                    selectionColor={theme.colors.primaryAction}
                />

                {/* Type Selection */}
                <Text style={styles.label}>Log Input Type</Text>
                <View style={styles.row}>
                    {(['rating', 'time', 'boolean', 'text'] as Pillar['type'][]).map((t) => (
                        <Pressable
                            key={t}
                            style={[styles.pill, pillarType === t && styles.pillActive]}
                            onPress={() => {
                                vibrate(10);
                                setPillarType(t);
                            }}
                        >
                            <Text style={[styles.pillText, pillarType === t && styles.pillTextActive]}>
                                {t.toUpperCase()}
                            </Text>
                        </Pressable>
                    ))}
                </View>

                {/* Scope Selection */}
                <Text style={styles.label}>Scope</Text>
                <View style={styles.row}>
                    {(['daily', 'weekly', 'adaptive'] as Pillar['scope'][]).map((s) => (
                        <Pressable
                            key={s}
                            style={[styles.pill, pillarScope === s && styles.pillActive]}
                            onPress={() => {
                                vibrate(10);
                                setPillarScope(s);
                            }}
                        >
                            <Text style={[styles.pillText, pillarScope === s && styles.pillTextActive]}>
                                {s.toUpperCase()}
                            </Text>
                        </Pressable>
                    ))}
                </View>

                {/* Adaptive Days Input */}
                {pillarScope === 'adaptive' && (
                    <View style={styles.adaptiveRow}>
                        <Text style={styles.adaptiveLabel}>Days to graduate to Weekly:</Text>
                        <TextInput
                            style={styles.adaptiveInput}
                            value={adaptiveDays}
                            onChangeText={setAdaptiveDays}
                            keyboardType="number-pad"
                            maxLength={3}
                            placeholder="14"
                            placeholderTextColor={theme.colors.placeholder}
                            selectionColor={theme.colors.primaryAction}
                        />
                    </View>
                )}

                <AnimatedScaleButton style={styles.submitBtn} onPress={handleAddPillar}>
                    <Text style={styles.submitBtnText}>ADD MASTERY</Text>
                </AnimatedScaleButton>
            </View>

            <View style={[styles.divider, { marginVertical: 30 }]} />

            {/* Advice Section */}
            <View style={styles.sectionHeader}>
                <MaterialCommunityIcons name="cards-outline" size={20} color={theme.colors.primaryAction} />
                <Text style={styles.sectionTitle}>Life Advice Deck</Text>
            </View>
            <Text style={styles.subtext}>
                Write down quotes or life advice you want to practice. The app will smartly rotate these and ask how
                implementation went.
            </Text>

            {/* List of active advice */}
            <View style={styles.listContainer}>
                {adviceCards.length === 0 ? (
                    <Text style={styles.emptyText}>No advice cards saved yet.</Text>
                ) : (
                    adviceCards.map((item) => (
                        <View key={item.id} style={styles.itemRow}>
                            <View style={{ flex: 1, paddingRight: 10 }}>
                                <Text style={styles.adviceCardText}>"{item.text}"</Text>
                                <Text style={styles.itemMeta}>Reflections: {item.reflectionCount}</Text>
                            </View>
                            <Pressable
                                onPress={() => {
                                    vibrate(10);
                                    confirmDeleteAdvice(item);
                                }}
                                style={styles.deleteBtn}
                            >
                                <MaterialCommunityIcons
                                    name="trash-can-outline"
                                    size={18}
                                    color={theme.colors.danger}
                                />
                            </Pressable>
                        </View>
                    ))
                )}
            </View>

            {/* Form to add Advice */}
            <View style={styles.formCard}>
                <Text style={styles.formTitle}>Add Advice Card</Text>
                <TextInput
                    style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
                    value={adviceText}
                    onChangeText={setAdviceText}
                    multiline
                    placeholder="Enter life advice (e.g. Listen 80%, speak 20%)"
                    placeholderTextColor={theme.colors.placeholder}
                    selectionColor={theme.colors.primaryAction}
                />
                <AnimatedScaleButton style={styles.submitBtn} onPress={handleAddAdvice}>
                    <Text style={styles.submitBtnText}>ADD ADVICE</Text>
                </AnimatedScaleButton>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginTop: 10,
        backgroundColor: theme.colors.glassBackground,
        borderRadius: theme.borderRadius.md,
        padding: 20,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        marginBottom: 20,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    sectionTitle: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        fontWeight: 'bold',
        fontFamily: theme.typography.fontFamily,
    },
    subtext: {
        color: theme.colors.textMuted,
        fontSize: 13,
        lineHeight: 18,
        marginBottom: 20,
    },
    listContainer: {
        gap: 10,
        marginBottom: 20,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: theme.colors.glassSurfaceMinimal,
        padding: 12,
        borderRadius: theme.borderRadius.sm,
        borderWidth: 1,
        borderColor: theme.colors.glassBorderSubtle,
    },
    itemTitle: {
        color: theme.colors.textPrimary,
        fontSize: 14,
        fontWeight: '600',
    },
    itemMeta: {
        color: theme.colors.textDim,
        fontSize: 11,
        marginTop: 2,
    },
    adviceCardText: {
        color: theme.colors.textPrimary,
        fontSize: 14,
        fontStyle: 'italic',
        lineHeight: 20,
    },
    emptyText: {
        color: theme.colors.textDim,
        fontSize: 13,
        textAlign: 'center',
        paddingVertical: 10,
    },
    deleteBtn: {
        padding: 6,
    },
    formCard: {
        backgroundColor: theme.colors.glassSurfaceSubtle,
        borderRadius: theme.borderRadius.sm,
        padding: 14,
        borderWidth: 1,
        borderColor: theme.colors.glassBorderFaint,
    },
    formTitle: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 10,
    },
    input: {
        backgroundColor: theme.colors.background,
        color: theme.colors.textPrimary,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: Platform.OS === 'ios' ? 12 : 8,
        fontSize: 14,
        marginBottom: 12,
    },
    label: {
        color: theme.colors.textDim,
        fontSize: 11,
        fontWeight: '600',
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    row: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 15,
    },
    pill: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 15,
        backgroundColor: theme.colors.glassSurface,
        borderWidth: 1,
        borderColor: theme.colors.glassBorderSubtle,
    },
    pillActive: {
        backgroundColor: theme.colors.primaryAction,
        borderColor: theme.colors.primaryAction,
    },
    pillText: {
        color: theme.colors.textSecondary,
        fontSize: 11,
        fontWeight: 'bold',
    },
    pillTextActive: {
        color: theme.colors.background,
    },
    adaptiveRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 15,
    },
    adaptiveLabel: {
        color: theme.colors.textSecondary,
        fontSize: 13,
    },
    adaptiveInput: {
        backgroundColor: theme.colors.background,
        color: theme.colors.textPrimary,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        borderRadius: 8,
        width: 60,
        textAlign: 'center',
        paddingVertical: Platform.OS === 'ios' ? 6 : 4,
        fontSize: 14,
    },
    submitBtn: {
        backgroundColor: theme.colors.textPrimary,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 5,
    },
    submitBtnText: {
        color: theme.colors.background,
        fontSize: 13,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    divider: {
        height: 1,
        backgroundColor: theme.colors.glassBorder,
    },
});
