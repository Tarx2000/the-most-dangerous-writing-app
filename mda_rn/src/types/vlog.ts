/**
 * SavedVlog — Represents a recorded video journal entry.
 *
 * The actual video file is stored in the app's private `documentDirectory/vlogs/`
 * directory (invisible to the device gallery). This metadata object is persisted
 * in AsyncStorage for quick listing, calendar display, and playback reference.
 */
export interface SavedVlog {
    id: string;
    /** Absolute path to the video file in the app's private documentDirectory */
    filePath: string;
    /** Human-readable date string for display (e.g. "Mar 31, 2026 01:30 AM") */
    dateStr: string;
    /** Unix timestamp for sorting and calendar day mapping */
    timestamp: number;
    /** Recording duration in seconds */
    durationSec: number;
    /** File size in bytes (for storage usage tracking) */
    fileSizeBytes: number;
    /** Cached thumbnail image path (generated on first view via expo-video-thumbnails) */
    thumbnailPath?: string;
    /** Which compression preset was applied ('off' | 'light' | 'balanced' | 'max') */
    compressionPreset?: string;
    /** Original uncompressed file size in bytes (for comparison display) */
    originalFileSizeBytes?: number;
    /** Whether compression is still pending (interrupted before completion) */
    compressionPending?: boolean;
}
