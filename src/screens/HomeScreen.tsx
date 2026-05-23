import React, { useRef, useState, useCallback, useMemo, useTransition } from 'react';
import { View, useWindowDimensions, StyleSheet, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { ScrollView, GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Route } from '@react-navigation/native';
import { RootStackParamList } from '@/types/navigation.types';
import { StartScreen } from './StartScreen';
import { LibraryScreen } from './LibraryScreen';
import { FeedScreen } from './FeedScreen';
import { LiquidGlassNav } from '@/components/ui/LiquidGlassNav';
import { NoteViewerModal } from '@/components/features/library/NoteViewerModal';
import { VlogViewerModal } from '@/components/features/library/VlogViewerModal';
import { usePreferences } from '@/lib/hooks/useStorage';
import { useSecurity } from '@/lib/hooks/useSecurity';
import { useAiQueueContext } from '@/lib/hooks/useAiQueueProvider';
import { useHomeModals } from '@/lib/hooks/useHomeModals';
import { useHomeGestures } from '@/lib/hooks/useHomeGestures';
import { theme } from '@/styles/theme';
import type { SavedNote, AiJobCategory } from '@/types';
import { CONFIG } from '@/config';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

/* -- CONFIGURABLE ---------------------------------------------------------- */

/**
 * HomeScreen — Root container wrapping horizontal Start ? Library scroll
 * and the vertical pull-down Feed page.
 *
 * Architecture:
 * +--------------------------+
 * ¦      Feed (hidden above) ¦  ? revealed by swiping DOWN from Start
 * +--------------------------¦
 * ¦  Start  ¦  Library       ¦  ? horizontal paging scroll
 * +--------------------------¦
 * ¦  LiquidGlassNav (float)  ¦  ? persistent bottom nav
 * +--------------------------+
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
    const { width: screenWidth } = useWindowDimensions();

    const scrollViewRef = useRef<ScrollView>(null);

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

    const { lastReflectionDate } = usePreferences();
    const security = useSecurity();
    const { enqueueNote, isNoteActive } = useAiQueueContext();

    const {
        viewNoteModal,
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
     *
     * Optimization: we update activeTabId (nav visual state) immediately,
     * then let the indicator spring start BEFORE we queue the heavy
     * sessionMode transition via enqueue. This gives the spring a full
     * 1–2 frame head start, eliminating the sense of JS blocking the animation.
     */
    const handleModeChange = useCallback(
        (mode: string) => {
            // Immediate nav update — triggers LiquidGlassNav indicator spring
            setActiveTabId(mode as 'journal' | 'circles' | 'checkin' | 'vlog');

            // Defer heavier screen content re-renders so the spring starts first
            startTransition(() => {
                setSessionMode(mode as 'journal' | 'circles' | 'checkin' | 'vlog');
            });
        },
        [startTransition],
    );

    /**
     * Track horizontal scroll to determine current page.
     * Used to conditionally show check-in urgent dot
     * and to restrict Feed pull-down to Start page only.
     */
    const handleScroll = useCallback(
        (e: NativeSyntheticEvent<NativeScrollEvent>) => {
            const offsetX = e.nativeEvent.contentOffset.x;
            const page = Math.round(offsetX / screenWidth);
            setCurrentPage(page);
        },
        [screenWidth],
    );

    /** Check-in urgency: show dot when overdue (>CONFIG.CHECKIN_URGENT_DAYS days) AND only on homescreen */
    const isCheckinUrgent =
        currentPage === 0 && (!lastReflectionDate || Date.now() - lastReflectionDate > CONFIG.CHECKIN_URGENT_MS);

    /**
     * Memoize nav items to prevent LiquidGlassNav re-renders.
     * Only recalculates when the urgent dot status changes.
     * IMPORTANT: The array is frozen object literals with stable keys,
     * so the only dep that changes is isCheckinUrgent.
     */
    const navItems = useMemo(
        () => [
            { id: 'journal', icon: 'notebook-edit', label: 'Journal' },
            { id: 'circles', icon: 'account-group', label: 'Circles' },
            { id: 'vlog', icon: 'video-outline', label: 'Vlog' },
            { id: 'checkin', icon: 'compass-outline', label: 'Check-in', urgent: isCheckinUrgent },
        ],
        [isCheckinUrgent],
    );

    /**
     * Keep a stable reference to navItems so that any downstream
     * equality check (e.g. React.memo in LiquidGlassNav) does not
     * false-negative when deps haven't meaningfully changed.
     */
    const navItemsRef = useRef(navItems);
    navItemsRef.current = navItems;

    /* --------------------------------------------------------------------------
       FEED GESTURE — delegated to useHomeGestures hook
       -------------------------------------------------------------------------- */

    const {
        feedProgress,
        feedVisible,
        feedPanGesture,
        mainContentAnimStyle,
        feedAnimStyle,
        navAnimStyle,
        openFeed,

        closeFeed,
        scrollEnabled,
        setScrollEnabled,
        screenHeight,
        listScrollY,
    } = useHomeGestures(currentPage);

    const handleRegenerateAi = useCallback(
        (note: SavedNote, category: AiJobCategory) => {
            enqueueNote(note.id, category);
        },
        [enqueueNote],
    );

    return (
        <View style={styles.container}>
            {/* Feed Page — positioned below viewport, slides up when revealed */}
            <Animated.View
                style={useMemo(
                    () => [styles.feedLayer, feedAnimStyle, { height: screenHeight }],
                    [feedAnimStyle, screenHeight],
                )}
            >
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
                        <View style={useMemo(() => [styles.page, { width: screenWidth }], [screenWidth])}>
                            <StartScreen
                                navigation={navigation}
                                route={route as Route<string, RootStackParamList['Home']>}
                                _onGoToLibrary={goToLibrary}
                                setHomeScrollEnabled={setScrollEnabled}
                                sessionMode={sessionMode}
                                _setSessionMode={setSessionMode}
                                isActive={currentPage === 0}
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
                <LiquidGlassNav items={navItems} activeId={activeTabId} onSelect={handleModeChange} />
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
