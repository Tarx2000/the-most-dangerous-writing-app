import React, { useMemo, useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Platform,
    StatusBar,
    Vibration,
    Pressable,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, runOnJS } from 'react-native-reanimated';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { FeedCard, FeedItem, FeedItemType } from '@/components/features/feed/FeedCard';
import { FeedVideoCard } from '@/components/features/feed/FeedVideoCard';
import { useStorage } from '@/lib/hooks/useStorage';
import { theme } from '@/styles/theme';
import type { SavedNote, SavedVlog, Person } from '@/types';

/* ── CONFIGURABLE ─────────────────────────────────────────────────────────── */

/** Word count threshold for tweet vs story classification */
const TWEET_THRESHOLD = 100;

/* ── COMPONENT ────────────────────────────────────────────────────────────── */

/**
 * FeedScreen — Chronological timeline of all user content.
 *
 * Design:
 * - "Private Twitter Feed" — a social-media-style timeline for personal entries
 * - Short entries (<100 words) display as "tweets" shown in full
 * - Long entries (≥100 words) display as "stories" with preview + Read More
 * - Videos, check-ins, and circle entries all have distinct visual styling
 * - Biometric lock screen shown if not yet unlocked (via central unlock)
 * - Bookmark filter toggle (All / Bookmarked)
 * - Newest entries at the BOTTOM (oldest at top = chronological reading order)
 *
 * This is a visualization layer over existing library data —
 * no separate data store. All data comes from useStorage().
 *
 * Navigation:
 * - The Feed is revealed by swiping down from the HomeScreen
 * - Swiping up from the bottom returns to HomeScreen (handled by parent)
 */
interface Props {
    /** Whether the feed is unlocked (from central Security Stage 2) */
    isUnlocked: boolean;
    /** Trigger biometric to unlock */
    onUnlock: () => Promise<boolean>;
    /** Callback to open a note in the full note viewer */
    onOpenNote: (note: SavedNote) => void;
    /** Callback to open a vlog in the player */
    onOpenVlog?: (vlog: SavedVlog) => void;
    /** Callback to return to HomeScreen (swipe up / close) */
    onClose: () => void;
}

const FeedScreenInner: React.FC<Props> = ({
    isUnlocked,
    onUnlock,
    onOpenNote,
    onOpenVlog,
    onClose,
}) => {
    const storage = useStorage();
    const [filterBookmarked, setFilterBookmarked] = useState(false);
    const listRef = useRef<any>(null);

    /**
     * Merge all content types into a single chronological feed.
     * Notes, vlogs, and check-ins are all unified into FeedItem objects
     * and sorted by timestamp (newest LAST — oldest at top).
     */
    const feedItems = useMemo(() => {
        const items: FeedItem[] = [];

        // Build person lookup for circle entries
        const personMap = new Map<string, Person>();
        storage.persons.forEach(p => personMap.set(p.id, p));

        // Process text notes (journals, circles, check-ins)
        storage.savedNotes.forEach(note => {
            const wordCount = (note.text || '').split(/\s+/).filter(Boolean).length;
            const isCheckin = !!(note as any).isAlignmentReflection;
            const type: FeedItemType = isCheckin ? 'checkin'
                : wordCount < TWEET_THRESHOLD ? 'tweet' : 'story';

            const person = note.personId ? personMap.get(note.personId) : undefined;

            items.push({
                type,
                timestamp: note.timestamp,
                note,
                personName: person?.name,
                person,
            });
        });

        // Process vlogs
        storage.savedVlogs.forEach(vlog => {
            items.push({
                type: 'clip',
                timestamp: vlog.timestamp,
                vlog,
            });
        });

        // Sort reverse chronologically: newest first
        items.sort((a, b) => b.timestamp - a.timestamp);

        return items;
    }, [storage.savedNotes, storage.savedVlogs, storage.persons]);

    /** Apply bookmark filter if active */
    const displayItems = useMemo(() => {
        if (!filterBookmarked) return feedItems;
        return feedItems.filter(item => {
            const id = item.note?.id || item.vlog?.id || '';
            return storage.bookmarkedNoteIds.includes(id);
        });
    }, [feedItems, filterBookmarked, storage.bookmarkedNoteIds]);

    /** Over-scroll logic to close feed when pulling down at the top */
    const handleScroll = useCallback((e: any) => {
        // If user pulls down (negative offset Y) heavily while at top, trigger close
        if (e.nativeEvent.contentOffset.y < -40) {
            onClose();
        }
    }, [onClose]);

    /* ── Render: Lock screen ───────────────────────────────────────── */
    const lockPanGesture = useMemo(() => Gesture.Pan()
        // Activate if pulled DOWN past 20px, or UP past 10000px (never)
        .activeOffsetY([-10000, 20])
        .onEnd((e) => {
            if (e.translationY > 80) runOnJS(onClose)();
        }), [onClose]);

    if (!isUnlocked) {
        return (
            <GestureDetector gesture={lockPanGesture}>
                <Animated.View style={styles.container}>
                    <View style={styles.lockScreen}>
                        <MaterialCommunityIcons name="lock-outline" size={48} color={theme.colors.textMuted} />
                        <Text style={styles.lockTitle}>Feed Locked</Text>
                        <Text style={styles.lockHint}>Use the Vision ★ button to unlock your feed</Text>
                        <AnimatedScaleButton
                            style={styles.unlockBtn}
                            onPress={async () => {
                                const success = await onUnlock();
                                if (success) Vibration.vibrate(50);
                            }}
                        >
                            <MaterialCommunityIcons name="fingerprint" size={24} color="#FFF" style={{ marginRight: 10 }} />
                            <Text style={styles.unlockBtnText}>Unlock Feed</Text>
                        </AnimatedScaleButton>
                    </View>
                </Animated.View>
            </GestureDetector>
        );
    }

    const headerPanGesture = useMemo(() => Gesture.Pan()
        .activeOffsetY([-10000, 20])
        .onEnd((e) => {
            if (e.translationY > 50 || e.velocityY > 500) {
                runOnJS(onClose)();
            }
        }), [onClose]);

    /* ── Render: Feed header ────────────────────────────────────────── */
    const renderHeader = () => (
        <GestureDetector gesture={headerPanGesture}>
            <Animated.View style={styles.headerContainer}>
                {/* Drag handle (visual hint to swipe down to close) */}
                <View style={styles.dragHandle} />

                {/* Title row */}
                <View style={styles.titleRow}>
                    <View>
                        <Text style={styles.feedTitle}>Feed</Text>
                        <Text style={styles.feedSubtitle}>
                            {feedItems.length} {feedItems.length === 1 ? 'entry' : 'entries'}
                        </Text>
                    </View>
                    <AnimatedScaleButton style={styles.closeBtn} onPress={onClose}>
                        <MaterialCommunityIcons name="chevron-down" size={22} color={theme.colors.textSecondary} />
                    </AnimatedScaleButton>
                </View>

                {/* Filter toggle: All / Bookmarked */}
                <View style={styles.filterRow}>
                    <AnimatedScaleButton
                        style={[styles.filterBtn, !filterBookmarked && styles.filterBtnActive]}
                        onPress={() => setFilterBookmarked(false)}
                    >
                        <Text style={[styles.filterBtnText, !filterBookmarked && styles.filterBtnTextActive]}>All</Text>
                    </AnimatedScaleButton>
                    <AnimatedScaleButton
                        style={[styles.filterBtn, filterBookmarked && styles.filterBtnActive]}
                        onPress={() => setFilterBookmarked(true)}
                    >
                        <MaterialCommunityIcons
                            name="bookmark"
                            size={14}
                            color={filterBookmarked ? '#FFF' : theme.colors.textMuted}
                            style={{ marginRight: 4 }}
                        />
                        <Text style={[styles.filterBtnText, filterBookmarked && styles.filterBtnTextActive]}>
                            Bookmarked
                        </Text>
                    </AnimatedScaleButton>
                </View>

                {/* Newest first notice */}
                <View style={styles.chronoNotice}>
                    <MaterialCommunityIcons name="clock-outline" size={12} color={theme.colors.textMuted} />
                    <Text style={styles.chronoNoticeText}>Newest first · Oldest at bottom</Text>
                </View>
            </Animated.View>
        </GestureDetector>
    );

    /* ── Render: Empty state ────────────────────────────────────────── */
    const renderEmpty = () => (
        <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="text-box-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>
                {filterBookmarked ? 'No bookmarked entries' : 'Your feed is empty'}
            </Text>
            <Text style={styles.emptyHint}>
                {filterBookmarked
                    ? 'Bookmark entries to save them here'
                    : 'Complete a writing session to see your entries here'
                }
            </Text>
        </View>
    );

    /* ── Render: Footer ───────────────────── */
    const renderFooter = () => (
        <View style={styles.footerContainer}>
            <Text style={styles.footerText}>You've reached the beginning of time</Text>
        </View>
    );

    return (
        <View style={styles.container}>
            <FlashList
                ref={listRef}
                data={displayItems}
                ListHeaderComponent={renderHeader}
                ListEmptyComponent={renderEmpty}
                ListFooterComponent={displayItems.length > 5 ? renderFooter : null}
                keyExtractor={(item) => item.note?.id || item.vlog?.id || String(item.timestamp)}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                bounces={true}
                overScrollMode="always"
                renderItem={({ item }) => (
                    <View style={styles.cardWrapper}>
                        {/* Use FeedVideoCard for clips, FeedCard for everything else */}
                        {item.type === 'clip' && item.vlog && onOpenVlog ? (
                            <FeedVideoCard
                                item={item}
                                isBookmarked={storage.bookmarkedNoteIds.includes(item.vlog.id)}
                                comment={storage.feedComments[item.vlog.id]}
                                autoPlay={storage.autoPlayFeedVideos}
                                onToggleBookmark={storage.toggleBookmark}
                                onSaveComment={storage.saveFeedComment}
                                onOpenVlog={onOpenVlog}
                            />
                        ) : (
                            <FeedCard
                                item={item}
                                isBookmarked={storage.bookmarkedNoteIds.includes(
                                    item.note?.id || item.vlog?.id || ''
                                )}
                                comment={storage.feedComments[item.note?.id || item.vlog?.id || '']}
                                onToggleBookmark={storage.toggleBookmark}
                                onSaveComment={storage.saveFeedComment}
                                onOpenEntry={onOpenNote}
                                onOpenVlog={onOpenVlog}
                            />
                        )}
                    </View>
                )}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
            />
        </View>
    );
};

/**
 * Memoized export — prevents unnecessary re-renders
 * from parent HomeScreen state changes.
 */
export const FeedScreen = React.memo(FeedScreenInner);

/* ── STYLES ───────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    listContent: {
        paddingBottom: 100,
    },
    cardWrapper: {
        paddingHorizontal: 16,
    },

    /* ── Lock screen ────────────────────────────────────────────────── */
    lockScreen: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 30,
    },
    lockTitle: {
        color: '#FFF',
        fontSize: 24,
        fontWeight: '900',
        marginTop: 16,
        marginBottom: 8,
    },
    lockHint: {
        color: theme.colors.textMuted,
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 30,
        lineHeight: 20,
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

    /* ── Header ─────────────────────────────────────────────────────── */
    headerContainer: {
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 60 : (StatusBar.currentHeight || 40) + 16,
        paddingBottom: 8,
    },
    dragHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        alignSelf: 'center',
        marginBottom: 16,
    },
    titleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    feedTitle: {
        color: '#FFF',
        fontSize: 32,
        fontWeight: '900',
        letterSpacing: -0.5,
    },
    feedSubtitle: {
        color: theme.colors.textMuted,
        fontSize: 14,
        fontWeight: '500',
        marginTop: 2,
    },
    closeBtn: {
        backgroundColor: theme.colors.glassBackground,
        padding: 10,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
    },

    /* ── Filter toggle ──────────────────────────────────────────────── */
    filterRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 16,
    },
    filterBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 100,
        backgroundColor: theme.colors.glassBackground,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
    },
    filterBtnActive: {
        backgroundColor: theme.colors.primaryAction,
        borderColor: theme.colors.primaryAction,
    },
    filterBtnText: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        fontWeight: '600',
    },
    filterBtnTextActive: {
        color: '#FFF',
        fontWeight: '700',
    },

    /* ── Chrono notice ──────────────────────────────────────────────── */
    chronoNotice: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 12,
    },
    chronoNoticeText: {
        color: theme.colors.textMuted,
        fontSize: 11,
        fontWeight: '500',
    },

    /* ── Empty state ────────────────────────────────────────────────── */
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 80,
        paddingHorizontal: 30,
    },
    emptyTitle: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: '700',
        marginTop: 16,
        marginBottom: 8,
    },
    emptyHint: {
        color: theme.colors.textMuted,
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
    },

    /* ── Footer ─────────────────────────────────────────────────────── */
    footerContainer: {
        alignItems: 'center',
        paddingVertical: 30,
        gap: 12,
    },
    footerText: {
        color: theme.colors.textMuted,
        fontSize: 13,
        fontWeight: '500',
    },
    jumpBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 100,
        backgroundColor: theme.colors.glassBackground,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
    },
    jumpBtnText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontWeight: '600',
    },
});
