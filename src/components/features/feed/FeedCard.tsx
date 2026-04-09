import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    Vibration,
    Modal,
    Pressable,
} from 'react-native';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RichText } from '@/components/ui/RichText';
import { theme } from '@/styles/theme';
import type { SavedNote, SavedVlog, Person } from '@/types';

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
    journal: 'rgba(255, 255, 255, 0.6)',
    circle: '#FF2A2A',
    checkin: '#FFD700',
    clip: '#FF6B35',
};

/* ── HELPERS ──────────────────────────────────────────────────────────────── */

/** Get word count from text */
const getWordCount = (text: string) => (text || '').split(/\s+/).filter(Boolean).length;

/** Format timestamp to relative time (e.g., "2h ago", "3 days ago") */
const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    const weeks = Math.floor(diff / 604800000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    if (weeks < 4) return `${weeks}w ago`;
    return new Date(timestamp).toLocaleDateString('default', { month: 'short', day: 'numeric' });
};

/** Get score details for check-in entries */
const getScoreDetails = (score: number) => {
    if (score <= 2) return { emoji: '😵', color: '#ff4d4d', label: 'Struggling' };
    if (score <= 4) return { emoji: '😕', color: '#ff9933', label: 'Drifting' };
    if (score === 5) return { emoji: '😐', color: '#ffcc00', label: 'Okay' };
    if (score <= 7) return { emoji: '😊', color: '#a2ff66', label: 'Good' };
    if (score <= 9) return { emoji: '😄', color: '#66ffcc', label: 'Great' };
    return { emoji: '😎', color: '#00ccff', label: 'Aligned' };
};

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
export const FeedCard: React.FC<FeedCardProps> = ({
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

    const noteId = item.note?.id || item.vlog?.id || '';
    const isCircle = !!item.note?.personId;
    const isCheckin = !!(item.note as any)?.isAlignmentReflection;

    /** Determine the entry's category for visual styling */
    const category = isCheckin ? 'checkin' : item.type === 'clip' ? 'clip' : isCircle ? 'circle' : 'journal';
    const accentColor = category === 'checkin'
        ? getScoreDetails((item.note as any)?.alignmentScore || 5).color
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
            const score = (item.note as any)?.alignmentScore || 5;
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
            <View style={[styles.avatar, { borderColor: 'rgba(255,255,255,0.2)' }]}>
                <MaterialCommunityIcons name="star-four-points" size={16} color="rgba(255,255,255,0.6)" />
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
            const score = (item.note as any)?.alignmentScore || 5;
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
                        <Text style={styles.tweetText} numberOfLines={3}>
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
                    <Text style={styles.tweetText}>{item.note.text}</Text>
                </View>
            );
        }

        // Story (long entry) — show AI title prominently + preview + Read More
        return (
            <View>
                {item.note.aiTitle && (
                    <RichText style={styles.storyTitle} numberOfLines={2} text={item.note.aiTitle} />
                )}
                <Text style={styles.storyPreview}>
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
        Vibration.vibrate(15);
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
                        <Text style={styles.commentDisplayText} numberOfLines={2}>{comment}</Text>
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
                                Vibration.vibrate(10);
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
};

/* ── STYLES ───────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
    /** Card container with minimalist bottom divider */
    card: {
        flexDirection: 'row',
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.06)',
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
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
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
        color: 'rgba(255, 255, 255, 0.88)',
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
        color: '#FFF',
        fontSize: 18,
        fontWeight: '800',
        marginBottom: 8,
        lineHeight: 24,
    },
    storyPreview: {
        color: 'rgba(255, 255, 255, 0.7)',
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
        borderTopColor: 'rgba(255, 255, 255, 0.06)',
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
        borderTopColor: 'rgba(255, 255, 255, 0.06)',
    },
    commentInput: {
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        color: '#FFF',
        fontSize: 14,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
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
        color: '#FFF',
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
        borderTopColor: 'rgba(255, 255, 255, 0.04)',
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
