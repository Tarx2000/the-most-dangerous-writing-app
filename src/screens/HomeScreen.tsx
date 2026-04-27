import React, { useRef, useState, useCallback, useMemo, useTransition } from 'react';
import { View, useWindowDimensions, StyleSheet, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { ScrollView, GestureDetector } from 'react-native-gesture-handler';
import Animated, { type SharedValue } from 'react-native-reanimated';
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
import { useHomeGestures } from '@/lib/hooks/useHomeGestures';
import { theme } from '@/styles/theme';
import type { SavedNote, SavedVlog } from '@/types';
import type { VideoPlayer } from 'expo-video';

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
        handleCloseFeed,
        openFeed,
        closeFeed,
        scrollEnabled,
        setScrollEnabled,
        screenHeight,
        screenHeightSV,
        listScrollY,
    } = useHomeGestures(currentPage);

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
