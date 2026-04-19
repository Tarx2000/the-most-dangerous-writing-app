import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Platform,
    StatusBar,
    Vibration,
    Pressable,
    useWindowDimensions,
    DeviceEventEmitter,
} from 'react-native';
import { FlashList, type FlashListRef, type ViewToken } from '@shopify/flash-list';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Gesture, GestureDetector, ScrollView as RNGHScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, cancelAnimation, runOnJS, SharedValue, useAnimatedScrollHandler, useAnimatedReaction } from 'react-native-reanimated';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { FeedCard, FeedItem, FeedItemType } from '@/components/features/feed/FeedCard';
import { FeedVideoCard } from '@/components/features/feed/FeedVideoCard';
import { useNotes, useVlogs, usePersons, useFeedData } from '@/lib/hooks/useStorage';
import { theme } from '@/styles/theme';
import type { SavedNote, SavedVlog, Person } from '@/types';
import { isAlignmentReflection } from '@/types';
import type { LayoutRect } from '../components/features/library/VlogViewerModal';

/* ── CONFIGURABLE ─────────────────────────────────────────────────────────── */

/** Word count threshold for tweet vs story classification */
const TWEET_THRESHOLD = 50;

/**
 * Hoisted outside component to prevent React from unmounting/remounting
 * the list on every parent re-render. Creating animated components inside
 * render is a critical performance anti-pattern (rerender-no-inline-components).
 */
// Animated.createAnimatedComponent loses generic types — this is a known
// React Native typing limitation. The component works correctly at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as any;

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
    onOpenVlog?: (vlog: SavedVlog, rect?: LayoutRect) => void;
    /** Callback to commit feed close state (lightweight, no animation) */
    onClose: () => void;
    /** Callback to commit feed open state (lightweight, no animation) */
    onOpen: () => void;
    /** Shared value from HomeScreen driving feed translation */
    feedProgress?: SharedValue<number>;
    /** Whether the feed layer is currently visible (from HomeScreen state) */
    isFeedVisible?: boolean;
    /** Shared scroll position from HomeScreen for gesture coordination */
    listScrollY?: SharedValue<number>;
}

const FeedScreenInner: React.FC<Props> = ({
    isUnlocked,
    onUnlock,
    onOpenNote,
    onOpenVlog,
    onClose,
    onOpen,
    feedProgress,
    isFeedVisible = true,
    listScrollY: listScrollYProp,
}) => {
    const { height: screenHeight } = useWindowDimensions();
    /** SharedValue for Reanimated worklets — kept in sync via useEffect to avoid render-phase writes */
    const screenHeightSV = useSharedValue(screenHeight);
    useEffect(() => { screenHeightSV.value = screenHeight; }, [screenHeight, screenHeightSV]);

    const { savedNotes } = useNotes();
    const { savedVlogs } = useVlogs();
    const { persons } = usePersons();
    const { autoPlayFeedVideos, bookmarkedNoteIds, feedComments, toggleBookmark, saveFeedComment } = useFeedData();

    const [filterBookmarked, setFilterBookmarked] = useState(false);
    const [feedScrollEnabled, setFeedScrollEnabled] = useState(true);
    /** Track which feed items are currently visible in the viewport for video auto-play */
    const [visibleItemIds, setVisibleItemIds] = useState<Set<string>>(new Set());
    // FlashListRef and GestureType are incompatible — use any for gesture interop
    const listRef = useRef<any>(null);

    /** When feed is hidden (user navigated to home/library), clear all visible items
     *  so videos stop playing immediately. */
    useEffect(() => {
        if (!isFeedVisible) {
            setVisibleItemIds(new Set());
        }
    }, [isFeedVisible]);
    /** Use prop-provided listScrollY if available, otherwise local fallback */
    const localListScrollY = useSharedValue(0);
    const listScrollY = listScrollYProp || localListScrollY;

    /** Gesture coordination SharedValues */
    const gestureStartProgress = useSharedValue(0);
    const startTranslationOffset = useSharedValue(0);
    const isFeedGestureActive = useSharedValue(false);

    /** Fade animation for lock screen → feed transition */
    const fadeAnim = useSharedValue(isUnlocked ? 1 : 0);

    /** Animate feed content in when unlocked, out when locked */
    useEffect(() => {
        fadeAnim.value = withTiming(isUnlocked ? 1 : 0, { duration: 300 });
    }, [isUnlocked, fadeAnim]);

    const feedContentOpacity = useAnimatedStyle(() => ({
        opacity: fadeAnim.value,
    }));

    /**
     * Merge all content types into a single chronological feed.
     * Notes, vlogs, and check-ins are all unified into FeedItem objects
     * and sorted by timestamp (newest LAST — oldest at top).
     */
    const feedItems = useMemo(() => {
        const items: FeedItem[] = [];

        // Build person lookup for circle entries
        const personMap = new Map<string, Person>();
        persons.forEach(p => personMap.set(p.id, p));

        // Process text notes (journals, circles, check-ins)
        savedNotes.forEach(note => {
            const wordCount = (note.text || '').split(/\s+/).filter(Boolean).length;
            const isCheckin = isAlignmentReflection(note);
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
        savedVlogs.forEach(vlog => {
            items.push({
                type: 'clip',
                timestamp: vlog.timestamp,
                vlog,
            });
        });

        // Sort reverse chronologically: newest first
        items.sort((a, b) => b.timestamp - a.timestamp);

        return items;
    }, [savedNotes, savedVlogs, persons]);

    /** Apply bookmark filter if active (uses Set for O(1) lookups) */
    const bookmarkSet = useMemo(() => new Set(bookmarkedNoteIds), [bookmarkedNoteIds]);
    const displayItems = useMemo(() => {
        if (!filterBookmarked) return feedItems;
        return feedItems.filter(item => {
            const id = item.note?.id || item.vlog?.id || '';
            return bookmarkSet.has(id);
        });
    }, [feedItems, filterBookmarked, bookmarkSet]);

    /** Track visible items for video auto-play — only clips that are on-screen should play */
    const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken<FeedItem>[] }) => {
        const newVisibleIds = new Set<string>();
        for (const item of viewableItems) {
            const feedItem = item.item as FeedItem;
            const id = feedItem?.note?.id || feedItem?.vlog?.id || '';
            if (id) newVisibleIds.add(id);
        }
        setVisibleItemIds(newVisibleIds);
    }, []);

    /** Consider an item visible when ANY part is in the viewport.
     *  Videos pause only when completely out of view, not when half-scrolled off. */
    const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 0 }), []);

    /**
     * Enable list scrolling once the feed is nearly fully revealed (95%+).
     * useAnimatedReaction executes EXACTLY once when the boundary crosses.
     */
    useAnimatedReaction(
        () => (feedProgress ? feedProgress.value >= 0.95 : false),
        (isFullyOpen, prevIsFullyOpen) => {
            if (isFullyOpen !== prevIsFullyOpen) {
                runOnJS(setFeedScrollEnabled)(isFullyOpen);
            }
        }
    );

    /**
     * Safety net: if feedProgress is stranded at a mid-value with no gesture
     * active and no animation running, snap to the nearest end.
     * This catches edge cases from rapid gesture switching.
     */
    useAnimatedReaction(
        () => {
            if (!feedProgress) return 0;
            const p = feedProgress.value;
            if (isFeedGestureActive.value) return 0; // gesture is handling it
            if (p < 0.01 || p > 0.99) return 0;       // already at an end
            return p;                                  // stranded mid-value
        },
        (current, prev) => {
            if (current === prev || current === 0) return;
            // Stranded — snap to nearest end
            const target = current > 0.5 ? 1 : 0;
            feedProgress!.value = withSpring(target, theme.animation.springFeed);
            if (target === 0) runOnJS(onClose)();
            else runOnJS(onOpen)();
        }
    );

    const handleScroll = useAnimatedScrollHandler({
        onScroll: (e: any) => {
            listScrollY.value = e.contentOffset.y;
        }
    });

    /** Follow-finger drag-down to close — coexists with FlashList scroll.
     *  DOWNWARD-only activation (activeOffsetY) ensures the list scrolls
     *  normally when swiping up. Only starts driving feedProgress when
     *  the list is at the top AND the user pulls down past the content
     *  boundary. Normal scrolling is never intercepted.
     *  Activates from any feedProgress position (including mid-rescue). */
    const feedPanGesture = useMemo(() => Gesture.Pan()
        .simultaneousWithExternalGesture(listRef)
        .activeOffsetY([-10000, 15])    // Only activate on DOWNWARD movement
        .failOffsetX([-12, 12])          // Fail on any horizontal movement
        .onStart(() => {
            if (!feedProgress) return;
            cancelAnimation(feedProgress);
            gestureStartProgress.value = feedProgress.value;
            startTranslationOffset.value = 0;
            isFeedGestureActive.value = false;
        })
        .onUpdate((e) => {
            if (!feedProgress) return;

            // Activate when at top of list + swiping down (from any feedProgress)
            if (!isFeedGestureActive.value) {
                const atTopOfList = listScrollY.value <= 0;
                const swipingDown = e.translationY > 8;

                if (atTopOfList && swipingDown) {
                    isFeedGestureActive.value = true;
                    gestureStartProgress.value = feedProgress.value;
                    startTranslationOffset.value = e.translationY;
                }
                return;
            }

            // Follow finger in both directions from activation point
            const delta = e.translationY - startTranslationOffset.value;
            const progressDelta = delta / screenHeightSV.value; // positive = down = closing
            const newProgress = Math.max(0, Math.min(1, gestureStartProgress.value - progressDelta));
            feedProgress.value = newProgress;
        })
        .onEnd((e) => {
            if (!feedProgress) return;
            if (!isFeedGestureActive.value) return;
            isFeedGestureActive.value = false;

            const shouldClose = feedProgress.value < 0.5 || e.velocityY > 500;
            const target = shouldClose ? 0 : 1;
            feedProgress.value = withSpring(target, theme.animation.springFeed);
            if (shouldClose) runOnJS(onClose)();
            else runOnJS(onOpen)();
        })
        .onFinalize(() => {
            isFeedGestureActive.value = false;
        }), [onClose, onOpen, feedProgress, screenHeightSV, listScrollY]);

    /** Close button — cancel in-flight animation, spring closed, set state immediately */
    const handleCloseButton = useCallback(() => {
        if (!feedProgress) return;
        cancelAnimation(feedProgress);
        feedProgress.value = withSpring(0, theme.animation.springFeed);
        onClose();
    }, [onClose, feedProgress]);

    const renderFeedItem = useCallback(({ item }: { item: any }) => {
        const itemId = item.note?.id || item.vlog?.id || '';
        // A video should only auto-play if: (1) auto-play is enabled in settings,
        // (2) the item is visible in the viewport, AND (3) the feed is fully revealed
        const isVisible = visibleItemIds.has(itemId) && isFeedVisible;
        return (
        <View style={styles.cardWrapper}>
            {/* Use FeedVideoCard for clips, FeedCard for everything else */}
            {item.type === 'clip' && item.vlog && onOpenVlog ? (
                <FeedVideoCard
                    item={item}
                    isBookmarked={bookmarkSet.has(item.vlog.id)}
                    comment={feedComments[item.vlog.id]}
                    autoPlay={autoPlayFeedVideos && isVisible}
                    onToggleBookmark={toggleBookmark}
                    onSaveComment={saveFeedComment}
                    onOpenVlog={onOpenVlog}
                />
            ) : (
                <FeedCard
                    item={item}
                    isBookmarked={bookmarkSet.has(
                        item.note?.id || item.vlog?.id || ''
                    )}
                    comment={feedComments[item.note?.id || item.vlog?.id || '']}
                    onToggleBookmark={toggleBookmark}
                    onSaveComment={saveFeedComment}
                    onOpenEntry={onOpenNote}
                    onOpenVlog={onOpenVlog}
                />
            )}
        </View>
    );
    }, [bookmarkSet, feedComments, autoPlayFeedVideos, visibleItemIds, isFeedVisible, toggleBookmark, saveFeedComment, onOpenNote, onOpenVlog]);

    /* ── Render: Lock screen ───────────────────────────────────────── */
    /** Lock screen pan gesture: follow-finger drag down to dismiss. */
    const lockPanGesture = useMemo(() => Gesture.Pan()
        .activeOffsetY([-10000, 15])   // Only activate on DOWNWARD movement
        .onStart(() => {
            if (!feedProgress) return;
            cancelAnimation(feedProgress);
            gestureStartProgress.value = feedProgress.value;
            startTranslationOffset.value = 0;
            isFeedGestureActive.value = false;
        })
        .onUpdate((e) => {
            if (!feedProgress) return;
            if (!isFeedGestureActive.value) {
                if (e.translationY > 8) {
                    isFeedGestureActive.value = true;
                    gestureStartProgress.value = feedProgress.value;
                    startTranslationOffset.value = e.translationY;
                }
                return;
            }
            const delta = e.translationY - startTranslationOffset.value;
            const progressDelta = delta / screenHeightSV.value;
            const newProgress = Math.max(0, Math.min(1, gestureStartProgress.value - progressDelta));
            feedProgress.value = newProgress;
        })
        .onEnd((e) => {
            if (!feedProgress || !isFeedGestureActive.value) return;
            isFeedGestureActive.value = false;
            const shouldClose = feedProgress.value < 0.5 || e.velocityY > 500;
            const target = shouldClose ? 0 : 1;
            feedProgress.value = withSpring(target, theme.animation.springFeed);
            if (shouldClose) runOnJS(onClose)();
            else runOnJS(onOpen)();
        })
        .onFinalize(() => {
            isFeedGestureActive.value = false;
        }), [onClose, onOpen, feedProgress, screenHeightSV]);


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
                            <MaterialCommunityIcons name="fingerprint" size={24} color={theme.colors.textPrimary} style={{ marginRight: 10 }} />
                            <Text style={styles.unlockBtnText}>Unlock Feed</Text>
                        </AnimatedScaleButton>
                    </View>
                </Animated.View>
            </GestureDetector>
        );
    }

    /* ── Render: Feed header ────────────────────────────────────────── */
    const renderHeader = () => (
        <Animated.View style={styles.headerContainer}>
                {/* Title row */}
                <View style={styles.titleRow}>
                    <View>
                        <Text style={styles.feedTitle}>Feed</Text>
                        <Text style={styles.feedSubtitle}>
                            {feedItems.length} {feedItems.length === 1 ? 'entry' : 'entries'}
                        </Text>
                    </View>
                    <AnimatedScaleButton style={styles.closeBtn} onPress={handleCloseButton}>
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
                            color={filterBookmarked ? theme.colors.textPrimary : theme.colors.textMuted}
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
        <GestureDetector gesture={feedPanGesture}>
            <View style={styles.container}>
            <Animated.View style={[styles.feedContentWrapper, feedContentOpacity]}>
                <AnimatedFlashList
                ref={listRef}
                renderScrollComponent={RNGHScrollView}
                data={displayItems}
                ListHeaderComponent={renderHeader}
                ListFooterComponent={renderFooter}
                ListEmptyComponent={renderEmpty}
                estimatedItemSize={250}
                keyExtractor={(item: any) => item.note?.id || item.vlog?.id || String(item.timestamp)}
                bounces={false}
                overScrollMode="never"
                scrollEnabled={feedScrollEnabled}
                onScroll={handleScroll}
                onScrollBeginDrag={() => DeviceEventEmitter.emit('RESET_LOCK_TIMER')}
                scrollEventThrottle={16}
                renderItem={renderFeedItem}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
            />
            </Animated.View>
        </View>
        </GestureDetector>
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
        backgroundColor: theme.colors.background,
    },
    feedContentWrapper: {
        flex: 1,
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
        color: theme.colors.textPrimary,
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
        color: theme.colors.textPrimary,
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
        color: theme.colors.textPrimary,
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
        color: theme.colors.textPrimary,
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
        color: theme.colors.textPrimary,
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
