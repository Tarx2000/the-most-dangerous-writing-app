import React, { useState, useEffect } from 'react';
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
import { useVlogs } from '@/lib/hooks/useStorage';
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
 * - Shows thumbnail still when paused
 * - Duration badge overlay on bottom-right
 * - Play/pause toggle on tap
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
    const accentColor = '#FF6B35'; // Orange for video clips

    const flashOpacity = useSharedValue(0);
    const [flashIcon, setFlashIcon] = useState<'play' | 'pause'>('play');
    const videoRef = React.useRef<View>(null);

    const handleTogglePlay = React.useCallback(() => {
        const nextState = !isPlaying;
        setIsPlaying(nextState);
        setFlashIcon(nextState ? 'play' : 'pause');
        flashOpacity.value = withSequence(
            withTiming(0.8, { duration: 50 }),
            withTiming(0, { duration: 600 })
        );
        Vibration.vibrate(10);
    }, [isPlaying, flashOpacity]);

    /** Create video player (muted by default) */
    const player = useVideoPlayer(vlog.filePath, (p) => {
        p.loop = true;
        p.volume = 0; // Starts muted
        if (autoPlay) p.play();
    });

    const handleExpandMedia = React.useCallback(() => {
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

    /** Sync playing state and volume with player */
    useEffect(() => {
        if (isPlaying) {
            player.play();
        } else {
            player.pause();
        }
    }, [isPlaying, player]);

    /** Robust resume: Monitor player status to prevent freezes after modal close */
    useEffect(() => {
        const subscription = player.addListener('playingChange', (event) => {
            if (isPlaying && !event.isPlaying) {
                // If it should be playing but stopped (e.g. modal closed), force resume
                player.play();
            }
        });
        return () => subscription.remove();
    }, [isPlaying, player]);

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

                {/* Video Player Area — View container with layered touch targets */}
                <View ref={videoRef} collapsable={false} style={[styles.videoContainer, { position: 'relative' }]}>
                    {/* Background tap-to-open layer (lowest z, catches taps that miss the mute button) */}
                    <Pressable
                        style={[StyleSheet.absoluteFillObject, { zIndex: 0 }]}
                        onPress={handleTogglePlay}
                    />

                    {/* Flashing Play/Pause Icon Overlay */}
                    <Animated.View style={[
                        styles.flashIconContainer,
                        useAnimatedStyle(() => ({ opacity: flashOpacity.value })),
                        { pointerEvents: 'none', zIndex: 10 }
                    ]}>
                        <View style={styles.flashIconBg}>
                            <MaterialCommunityIcons name={flashIcon} size={48} color="#FFF" />
                        </View>
                    </Animated.View>

                    {/* Thumbnail fallback when paused and thumbnail exists */}
                    {!isPlaying && vlog.thumbnailPath ? (
                        <View pointerEvents="none"><Image source={{ uri: vlog.thumbnailPath }} style={styles.thumbnail} /></View>
                    ) : (
                        <VideoView
                            style={[styles.videoPlayer, { pointerEvents: 'none' } as any]}
                            player={player}
                            nativeControls={false}
                        />
                    )}

                    {/* Mute/Unmute Toggle Top-Right Overlay (highest z, intercepts taps first) */}
                    <Pressable
                        style={[styles.muteToggleArea, { zIndex: 20, position: 'absolute', top: 5, right: 5 }]}
                        onPress={() => {
                            setIsMuted(!isMuted);
                            Vibration.vibrate(10);
                        }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <View style={styles.muteToggleButton}>
                            <MaterialCommunityIcons name={isMuted ? "volume-off" : "volume-high"} size={16} color="#FFF" />
                        </View>
                    </Pressable>

                    {/* Duration badge */}
                    <View style={[styles.durationBadge, { pointerEvents: 'none' }]}>
                        <Text style={styles.durationText}>{formatDuration(vlog.durationSec)}</Text>
                    </View>
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
        borderBottomColor: 'rgba(255, 255, 255, 0.06)',
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
        backgroundColor: 'rgba(255, 107, 53, 0.1)',
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
        borderColor: 'rgba(255, 255, 255, 0.1)',
        aspectRatio: 9 / 16,
        backgroundColor: '#111',
        marginBottom: 8,
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
        backgroundColor: 'rgba(0,0,0,0.4)',
        padding: 16,
        borderRadius: 40,
    },

    /* ── Overlays ───────────────────────────────────────────────────── */
    muteToggleArea: {
        position: 'absolute',
        top: 8,
        right: 8,
        padding: 4,
    },
    muteToggleButton: {
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
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
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    durationText: {
        color: '#FFF',
        fontSize: 11,
        fontWeight: '700',
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
