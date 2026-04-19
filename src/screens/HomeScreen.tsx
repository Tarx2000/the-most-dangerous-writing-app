import React, { useRef, useState, useCallback, useEffect, useMemo, useTransition } from 'react';
import { View, useWindowDimensions, StyleSheet, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { ScrollView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, useAnimatedReaction, withSpring, cancelAnimation, runOnJS, type SharedValue } from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Route } from '@react-navigation/native';
import { RootStackParamList } from '@/types/navigation.types';
import { StartScreen } from './StartScreen';
import { LibraryScreen } from './LibraryScreen';
import { FeedScreen } from './FeedScreen';
import { LiquidGlassNav } from '@/components/ui/LiquidGlassNav';
import { NoteViewerModal } from '@/components/features/library/NoteViewerModal';
import { VlogViewerModal, LayoutRect } from '@/components/features/library/VlogViewerModal';
import { usePreferences } from '@/lib/hooks/useStorage';
import { useSecurity } from '@/lib/hooks/useSecurity';
import { useAiQueueContext } from '@/lib/hooks/useAiQueueProvider';
import { useHomeModals } from '@/lib/hooks/useHomeModals';
import { theme } from '@/styles/theme';
import type { SavedNote, SavedVlog } from '@/types';
import type { VideoPlayer } from 'expo-video';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

/* ── CONFIGURABLE ─────────────────────────────────────────────────────────── */

/**
 * HomeScreen — Root container wrapping horizontal Start ↔ Library scroll
 * and the vertical pull-down Feed page.
 *
 * Architecture:
 * ┌──────────────────────────┐
 * │      Feed (hidden above) │  ← revealed by swiping DOWN from Start
 * ├──────────────────────────┤
 * │  Start  │  Library       │  ← horizontal paging scroll
 * ├──────────────────────────┤
 * │  LiquidGlassNav (float)  │  ← persistent bottom nav
 * └──────────────────────────┘
 *
 * The Feed page starts at translateY = -SCREEN_HEIGHT (above viewport).
 * When the user swipes down from the Start page, the entire content
 * (Start + Library) slides down while the Feed slides into view from above.
 *
 * Closing: When at the bottom of the Feed (newest entries), swiping up
 * past the content boundary triggers the dismiss — the Feed slides back
 * up and the HomeScreen returns to its original position.
 */
export const HomeScreen: React.FC<Props> = ({ navigation, route }) => {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    /** SharedValue for screen height — used in Reanimated worklets (animated styles / gesture handlers) */
    const screenHeightSV = useSharedValue(screenHeight);
    /** Keep the SharedValue in sync when the window resizes (e.g. rotation) */
    useEffect(() => { screenHeightSV.value = screenHeight; }, [screenHeight, screenHeightSV]);

    const scrollViewRef = useRef<ScrollView>(null);
    const [scrollEnabled, setScrollEnabled] = useState(true);

    /**
     * Shared session mode — drives both Start hero content and Library tab.
     * 'journal' = free writing / notes
     * 'circles' = relationship journal / circles tab
     * 'checkin' = alignment check-in / checkins tab
     * 'vlog' = video journal
     */
    const [sessionMode, setSessionMode] = useState<'journal' | 'circles' | 'checkin' | 'vlog'>('journal');
    // Immediate state for the navigation bar to eliminate perceived lag
    const [activeTabId, setActiveTabId] = useState<'journal' | 'circles' | 'checkin' | 'vlog'>('journal');

    /**
     * Track which page is visible (0 = Start, 1 = Library).
     * Feed pull-down is only available on the Start page.
     */
    const [currentPage, setCurrentPage] = useState(0);

    /** Whether the Feed page is currently revealed */
    const [feedVisible, setFeedVisible] = useState(false);

    const { lastReflectionDate, lockTimeoutMins } = usePreferences();
    const security = useSecurity(lockTimeoutMins);
    const { enqueueNote, isNoteActive } = useAiQueueContext();

    const {
        viewNoteModal,
        noteToDelete,
        viewVlogModal,
        vlogSourceRect,
        vlogPlayerInst,
        handleOpenNoteModal,
        handleCloseNoteModal,
        handleDeleteNoteModal,
        handleOpenVlogModal,
        handleCloseVlogModal,
    } = useHomeModals();

    /** Navigate to Library page (scroll right) */
    const goToLibrary = useCallback(() => {
        scrollViewRef.current?.scrollTo({ x: screenWidth, animated: true });
    }, [screenWidth]);

    /** Navigate to Start page (scroll left) */
    const goToStart = useCallback(() => {
        scrollViewRef.current?.scrollTo({ x: 0, animated: true });
    }, []);

    /**
     * useTransition marks the mode switch as a low-priority update.
     * React commits the nav bar indicator change IMMEDIATELY, then
     * defers the expensive StartScreen/LibraryScreen re-renders to
     * the next frame. This eliminates the perceived lag.
     */
    const [, startTransition] = useTransition();

    /**
     * Handle nav tab selection.
     * Uses startTransition so the nav pill slides instantly while
     * the heavy screen content updates are deferred.
     */
    const handleModeChange = useCallback((mode: string) => {
        // Immediate nav update
        setActiveTabId(mode as 'journal' | 'circles' | 'checkin' | 'vlog');
        
        // Defer heavier screen content re-renders
        startTransition(() => {
            setSessionMode(mode as 'journal' | 'circles' | 'checkin' | 'vlog');
        });
    }, [startTransition]);

    /**
     * Track horizontal scroll to determine current page.
     * Used to conditionally show check-in urgent dot
     * and to restrict Feed pull-down to Start page only.
     */
    const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetX = e.nativeEvent.contentOffset.x;
        const page = Math.round(offsetX / screenWidth);
        setCurrentPage(page);
    }, [screenWidth]);

    /** Check-in urgency: show dot when overdue (>7 days) AND only on homescreen */
    const isCheckinUrgent = currentPage === 0 && (
        !lastReflectionDate ||
        (Date.now() - lastReflectionDate > 7 * 24 * 60 * 60 * 1000)
    );

    /**
     * Memoize nav items to prevent LiquidGlassNav re-renders.
     * Only recalculates when the urgent dot status changes.
     */
    const navItems = useMemo(() => [
        { id: 'journal', icon: 'notebook-edit', label: 'Journal' },
        { id: 'circles', icon: 'account-group', label: 'Circles' },
        { id: 'vlog', icon: 'video-outline', label: 'Vlog' },
        { id: 'checkin', icon: 'compass-outline', label: 'Check-in', urgent: isCheckinUrgent },
    ], [isCheckinUrgent]);

    /* ═══════════════════════════════════════════════════════════════════
       FEED PULL-UP GESTURE
       
       The feed starts hidden BELOW the viewport. The user swipes UP
       on the Start page to reveal it. 
       ═══════════════════════════════════════════════════════════════════ */

    /**
     * Animated progress for the feed reveal (0 to 1)
     * 0 = normal (HomeScreen visible)
     * 1 = Feed fully revealed (content pushed up)
     */
    const feedProgress = useSharedValue(0);

    /** Gesture coordination SharedValues */
    const gestureStartProgress = useSharedValue(0);
    const startTranslationOffset = useSharedValue(0);
    const isFeedGestureActive = useSharedValue(false);
    const listScrollY = useSharedValue(0);

    /** JS callbacks — lightweight state-only commits, called on spring completion */
    const openFeed = useCallback(() => {
        setFeedVisible(true);
        setScrollEnabled(false);
    }, []);

    const closeFeed = useCallback(() => {
        setFeedVisible(false);
        setScrollEnabled(true);
    }, []);

    /**
     * Pan gesture: follow-finger feed reveal on the Start page.
     * UPWARD-only activation (activeOffsetY) + fail on horizontal (failOffsetX)
     * ensures strictly vertical swipes only — no diagonal.
     * No simultaneousWithExternalGesture — horizontal scroll and vertical pan
     * are mutually exclusive (failOffsetX makes pan fail on horizontal movement).
     * Activates on upward swipe from any feedProgress position (including mid-transition
     * rescue). cancelAnimation on start enables rapid switching without stuck states.
     */
    const feedPanGesture = useMemo(() => Gesture.Pan()
        .activeOffsetY([-15, 10000])   // Only activate on UPWARD movement
        .failOffsetX([-12, 12])         // Fail on any horizontal movement
        .enabled(currentPage === 0)
        .onStart(() => {
            cancelAnimation(feedProgress);
            gestureStartProgress.value = feedProgress.value;
            startTranslationOffset.value = 0;
            isFeedGestureActive.value = false;
        })
        .onUpdate((e) => {
            if (!isFeedGestureActive.value) {
                // Activate on upward swipe from any position (including mid-rescue)
                if (e.translationY < -8) {
                    isFeedGestureActive.value = true;
                    gestureStartProgress.value = feedProgress.value;
                    startTranslationOffset.value = e.translationY;
                }
                return;
            }
            const delta = e.translationY - startTranslationOffset.value;
            const progressDelta = -delta / screenHeightSV.value;
            const newProgress = Math.max(0, Math.min(1, gestureStartProgress.value + progressDelta));
            feedProgress.value = newProgress;
        })
        .onEnd((e) => {
            if (!isFeedGestureActive.value) return;
            isFeedGestureActive.value = false;
            const shouldOpen = feedProgress.value > 0.5 || e.velocityY < -500;
            const target = shouldOpen ? 1 : 0;
            feedProgress.value = withSpring(target, theme.animation.springFeed);
            if (shouldOpen) runOnJS(openFeed)();
            else runOnJS(closeFeed)();
        })
        .onFinalize(() => {
            isFeedGestureActive.value = false;
        }), [currentPage, feedProgress, screenHeightSV, openFeed, closeFeed]);

    /** Main content animates UP (to -screenHeight) when feed opens */
    const mainContentAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: feedProgress.value * -screenHeightSV.value }],
        pointerEvents: feedProgress.value > 0.5 ? 'none' : 'auto',
    }));

    /** Feed layer animates UP (from screenHeight to 0) */
    const feedAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: (1 - feedProgress.value) * screenHeightSV.value }],
        pointerEvents: feedProgress.value > 0.5 ? 'auto' : 'none',
    }));

    /** Nav bar fades out and slides down as feed opens — driven by feedProgress */
    const navAnimStyle = useAnimatedStyle(() => ({
        opacity: 1 - feedProgress.value,
        transform: [{ translateY: feedProgress.value * 80 }],
        pointerEvents: feedProgress.value > 0.5 ? 'none' : 'auto',
    }));

    /**
     * Safety net: if feedProgress is stranded at a mid-value with no gesture
     * active and no animation running, snap to the nearest end.
     */
    useAnimatedReaction(
        () => {
            const p = feedProgress.value;
            if (isFeedGestureActive.value) return 0;
            if (p < 0.01 || p > 0.99) return 0;
            return p;
        },
        (current, prev) => {
            if (current === prev || current === 0) return;
            const target = current > 0.5 ? 1 : 0;
            feedProgress.value = withSpring(target, theme.animation.springFeed);
            if (target === 0) runOnJS(closeFeed)();
            else runOnJS(openFeed)();
        }
    );

    /** Close the feed — cancel in-flight animation, spring closed, set state immediately */
    const handleCloseFeed = useCallback(() => {
        cancelAnimation(feedProgress);
        feedProgress.value = withSpring(0, theme.animation.springFeed);
        closeFeed();
    }, [closeFeed, feedProgress]);

    const handleRegenerateAi = useCallback((note: any, category: any) => {
        enqueueNote(note.id, category);
    }, [enqueueNote]);

    return (
        <View style={styles.container}>
            {/* Feed Page — positioned below viewport, slides up when revealed */}
            <Animated.View style={[styles.feedLayer, feedAnimStyle, { height: screenHeight }]}>
                <FeedScreen
                    isUnlocked={security.isFeedUnlocked}
                    onUnlock={security.unlockNotes}
                    onOpenNote={handleOpenNoteModal}
                    onOpenVlog={handleOpenVlogModal}
                    onClose={closeFeed}
                    onOpen={openFeed}
                    feedProgress={feedProgress}
                    isFeedVisible={feedVisible}
                    listScrollY={listScrollY}
                />
            </Animated.View>

            {/* Note Viewer Modal (Global to Home) */}
            <NoteViewerModal
                note={viewNoteModal}
                visible={!!viewNoteModal}
                onClose={handleCloseNoteModal}
                onDelete={handleDeleteNoteModal}
                isNoteActive={isNoteActive}
                onRegenerateAi={handleRegenerateAi}
            />

            {/* Vlog Viewer Modal */}
            <VlogViewerModal
                visible={!!viewVlogModal}
                vlogs={viewVlogModal ? [viewVlogModal] : []}
                sourceRect={vlogSourceRect}
                player={vlogPlayerInst}
                onClose={handleCloseVlogModal}
            />

            {/* Main Content — Start + Library horizontal scroll */}
            <GestureDetector gesture={feedPanGesture}>
                <Animated.View style={[styles.mainContent, mainContentAnimStyle]}>
                    <ScrollView
                        ref={scrollViewRef}
                        horizontal
                        pagingEnabled
                        scrollEnabled={scrollEnabled && !feedVisible}
                        bounces={false}
                        showsHorizontalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        style={styles.scrollView}
                        onScroll={handleScroll}
                        scrollEventThrottle={16}
                        decelerationRate="fast"
                    >
                        {/* Start Screen — writing mode setup */}
                        <View style={[styles.page, { width: screenWidth }]}>
                            <StartScreen
                                navigation={navigation}
                                route={route as Route<string, RootStackParamList['Home']>}
                                onGoToLibrary={goToLibrary}
                                setHomeScrollEnabled={setScrollEnabled}
                                sessionMode={sessionMode}
                                setSessionMode={setSessionMode}
                            />
                        </View>

                        {/* Library Screen — saved notes & circles */}
                        <View style={[styles.page, { width: screenWidth }]}>
                            <LibraryScreen
                                navigation={navigation}
                                route={route as Route<string, RootStackParamList['Home']>}
                                onGoToStart={goToStart}
                                sessionMode={sessionMode}
                            />
                        </View>
                    </ScrollView>
                </Animated.View>
            </GestureDetector>

            {/* Persistent Liquid Glass Navigation — fades out and slides down when feed opens */}
            <Animated.View style={navAnimStyle}>
                <LiquidGlassNav
                    items={navItems}
                    activeId={activeTabId}
                    onSelect={handleModeChange}
                />
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    /** Main content layer — Start + Library + NavBar */
    mainContent: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    page: {
        height: '100%',
    },
    /**
     * Feed layer — positioned absolutely to cover the full screen.
     * Starts below the viewport (translateY = screenHeightSV via animated style)
     * and slides into view when the user swipes UP.
     * Height is overridden inline with useWindowDimensions().
     */
    feedLayer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
    },
});
