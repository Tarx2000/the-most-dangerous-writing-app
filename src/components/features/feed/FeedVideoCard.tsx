import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    Image,
    StyleSheet,
    Vibration,
    Pressable,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '@/styles/theme';
import { useVlogs, usePreferences } from '@/lib/hooks/useStorage';
import { formatRelativeTime } from '@/lib/utils';
import { useThumbnails } from '@/lib/hooks/useThumbnails';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming } from 'react-native-reanimated';
import type { SavedVlog } from '@/types';
import type { FeedItem } from './FeedCard';
import type { LayoutRect } from '../library/VlogViewerModal';

/* ── CONFIGURABLE ─────────────────────────────────────────────────────────── */

/** Default behavior: auto-play videos muted as user scrolls to them */
const DEFAULT_AUTO_PLAY = true;

/* ── COMPONENT ────────────────────────────────────────────────────────────── */

/**
 * FeedVideoCard — Renders a video clip entry in the feed.
 *
 * Design:
 * - Orange gradient accent border (matches "clip" feed type)
 * - Auto-plays muted when visible (configurable via settings)
 * - Tap anywhere on video to toggle mute/unmute
 * - Shows thumbnail still when paused
 * - Duration badge overlay on bottom-right
 *
 * The auto-play behavior can be toggled in Settings via the
 * autoPlayFeedVideos storage field.
 *
 * Uses expo-video's useVideoPlayer for native performance.
 */
interface FeedVideoCardProps {
    item: FeedItem;
    /** Whether this entry is bookmarked */
    isBookmarked: boolean;
    /** Existing comment on this entry */
    comment?: string;
    /** Whether auto-play is enabled (from settings) */
    autoPlay: boolean;
    /** Toggle bookmark callback */
    onToggleBookmark: (id: string) => void;
    /** Save comment callback */
    onSaveComment: (id: string, comment: string) => void;
    /** Open full-screen vlog player */
    onOpenVlog: (vlog: SavedVlog, rect?: LayoutRect, player?: any) => void;
}

/**
 * Format seconds into human-readable duration string.
 * e.g., 65 → "1:05", 3661 → "1:01:01"
 */
const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};


export const FeedVideoCard: React.FC<FeedVideoCardProps> = React.memo(({
    item,
    isBookmarked,
    comment,
    autoPlay,
    onToggleBookmark,
    onSaveComment,
    onOpenVlog,
}) => {
    const vlog = item.vlog;
    if (!vlog) return null;

    const [isPlaying, setIsPlaying] = useState(autoPlay);
    const [isMuted, setIsMuted] = useState(true);
    const accentColor = theme.colors.orange; // Orange for video clips
    const { devMode } = usePreferences();

    const flashOpacity = useSharedValue(0);
    const [flashIcon, setFlashIcon] = useState<'volume-off' | 'volume-high'>('volume-off');
    const videoRef = React.useRef<View>(null);

    /**
     * Tracks whether the user manually paused (vs viewport-driven pause).
     * - When the user taps pause: userPaused = true → prevents force-resume
     * - When autoPlay changes (viewport change): userPaused resets → auto-play resumes
     * - When the user taps play: userPaused = false → allows force-resume again
     */
    const userPausedRef = useRef(false);

    /** Create video player (muted by default) */
    const player = useVideoPlayer(vlog.filePath, (p) => {
        p.loop = true;
        p.volume = 0; // Starts muted
        if (autoPlay) p.play();
    });

    /** Viewport-driven playback control.
     *  When autoPlay changes (feed hidden/shown or video scrolled in/out),
     *  reset any manual pause override and directly control the player.
     *  This is the source of truth — autoPlay always wins over manual state. */
    useEffect(() => {
        userPausedRef.current = false;
        try {
            if (autoPlay) {
                player.play();
            } else {
                player.pause();
            }
        } catch (_) { /* native object may already be released */ }
        setIsPlaying(autoPlay);
    }, [autoPlay, player]);

    /** Pause the player on unmount to prevent background decoding.
     *  Guard against "shared object already released" errors that occur
     *  when the native VideoPlayer has been deallocated before this cleanup runs. */
    useEffect(() => {
        return () => {
            try { player.pause(); } catch (_) { /* native object may already be released */ }
        };
    }, [player]);

    /** Tap anywhere on video to toggle mute.
     *  Play/pause is fully viewport-driven (autoPlay prop) — no manual toggle needed.
     *  The flash icon shows the new mute state for visual feedback. */
    const handleToggleMute = useCallback(() => {
        const nextMuted = !isMuted;
        setIsMuted(nextMuted);
        setFlashIcon(nextMuted ? 'volume-off' : 'volume-high');
        flashOpacity.value = withSequence(
            withTiming(0.8, { duration: 50 }),
            withTiming(0, { duration: 600 })
        );
        Vibration.vibrate(10);
    }, [isMuted, flashOpacity]);

    const handleExpandMedia = useCallback(() => {
        if (videoRef.current) {
            videoRef.current.measureInWindow((x, y, w, h) => {
                onOpenVlog(vlog, { x, y, width: w, height: h }, player);
            });
        } else {
            onOpenVlog(vlog, undefined, player);
        }
        Vibration.vibrate(10);
    }, [vlog, onOpenVlog, player]);

    const { updateVlog } = useVlogs();
    const { getThumbnail } = useThumbnails(updateVlog);

    /** Robust resume: prevent freezes after modal close.
     *  Only force-resumes when: auto-play is active (in viewport + feed visible),
     *  the user hasn't manually paused, and the player stopped unexpectedly.
     *  This handles cases like the vlog modal closing or system pauses. */
    useEffect(() => {
        const subscription = player.addListener('playingChange', (event) => {
            if (autoPlay && !userPausedRef.current && !event.isPlaying) {
                try { player.play(); } catch (_) { /* native object may already be released */ }
            }
        });
        return () => subscription.remove();
    }, [autoPlay, player]);

    useEffect(() => {
        player.volume = isMuted ? 0 : 1;
    }, [isMuted, player]);

    /** Extract thumbnail if we don't have one */
    useEffect(() => {
        if (!vlog.thumbnailPath && !isPlaying) {
            getThumbnail(vlog);
        }
    }, [vlog.thumbnailPath, isPlaying, getThumbnail, vlog]);

    return (
        <View style={styles.card}>
            <View style={styles.leftColumn}>
                <View style={[styles.avatar, { borderColor: accentColor }]}>
                    <MaterialCommunityIcons name="video" size={16} color={accentColor} />
                </View>
            </View>

            <View style={styles.rightColumn}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={[styles.categoryBadge, { color: accentColor }]}>VIDEO CLIP</Text>
                    <Text style={styles.timeAgo}>{formatRelativeTime(item.timestamp)}</Text>
                </View>

                {/* Video Player Area */}
                <View ref={videoRef} collapsable={false} style={styles.videoContainer}>
                    {/* Video / Thumbnail layer — renders below the Pressable */}
                    {!isPlaying && vlog.thumbnailPath ? (
                        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
                            <Image source={{ uri: vlog.thumbnailPath }} style={styles.thumbnail} />
                        </View>
                    ) : (
                        <VideoView
                            style={[styles.videoPlayer, { position: 'absolute' as const, pointerEvents: 'none' as const }]}
                            player={player}
                            nativeControls={false}
                        />
                    )}

                    {/* Full-area tap target for mute/unmute — on top of video with zIndex */}
                    <Pressable
                        style={[StyleSheet.absoluteFillObject, { zIndex: 5 }]}
                        onPress={handleToggleMute}
                    />

                    {/* Flashing Mute/Unmute Icon Overlay — visual feedback on tap */}
                    <Animated.View style={[
                        styles.flashIconContainer,
                        useAnimatedStyle(() => ({ opacity: flashOpacity.value })),
                        { pointerEvents: 'none', zIndex: 10 }
                    ]}>
                        <View style={styles.flashIconBg}>
                            <MaterialCommunityIcons name={flashIcon} size={48} color={theme.colors.textPrimary} />
                        </View>
                    </Animated.View>

                    {/* Mute indicator — visual only */}
                    <View style={styles.muteIndicator} pointerEvents="none">
                        <View style={styles.muteIndicatorBg}>
                            <MaterialCommunityIcons name={isMuted ? "volume-off" : "volume-high"} size={16} color={theme.colors.textPrimary} />
                        </View>
                    </View>

                    {/* Duration badge */}
                    <View style={styles.durationBadge} pointerEvents="none">
                        <Text style={styles.durationText}>{formatDuration(vlog.durationSec)}</Text>
                    </View>

                    {/* Dev watermark overlay */}
                    {devMode && (
                        <View style={styles.devWatermark} pointerEvents="none">
                            <Text style={styles.devWatermarkText}>
                                DEV: {vlog.compressionPreset || 'Uncompressed'}{' '}
                                {vlog.originalFileSizeBytes ? 
                                    `(${Math.round(100 - (vlog.fileSizeBytes / vlog.originalFileSizeBytes) * 100)}% saved)`
                                    : ''
                                }
                            </Text>
                        </View>
                    )}
                </View>

                {/* Footer — actions */}
                <View style={styles.footer}>
                    <Text style={styles.metaText}>
                        {(vlog.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB
                    </Text>
                    <View style={styles.actionRow}>
                        <AnimatedScaleButton
                            onPress={() => {
                                onToggleBookmark(vlog.id);
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
                            onPress={handleExpandMedia}
                            style={[styles.actionBtn, { zIndex: 10 }]}
                        >
                            <MaterialCommunityIcons name="arrow-expand" size={16} color={theme.colors.textMuted} />
                        </AnimatedScaleButton>
                    </View>
                </View>
            </View>
        </View>
    );
});

/* ── STYLES ───────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.glassBorderSubtle,
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
        marginBottom: 12,
    },
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: theme.colors.videoAccentTint,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
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

    /* ── Video area ─────────────────────────────────────────────────── */
    videoContainer: {
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        aspectRatio: 9 / 16,
        backgroundColor: theme.colors.surfaceMedium,
        marginBottom: 8,
        position: 'relative',
    },
    videoPlayer: {
        width: '100%',
        height: '100%',
    },
    thumbnail: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    flashIconContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    flashIconBg: {
        backgroundColor: theme.colors.videoFlashBackground,
        padding: 16,
        borderRadius: 40,
    },

    /* ── Overlays ───────────────────────────────────────────────────── */
    muteIndicator: {
        position: 'absolute',
        top: 8,
        right: 8,
        pointerEvents: 'none',
    },
    muteIndicatorBg: {
        backgroundColor: theme.colors.overlayVideoMuted,
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 6,
        justifyContent: 'center',
        alignItems: 'center',
    },
    durationBadge: {
        position: 'absolute',
        bottom: 8,
        right: 8,
        backgroundColor: theme.colors.overlayVideoStrong,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    durationText: {
        color: theme.colors.textPrimary,
        fontSize: 11,
        fontWeight: '700',
    },
    devWatermark: {
        position: 'absolute',
        top: 8,
        left: 8,
        backgroundColor: theme.colors.dangerOverlayStrong,
        padding: 4,
        borderRadius: 4,
        zIndex: 10,
    },
    devWatermarkText: {
        color: theme.colors.textPrimary,
        fontSize: 10,
        fontWeight: 'bold',
    },

    /* ── Footer ─────────────────────────────────────────────────────── */
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 6,
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
