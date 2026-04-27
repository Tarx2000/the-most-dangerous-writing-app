/**
 * Video Compressor â€” Post-recording video optimization service.
 *
 * Uses `react-native-compressor` to transcode recorded vlogs into smaller
 * files while preserving visual quality. Supports:
 *
 * - 4 compression presets: Off, Light, Balanced, Max Savings
 * - Progress callbacks for UI feedback (0â†’1 float)
 * - Graceful fallback: if compression fails, the original file is kept
 * - Pending queue: interrupted compressions are persisted to AsyncStorage
 *   and retried on next app startup
 * - Expo Go compatibility: gracefully skips compression when native module
 *   isn't available (e.g. running in Expo Go instead of a dev build)
 *
 * Tech terms:
 * - Transcoding: Re-encoding a video with different quality/resolution settings
 * - Bitrate: Data rate (bits/second) â€” lower = smaller file, lower quality
 * - maxSize: Resolution cap â€” the compressor scales down to fit within this boundary
 */

import * as FileSystem from 'expo-file-system/legacy';
import { storage } from '@/lib/storage';
import { logger } from '@/lib/logger';
import { CONFIG } from '@/config';
import type { SavedVlog } from '@/types';

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * NATIVE MODULE AVAILABILITY CHECK
 *
 * react-native-compressor requires a dev build (native code).
 * In Expo Go, the native module isn't linked, so we detect this at import
 * time and gracefully fall back to "no compression" mode.
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

let VideoCompressor: unknown = null;
let isNativeModuleAvailable = false;

try {
    // Dynamic import — if the native module isn't linked (Expo Go),
    // this throws and we catch it, leaving VideoCompressor as null.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-compressor');
    VideoCompressor = mod.Video;
    isNativeModuleAvailable = true;
    logger("info", "Compressor", "Native module loaded successfully");
} catch (err) {
    console.warn('[Compressor] Native module not available (Expo Go mode) — compression will be skipped. Reason:', err instanceof Error ? err.message : String(err));
}

/**
 * Check if the native compressor module is available.
 * Returns false in Expo Go, true in dev builds / production.
 */
export function isCompressionAvailable(): boolean {
    return isNativeModuleAvailable;
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * TYPES
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/** A single compression preset configuration */
export interface CompressionPreset {
    id: string;
    label: string;
    desc: string;
    /** Maximum resolution boundary (0 = no compression) */
    maxSize: number;
    /** Target bitrate in bits per second */
    bitrate: number;
}

/** Result returned after compression attempt */
export interface CompressionResult {
    /** Path to the final video file (compressed or original) */
    outputUri: string;
    /** Size in bytes of the output file */
    outputSizeBytes: number;
    /** Size in bytes of the original uncompressed file */
    originalSizeBytes: number;
    /** Whether compression was actually applied */
    wasCompressed: boolean;
    /** Percentage saved (0-100) */
    savingsPercent: number;
}

/** Serializable record of a compression that needs to be retried */
export interface PendingCompression {
    /** The vlog ID that needs compression */
    vlogId: string;
    /** Path to the uncompressed video file */
    inputUri: string;
    /** Compression preset ID to apply */
    presetId: string;
    /** When the compression was first attempted */
    createdAt: number;
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * PRESET LOOKUP
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**
 * Find a compression preset by its ID string.
 * Falls back to 'balanced' if the ID is unknown.
 */
export function getPreset(presetId: string): CompressionPreset {
    const found = CONFIG.VLOG_COMPRESSION_PRESETS.find(p => p.id === presetId);
    // Default to 'balanced' if preset not found
    return found || CONFIG.VLOG_COMPRESSION_PRESETS[2];
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * CORE COMPRESSION
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**
 * Compress a video file using the specified preset.
 *
 * If preset is 'off', returns the original file unchanged.
 * If the native module isn't available (Expo Go), returns original unchanged.
 * If compression fails for any reason, falls back to the original file
 * (no data is lost).
 *
 * @param inputUri  - Absolute path to the raw video file
 * @param presetId  - ID of the compression preset ('off' | 'light' | 'balanced' | 'max')
 * @param onProgress - Optional callback for progress updates (0.0 â†’ 1.0)
 * @returns Compression result with output path and size stats
 */
export async function compressVideo(
    inputUri: string,
    presetId: string,
    onProgress?: (progress: number) => void,
): Promise<CompressionResult> {
    // Get original file size
    const originalInfo = await FileSystem.getInfoAsync(inputUri);
    const originalSizeBytes = ('size' in originalInfo ? (originalInfo as { size: number }).size : 0);

    const preset = getPreset(presetId);

    // Skip compression if preset is 'off', missing config, or native module unavailable
    if (preset.id === 'off' || preset.maxSize === 0 || !isNativeModuleAvailable) {
        if (!isNativeModuleAvailable && preset.id !== 'off') {
            logger("info", "Compressor", "Skipping compression — native module not available (Expo Go)");
        }
        onProgress?.(1);
        return {
            outputUri: inputUri,
            outputSizeBytes: originalSizeBytes,
            originalSizeBytes,
            wasCompressed: false,
            savingsPercent: 0,
        };
    }

    try {
        logger("info", "Compressor", `Starting compression: preset=${preset.id}, maxSize=${preset.maxSize}, bitrate=${preset.bitrate}`);

        const compressedUri = await VideoCompressor.compress(
            inputUri,
            {
                compressionMethod: 'manual',
                bitrate: preset.bitrate,
            },
            (progress: number) => {
                onProgress?.(progress);
            },
        );

        // Get compressed file size
        const compressedInfo = await FileSystem.getInfoAsync(compressedUri);
        const compressedSizeBytes = ('size' in compressedInfo ? (compressedInfo as { size: number }).size : 0);

        // If compression somehow made the file bigger, use the original
        if (compressedSizeBytes >= originalSizeBytes) {
            logger("warn", "Compressor", "Compressed file is larger than original — keeping original");
            // Clean up the compressed file
            try { await FileSystem.deleteAsync(compressedUri, { idempotent: true }); } catch (err) { logger("warn", "Compressor", "Failed to delete compressed file:", err); }
            onProgress?.(1);
            return {
                outputUri: inputUri,
                outputSizeBytes: originalSizeBytes,
                originalSizeBytes,
                wasCompressed: false,
                savingsPercent: 0,
            };
        }

        const savingsPercent = Math.round((1 - compressedSizeBytes / originalSizeBytes) * 100);
        const origMb = (originalSizeBytes / 1024 / 1024).toFixed(1);
        const compMb = (compressedSizeBytes / 1024 / 1024).toFixed(1);
        logger("info", "Compressor", `Done: ${origMb}MB → ${compMb}MB (${savingsPercent}% saved)`);

        // Replace the original file with the compressed version
        await FileSystem.deleteAsync(inputUri, { idempotent: true });
        await FileSystem.moveAsync({ from: compressedUri, to: inputUri });

        onProgress?.(1);
        return {
            outputUri: inputUri,
            outputSizeBytes: compressedSizeBytes,
            originalSizeBytes,
            wasCompressed: true,
            savingsPercent,
        };
    } catch (error) {
        logger("error", "Compressor", "Compression failed, keeping original:", error);
        onProgress?.(1);
        return {
            outputUri: inputUri,
            outputSizeBytes: originalSizeBytes,
            originalSizeBytes,
            wasCompressed: false,
            savingsPercent: 0,
        };
    }
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * PENDING COMPRESSION QUEUE
 *
 * When a compression is interrupted (app killed, crash, etc.), the vlog's
 * `compressionPending` flag stays true and the job is stored in AsyncStorage.
 * On next app launch, `processPendingCompressions()` picks up where it left off.
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**
 * Add a vlog to the pending compression queue.
 * Called right before starting compression so we can retry if interrupted.
 */
export async function addToPendingQueue(entry: PendingCompression): Promise<void> {
    try {
        const raw = await storage.getItem(CONFIG.PENDING_COMPRESSION_KEY);
        const queue: PendingCompression[] = raw ? JSON.parse(raw) : [];
        // Avoid duplicates
        const filtered = queue.filter(p => p.vlogId !== entry.vlogId);
        filtered.push(entry);
        await storage.setItem(CONFIG.PENDING_COMPRESSION_KEY, JSON.stringify(filtered));
    } catch (error) {
        logger("error", "Compressor", "Failed to add to pending queue:", error);
    }
}

/**
 * Remove a vlog from the pending compression queue.
 * Called after successful compression or if the vlog was deleted.
 */
export async function removeFromPendingQueue(vlogId: string): Promise<void> {
    try {
        const raw = await storage.getItem(CONFIG.PENDING_COMPRESSION_KEY);
        if (!raw) return;
        const queue: PendingCompression[] = JSON.parse(raw);
        const filtered = queue.filter(p => p.vlogId !== vlogId);
        await storage.setItem(CONFIG.PENDING_COMPRESSION_KEY, JSON.stringify(filtered));
    } catch (error) {
        logger("error", "Compressor", "Failed to remove from pending queue:", error);
    }
}

/**
 * Process any pending compressions from previous interrupted sessions.
 *
 * Called on app startup. For each pending item:
 * 1. Check if the vlog file still exists
 * 2. Compress it with the original preset
 * 3. Update the vlog metadata (file size, flags) via the provided callback
 * 4. Remove from the pending queue
 *
 * In Expo Go, this still runs but compressVideo() will skip the native part
 * and just mark pending items as complete with their original file sizes.
 *
 * @param updateVlog - Callback to update the vlog metadata after compression
 */
export async function processPendingCompressions(
    updateVlog: (id: string, patch: Partial<SavedVlog>) => Promise<void>,
): Promise<number> {
    let processed = 0;

    try {
        const raw = await storage.getItem(CONFIG.PENDING_COMPRESSION_KEY);
        if (!raw) return 0;

        const queue: PendingCompression[] = JSON.parse(raw);
        if (queue.length === 0) return 0;

        logger("info", "Compressor", `Found ${queue.length} pending compression(s), processing...`);

        for (const entry of queue) {
            try {
                // Check if the file still exists
                const fileInfo = await FileSystem.getInfoAsync(entry.inputUri);
                if (!fileInfo.exists) {
                    logger("info", "Compressor", `Pending file missing, removing from queue: ${entry.vlogId}`);
                    await removeFromPendingQueue(entry.vlogId);
                    continue;
                }

                // Compress the video
                const result = await compressVideo(entry.inputUri, entry.presetId);

                // Update vlog metadata
                await updateVlog(entry.vlogId, {
                    fileSizeBytes: result.outputSizeBytes,
                    originalFileSizeBytes: result.originalSizeBytes,
                    compressionPreset: entry.presetId,
                    compressionPending: false,
                });

                // Remove from pending queue
                await removeFromPendingQueue(entry.vlogId);
                processed++;

                logger("info", "Compressor", `Pending compression completed: ${entry.vlogId} (${result.savingsPercent}% saved)`);
            } catch (error) {
                logger("error", "Compressor", `Failed to process pending compression for ${entry.vlogId}:`, error);
            }
        }
    } catch (error) {
        logger("error", "Compressor", "Failed to process pending queue:", error);
    }

    return processed;
}

