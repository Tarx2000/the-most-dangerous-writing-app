import React, { useRef, useState, useCallback, useEffect, useMemo, useTransition } from 'react';
import { View, Dimensions, StyleSheet, Vibration, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation.types';
import { StartScreen } from './StartScreen';
import { LibraryScreen } from './LibraryScreen';
import { LiquidGlassNav } from '@/components/ui/LiquidGlassNav';
import { useStorage } from '@/lib/hooks/useStorage';
import { useSecurity } from '@/lib/hooks/useSecurity';
import { useAiQueue } from '@/lib/hooks/useAiQueue';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const { width } = Dimensions.get('window');

/**
 * HomeScreen — Root container for horizontal scroll between Start and Library.
 *
 * The LiquidGlassNav lives here at the parent level so it
 * persists across the swipe transition between the two pages.
 *
 * `sessionMode` is lifted here to unify the navigation:
 *   - On Start page: controls which writing mode hero is shown
 *   - On Library page: controls which content tab (notes/circles/checkins) is displayed
 *
 * The check-in urgent dot only shows when viewing the Start page (homescreen),
 * not when viewing the Library page.
 */
export const HomeScreen: React.FC<Props> = ({ navigation, route }) => {
    const scrollViewRef = useRef<ScrollView>(null);
    const [scrollEnabled, setScrollEnabled] = useState(true);

    /**
     * Shared session mode — drives both Start hero content and Library tab.
     * 'journal' = free writing / notes
     * 'circles' = relationship journal / circles tab
     * 'checkin' = alignment check-in / checkins tab
     */
    const [sessionMode, setSessionMode] = useState<'journal' | 'circles' | 'checkin' | 'vlog'>('journal');

    /**
     * Track which page is visible (0 = Start, 1 = Library).
     * Used to control check-in urgent dot visibility.
     */
    const [currentPage, setCurrentPage] = useState(0);

    const storage = useStorage();
    const security = useSecurity();

    /**
     * Initialize the AI Queue Manager on app startup.
     * This loads persisted queue, recovers orphaned jobs,
     * and auto-resumes processing. Only runs once.
     */
    const { initializeQueue } = useAiQueue({
        aiApiKey: storage.aiApiKey,
        aiBaseUrl: storage.aiBaseUrl,
        aiModel: storage.aiModel,
        aiPrompts: storage.aiPrompts,
        savedNotes: storage.savedNotes,
        updateNote: storage.updateNote,
    });

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
     * Used to conditionally show check-in urgent dot.
     */
    const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetX = e.nativeEvent.contentOffset.x;
        const page = Math.round(offsetX / width);
        setCurrentPage(page);
    }, []);

    /** Check-in urgency: show dot when overdue (>7 days since last reflection) AND only on homescreen */
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

    return (
        <View style={styles.container}>
            <ScrollView
                ref={scrollViewRef}
                horizontal
                pagingEnabled
                scrollEnabled={scrollEnabled}
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
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    scrollView: {
        flex: 1,
    },
    page: {
        width, // Force each child column to be exactly screen width
        height: '100%',
    },
});
