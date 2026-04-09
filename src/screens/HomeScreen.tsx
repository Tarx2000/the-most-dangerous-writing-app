import React, { useRef, useState, useCallback, useEffect, useMemo, useTransition } from 'react';
import { View, Dimensions, StyleSheet, Vibration, NativeSyntheticEvent, NativeScrollEvent, StatusBar, Platform } from 'react-native';
import { ScrollView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation.types';
import { StartScreen } from './StartScreen';
import { LibraryScreen } from './LibraryScreen';
import { FeedScreen } from './FeedScreen';
import { LiquidGlassNav } from '@/components/ui/LiquidGlassNav';
import { NoteViewerModal } from '@/components/features/library/NoteViewerModal';
import { useStorage } from '@/lib/hooks/useStorage';
import { useSecurity } from '@/lib/hooks/useSecurity';
import { useAiQueue } from '@/lib/hooks/useAiQueue';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const { width, height: SCREEN_HEIGHT } = Dimensions.get('window');

/* ── CONFIGURABLE ─────────────────────────────────────────────────────────── */

/**
 * Distance (px) the user must swipe down before the Feed snaps open.
 * If the user drags less than this, the Feed snaps back closed.
 */
const FEED_SNAP_THRESHOLD = 120;

/** Spring physics for the feed reveal/dismiss animation */
const FEED_SPRING = {
    damping: 30,
    stiffness: 220,
    mass: 0.8,
};

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

    /**
     * Track which page is visible (0 = Start, 1 = Library).
     * Feed pull-down is only available on the Start page.
     */
    const [currentPage, setCurrentPage] = useState(0);

    /** Whether the Feed page is currently revealed */
    const [feedVisible, setFeedVisible] = useState(false);

    const storage = useStorage();
    const security = useSecurity();

    /**
     * Initialize the AI Queue Manager on app startup.
     * Loads persisted queue, recovers orphaned jobs,
     * and auto-resumes processing. Only runs once.
     */
    const { initializeQueue, enqueueNote, isNoteActive } = useAiQueue({
        aiApiKey: storage.aiApiKey,
        aiBaseUrl: storage.aiBaseUrl,
        aiModel: storage.aiModel,
        aiPrompts: storage.aiPrompts,
        savedNotes: storage.savedNotes,
        updateNote: storage.updateNote,
    });

    /** Note Viewer State for the Feed Screen */
    const [viewNoteModal, setViewNoteModal] = useState<any | null>(null);
    const [noteToDelete, setNoteToDelete] = useState<string | null>(null);

    /** Initialize queue once on mount (after storage loads) */
    const queueInitedRef = useRef(false);
    useEffect(() => {
        if (storage.savedNotes.length > 0 && !queueInitedRef.current) {
            queueInitedRef.current = true;
            initializeQueue();
        }
    }, [storage.savedNotes.length, initializeQueue]);

    /** Navigate to Library page (scroll right) */
    const goToLibrary = useCallback(() => {
        scrollViewRef.current?.scrollTo({ x: width, animated: true });
    }, []);

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
        const page = Math.round(offsetX / width);
        setCurrentPage(page);
    }, []);

    /** Check-in urgency: show dot when overdue (>7 days) AND only on homescreen */
    const isCheckinUrgent = currentPage === 0 && (
        !storage.lastReflectionDate ||
        (Date.now() - storage.lastReflectionDate > 7 * 24 * 60 * 60 * 1000)
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

    /** JS callbacks for gesture end (runOnJS bridges) */
    const openFeed = useCallback(() => {
        setFeedVisible(true);
        setScrollEnabled(false);
    }, []);

    const closeFeed = useCallback(() => {
        setFeedVisible(false);
        setScrollEnabled(true);
    }, []);

    /**
     * Pan gesture: only activates when swiping UP on the Start page.
     * Prevents interference with horizontal library swipe or vertical scrolling.
     */
    const feedPanGesture = Gesture.Pan()
        // Must be [min, max]. Activate if finger moves UP 20px (past -20)
        // or DOWN more than 10000px (effectively never)
        .activeOffsetY([-20, 10000])
        // Fail gesture if finger moves horizontally by 20px (allows Library swipe)
        .failOffsetX([-20, 20])
        .enabled(currentPage === 0 && !feedVisible)
        .onUpdate((e) => {
            // Only allow upward drag (negative translationY)
            if (e.translationY < 0) {
                const progress = Math.min(Math.abs(e.translationY) / SCREEN_HEIGHT, 1);
                feedProgress.value = Math.pow(progress, 0.7);
            }
        })
        .onEnd((e) => {
            if (e.translationY < -FEED_SNAP_THRESHOLD) {
                // Snap open
                feedProgress.value = withSpring(1, FEED_SPRING);
                runOnJS(openFeed)();
            } else {
                // Snap back
                feedProgress.value = withSpring(0, FEED_SPRING);
            }
        });

    /** Main content animates UP (to -SCREEN_HEIGHT) when feed opens */
    const mainContentAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: feedProgress.value * -SCREEN_HEIGHT }],
    }));

    /** Feed layer animates UP (from SCREEN_HEIGHT to 0) */
    const feedAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: (1 - feedProgress.value) * SCREEN_HEIGHT }],
    }));

    /** Close the feed — animate content back down */
    const handleCloseFeed = useCallback(() => {
        feedProgress.value = withSpring(0, FEED_SPRING);
        closeFeed();
    }, [closeFeed]);

    /** Stable references for Modals to prevent re-renders */
    const handleOpenNoteModal = useCallback((note: any) => {
        setViewNoteModal(note);
    }, []);

    const handleOpenVlogModal = useCallback((vlog: any) => {
        // TODO: Open vlog player
    }, []);

    const handleCloseNoteModal = useCallback(() => {
        setViewNoteModal(null);
    }, []);

    const handleDeleteNoteModal = useCallback((id: string) => {
        setViewNoteModal(null);
        setNoteToDelete(id);
    }, []);

    const handleRegenerateAi = useCallback((note: any, category: any) => {
        enqueueNote(note.id, category);
    }, [enqueueNote]);

    return (
        <View style={styles.container}>
            {/* Feed Page — positioned below viewport, slides up when revealed */}
            <Animated.View style={[styles.feedLayer, feedAnimStyle]} pointerEvents={feedVisible ? 'auto' : 'none'}>
                <FeedScreen
                    isUnlocked={security.isFeedUnlocked}
                    onUnlock={security.unlockNotes}
                    onOpenNote={handleOpenNoteModal}
                    onOpenVlog={handleOpenVlogModal}
                    onClose={handleCloseFeed}
                    feedProgress={feedProgress}
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

            {/* Main Content — Start + Library horizontal scroll */}
            <GestureDetector gesture={feedPanGesture}>
                {/* Pointer events bound to inverse feed state so it doesn't catch touches when hidden */}
                <Animated.View style={[styles.mainContent, mainContentAnimStyle]} pointerEvents={feedVisible ? 'none' : 'auto'}>
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
                        <View style={styles.page}>
                            <StartScreen
                                navigation={navigation}
                                route={route as any}
                                onGoToLibrary={goToLibrary}
                                setHomeScrollEnabled={setScrollEnabled}
                                sessionMode={sessionMode}
                                setSessionMode={setSessionMode}
                            />
                        </View>

                        {/* Library Screen — saved notes & circles */}
                        <View style={styles.page}>
                            <LibraryScreen
                                navigation={navigation}
                                route={route as any}
                                onGoToStart={goToStart}
                                sessionMode={sessionMode}
                            />
                        </View>
                    </ScrollView>

                    {/* Persistent Liquid Glass Navigation — floats above both pages */}
                    <LiquidGlassNav
                        items={navItems}
                        activeId={sessionMode}
                        onSelect={handleModeChange}
                    />
                </Animated.View>
            </GestureDetector>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    /** Main content layer — Start + Library + NavBar */
    mainContent: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    page: {
        width,
        height: '100%',
    },
    /**
     * Feed layer — positioned absolutely to cover the full screen.
     * Starts below the viewport (translateY = SCREEN_HEIGHT via animated style)
     * and slides into view when the user swipes UP.
     */
    feedLayer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: SCREEN_HEIGHT,
        zIndex: 100,
    },
});
