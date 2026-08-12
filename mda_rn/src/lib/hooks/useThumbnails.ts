import { useCallback, useRef } from 'react';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as FileSystem from 'expo-file-system/legacy';
import type { SavedVlog } from '@/types';

/* ── CONFIGURABLE ─────────────────────────────────────────────────────────── */

/** Directory name for cached thumbnail images */
const THUMBNAILS_DIR = 'vlog_thumbnails';

/**
 * Time position (ms) to extract the thumbnail from.
 * 1000ms (1 second) usually gives a good representative frame
 * since the first frame is often black.
 */
const THUMBNAIL_TIME_MS = 1000;

/** Image quality for thumbnail JPEG (0-1) */
const THUMBNAIL_QUALITY = 0.7;

/* ── HOOK ─────────────────────────────────────────────────────────────────── */

/**
 * useThumbnails — Lazy thumbnail extraction and caching for video journal entries.
 *
 * How it works:
 * 1. When a vlog needs a thumbnail, check if one exists on disk
 * 2. If not, extract a frame using expo-video-thumbnails
 * 3. Cache the extracted image on disk for future use
 * 4. Update the SavedVlog metadata with the thumbnail path
 *
 * Thumbnails are stored in documentDirectory/vlog_thumbnails/ as JPEGs.
 * Once extracted, the path is persisted on the vlog object so subsequent
 * renders skip the extraction step entirely.
 *
 * @param updateVlog - callback to persist the thumbnailPath on the SavedVlog
 */
export function useThumbnails(updateVlog?: (id: string, patch: Partial<SavedVlog>) => Promise<void>) {
    /** Track in-flight extractions to prevent duplicate work */
    const inFlightRef = useRef<Set<string>>(new Set());

    /** Ensure the thumbnails directory exists */
    const ensureDir = useCallback(async () => {
        const dir = `${FileSystem.documentDirectory}${THUMBNAILS_DIR}`;
        const info = await FileSystem.getInfoAsync(dir);
        if (!info.exists) {
            await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        }
        return dir;
    }, []);

    /**
     * Get or create a thumbnail for a video.
     *
     * Returns the thumbnail URI immediately if cached,
     * or triggers async extraction and returns null.
     * The caller should re-render when the vlog.thumbnailPath updates.
     */
    const getThumbnail = useCallback(
        async (vlog: SavedVlog): Promise<string | null> => {
            // Already cached — return immediately
            if (vlog.thumbnailPath) {
                const exists = await FileSystem.getInfoAsync(vlog.thumbnailPath);
                if (exists.exists) return vlog.thumbnailPath;
            }

            // Already being extracted — don't duplicate
            if (inFlightRef.current.has(vlog.id)) return null;

            // Check if video file exists
            const videoExists = await FileSystem.getInfoAsync(vlog.filePath);
            if (!videoExists.exists) return null;

            try {
                inFlightRef.current.add(vlog.id);
                const dir = await ensureDir();
                const thumbnailPath = `${dir}/${vlog.id}.jpg`;

                // Extract frame from video
                const { uri } = await VideoThumbnails.getThumbnailAsync(vlog.filePath, {
                    time: THUMBNAIL_TIME_MS,
                    quality: THUMBNAIL_QUALITY,
                });

                // Move to persistent cache location
                await FileSystem.moveAsync({
                    from: uri,
                    to: thumbnailPath,
                });

                // Persist on the vlog metadata
                if (updateVlog) {
                    await updateVlog(vlog.id, { thumbnailPath });
                }

                return thumbnailPath;
            } catch (e) {
                console.warn(`Thumbnail extraction failed for vlog ${vlog.id}:`, e);
                return null;
            } finally {
                inFlightRef.current.delete(vlog.id);
            }
        },
        [ensureDir, updateVlog],
    );

    /**
     * Batch extract thumbnails for all vlogs missing them.
     * Useful for retroactive generation after an app update.
     */
    const extractAllMissing = useCallback(
        async (vlogs: SavedVlog[]) => {
            const missing = vlogs.filter((v) => !v.thumbnailPath);
            for (const vlog of missing) {
                await getThumbnail(vlog);
            }
        },
        [getThumbnail],
    );

    return {
        /** Get or create a thumbnail for a single vlog */
        getThumbnail,
        /** Batch extract thumbnails for all vlogs without one */
        extractAllMissing,
    };
}
