import { run, getAll } from '@/lib/db';
import type { SavedVlog } from '@/types';
import * as FileSystem from 'expo-file-system/legacy';
import { CONFIG } from '@/config';

export interface VlogRow {
    id: string;
    file_path: string;
    date_str: string;
    timestamp: number;
    duration_sec: number;
    file_size_bytes: number;
    thumbnail_path: string | null;
    compression_preset: string | null;
    original_file_size_bytes: number | null;
    compression_pending: number;
}

function rowToVlog(row: VlogRow): SavedVlog {
    // A single malformed/legacy row must NEVER reject the whole repository load
    // (which would abort startup). `file_path` is schema NOT NULL, but we guard
    // anyway so one bad row can't crash the app on boot.
    const rawPath = typeof row.file_path === 'string' ? row.file_path : '';
    const videoFileName = rawPath ? rawPath.substring(rawPath.lastIndexOf('/') + 1) : rawPath;
    const correctedFilePath = videoFileName
        ? `${FileSystem.documentDirectory}${CONFIG.VLOG_STORAGE_DIR}${videoFileName}`
        : rawPath;

    let correctedThumbnailPath = row.thumbnail_path ?? undefined;
    if (correctedThumbnailPath) {
        const thumbFileName = correctedThumbnailPath.substring(correctedThumbnailPath.lastIndexOf('/') + 1);
        correctedThumbnailPath = `${FileSystem.documentDirectory}vlog_thumbnails/${thumbFileName}`;
    }

    return {
        id: row.id,
        filePath: correctedFilePath,
        dateStr: row.date_str,
        timestamp: row.timestamp,
        durationSec: row.duration_sec,
        fileSizeBytes: row.file_size_bytes,
        thumbnailPath: correctedThumbnailPath,
        compressionPreset: row.compression_preset ?? undefined,
        originalFileSizeBytes: row.original_file_size_bytes ?? undefined,
        compressionPending: !!row.compression_pending,
    };
}

export async function getAllVlogs(): Promise<SavedVlog[]> {
    const rows = await getAll<VlogRow>(`SELECT * FROM vlogs ORDER BY timestamp DESC`);
    return rows.map(rowToVlog);
}

export async function insertVlog(vlog: SavedVlog): Promise<void> {
    await run(
        `INSERT INTO vlogs (id, file_path, date_str, timestamp, duration_sec, file_size_bytes, thumbnail_path, compression_preset, original_file_size_bytes, compression_pending)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            vlog.id,
            vlog.filePath,
            vlog.dateStr,
            vlog.timestamp,
            vlog.durationSec,
            vlog.fileSizeBytes,
            vlog.thumbnailPath ?? null,
            vlog.compressionPreset ?? null,
            vlog.originalFileSizeBytes ?? null,
            vlog.compressionPending ? 1 : 0,
        ],
    );
}

export async function updateVlog(id: string, updates: Partial<SavedVlog>): Promise<void> {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.filePath !== undefined) {
        fields.push('file_path = ?');
        values.push(updates.filePath);
    }
    if (updates.dateStr !== undefined) {
        fields.push('date_str = ?');
        values.push(updates.dateStr);
    }
    if (updates.timestamp !== undefined) {
        fields.push('timestamp = ?');
        values.push(updates.timestamp);
    }
    if (updates.durationSec !== undefined) {
        fields.push('duration_sec = ?');
        values.push(updates.durationSec);
    }
    if (updates.fileSizeBytes !== undefined) {
        fields.push('file_size_bytes = ?');
        values.push(updates.fileSizeBytes);
    }
    if (updates.thumbnailPath !== undefined) {
        fields.push('thumbnail_path = ?');
        values.push(updates.thumbnailPath ?? null);
    }
    if (updates.compressionPreset !== undefined) {
        fields.push('compression_preset = ?');
        values.push(updates.compressionPreset ?? null);
    }
    if (updates.originalFileSizeBytes !== undefined) {
        fields.push('original_file_size_bytes = ?');
        values.push(updates.originalFileSizeBytes ?? null);
    }
    if (updates.compressionPending !== undefined) {
        fields.push('compression_pending = ?');
        values.push(updates.compressionPending ? 1 : 0);
    }

    if (fields.length === 0) return;
    values.push(id);
    await run(`UPDATE vlogs SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function deleteVlog(id: string): Promise<void> {
    await run(`DELETE FROM vlogs WHERE id = ?`, [id]);
}

export async function deleteAllVlogs(): Promise<void> {
    await run(`DELETE FROM vlogs`);
}
