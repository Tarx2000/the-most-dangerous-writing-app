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
import {
    StyleSheet,
    Platform,
    ActivityIndicator,
    View,
    Text,
    ScrollView,
    TextInput,
    useWindowDimensions,
    DeviceEventEmitter,
} from 'react-native';
import { vibrate } from '@/lib/haptics';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSequence,
    Easing,
    runOnJS,
} from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation.types';
import { StackActions } from '@react-navigation/native';
import { useNotes, useAiConfig, usePreferences } from '@/lib/hooks/useStorage';
import { useAiQueueContext } from '@/lib/hooks/useAiQueueProvider';
import { checkGrammar, classifyError, type GrammarSuggestion } from '@/lib/aiService';
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
import { BlurView } from 'expo-blur';
import { AnimatedLockIcon } from '@/components/ui/AnimatedLockIcon';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

type Props = NativeStackScreenProps<RootStackParamList, 'PostWriting'>;

// Customizable configuration variables for animation transitions
const FLY_AWAY_SCROLL_OFFSET = Platform.OS === 'ios' ? 140 : 120;

export const PostWritingScreen: React.FC<Props> = ({ route, navigation }) => {
    const { noteId } = route.params;
    const { savedNotes, updateNote } = useNotes();
    const { aiApiKey, aiBaseUrl, aiGrammarModel, aiPrompts, autoGenerateSummaries, aiProvider } = useAiConfig();

    /** User typography — applied to entry text only, not AI chrome */
    const { fontIndex, sizeIndex } = usePreferences();
    const activeFont = CONFIG.FONTS[fontIndex]?.value || (Platform.OS === 'ios' ? 'System' : 'sans-serif');
    const activeSize = CONFIG.SIZES[sizeIndex]?.value || 18;
    const activeLineHeight = CONFIG.SIZES[sizeIndex]?.line || 28;

    /** AI Queue — centralized, single-instance via AiQueueProvider */
    const { enqueueNote, isNoteActive, isNoteQueued, queueState, failureNotifications, retryNote } =
        useAiQueueContext();

    /** Per-note failure notification (if this note's AI processing failed permanently)
     *  — surfaces the actionable reason + Retry so the user isn't left guessing why
     *  no title/summary appeared. */
    const noteFailure = failureNotifications.find((n) => n.noteId === noteId) ?? null;

    /* ── State ──────────────────────────────────────────────────────── */
    const editableTextRef = useRef('');
    const [renderKey, setRenderKey] = useState(0);

    /** Grammar check state (user-triggered, not through queue) */
    const [grammarSuggestions, setGrammarSuggestions] = useState<GrammarSuggestion[]>([]);
    const [grammarLoading, setGrammarLoading] = useState(false);
    const [grammarChecked, setGrammarChecked] = useState(false);
    /**
     * Grammar check error — holds a friendly, actionable message when the
     * check itself fails (network, auth, parse, …). When set, the UI shows an
     * error banner instead of the misleading "No issues found!" state, and
     * offers a Retry button. `null` means "no error surfaced yet".
     */
    const [grammarError, setGrammarError] = useState<string | null>(null);

    /** Track if user is in text edit mode */
    const [isEditing, setIsEditing] = useState(false);

    /** Track if AI processing was already enqueued */
    const aiEnqueuedRef = useRef(false);
    const noteSavedRef = useRef(false);

    // Centered lock animation states during save transition
    const [showLockIcon, setShowLockIcon] = useState(false);
    const [isLockIconUnlocked, setIsLockIconUnlocked] = useState(true);

    /** Unmount guard to prevent setState on unmounted component */
    const isMountedRef = useRef(true);
    useEffect(() => {
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const scrollViewRef = useRef<ScrollView>(null);

    // Intercept back actions (system back button or gesture) and pop directly to Home menu
    useEffect(() => {
        const unsubscribe = navigation.addListener('beforeRemove', (e) => {
            if (noteSavedRef.current) return;
            e.preventDefault();
            navigation.dispatch(StackActions.popToTop());
        });
        return unsubscribe;
    }, [navigation]);

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
        setGrammarError(null); // clear any prior error before re-checking
        vibrate(30);

        try {
            const suggestions = await checkGrammar(editableTextRef.current, {
                apiKey: aiApiKey,
                baseUrl: aiBaseUrl,
                // Honour the dedicated grammar model when set; checkGrammar
                // already falls back to the provider default if undefined.
                grammarModel: aiGrammarModel || undefined,
                provider: aiProvider,
                prompts: aiPrompts,
            });
            if (!isMountedRef.current) return;
            setGrammarSuggestions(suggestions);
            setGrammarChecked(true);
        } catch (err: unknown) {
            // Classify so the user gets an actionable message rather than a
            // silent return-to-idle. checkGrammar now throws AiError('parse')
            // on unparseable responses; network/auth/timeouts come from the XHR layer.
            const classified = classifyError(err);
            logger('warn', 'AI', 'Grammar check failed:', { kind: classified.kind, message: classified.message });
            if (!isMountedRef.current) return;
            setGrammarError(classified.userMessage);
        } finally {
            if (isMountedRef.current) {
                setGrammarLoading(false);
            }
        }
    }, [aiApiKey, aiBaseUrl, aiGrammarModel, aiProvider, aiPrompts, grammarLoading]);

    /* ── Apply a single grammar suggestion (tap-to-accept) ──────────── */
    const applySuggestion = useCallback((suggestion: GrammarSuggestion) => {
        const newText = editableTextRef.current.replace(suggestion.original, suggestion.suggestion);
        editableTextRef.current = newText;
        setRenderKey((prev) => prev + 1);
        setGrammarSuggestions((prev) => prev.filter((s) => s !== suggestion));
        vibrate(20);
    }, []);

    const { width: screenWidth, height: screenHeight } = useWindowDimensions();

    // ── Save/Exit Animation Shared Values ──
    const saveTranslateX = useSharedValue(0);
    const saveScale = useSharedValue(1);
    const saveOpacity = useSharedValue(1);
    const saveBorderRadius = useSharedValue(0);
    const saveBorderWidth = useSharedValue(0);
    const saveBgColor = useSharedValue('transparent');
    const saveWidth = useSharedValue(screenWidth);
    const saveHeight = useSharedValue(screenHeight);
    const footerOpacity = useSharedValue(1);
    const blurIntensity = useSharedValue<number | undefined>(0);
    const contentOpacity = useSharedValue(1);
    const lockIconOpacity = useSharedValue(0);

    /** Plays a card-shrink, content-blur, and slide-right throw animation during exit saving */
    const performSaveFlyAway = useCallback(
        (onComplete: () => void) => {
            // Reset and show lock overlay
            setShowLockIcon(true);
            setIsLockIconUnlocked(true);

            // Smoothly scroll the container to center the AI Title in the viewport
            scrollViewRef.current?.scrollTo({ y: FLY_AWAY_SCROLL_OFFSET, animated: true });

            // Notify WritingScreen underneath to fade out its background in sync
            DeviceEventEmitter.emit('EXIT_POST_WRITING');

            // Fade background gradient to transparent in sync with exit transition
            footerOpacity.value = withTiming(0, { duration: 250 });

            // Apply card styling borders and card background color
            saveBorderRadius.value = withTiming(theme.borderRadius.md, { duration: 250 });
            saveBorderWidth.value = withTiming(1, { duration: 250 });
            saveBgColor.value = withTiming(theme.colors.surfaceCard, { duration: 250 });

            // Blur the contents inside the card rapidly and with balanced density (earlier in the transition)
            blurIntensity.value = withTiming(80, { duration: 150 });

            // Fade out internal card content to dissolve details into the blur
            contentOpacity.value = withTiming(0, { duration: 150 });

            // Fade in the lock icon overlay rapidly in sync with the blur
            lockIconOpacity.value = withTiming(1, { duration: 150 });

            // Swing the shackle closed after a brief delay to ensure the user perceives the lock action
            setTimeout(() => {
                setIsLockIconUnlocked(false);
            }, 30);

            // Shrink dimensions to card size in place
            saveWidth.value = withTiming(320, {
                duration: 350,
                easing: Easing.bezier(0.25, 1, 0.5, 1),
            });
            saveHeight.value = withTiming(180, {
                duration: 350,
                easing: Easing.bezier(0.25, 1, 0.5, 1),
            });

            // Scale shrinks slightly to match the original card feel
            saveScale.value = withTiming(0.85, {
                duration: 350,
                easing: Easing.bezier(0.25, 1, 0.5, 1),
            });

            // Translate off screen to the right
            saveTranslateX.value = withSequence(
                withTiming(0, { duration: 200 }), // hold for shrink
                withTiming(
                    screenWidth * 1.3,
                    {
                        duration: 400,
                        easing: Easing.bezier(0.3, 0, 0.8, 0.15),
                    },
                    (finished) => {
                        if (finished) {
                            runOnJS(onComplete)();
                        }
                    },
                ),
            );

            // Fade the card out completely as it flies off screen
            saveOpacity.value = withSequence(withTiming(1, { duration: 350 }), withTiming(0, { duration: 250 }));
        },
        [
            screenWidth,
            footerOpacity,
            saveBorderRadius,
            saveBorderWidth,
            saveBgColor,
            blurIntensity,
            contentOpacity,
            lockIconOpacity,
            saveWidth,
            saveHeight,
            saveScale,
            saveTranslateX,
            saveOpacity,
        ],
    );

    const handleSaveAndClose = useCallback(async () => {
        if (noteSavedRef.current) return;
        noteSavedRef.current = true;

        // Save any text edits (AI results are saved directly by the queue)
        await updateNote(noteId, { text: editableTextRef.current });

        performSaveFlyAway(() => {
            // Emit streak data via event so Home screen picks it up without re-rendering from param changes
            if (route.params.streakIncreased) {
                DeviceEventEmitter.emit('streakIncreased', { newStreak: route.params.newStreak });
            }
            navigation.dispatch(StackActions.popToTop());
        });
    }, [noteId, navigation, route.params, updateNote, performSaveFlyAway]);

    const saveAnimatedStyle = useAnimatedStyle(() => {
        return {
            width: saveWidth.value,
            height: saveHeight.value,
            alignSelf: 'center',
            transform: [{ translateX: saveTranslateX.value }, { scale: saveScale.value }],
            opacity: saveOpacity.value,
            borderRadius: saveBorderRadius.value,
            borderWidth: saveBorderWidth.value,
            backgroundColor: saveBgColor.value,
            borderColor: theme.colors.glassBorder,
            overflow: 'hidden',
        };
    });

    const animatedFooterStyle = useAnimatedStyle(() => ({
        opacity: footerOpacity.value,
    }));

    const animatedContentStyle = useAnimatedStyle(() => ({
        opacity: contentOpacity.value,
    }));

    const lockIconAnimatedStyle = useAnimatedStyle(() => ({
        opacity: lockIconOpacity.value,
        transform: [{ scale: lockIconOpacity.value }],
    }));

    /* ── Render ──────────────────────────────────────────────────────── */

    /** Word count — only recompute when editable text actually changes */
    const wordCount = useMemo(() => {
        return editableTextRef.current.trim().split(/\s+/).filter(Boolean).length;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [renderKey]);
    const isTooShortForAi = note?.isTweet || wordCount < MIN_AI_WORDS;

    return (
        <View style={styles.container}>
            <Animated.View style={[StyleSheet.absoluteFillObject, animatedFooterStyle]}>
                <LinearGradient
                    colors={[theme.colors.surfaceDark, theme.colors.background]}
                    style={StyleSheet.absoluteFillObject}
                />
            </Animated.View>

            <Animated.View style={saveAnimatedStyle}>
                <Animated.ScrollView
                    ref={scrollViewRef as unknown as React.RefObject<ScrollView>}
                    style={[styles.scrollView, animatedContentStyle]}
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

                    {/* ── Per-note AI failure banner ──────────────────────
                        If this note's AI processing failed permanently (max retries,
                        auth error, parse error, …) the queue surfaced a notification.
                        Show it here with the actionable reason + Retry instead of
                        leaving the writer wondering why no title/summary appeared. */}
                    {noteFailure && !hasAiTitle && (
                        <View style={styles.noteFailureBox}>
                            <View style={styles.noteFailureHeader}>
                                <MaterialCommunityIcons
                                    name="alert-circle-outline"
                                    size={16}
                                    color={theme.colors.danger}
                                />
                                <Text style={styles.noteFailureTitle}>AI processing failed</Text>
                            </View>
                            <Text style={styles.noteFailureMsg}>{noteFailure.message}</Text>
                            <AnimatedScaleButton style={styles.noteFailureRetryBtn} onPress={() => retryNote(noteId)}>
                                <MaterialCommunityIcons name="refresh" size={14} color={theme.colors.primaryAction} />
                                <Text style={styles.noteFailureRetryText}>Retry</Text>
                            </AnimatedScaleButton>
                        </View>
                    )}

                    {/* ── AI Title ────────────────────────────────────── */}
                    <View style={styles.sectionContainer}>
                        <Text style={styles.sectionLabel}>
                            <MaterialCommunityIcons name="format-title" size={14} color={theme.colors.textMuted} /> AI
                            TITLE
                        </Text>
                        {!hasAiTitle ? (
                            queueState.serverOnline === false ? (
                                <View style={{ paddingVertical: 10 }}>
                                    <Text style={{ color: theme.colors.danger, fontStyle: 'italic' }}>
                                        AI Server Unreachable
                                    </Text>
                                    {/* Show the actionable, classified reason (e.g. "Your API key
                                        is invalid or expired…") so the user knows what to fix. */}
                                    {queueState.lastError ? (
                                        <Text
                                            style={{
                                                color: theme.colors.textMuted,
                                                fontSize: 11,
                                                marginTop: 4,
                                                fontStyle: 'italic',
                                            }}
                                        >
                                            {queueState.lastError}
                                        </Text>
                                    ) : null}
                                    <Text
                                        style={{
                                            color: theme.colors.textMuted,
                                            fontSize: 11,
                                            marginTop: 4,
                                        }}
                                    >
                                        Open AI Settings to check your provider, key, and base URL. The queue will
                                        resume automatically when the server is back.
                                    </Text>
                                </View>
                            ) : isTooShortForAi ? (
                                <Text
                                    style={{ color: theme.colors.textMuted, fontStyle: 'italic', paddingVertical: 10 }}
                                >
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
                                <View style={{ paddingVertical: 10 }}>
                                    <Text style={{ color: theme.colors.textMuted, fontStyle: 'italic' }}>
                                        Summary unavailable.
                                    </Text>
                                    {queueState.lastError ? (
                                        <Text
                                            style={{
                                                color: theme.colors.textMuted,
                                                fontSize: 11,
                                                marginTop: 4,
                                                fontStyle: 'italic',
                                            }}
                                        >
                                            {queueState.lastError}
                                        </Text>
                                    ) : null}
                                </View>
                            ) : isTooShortForAi ? (
                                <Text
                                    style={{ color: theme.colors.textMuted, fontStyle: 'italic', paddingVertical: 10 }}
                                >
                                    Short entry — AI summary not available
                                </Text>
                            ) : !aiProcessing ? (
                                <Text
                                    style={{ color: theme.colors.textMuted, fontStyle: 'italic', paddingVertical: 10 }}
                                >
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
                                <MaterialCommunityIcons
                                    name="pencil-outline"
                                    size={14}
                                    color={theme.colors.textMuted}
                                />{' '}
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
                                    {
                                        fontFamily: activeFont,
                                        fontSize: activeSize,
                                        lineHeight: activeLineHeight,
                                        color: theme.colors.textInput,
                                    },
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
                        {/* Error banner: the check itself failed (network/auth/parse).
                            Previously this was swallowed to a logger call and the user
                            saw a misleading "No issues found!" — now we surface a
                            friendly message + Retry so they can act on it. */}
                        {grammarError ? (
                            <View style={styles.grammarErrorBox}>
                                <View style={styles.grammarErrorHeader}>
                                    <MaterialCommunityIcons
                                        name="alert-circle-outline"
                                        size={16}
                                        color={theme.colors.danger}
                                    />
                                    <Text style={styles.grammarErrorTitle}>Couldn't check grammar</Text>
                                </View>
                                <Text style={styles.grammarErrorMsg}>{grammarError}</Text>
                                <AnimatedScaleButton
                                    style={styles.grammarRetryBtn}
                                    onPress={() => {
                                        setGrammarError(null);
                                        handleGrammarCheck();
                                    }}
                                >
                                    <MaterialCommunityIcons
                                        name="refresh"
                                        size={14}
                                        color={theme.colors.primaryAction}
                                    />
                                    <Text style={styles.grammarRetryText}>Try again</Text>
                                </AnimatedScaleButton>
                            </View>
                        ) : !grammarChecked ? (
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
                </Animated.ScrollView>

                {/* Animated Double Blur Overlay — stacked to double the native blur strength */}
                <AnimatedBlurView
                    intensity={blurIntensity}
                    tint="dark"
                    style={StyleSheet.absoluteFillObject}
                    pointerEvents="none"
                />
                <AnimatedBlurView
                    intensity={blurIntensity}
                    tint="dark"
                    style={StyleSheet.absoluteFillObject}
                    pointerEvents="none"
                />

                {/* Centered Lock Animation Overlay */}
                {showLockIcon && (
                    <Animated.View
                        style={[
                            StyleSheet.absoluteFillObject,
                            { justifyContent: 'center', alignItems: 'center' },
                            lockIconAnimatedStyle,
                        ]}
                        pointerEvents="none"
                    >
                        <View style={styles.lockOverlayCircle}>
                            <AnimatedLockIcon
                                isUnlocked={isLockIconUnlocked}
                                color={theme.colors.textPrimary}
                                size={32}
                                duration={140}
                            />
                        </View>
                    </Animated.View>
                )}
            </Animated.View>

            {/* ── Floating Save Button ────────────────────────────── */}
            <Animated.View style={[styles.floatingFooter, animatedFooterStyle]}>
                <AnimatedScaleButton style={styles.saveBtn} onPress={handleSaveAndClose}>
                    <MaterialCommunityIcons name="content-save-check" size={20} color={theme.colors.background} />
                    <Text style={styles.saveBtnText}>Save & Close</Text>
                </AnimatedScaleButton>
            </Animated.View>
        </View>
    );
};

/* ── Styles ───────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
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
    /* Grammar check error banner — shown when the check itself fails
       (network/auth/parse) instead of the misleading "No issues found!". */
    grammarErrorBox: {
        backgroundColor: theme.colors.dangerFill,
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.dangerBorderStrong,
    },
    grammarErrorHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },
    grammarErrorTitle: {
        color: theme.colors.danger,
        fontSize: 14,
        fontWeight: '700',
    },
    grammarErrorMsg: {
        color: theme.colors.danger,
        fontSize: 12,
        lineHeight: 18,
        marginBottom: 12,
    },
    grammarRetryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 10,
        backgroundColor: theme.colors.glassSurfaceLow,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
    },
    grammarRetryText: {
        color: theme.colors.primaryAction,
        fontSize: 13,
        fontWeight: '700',
    },
    /* Per-note AI failure banner — shown when this note's AI job failed
       permanently (max retries / auth / parse). Mirrors the grammar banner. */
    noteFailureBox: {
        backgroundColor: theme.colors.dangerFill,
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.dangerBorderStrong,
        marginBottom: 16,
    },
    noteFailureHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },
    noteFailureTitle: {
        color: theme.colors.danger,
        fontSize: 14,
        fontWeight: '700',
    },
    noteFailureMsg: {
        color: theme.colors.danger,
        fontSize: 12,
        lineHeight: 18,
        marginBottom: 12,
    },
    noteFailureRetryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 10,
        backgroundColor: theme.colors.glassSurfaceLow,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
    },
    noteFailureRetryText: {
        color: theme.colors.primaryAction,
        fontSize: 13,
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
    lockOverlayCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: theme.colors.glassSurfaceMedium,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: theme.colors.shadowDark,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
});

export default PostWritingScreen;
