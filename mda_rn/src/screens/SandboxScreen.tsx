/**
 * SandboxScreen — Isolated component testing environment for developers.
 *
 * Provides a clean black canvas where individual UI components can be
 * mounted, inspected, and interacted with independently of the main
 * application state. Accessible only via Developer Tools.
 *
 * Components are selected via an ActionSheet dropdown. Each component
 * section renders with mock/synthetic data so no real context is needed.
 */
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Switch, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation.types';
import { theme } from '@/styles/theme';
import { commonStyles } from '@/styles/commonStyles';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { ActionSheet } from '@/components/ui/ActionSheet';
import { SettingsCard } from '@/components/ui/SettingsCard';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TickDial } from '@/components/ui/TickDial';

type Props = NativeStackScreenProps<RootStackParamList, 'Sandbox'>;

/* ── CONFIGURATION: List of testable components ────────────────────────── */
const COMPONENT_OPTIONS = [
    { id: 'colors', label: 'Colors & Typography', icon: 'palette' as const },
    { id: 'buttons', label: 'AnimatedScaleButton', icon: 'gesture-tap-button' as const },
    { id: 'settingscard', label: 'SettingsCard', icon: 'card-outline' as const },
    { id: 'actionsheet', label: 'ActionSheet', icon: 'menu-open' as const },
    { id: 'confirmdialog', label: 'ConfirmDialog', icon: 'alert-circle-outline' as const },
    { id: 'tickdial', label: 'TickDial', icon: 'timer-outline' as const },
];

export const SandboxScreen: React.FC<Props> = ({ navigation }) => {
    /* ── Component selector state ──────────────────────────────────────── */
    const [selectedId, setSelectedId] = useState('colors');
    const [showSelector, setShowSelector] = useState(false);

    /* ── Per-component test states ─────────────────────────────────────── */
    const [testSheetVisible, setTestSheetVisible] = useState(false);
    const [testDialogVisible, setTestDialogVisible] = useState(false);
    const [testSwitchOn, setTestSwitchOn] = useState(false);
    const [testDialIndex, setTestDialIndex] = useState(2);

    /** Retrieve the label for the currently selected component */
    const selectedLabel = COMPONENT_OPTIONS.find((o) => o.id === selectedId)?.label ?? 'Select';

    /** Handle component selector selection */
    const handleSelectComponent = useCallback((id: string) => {
        setSelectedId(id);
        setShowSelector(false);
    }, []);

    /** Handle test ActionSheet selection */
    const handleTestSelect = useCallback((id: string) => {
        Alert.alert('Selected', `Option: ${id}`);
        setTestSheetVisible(false);
    }, []);

    return (
        <View style={styles.container}>
            {/* ── Header bar ──────────────────────────────────────────── */}
            <View style={styles.header}>
                <AnimatedScaleButton onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Text style={styles.backBtnText}>← Exit</Text>
                </AnimatedScaleButton>
                <Text style={styles.headerTitle}>🧪 Sandbox</Text>
                <AnimatedScaleButton onPress={() => setShowSelector(true)} style={styles.selectorBtn}>
                    <Text style={styles.selectorBtnText}>{selectedLabel} ▼</Text>
                </AnimatedScaleButton>
            </View>

            {/* ── Component canvas ────────────────────────────────────── */}
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                {/* ─── Colors & Typography ─────────────────────────── */}
                {selectedId === 'colors' && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Theme Color Palette</Text>
                        <View style={styles.colorGrid}>
                            {(
                                [
                                    ['Primary', theme.colors.primaryAction],
                                    ['Danger', theme.colors.danger],
                                    ['Success', theme.colors.success],
                                    ['Gold', theme.colors.gold],
                                    ['Glass BG', theme.colors.glassBackground],
                                    ['Surface Dark', theme.colors.surfaceDark],
                                ] as [string, string][]
                            ).map(([name, color]) => (
                                <View key={name} style={[styles.colorSwatch, { backgroundColor: color }]}>
                                    <Text style={styles.swatchLabel}>{name}</Text>
                                    <Text style={styles.swatchHex}>{color}</Text>
                                </View>
                            ))}
                        </View>

                        <Text style={[styles.sectionTitle, { marginTop: 30 }]}>Typography Scale</Text>
                        <View style={{ gap: 12 }}>
                            <Text style={{ color: theme.colors.textPrimary, fontSize: 32, fontWeight: '900' }}>
                                H1 — Primary 32px
                            </Text>
                            <Text style={{ color: theme.colors.textPrimary, fontSize: 24, fontWeight: '700' }}>
                                H2 — Primary 24px
                            </Text>
                            <Text style={{ color: theme.colors.textSecondary, fontSize: 18, fontWeight: '600' }}>
                                H3 — Secondary 18px
                            </Text>
                            <Text style={{ color: theme.colors.textSecondary, fontSize: 16, fontWeight: '500' }}>
                                Body — Secondary 16px
                            </Text>
                            <Text style={{ color: theme.colors.textMuted, fontSize: 14, fontWeight: '400' }}>
                                Caption — Muted 14px
                            </Text>
                            <Text style={{ color: theme.colors.textMuted, fontSize: 11, fontWeight: '400' }}>
                                Micro — Muted 11px
                            </Text>
                        </View>
                    </View>
                )}

                {/* ─── AnimatedScaleButton ─────────────────────────── */}
                {selectedId === 'buttons' && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Button Variants</Text>
                        <View style={{ gap: 16 }}>
                            <AnimatedScaleButton
                                style={[commonStyles.dockedStartBtn, { paddingVertical: 16 }]}
                                onPress={() => Alert.alert('Primary pressed')}
                            >
                                <Text style={commonStyles.dockedStartBtnText}>Primary CTA Button</Text>
                            </AnimatedScaleButton>

                            <AnimatedScaleButton
                                style={commonStyles.closeVersionBtn}
                                onPress={() => Alert.alert('Secondary pressed')}
                            >
                                <Text style={commonStyles.closeVersionBtnText}>Secondary Button</Text>
                            </AnimatedScaleButton>

                            <AnimatedScaleButton
                                style={commonStyles.iconButton}
                                onPress={() => Alert.alert('Icon pressed')}
                            >
                                <Text style={commonStyles.iconButtonText}>⚙️ Icon Button</Text>
                            </AnimatedScaleButton>

                            <AnimatedScaleButton
                                style={[commonStyles.dockedStartBtn, { opacity: 0.4, paddingVertical: 16 }]}
                                disabled
                            >
                                <Text style={commonStyles.dockedStartBtnText}>Disabled Button</Text>
                            </AnimatedScaleButton>

                            <Text style={styles.sectionTitle}>Scale Variations</Text>
                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                <AnimatedScaleButton
                                    activeScale={0.8}
                                    style={[styles.scaleBox, { backgroundColor: theme.colors.danger }]}
                                    onPress={() => {}}
                                >
                                    <Text style={styles.scaleBoxText}>0.8</Text>
                                </AnimatedScaleButton>
                                <AnimatedScaleButton
                                    activeScale={0.9}
                                    style={[styles.scaleBox, { backgroundColor: theme.colors.gold }]}
                                    onPress={() => {}}
                                >
                                    <Text style={styles.scaleBoxText}>0.9</Text>
                                </AnimatedScaleButton>
                                <AnimatedScaleButton
                                    activeScale={0.95}
                                    style={[styles.scaleBox, { backgroundColor: theme.colors.success }]}
                                    onPress={() => {}}
                                >
                                    <Text style={styles.scaleBoxText}>0.95</Text>
                                </AnimatedScaleButton>
                            </View>
                        </View>
                    </View>
                )}

                {/* ─── SettingsCard ────────────────────────────────── */}
                {selectedId === 'settingscard' && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>SettingsCard States</Text>
                        <SettingsCard>
                            <Text
                                style={{
                                    color: theme.colors.textPrimary,
                                    fontWeight: '700',
                                    fontSize: 16,
                                    marginBottom: 4,
                                }}
                            >
                                Default Card
                            </Text>
                            <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
                                Glass-morphic container with standard border.
                            </Text>
                            <View
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    marginTop: 12,
                                }}
                            >
                                <Text style={{ color: theme.colors.textSecondary, fontSize: 14 }}>Toggle Example</Text>
                                <Switch
                                    value={testSwitchOn}
                                    onValueChange={setTestSwitchOn}
                                    trackColor={{ false: theme.colors.glassBorder, true: theme.colors.primaryAction }}
                                />
                            </View>
                        </SettingsCard>

                        <SettingsCard active>
                            <Text
                                style={{ color: theme.colors.gold, fontWeight: '700', fontSize: 16, marginBottom: 4 }}
                            >
                                Active Card (Gold Border)
                            </Text>
                            <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
                                Used when an important mode is enabled (e.g. Dev Mode).
                            </Text>
                        </SettingsCard>
                    </View>
                )}

                {/* ─── ActionSheet ────────────────────── */}
                {selectedId === 'actionsheet' && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>ActionSheet Demo</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginBottom: 20 }}>
                            The ActionSheet is a swipe-dismissable bottom sheet for option selection. Tap below to open
                            one with sample options.
                        </Text>
                        <AnimatedScaleButton
                            style={[commonStyles.dockedStartBtn, { paddingVertical: 16 }]}
                            onPress={() => setTestSheetVisible(true)}
                        >
                            <Text style={commonStyles.dockedStartBtnText}>Open ActionSheet</Text>
                        </AnimatedScaleButton>
                    </View>
                )}

                {/* ─── ConfirmDialog ─────────────────────────────── */}
                {selectedId === 'confirmdialog' && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>ConfirmDialog Demo</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginBottom: 20 }}>
                            The ConfirmDialog is used for destructive actions like deleting notes or clearing data.
                        </Text>
                        <AnimatedScaleButton
                            style={[commonStyles.closeVersionBtn, { backgroundColor: theme.colors.dangerFill }]}
                            onPress={() => setTestDialogVisible(true)}
                        >
                            <Text style={[commonStyles.closeVersionBtnText, { color: theme.colors.danger }]}>
                                Show Destructive Dialog
                            </Text>
                        </AnimatedScaleButton>
                    </View>
                )}

                {/* ─── TickDial ──────────────────────────────────── */}
                {selectedId === 'tickdial' && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>TickDial Demo</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginBottom: 20 }}>
                            The TickDial is a horizontal ruler-style selector used for time and difficulty settings.
                            Swipe left/right to change the value.
                        </Text>
                        <View style={{ alignItems: 'center' }}>
                            <TickDial
                                data={[1, 3, 5, 10, 15, 30]}
                                selectedIndex={testDialIndex}
                                onSelect={setTestDialIndex}
                                unit="min"
                            />
                        </View>
                    </View>
                )}

                {/* Bottom padding */}
                <View style={{ height: 60 }} />
            </ScrollView>

            {/* ── Component Selector ActionSheet ──────────────────────── */}
            <ActionSheet
                visible={showSelector}
                onClose={() => setShowSelector(false)}
                title="Select Component"
                options={COMPONENT_OPTIONS}
                activeId={selectedId}
                onSelect={handleSelectComponent}
            />

            {/* ── Test ActionSheet (for ActionSheet demo) ─────────────── */}
            <ActionSheet
                visible={testSheetVisible}
                onClose={() => setTestSheetVisible(false)}
                title="Sort Library By"
                options={[
                    { id: 'newest', label: 'Newest First', icon: 'sort-calendar-descending' },
                    { id: 'oldest', label: 'Oldest First', icon: 'sort-calendar-ascending' },
                    { id: 'longest', label: 'Longest First', icon: 'timer-outline' },
                ]}
                activeId="newest"
                onSelect={handleTestSelect}
            />

            {/* ── Test ConfirmDialog ──────────────────────────────────── */}
            <ConfirmDialog
                visible={testDialogVisible}
                title="Delete Everything?"
                message="This action cannot be undone. All your data will be permanently removed."
                confirmLabel="Delete"
                cancelLabel="Keep"
                destructive
                icon="delete-outline"
                onConfirm={() => {
                    setTestDialogVisible(false);
                    Alert.alert('Confirmed', 'Destructive action was confirmed.');
                }}
                onCancel={() => setTestDialogVisible(false)}
            />
        </View>
    );
};

/* ── Styles ────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.surfaceDark,
        paddingTop: Platform.OS === 'ios' ? 50 : 30,
    },
    header: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 10,
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.glassBorder,
    },
    headerTitle: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        fontWeight: '800',
    },
    backBtn: {
        backgroundColor: theme.colors.dangerFillLight,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 20,
    },
    backBtnText: {
        color: theme.colors.suggestionError,
        fontWeight: 'bold',
        fontSize: 13,
    },
    selectorBtn: {
        backgroundColor: theme.colors.glassBorder,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 20,
        maxWidth: 160,
    },
    selectorBtnText: {
        color: theme.colors.textPrimary,
        fontWeight: 'bold',
        fontSize: 12,
    },
    content: {
        padding: 20,
    },
    section: {
        marginBottom: 20,
    },
    sectionTitle: {
        color: theme.colors.textPrimary,
        fontSize: 20,
        fontWeight: '800',
        marginBottom: 16,
    },

    /* Color swatches */
    colorGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    colorSwatch: {
        width: '47%',
        height: 70,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.glassHighlight,
    },
    swatchLabel: {
        color: theme.colors.textPrimary,
        fontSize: 12,
        fontWeight: '700',
        textShadowColor: theme.colors.overlayVideoStrong,
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    swatchHex: {
        color: theme.colors.textBodyDim,
        fontSize: 9,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        textShadowColor: theme.colors.overlayVideoStrong,
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },

    /* Scale test boxes */
    scaleBox: {
        flex: 1,
        height: 60,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scaleBoxText: {
        color: theme.colors.background,
        fontWeight: '900',
        fontSize: 16,
    },
});
