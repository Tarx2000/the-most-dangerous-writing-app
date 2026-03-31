/**
 * PostWritingScreen — AI-enhanced post-session review screen.
 *
 * Shown after a writing session completes. Provides:
 * 1. Auto-generated AI title (always runs in background)
 * 2. Auto-generated AI summary bullets (always runs in background)
 * 3. Editable text area for last-chance corrections
 * 4. Optional "Check Grammar" button — AI finds issues, tap-to-accept fixes
 * 5. "Save & Close" — saves edits + AI data (AI continues in background if not done)
 *
 * The note is ALREADY saved before arriving here. This screen enriches it.
 * If the user leaves before AI finishes, processing continues in background.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Platform,
    Dimensions,
    ActivityIndicator,
    Vibration,
    Animated,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation.types';
import { useStorage } from '@/lib/hooks/useStorage';
import { generateTitle, generateSummary, checkGrammar, type GrammarSuggestion } from '@/lib/aiService';
import { theme } from '@/styles/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { RichText } from '@/components/ui/RichText';

type Props = NativeStackScreenProps<RootStackParamList, 'PostWriting'>;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

/* ── Shimmer Loading Animation Component ─────────────────────────────── */

/** Simple shimmer placeholder for loading states */
const ShimmerLine: React.FC<{ width: number | string; height?: number; style?: any }> = ({ width, height = 16, style }) => {
    const animValue = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(animValue, { toValue: 1, duration: 1000, useNativeDriver: true }),
                Animated.timing(animValue, { toValue: 0, duration: 1000, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [animValue]);

    const opacity = animValue.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.35] });

    return (
        <Animated.View style={[{ width: width as any, height, borderRadius: 8, backgroundColor: '#FFF', opacity }, style]} />
    );
};

export const PostWritingScreen: React.FC<Props> = ({ route, navigation }) => {
    const { noteId } = route.params;
    const storage = useStorage();

    /* ── State ──────────────────────────────────────────────────────── */
    const [editableText, setEditableText] = useState('');
    const [aiTitle, setAiTitle] = useState<string | null>(null);
    const [aiSummary, setAiSummary] = useState<string[] | null>(null);
    const [titleLoading, setTitleLoading] = useState(true);
    const [summaryLoading, setSummaryLoading] = useState(true);

    /** Grammar check state */
    const [grammarSuggestions, setGrammarSuggestions] = useState<GrammarSuggestion[]>([]);
    const [grammarLoading, setGrammarLoading] = useState(false);
    const [grammarChecked, setGrammarChecked] = useState(false);

    /** Track if user is in text edit mode */
    const [isEditing, setIsEditing] = useState(false);

    /** Track if AI background processing was already started */
    const aiStartedRef = useRef(false);
    const noteSavedRef = useRef(false);

    /* ── Load note data on mount ────────────────────────────────────── */
    useEffect(() => {
        storage.loadAllData();
    }, []);

    /** Find the note once data is loaded */
    const note = storage.savedNotes.find(n => n.id === noteId);

    /** Initialize editable text when note is found */
    useEffect(() => {
        if (note && !editableText) {
            setEditableText(note.text);
        }
    }, [note]);

    /* ── AI Processing (runs automatically in background) ───────────── */
    useEffect(() => {
        if (!note || aiStartedRef.current) return;
        aiStartedRef.current = true;

        const aiConfig = {
            apiKey: storage.aiApiKey,
            baseUrl: storage.aiBaseUrl,
            model: storage.aiModel,
            prompts: storage.aiPrompts,
        };

        // Mark note as processing
        storage.updateNote(noteId, { aiProcessing: true });

        // Generate title (background)
        generateTitle(note.text, aiConfig, chunk => {
            setAiTitle(chunk.replace(/^["']+|["']+$/g, '').trim());
        })
            .then(title => {
                setAiTitle(title);
                setTitleLoading(false);
                storage.updateNote(noteId, { aiTitle: title });
            })
            .catch(err => {
                console.warn('[AI] Title generation failed:', err);
                setTitleLoading(false);
            });

        // Generate summary (background)
        generateSummary(note.text, aiConfig, chunk => {
            const tempBullets = chunk
                .split('\n')
                .map(line => line.replace(/^[\s•\-*]+/, '').trim())
                .filter(line => line.length > 0)
                .slice(0, 5);
            setAiSummary(tempBullets);
        })
            .then(summary => {
                setAiSummary(summary);
                setSummaryLoading(false);
                storage.updateNote(noteId, { 
                    aiSummary: summary, 
                    aiModelUsed: storage.aiModel,
                    aiProcessing: false 
                });
            })
            .catch(err => {
                console.warn('[AI] Summary generation failed:', err);
                setSummaryLoading(false);
                storage.updateNote(noteId, { aiProcessing: false });
            });
    }, [note, storage.aiApiKey]);

    /* ── Grammar Check (user-triggered) ─────────────────────────────── */
    const handleGrammarCheck = useCallback(async () => {
        if (grammarLoading || !editableText.trim()) return;
        setGrammarLoading(true);
        Vibration.vibrate(30);

        try {
            const suggestions = await checkGrammar(editableText, {
                apiKey: storage.aiApiKey,
                baseUrl: storage.aiBaseUrl,
                model: storage.aiGrammarModel,
                prompts: storage.aiPrompts,
            });
            setGrammarSuggestions(suggestions);
            setGrammarChecked(true);
        } catch (err) {
            console.warn('[AI] Grammar check failed:', err);
        } finally {
            setGrammarLoading(false);
        }
    }, [editableText, storage.aiApiKey, storage.aiBaseUrl, storage.aiGrammarModel, storage.aiPrompts, grammarLoading]);

    /* ── Apply a single grammar suggestion (tap-to-accept) ──────────── */
    const applySuggestion = useCallback((suggestion: GrammarSuggestion) => {
        const newText = editableText.replace(suggestion.original, suggestion.suggestion);
        setEditableText(newText);
        // Remove the applied suggestion from the list
        setGrammarSuggestions(prev => prev.filter(s => s !== suggestion));
        Vibration.vibrate(20);
    }, [editableText]);

    /* ── Save & Close ───────────────────────────────────────────────── */
    const handleSaveAndClose = useCallback(async () => {
        if (noteSavedRef.current) return;
        noteSavedRef.current = true;

        // Save any text edits + AI data that's available so far
        const updates: any = { text: editableText };
        if (aiTitle) updates.aiTitle = aiTitle;
        if (aiSummary) updates.aiSummary = aiSummary;
        // Leave aiProcessing true if AI isn't done — it was already persisted in background

        await storage.updateNote(noteId, updates);

        navigation.reset({
            index: 0,
            routes: [{
                name: 'Home',
                params: route.params.streakIncreased
                    ? { streakIncreased: true, newStreak: route.params.newStreak }
                    : undefined,
            }],
        });
    }, [editableText, aiTitle, aiSummary, noteId, navigation, route.params]);

    /* ── Render ──────────────────────────────────────────────────────── */

    const wordCount = editableText.trim().split(/\s+/).filter(Boolean).length;

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#0a0a0a', '#000000']} style={StyleSheet.absoluteFillObject} />

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
                    {titleLoading ? (
                        <View style={styles.shimmerContainer}>
                            <ShimmerLine width="75%" height={24} />
                        </View>
                    ) : (
                        <RichText style={styles.aiTitleText} text={aiTitle || 'Untitled Entry'} />
                    )}
                </View>

                {/* ── AI Summary ──────────────────────────────────── */}
                <View style={styles.summaryCard}>
                    <View style={styles.summaryHeader}>
                        <MaterialCommunityIcons name="brain" size={18} color={theme.colors.primaryAction} />
                        <Text style={styles.summaryHeaderText}>AI Summary</Text>
                    </View>
                    {summaryLoading ? (
                        <View style={styles.shimmerContainer}>
                            <ShimmerLine width="90%" style={{ marginBottom: 10 }} />
                            <ShimmerLine width="80%" style={{ marginBottom: 10 }} />
                            <ShimmerLine width="85%" />
                        </View>
                    ) : (
                        <View style={styles.bulletsContainer}>
                            {(aiSummary || []).map((bullet, i) => (
                                <View key={i} style={styles.bulletRow}>
                                    <Text style={styles.bulletDot}>•</Text>
                                    <RichText style={styles.bulletText} text={bullet} />
                                </View>
                            ))}
                            {(!aiSummary || aiSummary.length === 0) && (
                                <Text style={styles.noDataText}>Summary could not be generated</Text>
                            )}
                        </View>
                    )}
                </View>

                {/* ── Editable Text ───────────────────────────────── */}
                <View style={styles.sectionContainer}>
                    <View style={styles.editHeader}>
                        <Text style={styles.sectionLabel}>
                            <MaterialCommunityIcons name="pencil-outline" size={14} color={theme.colors.textMuted} /> YOUR ENTRY
                        </Text>
                        <TouchableOpacity
                            style={styles.editToggle}
                            onPress={() => setIsEditing(!isEditing)}
                        >
                            <MaterialCommunityIcons
                                name={isEditing ? 'check' : 'pencil'}
                                size={14}
                                color={isEditing ? '#4ade80' : theme.colors.textMuted}
                            />
                            <Text style={[styles.editToggleText, isEditing && { color: '#4ade80' }]}>
                                {isEditing ? 'Done' : 'Edit'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {isEditing ? (
                        <TextInput
                            style={styles.editableTextInput}
                            value={editableText}
                            onChangeText={setEditableText}
                            multiline
                            autoFocus
                            selectionColor={theme.colors.primaryAction}
                        />
                    ) : (
                        <View style={styles.readOnlyTextContainer}>
                            <RichText style={styles.readOnlyText} text={editableText} />
                        </View>
                    )}
                </View>

                {/* ── Grammar Check ───────────────────────────────── */}
                <View style={styles.grammarSection}>
                    {!grammarChecked ? (
                        <TouchableOpacity
                            style={[styles.grammarBtn, grammarLoading && styles.grammarBtnLoading]}
                            onPress={handleGrammarCheck}
                            disabled={grammarLoading}
                        >
                            {grammarLoading ? (
                                <ActivityIndicator size="small" color={theme.colors.primaryAction} />
                            ) : (
                                <MaterialCommunityIcons name="spellcheck" size={20} color={theme.colors.primaryAction} />
                            )}
                            <Text style={styles.grammarBtnText}>
                                {grammarLoading ? 'Checking...' : 'Check Grammar & Spelling'}
                            </Text>
                        </TouchableOpacity>
                    ) : (
                        <View>
                            <View style={styles.grammarResultHeader}>
                                <MaterialCommunityIcons name="spellcheck" size={16} color="#4ade80" />
                                <Text style={styles.grammarResultTitle}>
                                    {grammarSuggestions.length === 0
                                        ? 'No issues found! ✨'
                                        : `${grammarSuggestions.length} suggestion${grammarSuggestions.length > 1 ? 's' : ''}`
                                    }
                                </Text>
                            </View>

                            {grammarSuggestions.map((s, i) => (
                                <TouchableOpacity
                                    key={i}
                                    style={styles.suggestionCard}
                                    onPress={() => applySuggestion(s)}
                                    activeOpacity={0.6}
                                >
                                    <View style={styles.suggestionContent}>
                                        <View style={styles.suggestionTexts}>
                                            <Text style={styles.suggestionOriginal}>{s.original}</Text>
                                            <MaterialCommunityIcons name="arrow-right" size={14} color={theme.colors.textMuted} />
                                            <Text style={styles.suggestionFixed}>{s.suggestion}</Text>
                                        </View>
                                        <Text style={styles.suggestionExplanation}>{s.explanation}</Text>
                                    </View>
                                    <View style={styles.suggestionApplyBtn}>
                                        <MaterialCommunityIcons name="check" size={16} color="#4ade80" />
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>

                {/* Bottom padding */}
                <View style={{ height: 120 }} />
            </ScrollView>

            {/* ── Floating Save Button ────────────────────────────── */}
            <View style={styles.floatingFooter}>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveAndClose}>
                    <MaterialCommunityIcons name="content-save-check" size={20} color="#000" />
                    <Text style={styles.saveBtnText}>Save & Close</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

/* ── Styles ───────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
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
        backgroundColor: 'rgba(255, 42, 42, 0.1)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 42, 42, 0.2)',
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
        color: '#FFF',
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
        color: '#FFF',
        fontSize: 22,
        fontWeight: '800',
        lineHeight: 30,
    },

    /* AI Summary Card */
    summaryCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderRadius: 20,
        padding: 20,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
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
        color: 'rgba(255, 255, 255, 0.85)',
        fontSize: 15,
        lineHeight: 24,
        flex: 1,
    },
    noDataText: {
        color: theme.colors.textMuted,
        fontSize: 14,
        fontStyle: 'italic',
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
        backgroundColor: 'rgba(255,255,255,0.06)',
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
        color: 'rgba(255, 255, 255, 0.9)',
        fontSize: 16,
        lineHeight: 26,
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        minHeight: 150,
        textAlignVertical: 'top',
    },
    readOnlyTextContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    readOnlyText: {
        color: 'rgba(255, 255, 255, 0.8)',
        fontSize: 16,
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
        backgroundColor: 'rgba(255, 42, 42, 0.08)',
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 42, 42, 0.15)',
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
        color: '#4ade80',
        fontSize: 14,
        fontWeight: '700',
    },
    suggestionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 200, 50, 0.06)',
        borderRadius: 14,
        padding: 14,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 200, 50, 0.12)',
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
        color: '#ff6b6b',
        fontSize: 14,
        fontWeight: '600',
        textDecorationLine: 'line-through',
    },
    suggestionFixed: {
        color: '#4ade80',
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
        backgroundColor: 'rgba(74, 222, 128, 0.1)',
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
        backgroundColor: '#FFF',
        paddingVertical: 16,
        borderRadius: 100,
        shadowColor: '#FFF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 15,
        elevation: 10,
    },
    saveBtnText: {
        color: '#000',
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
});

export default PostWritingScreen;
