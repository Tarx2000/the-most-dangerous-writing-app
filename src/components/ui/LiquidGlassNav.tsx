import React, { useRef, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Dimensions,
    Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '@/styles/theme';

/**
 * CONFIGURABLE: The width of the pill relative to the screen.
 * 0.88 = 88% of screen width for a floating look.
 */
const PILL_WIDTH_RATIO = 0.88;

/**
 * LiquidGlassNav — Premium floating pill navigation bar.
 *
 * Inspired by TIDE app's liquid glass bottom nav:
 * - Frosted glass / translucent pill shape
 * - Floating above content with subtle shadow
 * - Smooth animated indicator that slides between tabs
 * - Minimalistic icons with labels
 *
 * This component lives at the HomeScreen level so it persists
 * across the horizontal scroll between Start and Library.
 */
interface NavItem {
    id: string;
    icon: string;
    label: string;
    /** Optional badge (e.g. urgent dot for check-in) */
    urgent?: boolean;
}

interface Props {
    items: NavItem[];
    activeId: string;
    onSelect: (id: string) => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PILL_WIDTH = SCREEN_WIDTH * PILL_WIDTH_RATIO;

export const LiquidGlassNav: React.FC<Props> = ({ items, activeId, onSelect }) => {
    const activeIndex = items.findIndex(i => i.id === activeId);
    const tabWidth = PILL_WIDTH / items.length;

    /** Animated position for the sliding indicator */
    const indicatorX = useRef(new Animated.Value(activeIndex * tabWidth)).current;

    useEffect(() => {
        Animated.spring(indicatorX, {
            toValue: activeIndex * tabWidth,
            useNativeDriver: true,
            damping: 20,
            stiffness: 200,
            mass: 0.6,
        }).start();
    }, [activeIndex, tabWidth]);

    return (
        <View style={styles.wrapper}>
            <View style={styles.pill}>
                {/* Frosted glass background via BlurView */}
                <BlurView
                    intensity={40}
                    tint="dark"
                    style={StyleSheet.absoluteFillObject}
                />

                {/* Extra dark tint overlay for AMOLED contrast */}
                <View style={styles.tintOverlay} />

                {/* Sliding active indicator */}
                <Animated.View
                    style={[
                        styles.indicator,
                        {
                            width: tabWidth - 16,
                            transform: [{ translateX: Animated.add(indicatorX, 8) }],
                        },
                    ]}
                />

                {/* Tab items */}
                <View style={styles.tabRow}>
                    {items.map((item) => {
                        const isActive = item.id === activeId;
                        return (
                            <TouchableOpacity
                                key={item.id}
                                style={[styles.tab, { width: tabWidth }]}
                                onPress={() => onSelect(item.id)}
                                activeOpacity={0.7}
                            >
                                <View style={styles.iconContainer}>
                                    {item.urgent && (
                                        <View style={styles.urgentDot} />
                                    )}
                                    <MaterialCommunityIcons
                                        name={item.icon as any}
                                        size={22}
                                        color={isActive ? '#FFF' : 'rgba(255,255,255,0.4)'}
                                    />
                                </View>
                                <Text style={[
                                    styles.label,
                                    isActive && styles.labelActive,
                                ]}>
                                    {item.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    /** Positioned at the bottom of the screen */
    wrapper: {
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 30 : 16,
        width: '100%',
        alignItems: 'center',
        zIndex: 999,
    },

    /** The glass pill container */
    pill: {
        width: PILL_WIDTH,
        height: 64,
        borderRadius: 32,
        overflow: 'hidden',
        // Liquid glass border
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
        // Glow shadow
        shadowColor: 'rgba(0, 0, 0, 0.8)',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.6,
        shadowRadius: 20,
        elevation: 20,
    },

    /** Semi-transparent dark overlay on top of blur */
    tintOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15, 15, 15, 0.65)',
    },

    /** The sliding highlight behind the active tab */
    indicator: {
        position: 'absolute',
        top: 6,
        height: 52,
        borderRadius: 26,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.06)',
    },

    /** Row of tab buttons */
    tabRow: {
        flexDirection: 'row',
        flex: 1,
        zIndex: 2,
    },

    /** Individual tab */
    tab: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
    },

    /** Icon wrapper for badge positioning */
    iconContainer: {
        position: 'relative',
    },

    /** Urgent notification dot */
    urgentDot: {
        position: 'absolute',
        top: -2,
        right: -4,
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: '#FFD700',
        zIndex: 3,
    },

    /** Tab label text */
    label: {
        fontSize: 11,
        fontWeight: '600',
        color: 'rgba(255, 255, 255, 0.35)',
        letterSpacing: 0.2,
    },
    labelActive: {
        color: '#FFF',
        fontWeight: '700',
    },
});
