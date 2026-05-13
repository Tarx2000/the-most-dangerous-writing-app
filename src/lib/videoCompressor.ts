/**
 * Video Compressor — Post-recording video optimization service.
 *
 * Uses `react-native-compressor` to transcode recorded vlogs into smaller
 * files while preserving visual quality.
 *
 * This low-level module only exports the `compressVideo()` function.
 * All queue management (pending jobs, retries, progress, lifecycle) is
 * handled by `src/lib/compressionQueue.ts` — screens should NEVER call
 * `compressVideo()` directly outside of the queue.  Instead they use
 * `useCompressionQueueContext().enqueueVlog(...)`.
 *
 * Tech terms:
 * - Transcoding: Re-encoding a video with different quality/resolution settings
 * - Bitrate: Data rate (bits/second) — lower = smaller file, lower quality
 * - maxSize: Resolution cap — the compressor scales down to fit within this boundary
 */

import * as FileSystem from 'expo-file-system/legacy';
import { logger } from '@/lib/logger';
import { CONFIG } from '@/config';
import { generateId } from '@/lib/utils';

/* ────────────────────────────────────────────────────────────────────────────
 * NATIVE MODULE AVAILABILITY CHECK
 *
 * react-native-compressor requires a dev build (native code).
 * In Expo Go, the native module isn't linked, so we detect this at import
 * time and gracefully fall back to "no compression" mode.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Type for the react-native-compressor Video module */
interface VideoCompressorModule {
    compress: (
        uri: string,
        options: Record<string, unknown>,
        onProgress: (progress: number) => void,
    ) => Promise<string>;
}

let VideoCompressor: VideoCompressorModule | null = null;
let isNativeModuleAvailable = false;

try {
    // Dynamic import — if the native module isn't linked (Expo Go),
    // this throws and we catch it, leaving VideoCompressor as null.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-compressor') as { Video: VideoCompressorModule };
    VideoCompressor = mod.Video;
    isNativeModuleAvailable = true;
    logger('info', 'Compressor', 'Native module loaded successfully');
} catch (err) {
    console.warn(
        '[Compressor] Native module not available (Expo Go mode) — compression will be skipped. Reason:',
        err instanceof Error ? err.message : String(err),
    );
}

/**
 * Check if the native compressor module is available.
 * Returns false in Expo Go, true in dev builds / production.
 */
export function isCompressionAvailable(): boolean {
    return isNativeModuleAvailable;
}

/* ────────────────────────────────────────────────────────────────────────────
 * TYPES
 * ──────────────────────────────────────────────────────────────────────────── */

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

/* ────────────────────────────────────────────────────────────────────────────
 * PRESET LOOKUP
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Find a compression preset by its ID string.
 * Falls back to 'balanced' if the ID is unknown.
 */
export function getPreset(presetId: string): CompressionPreset {
    const found = CONFIG.VLOG_COMPRESSION_PRESETS.find((p) => p.id === presetId);
    // Default to 'balanced' if preset not found
    return found || CONFIG.VLOG_COMPRESSION_PRESETS[2];
}

/* ────────────────────────────────────────────────────────────────────────────
 * CORE COMPRESSION
 * ──────────────────────────────────────────────────────────────────────────── */

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
 * @param onProgress - Optional callback for progress updates (0.0 → 1.0)
 * @returns Compression result with output path and size stats
 */
export async function compressVideo(
    inputUri: string,
    presetId: string,
    onProgress?: (progress: number) => void,
): Promise<CompressionResult> {
    // Get original file size
    const originalInfo = await FileSystem.getInfoAsync(inputUri);
    const originalSizeBytes = 'size' in originalInfo ? (originalInfo as { size: number }).size : 0;

    const preset = getPreset(presetId);

    // Skip compression if preset is 'off', missing config, or native module unavailable
    if (preset.id === 'off' || preset.maxSize === 0 || !isNativeModuleAvailable) {
        if (!isNativeModuleAvailable && preset.id !== 'off') {
            logger('info', 'Compressor', 'Skipping compression — native module not available (Expo Go)');
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
        logger(
            'info',
            'Compressor',
            `Starting compression: preset=${preset.id}, maxSize=${preset.maxSize}, bitrate=${preset.bitrate}`,
        );

        // isNativeModuleAvailable being true guarantees VideoCompressor is set
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const compressedUri = await VideoCompressor!.compress(
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
        const compressedSizeBytes = 'size' in compressedInfo ? (compressedInfo as { size: number }).size : 0;

        // If compression somehow made the file bigger, use the original
        if (compressedSizeBytes >= originalSizeBytes) {
            logger('warn', 'Compressor', 'Compressed file is larger than original — keeping original');
            // Clean up the compressed file
            try {
                await FileSystem.deleteAsync(compressedUri, { idempotent: true });
            } catch (err) {
                logger('warn', 'Compressor', 'Failed to delete compressed file:', err);
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

        const savingsPercent = Math.round((1 - compressedSizeBytes / originalSizeBytes) * 100);
        const origMb = (originalSizeBytes / 1024 / 1024).toFixed(1);
        const compMb = (compressedSizeBytes / 1024 / 1024).toFixed(1);
        logger('info', 'Compressor', `Done: ${origMb}MB → ${compMb}MB (${savingsPercent}% saved)`);

        /* ── iOS-safe file replacement strategy ───────────────────────────
         *  Instead of moveAsync to the original path (which fails on iOS
         *  when the destination already exists), we move the compressed
         *  file to a NEW permanent filename and delete the original.
         *  The caller is responsible for updating the vlog's filePath field.
         * ──────────────────────────────────────────────────────────────── */
        const vlogDir = inputUri.substring(0, inputUri.lastIndexOf('/') + 1);
        const newFileName = `compressed_${generateId()}.mp4`;
        const permanentUri = `${vlogDir}${newFileName}`;

        await FileSystem.moveAsync({ from: compressedUri, to: permanentUri });

        // Delete original only after compressed file is safely moved
        try {
            await FileSystem.deleteAsync(inputUri, { idempotent: true });
        } catch (err) {
            logger('warn', 'Compressor', 'Failed to delete original file:', err);
        }

        onProgress?.(1);
        return {
            outputUri: permanentUri,
            outputSizeBytes: compressedSizeBytes,
            originalSizeBytes,
            wasCompressed: true,
            savingsPercent,
        };
    } catch (error) {
        logger('error', 'Compressor', 'Compression failed, keeping original:', error);
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
