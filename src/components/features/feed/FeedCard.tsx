import React, { useState } from 'react';
import { View,
    Text,
    TextInput,
    StyleSheet,
    Modal,
    Pressable,
Platform
} from 'react-native';
import { vibrate } from '@/lib/haptics';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RichText } from '@/components/ui/RichText';
import { theme } from '@/styles/theme';
import { CONFIG } from '@/config';
import { usePreferences } from '@/lib/hooks/useStorage';
import type { SavedNote, SavedVlog, Person, AlignmentReflection } from '@/types';
import { isAlignmentReflection } from '@/types';
import { formatRelativeTime } from '@/lib/utils';
import { getAlignmentScoreFeed } from '@/lib/alignmentScores';

/* ── CONFIGURABLE ─────────────────────────────────────────────────────────── */

/** Word count threshold: below this = tweet, at/above = story */
const TWEET_THRESHOLD = 100;

/** Max preview words shown for a story before "Read more" */
const STORY_PREVIEW_WORDS = 50;

/* ── TYPES ────────────────────────────────────────────────────────────────── */

/**
 * FeedItemType — Visual classification of feed entries.
 * - tweet: short text entry (<100 words), shown in full
 * - story: long text entry (≥100 words), shown with preview + "Read more"
 * - clip: video journal entry
 * - checkin: alignment check-in with score
 */
export type FeedItemType = 'tweet' | 'story' | 'clip' | 'checkin';

/**
 * FeedItem — Unified feed entry wrapping all content types.
 * Sorted by timestamp for chronological display.
 */
export interface FeedItem {
    type: FeedItemType;
    timestamp: number;
    /** Text entry (journal, circle, or check-in) */
    note?: SavedNote;
    /** Video journal entry */
    vlog?: SavedVlog;
    /** Person name if this is a circle entry */
    personName?: string;
    /** Person object reference for avatar */
    person?: Person;
}

/* ── COLOR ACCENTS — strong visual distinction per type ───────────────────── */

const TYPE_COLORS: Record<string, string> = {
    journal: theme.colors.textSecondary,
    circle: theme.colors.danger,
    checkin: theme.colors.gold,
    clip: theme.colors.orange,
};

/* ── HELPERS ──────────────────────────────────────────────────────────────── */

/** Get word count from text */
const getWordCount = (text: string) => (text || '').split(/\s+/).filter(Boolean).length;


/** Get score details for check-in entries */
const getScoreDetails = getAlignmentScoreFeed;

/** Truncate text to N words and add ellipsis */
const truncateWords = (text: string, maxWords: number): string => {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return text;
    return words.slice(0, maxWords).join(' ') + '…';
};

/* ── COMPONENT ────────────────────────────────────────────────────────────── */

interface FeedCardProps {
    item: FeedItem;
    /** Whether this entry is bookmarked */
    isBookmarked: boolean;
    /** Existing comment/annotation on this entry */
    comment?: string;
    /** Toggle bookmark callback */
    onToggleBookmark: (id: string) => void;
    /** Save comment callback */
    onSaveComment: (id: string, comment: string) => void;
    /** Open full entry view */
    onOpenEntry: (note: SavedNote) => void;
    /** Open full vlog player */
    onOpenVlog?: (vlog: SavedVlog) => void;
}

/**
 * FeedCard — Renders a single feed entry with type-specific styling.
 *
 * Visual distinction system:
 * - Journal: white accent, ✦ star icon
 * - Circle: red accent, person initial avatar
 * - Check-in: dynamic mood color, emoji avatar
 * - Clip: orange gradient accent, ▶ play icon
 *
 * Each card has a thin left border accent in its type color
 * for fast visual scanning of the feed.
 */
export const FeedCard: React.FC<FeedCardProps> = React.memo(({
    item,
    isBookmarked,
    comment,
    onToggleBookmark,
    onSaveComment,
    onOpenEntry,
    onOpenVlog,
}) => {
    const [showCommentInput, setShowCommentInput] = useState(false);
    const [commentText, setCommentText] = useState(comment || '');

    /** User's chosen font — applied to content text only (not UI chrome) */
    const { fontIndex } = usePreferences();
    const activeFont = CONFIG.FONTS[fontIndex]?.value || (Platform.OS === 'ios' ? 'System' : 'sans-serif');

    const noteId = item.note?.id || item.vlog?.id || '';
    const isCircle = !!item.note?.personId;
    const isCheckin = !!item.note && isAlignmentReflection(item.note);

    /** Determine the entry's category for visual styling */
    const category = isCheckin ? 'checkin' : item.type === 'clip' ? 'clip' : isCircle ? 'circle' : 'journal';
    const accentColor = category === 'checkin'
        ? getScoreDetails(item.note && isAlignmentReflection(item.note) ? item.note.alignmentScore : 5).color
        : TYPE_COLORS[category];

    /** Category label shown in the header */
    const categoryLabel = isCheckin ? 'CHECK-IN'
        : isCircle ? item.personName || 'Circle'
        : item.type === 'clip' ? 'VIDEO CLIP'
        : 'JOURNAL';

    /** Word count for text entries */
    const wordCount = item.note ? getWordCount(item.note.text) : 0;

    /** Duration display */
    const durationLabel = item.note
        ? (item.note.durationMin > 0 ? `${item.note.durationMin} min` : 'Quick Note')
        : item.vlog
        ? `${Math.ceil(item.vlog.durationSec / 60)} min`
        : '';

    /* ── Render: Avatar ─────────────────────────────────────────────── */
    const renderAvatar = () => {
        if (isCheckin) {
            const checkinNote = item.note as AlignmentReflection;
            const score = checkinNote?.alignmentScore || 5;
            const details = getScoreDetails(score);
            return (
                <View style={[styles.avatar, { borderColor: details.color, shadowColor: details.color }]}>
                    <Text style={styles.avatarEmoji}>{details.emoji}</Text>
                </View>
            );
        }
        if (isCircle && item.personName) {
            return (
                <View style={[styles.avatar, { borderColor: TYPE_COLORS.circle }]}>
                    <Text style={[styles.avatarLetter, { color: TYPE_COLORS.circle }]}>
                        {item.personName.charAt(0).toUpperCase()}
                    </Text>
                </View>
            );
        }
        // Journal — star icon
        return (
            <View style={[styles.avatar, { borderColor: theme.colors.border }]}>
                <MaterialCommunityIcons name="star-four-points" size={16} color={theme.colors.textSecondary} />
            </View>
        );
    };

    /* ── Render: Body Content ───────────────────────────────────────── */
    const renderBody = () => {
        if (item.type === 'clip') {
            // Video entries handled by FeedVideoCard
            return null;
        }

        if (!item.note) return null;

        // Check-in card
        if (isCheckin) {
            const checkinNote = item.note as AlignmentReflection;
            const score = checkinNote?.alignmentScore || 5;
            const details = getScoreDetails(score);
            return (
                <View>
                    <View style={styles.checkinScoreRow}>
                        <Text style={[styles.checkinScore, { color: details.color }]}>
                            {score}/10
                        </Text>
                        <Text style={[styles.checkinLabel, { color: details.color }]}>
                            {details.label}
                        </Text>
                    </View>
                    {item.note.text && (
                        <Text style={[styles.tweetText, { fontFamily: activeFont }]} numberOfLines={3}>
                            {truncateWords(item.note.text, 40)}
                        </Text>
                    )}
                </View>
            );
        }

        // Tweet (short entry) — show full text
        if (wordCount < TWEET_THRESHOLD) {
            return (
                <View>
                    {/* AI title shown discreetly for tweets */}
                    {item.note.aiTitle && (
                        <Text style={styles.tweetAiTitle} numberOfLines={1}>
                            {item.note.aiTitle}
                        </Text>
                    )}
                    <Text style={[styles.tweetText, { fontFamily: activeFont }]}>{item.note.text}</Text>
                </View>
            );
        }

        // Story (long entry) — show AI title prominently + preview + Read More
        return (
            <View>
                {item.note.aiTitle && (
                    <RichText style={styles.storyTitle} numberOfLines={2} text={item.note.aiTitle} />
                )}
                <Text style={[styles.storyPreview, { fontFamily: activeFont }]}>
                    {truncateWords(item.note.text, STORY_PREVIEW_WORDS)}
                </Text>
                <AnimatedScaleButton
                    style={styles.readMoreBtn}
                    onPress={() => onOpenEntry(item.note!)}
                >
                    <Text style={styles.readMoreText}>Read more</Text>
                    <MaterialCommunityIcons name="arrow-right" size={14} color={theme.colors.primaryAction} />
                </AnimatedScaleButton>
            </View>
        );
    };

    /* ── Render: Comment section ────────────────────────────────────── */
    const handleSaveComment = () => {
        onSaveComment(noteId, commentText);
        setShowCommentInput(false);
        vibrate(15);
    };

    return (
        <AnimatedScaleButton
            style={styles.card}
            onPress={() => {
                if (item.note) onOpenEntry(item.note);
                else if (item.vlog && onOpenVlog) onOpenVlog(item.vlog);
            }}
            activeScale={0.98}
        >
            <View style={styles.leftColumn}>
                {renderAvatar()}
            </View>

            <View style={styles.rightColumn}>
                {/* Header: Category + Time */}
                <View style={styles.header}>
                    <Text style={[styles.categoryBadge, { color: accentColor }]}>
                        {categoryLabel}
                    </Text>
                    <Text style={styles.timeAgo}>{formatRelativeTime(item.timestamp)}</Text>
                </View>

                {/* Body Content */}
                {renderBody()}

                {/* Existing comment display */}
                {comment && !showCommentInput && (
                    <View style={styles.commentDisplay}>
                        <MaterialCommunityIcons name="comment-text-outline" size={12} color={theme.colors.textMuted} />
                        <Text style={[styles.commentDisplayText, { fontFamily: activeFont }]} numberOfLines={2}>{comment}</Text>
                    </View>
                )}

                {/* Comment input */}
                {showCommentInput && (
                    <View style={styles.commentInputContainer}>
                        <TextInput
                            style={styles.commentInput}
                            value={commentText}
                            onChangeText={setCommentText}
                            placeholder="Add a personal note..."
                            placeholderTextColor={theme.colors.textMuted}
                            multiline
                            maxLength={500}
                            autoFocus
                            keyboardAppearance="dark"
                        />
                        <View style={styles.commentActions}>
                            <AnimatedScaleButton onPress={() => setShowCommentInput(false)}>
                                <Text style={styles.commentCancelText}>Cancel</Text>
                            </AnimatedScaleButton>
                            <AnimatedScaleButton style={styles.commentSaveBtn} onPress={handleSaveComment}>
                                <Text style={styles.commentSaveText}>Save</Text>
                            </AnimatedScaleButton>
                        </View>
                    </View>
                )}

                {/* Metadata Footer + Actions */}
                <View style={styles.footer}>
                    {/* Metadata */}
                    <View style={styles.metaRow}>
                        {wordCount > 0 && (
                            <Text style={styles.metaText}>{wordCount} words</Text>
                        )}
                        {durationLabel && (
                            <Text style={styles.metaText}>{wordCount > 0 ? ' · ' : ''}{durationLabel}</Text>
                        )}
                    </View>

                    {/* Interaction buttons */}
                    <View style={styles.actionRow}>
                        <AnimatedScaleButton
                            onPress={(e) => {
                                e?.stopPropagation?.();
                                onToggleBookmark(noteId);
                                vibrate(10);
                            }}
                            style={styles.actionBtn}
                        >
                            <MaterialCommunityIcons
                                name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                                size={18}
                                color={isBookmarked ? theme.colors.primaryAction : theme.colors.textMuted}
                            />
                        </AnimatedScaleButton>
                        <AnimatedScaleButton
                            onPress={(e) => {
                                e?.stopPropagation?.();
                                setShowCommentInput(!showCommentInput);
                                setCommentText(comment || '');
                            }}
                            style={styles.actionBtn}
                        >
                            <MaterialCommunityIcons
                                name={comment ? 'comment-text' : 'comment-outline'}
                                size={16}
                                color={comment ? theme.colors.primaryAction : theme.colors.textMuted}
                            />
                        </AnimatedScaleButton>
                    </View>
                </View>
            </View>
        </AnimatedScaleButton>
    );
});

/* ── STYLES ───────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
    /** Card container with minimalist bottom divider */
    card: {
        flexDirection: 'row',
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.glassSurface,
    },
    leftColumn: {
        marginRight: 12,
        alignItems: 'center',
    },
    rightColumn: {
        flex: 1,
    },

    /* ── Header ─────────────────────────────────────────────────────── */
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: theme.colors.glassSurface,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        marginRight: 10,
    },
    avatarEmoji: {
        fontSize: 16,
    },
    avatarLetter: {
        fontSize: 16,
        fontWeight: '800',
    },
    headerInfo: {
        flex: 1,
    },
    categoryBadge: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    timeAgo: {
        color: theme.colors.textMuted,
        fontSize: 12,
        fontWeight: '500',
    },

    /* ── Tweet content ──────────────────────────────────────────────── */
    tweetText: {
        color: theme.colors.textTweet,
        fontSize: 15,
        lineHeight: 23,
    },
    tweetAiTitle: {
        color: theme.colors.textMuted,
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 4,
        fontStyle: 'italic',
    },

    /* ── Story content (long entries) ───────────────────────────────── */
    storyTitle: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        fontWeight: '800',
        marginBottom: 8,
        lineHeight: 24,
    },
    storyPreview: {
        color: theme.colors.textBodyDim,
        fontSize: 14,
        lineHeight: 22,
        marginBottom: 12,
    },
    readMoreBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 6,
    },
    readMoreText: {
        color: theme.colors.primaryAction,
        fontSize: 13,
        fontWeight: '700',
    },

    /* ── Check-in content ───────────────────────────────────────────── */
    checkinScoreRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 8,
        marginBottom: 8,
    },
    checkinScore: {
        fontSize: 24,
        fontWeight: '900',
    },
    checkinLabel: {
        fontSize: 14,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },

    /* ── Comment ────────────────────────────────────────────────────── */
    commentDisplay: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: theme.colors.glassSurface,
    },
    commentDisplayText: {
        color: theme.colors.textMuted,
        fontSize: 12,
        flex: 1,
        lineHeight: 18,
        fontStyle: 'italic',
    },
    commentInputContainer: {
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: theme.colors.glassSurface,
    },
    commentInput: {
        backgroundColor: theme.colors.glassSurface,
        color: theme.colors.textPrimary,
        fontSize: 14,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        minHeight: 60,
        textAlignVertical: 'top',
    },
    commentActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
        marginTop: 8,
    },
    commentCancelText: {
        color: theme.colors.textMuted,
        fontSize: 13,
        fontWeight: '600',
    },
    commentSaveBtn: {
        backgroundColor: theme.colors.primaryAction,
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 100,
    },
    commentSaveText: {
        color: theme.colors.textPrimary,
        fontSize: 13,
        fontWeight: '700',
    },

    /* ── Footer ─────────────────────────────────────────────────────── */
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 12,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: theme.colors.glassSurfaceMinimal,
    },
    metaRow: {
        flexDirection: 'row',
    },
    metaText: {
        color: theme.colors.textMuted,
        fontSize: 11,
        fontWeight: '500',
    },
    actionRow: {
        flexDirection: 'row',
        gap: 12,
    },
    actionBtn: {
        padding: 4,
    },
});




