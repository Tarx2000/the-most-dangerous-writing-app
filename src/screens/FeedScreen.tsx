import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, StatusBar, useWindowDimensions, DeviceEventEmitter } from 'react-native';
import { vibrate } from '@/lib/haptics';
import { FlashList, type FlashListRef, type ViewToken } from '@shopify/flash-list';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Gesture, GestureDetector, ScrollView as RNGHScrollView } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
    cancelAnimation,
    runOnJS,
    SharedValue,
    useAnimatedScrollHandler,
    useAnimatedReaction,
} from 'react-native-reanimated';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { FeedCard } from '@/components/features/feed/FeedCard';
import { FeedVideoCard } from '@/components/features/feed/FeedVideoCard';
import { useNotes, useVlogs, usePersons, useFeedData } from '@/lib/hooks/useStorage';
import { theme } from '@/styles/theme';
import type { SavedNote, SavedVlog, Person, FeedItem, FeedItemType } from '@/types';
import { isAlignmentReflection } from '@/types';
import type { LayoutRect } from '../components/features/library/VlogViewerModal';

/** Scroll distance before showing the scroll-to-top button */
const SCROLL_TOP_SHOW_THRESHOLD = 300;

/**
 * Hoisted outside component to prevent React from unmounting/remounting
 * the list on every parent re-render. Creating animated components inside
 * render is a critical performance anti-pattern (rerender-no-inline-components).
 */
// Animated.createAnimatedComponent loses generic types — this is a known
// React Native typing limitation. The component works correctly at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as any;

/* ── Stable list sub-components (hoisted to avoid re-create on every render) ─ */

const FeedFooter = React.memo(() => (
    <View style={styles.footerContainer}>
        <Text style={styles.footerText}>You've reached the beginning of time</Text>
    </View>
));

interface FeedEmptyProps {
    filterBookmarked: boolean;
}

const FeedEmpty = React.memo(({ filterBookmarked }: FeedEmptyProps) => (
    <View style={styles.emptyContainer}>
        <MaterialCommunityIcons name="text-box-outline" size={48} color={theme.colors.textMuted} />
        <Text style={styles.emptyTitle}>{filterBookmarked ? 'No bookmarked entries' : 'Your feed is empty'}</Text>
        <Text style={styles.emptyHint}>
            {filterBookmarked
                ? 'Bookmark entries to save them here'
                : 'Complete a writing session to see your entries here'}
        </Text>
    </View>
));

/* ── Stable feed header (hoisted to avoid re-create on every render) ─ */

interface FeedHeaderProps {
    entryCount: number;
    filterBookmarked: boolean;
    onToggleFilter: (bookmarked: boolean) => void;
    showJournals: boolean;
    showTweets: boolean;
    showVlogs: boolean;
    showCheckins: boolean;
    onToggleType: (type: 'journals' | 'tweets' | 'vlogs' | 'checkins') => void;
    onClose: () => void;
}

const FeedHeader = React.memo(({ entryCount, filterBookmarked, onToggleFilter, showJournals, showTweets, showVlogs, showCheckins, onToggleType, onClose }: FeedHeaderProps) => (
    <Animated.View style={styles.headerContainer}>
        {/* Title row */}
        <View style={styles.titleRow}>
            <View>
                <Text style={styles.feedTitle}>Feed</Text>
                <Text style={styles.feedSubtitle}>
                    {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
                </Text>
            </View>
            <AnimatedScaleButton style={styles.closeBtn} onPress={onClose}>
                <MaterialCommunityIcons name="chevron-down" size={22} color={theme.colors.textSecondary} />
            </AnimatedScaleButton>
        </View>

        {/* Type filter checkboxes */}
        <View style={styles.checkboxRow}>
            {
                ([
                    { key: 'journals' as const, label: 'Journals', active: showJournals, icon: 'notebook-outline' as React.ComponentProps<typeof MaterialCommunityIcons>['name'] },
                    { key: 'tweets' as const, label: 'Tweets', active: showTweets, icon: 'chat-processing-outline' as React.ComponentProps<typeof MaterialCommunityIcons>['name'] },
                    { key: 'vlogs' as const, label: 'Vlogs', active: showVlogs, icon: 'video-outline' as React.ComponentProps<typeof MaterialCommunityIcons>['name'] },
                    { key: 'checkins' as const, label: 'Check-ins', active: showCheckins, icon: 'compass-outline' as React.ComponentProps<typeof MaterialCommunityIcons>['name'] },
                ]).map((item) => (
                    <AnimatedScaleButton
                        key={item.key}
                        style={[styles.checkboxBtn, item.active && styles.checkboxBtnActive]}
                        onPress={() => onToggleType(item.key)}
                    >
                        <MaterialCommunityIcons
                            name={item.icon}
                            size={14}
                            color={item.active ? theme.colors.textPrimary : theme.colors.textMuted}
                            style={{ marginRight: 4 }}
                        />
                        <Text style={[styles.checkboxText, item.active && styles.checkboxTextActive]}>{item.label}</Text>
                    </AnimatedScaleButton>
                ))
            }
        </View>

        {/* Filter toggle: All / Bookmarked */}
        <View style={styles.filterRow}>
            <AnimatedScaleButton
                style={[styles.filterBtn, !filterBookmarked && styles.filterBtnActive]}
                onPress={() => onToggleFilter(false)}
            >
                <Text style={[styles.filterBtnText, !filterBookmarked && styles.filterBtnTextActive]}>All</Text>
            </AnimatedScaleButton>
            <AnimatedScaleButton
                style={[styles.filterBtn, filterBookmarked && styles.filterBtnActive]}
                onPress={() => onToggleFilter(true)}
            >
                <MaterialCommunityIcons
                    name="bookmark"
                    size={14}
                    color={filterBookmarked ? theme.colors.textPrimary : theme.colors.textMuted}
                    style={{ marginRight: 4 }}
                />
                <Text style={[styles.filterBtnText, filterBookmarked && styles.filterBtnTextActive]}>Bookmarked</Text>
            </AnimatedScaleButton>
        </View>

        {/* Newest first notice */}
        <View style={styles.chronoNotice}>
            <MaterialCommunityIcons name="clock-outline" size={12} color={theme.colors.textMuted} />
            <Text style={styles.chronoNoticeText}>Newest first · Oldest at bottom</Text>
        </View>
    </Animated.View>
));

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
    feedProgress: SharedValue<number>;
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
    useEffect(() => {
        screenHeightSV.value = screenHeight;
    }, [screenHeight, screenHeightSV]);

    const { savedNotes } = useNotes();
    const { savedVlogs } = useVlogs();
    const { persons } = usePersons();
    const { autoPlayFeedVideos, bookmarkedNoteIds, feedComments, toggleBookmark, saveFeedComment } = useFeedData();

    const [filterBookmarked, setFilterBookmarked] = useState(false);
    const [feedScrollEnabled, setFeedScrollEnabled] = useState(true);
    /** Type filter checkboxes — which entry types to show */
    const [showJournals, setShowJournals] = useState(true);
    const [showTweets, setShowTweets] = useState(true);
    const [showVlogs, setShowVlogs] = useState(true);
    const [showCheckins, setShowCheckins] = useState(true);
    /** Track which feed items are currently visible in the viewport for video auto-play */
    const [visibleItemIds, setVisibleItemIds] = useState<Set<string>>(new Set());
    // FlashList ref for gesture interop — FlashListRef is the proper ref type
    // for FlashList imperatives (scrollToOffset, etc).
    const listRef = useRef<FlashListRef<FeedItem>>(null);

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

    /* ── CONFIGURABLE CLOSE GESTURE PARAMETERS ────────────────────────────────── */

    /**
     * Commit threshold for closing: once feedProgress drops below this value,
     * releasing auto-completes the close animation.
     *
     * IMPORTANT: progress starts at 1.0 (fully open) and goes toward 0.0 (closed).
     * A threshold of 0.70 means dragging 30% of screen height (~240px) commits.
     */
    const CLOSE_COMMIT_THRESHOLD = 0.7;
    /**
     * Velocity threshold: a downward flick faster than this (positive = down, px/s)
     * commits to close. At 3000, ONLY a very fast flick commits.
     * A gentle swipe (~500-1000 px/s) will NOT trigger this.
     */
    const CLOSE_VELOCITY_THRESHOLD = 3000;
    /**
     * Velocity projection factor: simulates native ScrollView paging physics.
     * On release, we calculate where the gesture would land if it decelerated
     * naturally. If the projected position drops below 50%, we commit to close.
     */
    const CLOSE_VELOCITY_PROJECTION_FACTOR = 0.12;

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

    /** Scroll-to-top button visibility (UI-thread only) */
    const showScrollTopButton = useSharedValue(0);

    useAnimatedReaction(
        () => listScrollY.value,
        (currentY) => {
            const shouldShow = currentY > SCROLL_TOP_SHOW_THRESHOLD;
            showScrollTopButton.value = shouldShow ? 1 : 0;
        },
        [],
    );

    const scrollToTopButtonStyle = useAnimatedStyle(() => ({
        opacity: withTiming(showScrollTopButton.value, { duration: 250 }),
        transform: [
            {
                translateY: withTiming(showScrollTopButton.value === 1 ? 0 : 10, { duration: 250 }),
            },
        ],
    }));

    const handleScrollToTop = useCallback(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, []);

    const handleToggleType = useCallback((type: 'journals' | 'tweets' | 'vlogs' | 'checkins') => {
        if (type === 'journals') setShowJournals(p => !p);
        if (type === 'tweets') setShowTweets(p => !p);
        if (type === 'vlogs') setShowVlogs(p => !p);
        if (type === 'checkins') setShowCheckins(p => !p);
    }, []);

    /**
     * Precompute person lookup so feedItems derivation doesn't rebuild the map
     * when only savedNotes/savedVlogs change. This splits the dependency graph
     * and reduces O(m) Map construction overhead on high-frequency updates.
     */
    const personMap = useMemo(() => {
        const map = new Map<string, Person>();
        persons.forEach((p) => map.set(p.id, p));
        return map;
    }, [persons]);

    /**
     * Merge all content types into a single chronological feed.
     * Notes, vlogs, and check-ins are all unified into FeedItem objects
     * and sorted by timestamp (newest LAST — oldest at top).
     */
    const feedItems = useMemo(() => {
        const items: FeedItem[] = [];

        // Process text notes (journals, circles, check-ins)
        savedNotes.forEach((note) => {
            const isCheckin = isAlignmentReflection(note);
            const type: FeedItemType = isCheckin ? 'checkin' : note.isTweet ? 'tweet' : 'story';

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
        savedVlogs.forEach((vlog) => {
            items.push({
                type: 'clip',
                timestamp: vlog.timestamp,
                vlog,
            });
        });

        // Sort reverse chronologically: newest first
        items.sort((a, b) => b.timestamp - a.timestamp);

        return items;
    }, [savedNotes, savedVlogs, personMap]);

    /** Apply bookmark filter if active (uses Set for O(1) lookups) */
    const bookmarkSet = useMemo(() => new Set(bookmarkedNoteIds), [bookmarkedNoteIds]);
    /** Apply bookmark + type filters */
    const displayItems = useMemo(() => {
        let items = feedItems;
        if (!showJournals) items = items.filter(i => i.type !== 'story');
        if (!showTweets) items = items.filter(i => i.type !== 'tweet');
        if (!showVlogs) items = items.filter(i => i.type !== 'clip');
        if (!showCheckins) items = items.filter(i => i.type !== 'checkin');
        if (filterBookmarked) {
            items = items.filter((item) => {
                const id = item.note?.id || item.vlog?.id || '';
                return bookmarkSet.has(id);
            });
        }
        return items;
    }, [feedItems, filterBookmarked, bookmarkSet, showJournals, showTweets, showVlogs, showCheckins]);

    /** Refs for stable renderItem access — prevents re-render cascade when
     *  bookmarks/comments change on ONE card. The renderItem reads from refs
     *  (always current) while extraData triggers targeted re-renders only. */
    const bookmarkSetRef = useRef(bookmarkSet);
    bookmarkSetRef.current = bookmarkSet;
    const feedCommentsRef = useRef(feedComments);
    feedCommentsRef.current = feedComments;

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
        },
    );

    // Safety net REMOVED — it fights onEnd with asymmetric thresholds.
    // onEnd already handles commit decisions correctly.

    const handleScroll = useAnimatedScrollHandler({
        onScroll: (e) => {
            listScrollY.value = e.contentOffset.y;
        },
    });

    /**
     * Follow-finger drag-down to close — coexists with FlashList scroll.
     *
     * simultaneousWithExternalGesture allows the Pan and FlashList scroll to
     * process the same touch. The onUpdate gate (listScrollY <= 0 + swipingDown)
     * ensures the Pan only drives feedProgress when the list is at the top.
     * When in the middle of the feed, the scroll moves normally and feedProgress
     * stays untouched.
     *
     * 1:1 finger tracking with snappier commit threshold and velocity.
     */
    const feedPanGesture = useMemo(
        () =>
            Gesture.Pan()
                .simultaneousWithExternalGesture(listRef as unknown as React.RefObject<React.ComponentType>)
                .activeOffsetY([-10000, 8]) // Only activate on DOWNWARD movement (8px = very responsive)
                .failOffsetX([-20, 20]) // Allow some horizontal jitter
                .onStart(() => {
                    if (!feedProgress) return;
                    cancelAnimation(feedProgress);
                    gestureStartProgress.value = feedProgress.value;
                    startTranslationOffset.value = 0;
                    isFeedGestureActive.value = false;
                })
                .onUpdate((e) => {
                    if (!feedProgress) return;

                    // Only start driving feedProgress when at top of list + swiping down.
                    // Use a 2px tolerance for scrollY because some devices report small
                    // positive values at the top due to pixel rounding.
                    if (!isFeedGestureActive.value) {
                        const atTopOfList = listScrollY.value <= 2;
                        const swipingDown = e.translationY > 5;

                        if (atTopOfList && swipingDown) {
                            isFeedGestureActive.value = true;
                            gestureStartProgress.value = feedProgress.value;
                            startTranslationOffset.value = e.translationY;
                        }
                        return;
                    }

                    // Follow finger in both directions from activation point
                    const delta = e.translationY - startTranslationOffset.value;
                    const progressDelta = delta / screenHeightSV.value;
                    const newProgress = Math.max(0, Math.min(1, gestureStartProgress.value - progressDelta));
                    feedProgress.value = newProgress;
                })
                .onEnd((e) => {
                    if (!feedProgress) return;
                    if (!isFeedGestureActive.value) return;
                    isFeedGestureActive.value = false;

                    // Velocity projection: where would we land if velocity carried us?
                    // This mimics native ScrollView paging — a flick "throws" the content.
                    const projectedProgress =
                        feedProgress.value - (e.velocityY * CLOSE_VELOCITY_PROJECTION_FACTOR) / screenHeightSV.value;

                    const shouldClose =
                        feedProgress.value < CLOSE_COMMIT_THRESHOLD ||
                        e.velocityY > CLOSE_VELOCITY_THRESHOLD ||
                        projectedProgress < 0.5;

                    // Gesture decision made — spring to target
                    const target = shouldClose ? 0 : 1;
                    feedProgress.value = withSpring(target, theme.animation.springSnappy);
                    if (shouldClose) runOnJS(onClose)();
                    else runOnJS(onOpen)();
                })
                .onFinalize(() => {
                    isFeedGestureActive.value = false;
                }),
        [
            onClose,
            onOpen,
            feedProgress,
            screenHeightSV,
            listScrollY,
            gestureStartProgress,
            isFeedGestureActive,
            startTranslationOffset,
        ],
    );

    /** Close button — cancel in-flight animation, spring closed, set state immediately */
    const handleCloseButton = useCallback(() => {
        if (!feedProgress) return;
        cancelAnimation(feedProgress);
        feedProgress.value = withSpring(0, theme.animation.springSnappy);
        onClose();
    }, [onClose, feedProgress]);

    const renderFeedItem = useCallback(
        ({ item }: { item: FeedItem }) => {
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
                            isBookmarked={bookmarkSetRef.current.has(item.vlog.id)}
                            comment={feedCommentsRef.current[item.vlog.id]}
                            autoPlay={autoPlayFeedVideos && isVisible}
                            onToggleBookmark={toggleBookmark}
                            onSaveComment={saveFeedComment}
                            onOpenVlog={onOpenVlog}
                        />
                    ) : (
                        <FeedCard
                            item={item}
                            isBookmarked={bookmarkSetRef.current.has(item.note?.id || item.vlog?.id || '')}
                            comment={feedCommentsRef.current[item.note?.id || item.vlog?.id || '']}
                            onToggleBookmark={toggleBookmark}
                            onSaveComment={saveFeedComment}
                            onOpenEntry={onOpenNote}
                            onOpenVlog={onOpenVlog}
                        />
                    )}
                </View>
            );
        },
        [visibleItemIds, isFeedVisible, autoPlayFeedVideos, toggleBookmark, saveFeedComment, onOpenNote, onOpenVlog],
    );
    // ^^^ bookmarkSet and feedComments removed — read from refs to prevent cascade

    /* ── Render: Lock screen ───────────────────────────────────────── */
    /**
     * Lock screen pan gesture: follow-finger drag down to dismiss.
     * Uses the same distance-scaled mechanics as the main close gesture.
     */
    const lockPanGesture = useMemo(
        () =>
            Gesture.Pan()
                .activeOffsetY([-10000, 8]) // Only activate on DOWNWARD movement (8px = very responsive)
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
                        if (e.translationY > 5) {
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

                    // Velocity projection: where would we land if velocity carried us?
                    const projectedProgress =
                        feedProgress.value - (e.velocityY * CLOSE_VELOCITY_PROJECTION_FACTOR) / screenHeightSV.value;

                    const shouldClose =
                        feedProgress.value < CLOSE_COMMIT_THRESHOLD ||
                        e.velocityY > CLOSE_VELOCITY_THRESHOLD ||
                        projectedProgress < 0.5;

                    const target = shouldClose ? 0 : 1;
                    feedProgress.value = withSpring(target, theme.animation.springSnappy);
                    if (shouldClose) runOnJS(onClose)();
                    else runOnJS(onOpen)();
                })
                .onFinalize(() => {
                    isFeedGestureActive.value = false;
                }),
        [
            onClose,
            onOpen,
            feedProgress,
            gestureStartProgress,
            isFeedGestureActive,
            screenHeightSV,
            startTranslationOffset,
        ],
    );

    /** Precompute stable empty element BEFORE the lock-screen early return */
    const emptyComponent = useMemo(() => <FeedEmpty filterBookmarked={filterBookmarked} />, [filterBookmarked]);

    /** Precompute stable header element — memoized props prevent re-create */
    const feedHeaderElement = useMemo(
        () => (
            <FeedHeader
                entryCount={feedItems.length}
                filterBookmarked={filterBookmarked}
                onToggleFilter={setFilterBookmarked}
                showJournals={showJournals}
                showTweets={showTweets}
                showVlogs={showVlogs}
                showCheckins={showCheckins}
                onToggleType={handleToggleType}
                onClose={handleCloseButton}
            />
        ),
        [feedItems.length, filterBookmarked, showJournals, showTweets, showVlogs, showCheckins, handleToggleType, handleCloseButton],
    );

    /** getItemLayout: approximate heights for FlashList fast-path layout.
     *  FlashList corrects actual heights after measurement. */
    const getFeedItemLayout = useCallback(
        (_: FeedItem[] | null, index: number) => ({
            length: 250,
            offset: 250 * index,
            index,
        }),
        [],
    );

    /** extraData: lightweight trigger that changes when bookmarks/comments update.
     *  FlashList re-renders visible items when this changes, but the stable
     *  renderItem reads from refs (no function re-creation). */
    const commentKeyCount = Object.keys(feedComments).length;
    const feedExtraData = useMemo(
        () => ({
            bookmarkVersion: bookmarkedNoteIds.length,
            commentVersion: commentKeyCount,
        }),
        [bookmarkedNoteIds.length, commentKeyCount],
    );

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
                                if (success) vibrate(50);
                            }}
                        >
                            <MaterialCommunityIcons
                                name="fingerprint"
                                size={24}
                                color={theme.colors.textPrimary}
                                style={{ marginRight: 10 }}
                            />
                            <Text style={styles.unlockBtnText}>Unlock Feed</Text>
                        </AnimatedScaleButton>
                    </View>
                </Animated.View>
            </GestureDetector>
        );
    }

    return (
        <View style={styles.container}>
            <GestureDetector gesture={feedPanGesture}>
                <View style={styles.gestureArea}>
                    <Animated.View style={[styles.feedContentWrapper, feedContentOpacity]}>
                        <AnimatedFlashList
                            ref={listRef}
                            renderScrollComponent={RNGHScrollView}
                            data={displayItems}
                            ListHeaderComponent={feedHeaderElement}
                            ListFooterComponent={FeedFooter}
                            ListEmptyComponent={emptyComponent}
                            estimatedItemSize={250}
                            getItemLayout={getFeedItemLayout}
                            keyExtractor={(item: FeedItem) => item.note?.id || item.vlog?.id || String(item.timestamp)}
                            bounces={false}
                            overScrollMode="never"
                            scrollEnabled={feedScrollEnabled}
                            onScroll={handleScroll}
                            onScrollBeginDrag={() => DeviceEventEmitter.emit('RESET_LOCK_TIMER')}
                            scrollEventThrottle={16}
                            renderItem={renderFeedItem}
                            extraData={feedExtraData}
                            onViewableItemsChanged={onViewableItemsChanged}
                            viewabilityConfig={viewabilityConfig}
                            contentContainerStyle={styles.listContent}
                            showsVerticalScrollIndicator={false}
                        />
                    </Animated.View>
                </View>
            </GestureDetector>
            {isUnlocked && displayItems.length > 0 && (
                <Animated.View style={[styles.scrollToTopBtn, scrollToTopButtonStyle]}>
                    <BlurView intensity={60} tint="dark" style={styles.scrollToTopBlur}>
                        <AnimatedScaleButton style={styles.scrollToTopBtnInner} onPress={handleScrollToTop}>
                            <MaterialCommunityIcons name="arrow-up" size={24} color={theme.colors.textPrimary} />
                        </AnimatedScaleButton>
                    </BlurView>
                </Animated.View>
            )}
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
        backgroundColor: theme.colors.grey,
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
    checkboxRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
    },
    checkboxBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 100,
        backgroundColor: theme.colors.glassBackground,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
    },
    checkboxBtnActive: {
        backgroundColor: theme.colors.primaryAction,
        borderColor: theme.colors.primaryAction,
    },
    checkboxText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontWeight: '600',
    },
    checkboxTextActive: {
        color: theme.colors.textPrimary,
        fontWeight: '700',
    },
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
    gestureArea: {
        flex: 1,
    },
    scrollToTopBtn: {
        position: 'absolute',
        bottom: 24,
        right: 20,
        zIndex: 9999,
        pointerEvents: 'auto',
    },
    scrollToTopBlur: {
        borderRadius: 100,
        overflow: 'hidden',
        backgroundColor: theme.colors.glassSurfaceMedium,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
    },
    scrollToTopBtnInner: {
        width: 48,
        height: 48,
        borderRadius: 100,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
