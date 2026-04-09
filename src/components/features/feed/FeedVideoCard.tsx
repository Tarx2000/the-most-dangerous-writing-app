import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    Image,
    StyleSheet,
    Vibration,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '@/styles/theme';
import { useStorage } from '@/lib/hooks/useStorage';
import { useThumbnails } from '@/lib/hooks/useThumbnails';
import type { SavedVlog } from '@/types';
import type { FeedItem } from './FeedCard';

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
    onOpenVlog: (vlog: SavedVlog) => void;
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

/**
 * Format timestamp to relative time (sharing helper with FeedCard)
 */
const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    const weeks = Math.floor(diff / 604800000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    if (weeks < 4) return `${weeks}w ago`;
    return new Date(timestamp).toLocaleDateString('default', { month: 'short', day: 'numeric' });
};

export const FeedVideoCard: React.FC<FeedVideoCardProps> = ({
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

    /** Create video player (muted by default) */
    const player = useVideoPlayer(vlog.filePath, (p) => {
        p.loop = true;
        p.volume = 0; // Starts muted
        if (autoPlay) p.play();
    });

    const { updateVlog } = useStorage();
    const { getThumbnail } = useThumbnails(updateVlog);

    /** Sync playing state and volume with player */
    useEffect(() => {
        if (isPlaying) {
            player.play();
        } else {
            player.pause();
        }
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

                {/* Video Player Area */}
                <View style={[styles.videoContainer, { position: 'relative' }]}>
                    {/* Background tap-to-open interceptor */}
                    <Pressable style={[StyleSheet.absoluteFillObject, { zIndex: 1 }]} onPress={() => onOpenVlog(vlog)} />
                    {/* Thumbnail fallback when paused and thumbnail exists */}
                    {!isPlaying && vlog.thumbnailPath ? (
                        <Image source={{ uri: vlog.thumbnailPath }} style={styles.thumbnail} />
                    ) : (
                        <VideoView
                            style={styles.videoPlayer}
                            player={player}
                            nativeControls={false}
                        />
                    )}

                    {/* Mute/Unmute Toggle Top-Right Overlay */}
                    <AnimatedScaleButton
                        style={[styles.muteToggleArea, { zIndex: 10, position: 'absolute', top: 5, right: 5 }]}
                        onPress={() => {
                            setIsMuted(!isMuted);
                            Vibration.vibrate(10);
                        }}
                    >
                        <View style={styles.muteToggleButton}>
                            <MaterialCommunityIcons name={isMuted ? "volume-off" : "volume-high"} size={16} color="#FFF" />
                        </View>
                    </AnimatedScaleButton>

                    {/* Duration badge */}
                    <View style={styles.durationBadge}>
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
                            onPress={() => {
                                onOpenVlog(vlog);
                                Vibration.vibrate(10);
                            }}
                            style={[styles.actionBtn, { zIndex: 10 }]}
                        >
                            <MaterialCommunityIcons name="arrow-expand" size={16} color={theme.colors.textMuted} />
                        </AnimatedScaleButton>
                    </View>
                </View>
            </View>
        </View>
    );
};

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
