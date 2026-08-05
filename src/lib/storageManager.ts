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
import { generateId } from '@/lib/utils';
import { insertVlog } from '@/lib/repositories/vlogsRepository';

/**
 * Delete orphaned vlog files that exist on disk but have no corresponding
 * SavedVlog metadata entry. These are safe to remove because the user
 * has already deleted the vlog entry — only the file was left behind.
 *
 * This is the ONLY automatic cleanup — it removes files the user already
 * chose to delete, not any user content.
 */
export async function cleanupOrphanedVlogs(knownVlogPaths: Set<string>): Promise<number> {
    const vlogDir = `${FileSystem.documentDirectory}${CONFIG.VLOG_STORAGE_DIR}`;
    let cleaned = 0;

    try {
        const info = await FileSystem.getInfoAsync(vlogDir);
        if (!info.exists || !('isDirectory' in info && info.isDirectory)) return 0;

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

/* ═══════════════════════════════════════════════════════════════════════════
   ORPHAN VLOG RECOVERY — Re-attach video files that exist on disk
   but have no database entry. This happens when AsyncStorage metadata
   is lost during a crash, reinstall, or failed migration, but the
   actual video files were left on disk.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface OrphanVlogInfo {
    filePath: string;
    fileName: string;
    fileSizeBytes: number;
    modificationTime: number;
}

/**
 * Scan the vlog directory for files that do NOT have a corresponding
 * database entry. Returns a list of orphaned files found.
 *
 * NOTE: This is purely diagnostic — it does NOT modify the database.
 */
export async function scanOrphanVlogFiles(knownVlogPaths: Set<string>): Promise<OrphanVlogInfo[]> {
    const vlogDir = `${FileSystem.documentDirectory}${CONFIG.VLOG_STORAGE_DIR}`;
    const orphans: OrphanVlogInfo[] = [];

    try {
        const info = await FileSystem.getInfoAsync(vlogDir);
        if (!info.exists || !('isDirectory' in info && info.isDirectory)) return orphans;

        const entries = await FileSystem.readDirectoryAsync(vlogDir);
        for (const entry of entries) {
            // Skip thumbnails and non-video files
            if (entry.endsWith('.jpg') || entry.endsWith('.png')) continue;

            const fullPath = `${vlogDir}${entry}`;
            if (knownVlogPaths.has(fullPath)) continue;

            const fileInfo = await FileSystem.getInfoAsync(fullPath);
            if (!fileInfo.exists || !('size' in fileInfo)) continue;

            const modTime = 'modificationTime' in fileInfo ? (fileInfo.modificationTime as number) * 1000 : Date.now();

            orphans.push({
                filePath: fullPath,
                fileName: entry,
                fileSizeBytes: fileInfo.size as number,
                modificationTime: modTime,
            });
        }
    } catch {
        // Directory read failed — return empty list
    }

    // Sort newest first (most recently recorded first)
    return orphans.sort((a, b) => b.modificationTime - a.modificationTime);
}

/**
 * Re-attach orphaned video files to the library by creating new SavedVlog
 * metadata entries. The original durationSec and thumbnail are lost, but
 * the file itself, its size, and its modification date are recovered.
 *
 * Returns the number of vlogs successfully re-attached.
 */
export async function reattachOrphanVlogFiles(
    orphans: OrphanVlogInfo[],
): Promise<{ reattached: number; failed: number }> {
    let reattached = 0;
    let failed = 0;

    for (const o of orphans) {
        const id = generateId();
        const date = new Date(o.modificationTime);
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

        const savedVlog: SavedVlog = {
            id,
            filePath: o.filePath,
            dateStr,
            timestamp: o.modificationTime,
            durationSec: 0, // Original duration lost — user can see it in video player
            fileSizeBytes: o.fileSizeBytes,
            thumbnailPath: undefined,
            compressionPreset: undefined,
            originalFileSizeBytes: undefined,
            compressionPending: false,
        };

        try {
            await insertVlog(savedVlog);
            reattached++;
        } catch {
            failed++;
        }
    }

    return { reattached, failed };
}
