import { run, getAll, getFirst } from '@/lib/db';
import type { Pillar, AdviceCard, PillarLog, PillarVersion } from '@/types';

/* ═══════════════════════════════════════════════════════════════════════════
   ROW INTERFACES
   ═══════════════════════════════════════════════════════════════════════════ */

export interface PillarRow {
    id: string;
    title: string;
    type: 'rating' | 'time' | 'boolean' | 'text';
    scope: 'daily' | 'weekly' | 'adaptive';
    created_at: number;
    last_edited_at: number;
    adaptive_days: number;
    is_active: number;
    description: string | null;
    version: number;
}

export interface AdviceRow {
    id: string;
    text: string;
    created_at: number;
    last_reflected_at: number | null;
    reflection_count: number;
    is_active: number;
}

export interface PillarLogRow {
    id: string;
    pillar_id: string;
    value_num: number | null;
    value_str: string | null;
    timestamp: number;
    note_id: string | null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONVERTERS
   ═══════════════════════════════════════════════════════════════════════════ */

function rowToPillar(row: PillarRow): Pillar {
    return {
        id: row.id,
        title: row.title,
        type: row.type,
        scope: row.scope,
        createdAt: row.created_at,
        lastEditedAt: row.last_edited_at || row.created_at,
        adaptiveDays: row.adaptive_days,
        isActive: !!row.is_active,
        description: row.description || undefined,
        version: row.version || 1,
    };
}

function rowToAdvice(row: AdviceRow): AdviceCard {
    return {
        id: row.id,
        text: row.text,
        createdAt: row.created_at,
        lastReflectedAt: row.last_reflected_at,
        reflectionCount: row.reflection_count,
        isActive: !!row.is_active,
    };
}

function rowToPillarLog(row: PillarLogRow): PillarLog {
    return {
        id: row.id,
        pillarId: row.pillar_id,
        valueNum: row.value_num,
        valueStr: row.value_str,
        timestamp: row.timestamp,
        noteId: row.note_id,
    };
}

/* ═══════════════════════════════════════════════════════════════════════════
   REPOSITORIES
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Pillars Repository ──

export async function getAllPillars(): Promise<Pillar[]> {
    const rows = await getAll<PillarRow>(`SELECT * FROM pillars ORDER BY created_at DESC`);
    return rows.map(rowToPillar);
}

export async function getPillarById(id: string): Promise<Pillar | undefined> {
    const row = await getFirst<PillarRow>(`SELECT * FROM pillars WHERE id = ?`, [id]);
    return row ? rowToPillar(row) : undefined;
}

export async function insertPillar(pillar: Pillar): Promise<void> {
    await run(
        `INSERT INTO pillars (id, title, type, scope, created_at, last_edited_at, adaptive_days, is_active, description, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
            pillar.id,
            pillar.title,
            pillar.type,
            pillar.scope,
            pillar.createdAt,
            pillar.lastEditedAt || pillar.createdAt,
            pillar.adaptiveDays,
            pillar.isActive ? 1 : 0,
            pillar.description || null,
            pillar.version || 1,
        ],
    );
}

export async function updatePillar(id: string, updates: Partial<Pillar>): Promise<void> {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.title !== undefined) {
        fields.push('title = ?');
        values.push(updates.title);
    }
    if (updates.type !== undefined) {
        fields.push('type = ?');
        values.push(updates.type);
    }
    if (updates.scope !== undefined) {
        fields.push('scope = ?');
        values.push(updates.scope);
    }
    if (updates.adaptiveDays !== undefined) {
        fields.push('adaptive_days = ?');
        values.push(updates.adaptiveDays);
    }
    if (updates.isActive !== undefined) {
        fields.push('is_active = ?');
        values.push(updates.isActive ? 1 : 0);
    }
    if (updates.description !== undefined) {
        fields.push('description = ?');
        values.push(updates.description || null);
    }
    if (updates.lastEditedAt !== undefined) {
        fields.push('last_edited_at = ?');
        values.push(updates.lastEditedAt);
    }
    if (updates.version !== undefined) {
        fields.push('version = ?');
        values.push(updates.version);
    }

    if (fields.length === 0) return;
    values.push(id);
    await run(`UPDATE pillars SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function deactivatePillar(id: string): Promise<void> {
    await run(`UPDATE pillars SET is_active = 0 WHERE id = ?`, [id]);
}

export async function hardDeletePillar(id: string): Promise<void> {
    await run(`DELETE FROM pillars WHERE id = ?`, [id]);
    await run(`DELETE FROM pillar_logs WHERE pillar_id = ?`, [id]);
    await run(`DELETE FROM pillar_versions WHERE pillar_id = ?`, [id]);
}

export async function getLatestPillarLogTimestamp(): Promise<number | null> {
    const row = await getFirst<{ max_ts: number | null }>(`SELECT MAX(timestamp) as max_ts FROM pillar_logs`);
    return row ? row.max_ts : null;
}

// ── Advice Cards Repository ──

export async function getAllAdviceCards(): Promise<AdviceCard[]> {
    const rows = await getAll<AdviceRow>(`SELECT * FROM advice_cards WHERE is_active = 1 ORDER BY created_at DESC`);
    return rows.map(rowToAdvice);
}

export async function getAdviceById(id: string): Promise<AdviceCard | undefined> {
    const row = await getFirst<AdviceRow>(`SELECT * FROM advice_cards WHERE id = ?`, [id]);
    return row ? rowToAdvice(row) : undefined;
}

export async function insertAdviceCard(advice: AdviceCard): Promise<void> {
    await run(
        `INSERT INTO advice_cards (id, text, created_at, last_reflected_at, reflection_count, is_active)
         VALUES (?, ?, ?, ?, ?, ?);`,
        [
            advice.id,
            advice.text,
            advice.createdAt,
            advice.lastReflectedAt,
            advice.reflectionCount,
            advice.isActive ? 1 : 0,
        ],
    );
}

export async function updateAdviceCard(id: string, updates: Partial<AdviceCard>): Promise<void> {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.text !== undefined) {
        fields.push('text = ?');
        values.push(updates.text);
    }
    if (updates.lastReflectedAt !== undefined) {
        fields.push('last_reflected_at = ?');
        values.push(updates.lastReflectedAt);
    }
    if (updates.reflectionCount !== undefined) {
        fields.push('reflection_count = ?');
        values.push(updates.reflectionCount);
    }
    if (updates.isActive !== undefined) {
        fields.push('is_active = ?');
        values.push(updates.isActive ? 1 : 0);
    }

    if (fields.length === 0) return;
    values.push(id);
    await run(`UPDATE advice_cards SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function deactivateAdviceCard(id: string): Promise<void> {
    await run(`UPDATE advice_cards SET is_active = 0 WHERE id = ?`, [id]);
}

export async function incrementAdviceReflection(id: string, timestamp: number): Promise<void> {
    await run(
        `UPDATE advice_cards 
         SET last_reflected_at = ?, reflection_count = reflection_count + 1 
         WHERE id = ?`,
        [timestamp, id],
    );
}

// ── Pillar Logs Repository ──

export async function getPillarLogs(pillarId: string): Promise<PillarLog[]> {
    const rows = await getAll<PillarLogRow>(`SELECT * FROM pillar_logs WHERE pillar_id = ? ORDER BY timestamp ASC`, [
        pillarId,
    ]);
    return rows.map(rowToPillarLog);
}

export async function insertPillarLog(log: PillarLog): Promise<void> {
    await run(
        `INSERT INTO pillar_logs (id, pillar_id, value_num, value_str, timestamp, note_id)
         VALUES (?, ?, ?, ?, ?, ?);`,
        [log.id, log.pillarId, log.valueNum, log.valueStr, log.timestamp, log.noteId],
    );
}

export async function deleteAllPillarsData(): Promise<void> {
    await run(`DELETE FROM pillars`);
    await run(`DELETE FROM advice_cards`);
    await run(`DELETE FROM pillar_logs`);
}

export async function updatePillarLogNoteId(logId: string, noteId: string): Promise<void> {
    await run(`UPDATE pillar_logs SET note_id = ? WHERE id = ?`, [logId, noteId]);
}

// ── Pillar Versions Repository ──

export interface PillarVersionRow {
    id: string;
    pillar_id: string;
    version: number;
    title: string;
    description: string | null;
    created_at: number;
}

export async function getPillarVersions(pillarId: string): Promise<PillarVersion[]> {
    const rows = await getAll<PillarVersionRow>(
        `SELECT * FROM pillar_versions WHERE pillar_id = ? ORDER BY version ASC`,
        [pillarId],
    );
    return rows.map((row) => ({
        id: row.id,
        pillarId: row.pillar_id,
        version: row.version,
        title: row.title,
        description: row.description || undefined,
        createdAt: row.created_at,
    }));
}

export async function getPillarVersion(pillarId: string, version: number): Promise<PillarVersion | undefined> {
    const row = await getFirst<PillarVersionRow>(`SELECT * FROM pillar_versions WHERE pillar_id = ? AND version = ?`, [
        pillarId,
        version,
    ]);
    if (!row) return undefined;
    return {
        id: row.id,
        pillarId: row.pillar_id,
        version: row.version,
        title: row.title,
        description: row.description || undefined,
        createdAt: row.created_at,
    };
}

export async function insertPillarVersion(ver: PillarVersion): Promise<void> {
    await run(
        `INSERT INTO pillar_versions (id, pillar_id, version, title, description, created_at)
         VALUES (?, ?, ?, ?, ?, ?);`,
        [ver.id, ver.pillarId, ver.version, ver.title, ver.description || null, ver.createdAt],
    );
}
