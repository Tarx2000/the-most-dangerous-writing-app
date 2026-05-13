/**
 * PostWritingScreen — Post-session review with background AI processing.
 *
 * Shown after a writing session completes. Provides:
 * 1. Shimmer-loading AI title (queued in background via AI Queue)
 * 2. Shimmer-loading AI summary bullets
 * 3. Editable text area for last-chance corrections
 * 4. Optional "Check Grammar" button — user-triggered, inline
 * 5. "Save & Close" — saves edits and navigates home; AI continues in background
 *
 * The note is ALREADY saved before arriving here. This screen enriches it.
 * AI processing is delegated entirely to the central AI Queue Manager.
 * If the user leaves before AI finishes, the queue continues processing.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StyleSheet, Platform, ActivityIndicator, View, Text, ScrollView, TextInput } from 'react-native';
import { vibrate } from '@/lib/haptics';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation.types';
import { useNotes, useAiConfig, usePreferences } from '@/lib/hooks/useStorage';
import { useAiQueueContext } from '@/lib/hooks/useAiQueueProvider';
import { checkGrammar, type GrammarSuggestion } from '@/lib/aiService';
import { logger } from '@/lib/logger';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { ShimmerLine } from '@/components/ui/ShimmerLine';
import { theme } from '@/styles/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CONFIG } from '@/config';
import { MIN_AI_WORDS } from '@/config/ai';
import { LinearGradient } from 'expo-linear-gradient';
import { RichText } from '@/components/ui/RichText';
import type { AiJobCategory } from '@/types';
import { isAlignmentReflection } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PostWriting'>;

export const PostWritingScreen: React.FC<Props> = ({ route, navigation }) => {
    const { noteId } = route.params;
    const { savedNotes, updateNote } = useNotes();
    const { aiApiKey, aiBaseUrl, aiGrammarModel, aiPrompts, autoGenerateSummaries } = useAiConfig();

    /** User typography — applied to entry text only, not AI chrome */
    const { fontIndex, sizeIndex } = usePreferences();
    const activeFont = CONFIG.FONTS[fontIndex]?.value || (Platform.OS === 'ios' ? 'System' : 'sans-serif');
    const activeSize = CONFIG.SIZES[sizeIndex]?.value || 18;
    const activeLineHeight = CONFIG.SIZES[sizeIndex]?.line || 28;

    /** AI Queue — centralized, single-instance via AiQueueProvider */
    const { enqueueNote, isNoteActive, isNoteQueued, queueState } = useAiQueueContext();

    /* ── State ──────────────────────────────────────────────────────── */
    const editableTextRef = useRef('');
    const [renderKey, setRenderKey] = useState(0);

    /** Grammar check state (user-triggered, not through queue) */
    const [grammarSuggestions, setGrammarSuggestions] = useState<GrammarSuggestion[]>([]);
    const [grammarLoading, setGrammarLoading] = useState(false);
    const [grammarChecked, setGrammarChecked] = useState(false);

    /** Track if user is in text edit mode */
    const [isEditing, setIsEditing] = useState(false);

    /** Track if AI processing was already enqueued */
    const aiEnqueuedRef = useRef(false);
    const noteSavedRef = useRef(false);

    /** Unmount guard to prevent setState on unmounted component */
    const isMountedRef = useRef(true);
    useEffect(() => {
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // Data is auto-loaded by StorageProvider
    /** Find the note once data is loaded */
    const note = savedNotes.find((n) => n.id === noteId);

    /** Whether AI is currently processing this note */
    const aiProcessing = isNoteActive(noteId) || isNoteQueued(noteId);

    /** Whether AI has finished (we have results) */
    const hasAiTitle = !!note?.aiTitle;
    const hasAiSummary = !!(note?.aiSummary && note.aiSummary.length > 0);

    /** Initialize editable text when note is found */
    useEffect(() => {
        if (note && !editableTextRef.current) {
            editableTextRef.current = note.text;
            setRenderKey((prev) => prev + 1);
        }
    }, [note]);

    useEffect(() => {
        if (!note || aiEnqueuedRef.current || !autoGenerateSummaries) return;

        // Skip AI for tweets (short entries) — tweets don't get title/summary
        if (note.isTweet) {
            aiEnqueuedRef.current = true;
            return;
        }

        // Skip AI for very short notes (below AI threshold)
        const noteWordCount = note.text.trim().split(/\s+/).filter(Boolean).length;
        if (noteWordCount < MIN_AI_WORDS) {
            aiEnqueuedRef.current = true;
            return;
        }

        aiEnqueuedRef.current = true;

        // Determine category based on note properties
        const category: AiJobCategory = isAlignmentReflection(note) ? 'checkin' : note.personId ? 'circle' : 'journal';

        // Only enqueue if the note doesn't already have AI data
        if (!note.aiTitle || !note.aiSummary || note.aiSummary.length === 0) {
            enqueueNote(noteId, category);
        }
    }, [note, noteId, enqueueNote, autoGenerateSummaries]);

    /* ── Manual AI Generate ─────────────────────────────────────────── */
    const handleManualGenerate = useCallback(() => {
        if (!note) return;
        if (note.isTweet) return;
        const noteWordCount = note.text.trim().split(/\s+/).filter(Boolean).length;
        if (noteWordCount < MIN_AI_WORDS) return;
        aiEnqueuedRef.current = true;
        const category: AiJobCategory = isAlignmentReflection(note) ? 'checkin' : note.personId ? 'circle' : 'journal';
        enqueueNote(noteId, category);
        vibrate(20);
    }, [note, noteId, enqueueNote]);

    /* ── Grammar Check (user-triggered) ─────────────────────────────── */
    const handleGrammarCheck = useCallback(async () => {
        if (grammarLoading || !editableTextRef.current.trim()) return;
        setGrammarLoading(true);
        vibrate(30);

        try {
            const suggestions = await checkGrammar(editableTextRef.current, {
                apiKey: aiApiKey,
                baseUrl: aiBaseUrl,
                model: aiGrammarModel,
                prompts: aiPrompts,
            });
            if (!isMountedRef.current) return;
            setGrammarSuggestions(suggestions);
            setGrammarChecked(true);
        } catch (err) {
            logger('warn', 'AI', 'Grammar check failed:', err);
        } finally {
            if (isMountedRef.current) {
                setGrammarLoading(false);
            }
        }
    }, [aiApiKey, aiBaseUrl, aiGrammarModel, aiPrompts, grammarLoading]);

    /* ── Apply a single grammar suggestion (tap-to-accept) ──────────── */
    const applySuggestion = useCallback((suggestion: GrammarSuggestion) => {
        const newText = editableTextRef.current.replace(suggestion.original, suggestion.suggestion);
        editableTextRef.current = newText;
        setRenderKey((prev) => prev + 1);
        setGrammarSuggestions((prev) => prev.filter((s) => s !== suggestion));
        vibrate(20);
    }, []);

    const handleSaveAndClose = useCallback(async () => {
        if (noteSavedRef.current) return;
        noteSavedRef.current = true;

        // Save any text edits (AI results are saved directly by the queue)
        await updateNote(noteId, { text: editableTextRef.current });

        navigation.reset({
            index: 0,
            routes: [
                {
                    name: 'Home',
                    params: route.params.streakIncreased
                        ? { streakIncreased: true, newStreak: route.params.newStreak }
                        : undefined,
                },
            ],
        });
    }, [noteId, navigation, route.params, updateNote]);

    /* ── Render ──────────────────────────────────────────────────────── */

    /** Word count — only recompute when editable text actually changes */
    const wordCount = useMemo(() => {
        return editableTextRef.current.trim().split(/\s+/).filter(Boolean).length;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [renderKey]);
    const isTooShortForAi = note?.isTweet || wordCount < MIN_AI_WORDS;

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={[theme.colors.surfaceDark, theme.colors.background]}
                style={StyleSheet.absoluteFillObject}
            />

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* ── Header ──────────────────────────────────────── */}
                <View style={styles.header}>
                    <View style={styles.headerBadge}>
                        <MaterialCommunityIcons name="creation" size={16} color={theme.colors.primaryAction} />
                        <Text style={styles.headerBadgeText}>AI Enhanced</Text>
                    </View>
                    <Text style={styles.headerTitle}>Session Complete</Text>
                    <Text style={styles.headerMeta}>
                        {wordCount} words • {note?.dateStr || 'Just now'}
                    </Text>
                </View>

                {/* ── AI Title ────────────────────────────────────── */}
                <View style={styles.sectionContainer}>
                    <Text style={styles.sectionLabel}>
                        <MaterialCommunityIcons name="format-title" size={14} color={theme.colors.textMuted} /> AI TITLE
                    </Text>
                    {!hasAiTitle ? (
                        queueState.serverOnline === false ? (
                            <Text style={{ color: theme.colors.danger, fontStyle: 'italic', paddingVertical: 10 }}>
                                AI Server Unreachable
                            </Text>
                        ) : isTooShortForAi ? (
                            <Text style={{ color: theme.colors.textMuted, fontStyle: 'italic', paddingVertical: 10 }}>
                                Short entry — AI title not available
                            </Text>
                        ) : !aiProcessing ? (
                            <AnimatedScaleButton onPress={handleManualGenerate} style={{ paddingVertical: 10 }}>
                                <Text style={{ color: theme.colors.primaryAction, fontWeight: '700' }}>
                                    Enable AI Processing for this entry
                                </Text>
                            </AnimatedScaleButton>
                        ) : (
                            <View style={styles.shimmerContainer}>
                                <ShimmerLine width="75%" height={24} />
                            </View>
                        )
                    ) : (
                        <RichText style={styles.aiTitleText} text={note?.aiTitle || 'Untitled Entry'} />
                    )}
                </View>

                {/* ── AI Summary ──────────────────────────────────── */}
                <View style={styles.summaryCard}>
                    <View style={styles.summaryHeader}>
                        <MaterialCommunityIcons name="brain" size={18} color={theme.colors.primaryAction} />
                        <Text style={styles.summaryHeaderText}>AI Summary</Text>
                        {aiProcessing && (
                            <ActivityIndicator
                                size="small"
                                color={theme.colors.primaryAction}
                                style={{ marginLeft: 'auto' }}
                            />
                        )}
                    </View>
                    {!hasAiSummary ? (
                        queueState.serverOnline === false ? (
                            <Text style={{ color: theme.colors.textMuted, fontStyle: 'italic', paddingVertical: 10 }}>
                                Summary unavailable.
                            </Text>
                        ) : isTooShortForAi ? (
                            <Text style={{ color: theme.colors.textMuted, fontStyle: 'italic', paddingVertical: 10 }}>
                                Short entry — AI summary not available
                            </Text>
                        ) : !aiProcessing ? (
                            <Text style={{ color: theme.colors.textMuted, fontStyle: 'italic', paddingVertical: 10 }}>
                                Tap 'Enable AI Processing' above to generate summary.
                            </Text>
                        ) : (
                            <View style={styles.shimmerContainer}>
                                <ShimmerLine width="90%" style={{ marginBottom: 10 }} />
                                <ShimmerLine width="80%" style={{ marginBottom: 10 }} />
                                <ShimmerLine width="85%" />
                            </View>
                        )
                    ) : (
                        <View style={styles.bulletsContainer}>
                            {(note?.aiSummary || []).map((bullet, i) => (
                                <View key={i} style={styles.bulletRow}>
                                    <Text style={styles.bulletDot}>•</Text>
                                    <RichText style={styles.bulletText} text={bullet} />
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                {/* ── Editable Text ───────────────────────────────── */}
                <View style={styles.sectionContainer}>
                    <View style={styles.editHeader}>
                        <Text style={styles.sectionLabel}>
                            <MaterialCommunityIcons name="pencil-outline" size={14} color={theme.colors.textMuted} />{' '}
                            YOUR ENTRY
                        </Text>
                        <AnimatedScaleButton style={styles.editToggle} onPress={() => setIsEditing(!isEditing)}>
                            <MaterialCommunityIcons
                                name={isEditing ? 'check' : 'pencil'}
                                size={14}
                                color={isEditing ? theme.colors.green : theme.colors.textMuted}
                            />
                            <Text style={[styles.editToggleText, isEditing && { color: theme.colors.green }]}>
                                {isEditing ? 'Done' : 'Edit'}
                            </Text>
                        </AnimatedScaleButton>
                    </View>

                    {isEditing ? (
                        <TextInput
                            key={renderKey}
                            style={[
                                styles.editableTextInput,
                                { fontFamily: activeFont, fontSize: activeSize, lineHeight: activeLineHeight },
                            ]}
                            defaultValue={editableTextRef.current}
                            onChangeText={(val) => (editableTextRef.current = val)}
                            multiline
                            autoFocus
                            selectionColor={theme.colors.primaryAction}
                        />
                    ) : (
                        <View style={styles.readOnlyTextContainer}>
                            <RichText
                                style={[
                                    styles.readOnlyText,
                                    { fontFamily: activeFont, fontSize: activeSize, lineHeight: activeLineHeight },
                                ]}
                                text={editableTextRef.current}
                            />
                        </View>
                    )}
                </View>

                {/* ── Grammar Check (user-triggered only) ─────────── */}
                <View style={styles.grammarSection}>
                    {!grammarChecked ? (
                        <AnimatedScaleButton
                            style={[styles.grammarBtn, grammarLoading && styles.grammarBtnLoading]}
                            onPress={handleGrammarCheck}
                            disabled={grammarLoading}
                        >
                            {grammarLoading ? (
                                <ActivityIndicator size="small" color={theme.colors.primaryAction} />
                            ) : (
                                <MaterialCommunityIcons
                                    name="spellcheck"
                                    size={20}
                                    color={theme.colors.primaryAction}
                                />
                            )}
                            <Text style={styles.grammarBtnText}>
                                {grammarLoading ? 'Checking...' : 'Check Grammar & Spelling'}
                            </Text>
                        </AnimatedScaleButton>
                    ) : (
                        <View>
                            <View style={styles.grammarResultHeader}>
                                <MaterialCommunityIcons name="spellcheck" size={16} color={theme.colors.green} />
                                <Text style={styles.grammarResultTitle}>
                                    {grammarSuggestions.length === 0
                                        ? 'No issues found! ✨'
                                        : `${grammarSuggestions.length} suggestion${grammarSuggestions.length > 1 ? 's' : ''}`}
                                </Text>
                            </View>

                            {grammarSuggestions.map((s, i) => (
                                <AnimatedScaleButton
                                    key={i}
                                    style={styles.suggestionCard}
                                    onPress={() => applySuggestion(s)}
                                    activeOpacity={0.6}
                                >
                                    <View style={styles.suggestionContent}>
                                        <View style={styles.suggestionTexts}>
                                            <Text style={styles.suggestionOriginal}>{s.original}</Text>
                                            <MaterialCommunityIcons
                                                name="arrow-right"
                                                size={14}
                                                color={theme.colors.textMuted}
                                            />
                                            <Text style={styles.suggestionFixed}>{s.suggestion}</Text>
                                        </View>
                                        <Text style={styles.suggestionExplanation}>{s.explanation}</Text>
                                    </View>
                                    <View style={styles.suggestionApplyBtn}>
                                        <MaterialCommunityIcons name="check" size={16} color={theme.colors.green} />
                                    </View>
                                </AnimatedScaleButton>
                            ))}
                        </View>
                    )}
                </View>

                {/* Bottom padding */}
                <View style={{ height: 120 }} />
            </ScrollView>

            {/* ── Floating Save Button ────────────────────────────── */}
            <View style={styles.floatingFooter}>
                <AnimatedScaleButton style={styles.saveBtn} onPress={handleSaveAndClose}>
                    <MaterialCommunityIcons name="content-save-check" size={20} color={theme.colors.background} />
                    <Text style={styles.saveBtnText}>Save & Close</Text>
                </AnimatedScaleButton>
            </View>
        </View>
    );
};

/* ── Styles ───────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
    },

    /* Header */
    header: {
        alignItems: 'center',
        marginBottom: 30,
    },
    headerBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.dangerTint,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.colors.dangerBorder,
        marginBottom: 12,
        gap: 6,
    },
    headerBadgeText: {
        color: theme.colors.primaryAction,
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    headerTitle: {
        color: theme.colors.textPrimary,
        fontSize: 28,
        fontWeight: '900',
        letterSpacing: -0.5,
        marginBottom: 6,
    },
    headerMeta: {
        color: theme.colors.textMuted,
        fontSize: 14,
        fontWeight: '500',
    },

    /* Section containers */
    sectionContainer: {
        marginBottom: 20,
    },
    sectionLabel: {
        color: theme.colors.textMuted,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        marginBottom: 10,
    },
    shimmerContainer: {
        paddingVertical: 8,
    },

    /* AI Title */
    aiTitleText: {
        color: theme.colors.textPrimary,
        fontSize: 22,
        fontWeight: '800',
        lineHeight: 30,
    },

    /* AI Summary Card */
    summaryCard: {
        backgroundColor: theme.colors.glassSurface,
        borderRadius: 20,
        padding: 20,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: theme.colors.glassSurfaceMedium,
    },
    summaryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    summaryHeaderText: {
        color: theme.colors.primaryAction,
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    bulletsContainer: {
        gap: 10,
    },
    bulletRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    bulletDot: {
        color: theme.colors.primaryAction,
        fontSize: 18,
        fontWeight: 'bold',
        lineHeight: 24,
    },
    bulletText: {
        color: theme.colors.textBody,
        fontSize: 15,
        lineHeight: 24,
        flex: 1,
    },

    /* Editable Text */
    editHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    editToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: theme.colors.glassSurface,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 12,
    },
    editToggleText: {
        color: theme.colors.textMuted,
        fontSize: 12,
        fontWeight: '600',
    },
    editableTextInput: {
        color: theme.colors.textInput,
        fontSize: 16, // Overridden at render-time with user's preferred size
        lineHeight: 26,
        backgroundColor: theme.colors.glassSurface,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        minHeight: 150,
        textAlignVertical: 'top',
    },
    readOnlyTextContainer: {
        backgroundColor: theme.colors.glassSurfaceSubtle,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: theme.colors.glassBorderSubtle,
    },
    readOnlyText: {
        color: theme.colors.textBodyDim,
        fontSize: 16, // Overridden at render-time with user's preferred size
        lineHeight: 26,
    },

    /* Grammar Check */
    grammarSection: {
        marginBottom: 20,
    },
    grammarBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        backgroundColor: theme.colors.dangerLight,
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.dangerAccent,
    },
    grammarBtnLoading: {
        opacity: 0.7,
    },
    grammarBtnText: {
        color: theme.colors.primaryAction,
        fontSize: 15,
        fontWeight: '700',
    },
    grammarResultHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    grammarResultTitle: {
        color: theme.colors.green,
        fontSize: 14,
        fontWeight: '700',
    },
    suggestionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.suggestionBackground,
        borderRadius: 14,
        padding: 14,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: theme.colors.suggestionBorder,
    },
    suggestionContent: {
        flex: 1,
    },
    suggestionTexts: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
        flexWrap: 'wrap',
    },
    suggestionOriginal: {
        color: theme.colors.suggestionError,
        fontSize: 14,
        fontWeight: '600',
        textDecorationLine: 'line-through',
    },
    suggestionFixed: {
        color: theme.colors.green,
        fontSize: 14,
        fontWeight: '700',
    },
    suggestionExplanation: {
        color: theme.colors.textMuted,
        fontSize: 12,
        fontStyle: 'italic',
    },
    suggestionApplyBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: theme.colors.successFill,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 10,
    },

    /* Floating Footer */
    floatingFooter: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        paddingTop: 16,
    },
    saveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: theme.colors.textPrimary,
        paddingVertical: 16,
        borderRadius: 100,
        shadowColor: theme.colors.textPrimary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 15,
        elevation: 10,
    },
    saveBtnText: {
        color: theme.colors.background,
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
});

export default PostWritingScreen;
