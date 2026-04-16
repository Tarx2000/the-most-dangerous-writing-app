/**
 * Storage Manager — Disk usage monitoring for vlogs.
 *
 * Video files accumulate in documentDirectory/vlogs/. This module provides:
 * - Storage usage tracking (total bytes, human-readable format)
 * - Orphan detection — files on disk with no corresponding metadata entry
 * - Capacity monitoring — check if storage is approaching limits
 *
 * IMPORTANT: This module NEVER auto-deletes user vlogs.
 * Vlogs are irreplaceable user content. Eviction suggestions are surfaced
 * to the UI only — the user decides what to delete.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { CONFIG } from '@/config';
import type { SavedVlog } from '@/types';

/** Default storage warning threshold in bytes (2 GB) */
export const DEFAULT_VLOG_STORAGE_CAP_BYTES = 2 * 1024 * 1024 * 1024;

/** Minimum free space required before a new recording (500 MB) */
export const MIN_FREE_SPACE_BYTES = 500 * 1024 * 1024;

/**
 * Get the total size of all vlog files.
 * Uses metadata sum — faster than reading the filesystem.
 */
export function getVlogStorageUsage(vlogs: SavedVlog[]): number {
    return vlogs.reduce((sum, v) => sum + (v.fileSizeBytes || 0), 0);
}

/**
 * Format bytes into a human-readable string.
 * Examples: "1.2 MB", "3.4 GB", "512 KB"
 */
export function formatStorageSize(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) {
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    if (bytes >= 1024) {
        return `${(bytes / 1024).toFixed(0)} KB`;
    }
    return `${bytes} B`;
}

/**
 * Sort vlogs by timestamp (oldest first).
 * Use this to suggest which vlogs the user might want to delete
 * to free up space — but NEVER auto-delete.
 */
export function getOldestVlogsFirst(vlogs: SavedVlog[]): SavedVlog[] {
    return [...vlogs].sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Check whether storage is approaching capacity.
 * Returns true if usage exceeds 80% of the cap.
 */
export function isStorageNearCapacity(
    currentUsageBytes: number,
    capBytes: number = DEFAULT_VLOG_STORAGE_CAP_BYTES,
): boolean {
    return currentUsageBytes >= capBytes * 0.8;
}

/**
 * Delete orphaned vlog files that exist on disk but have no corresponding
 * SavedVlog metadata entry. These are safe to remove because the user
 * has already deleted the vlog entry — only the file was left behind.
 *
 * This is the ONLY automatic cleanup — it removes files the user already
 * chose to delete, not any user content.
 */
export async function cleanupOrphanedVlogs(
    knownVlogPaths: Set<string>,
): Promise<number> {
    const vlogDir = `${FileSystem.documentDirectory}${CONFIG.VLOG_STORAGE_DIR}`;
    let cleaned = 0;

    try {
        const info = await FileSystem.getInfoAsync(vlogDir);
        if (!info.exists || !(info as any).isDirectory) return 0;

        const files = await FileSystem.readDirectoryAsync(vlogDir);
        for (const file of files) {
            const fullPath = `${vlogDir}${file}`;
            if (!knownVlogPaths.has(fullPath)) {
                try {
                    await FileSystem.deleteAsync(fullPath, { idempotent: true });
                    cleaned++;
                } catch {
                    // File may be locked — skip
                }
            }
        }
    } catch {
        // Directory read failed — nothing to clean
    }

    return cleaned;
}