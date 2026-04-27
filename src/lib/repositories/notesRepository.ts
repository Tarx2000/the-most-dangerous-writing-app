import { run, getAll, getFirst } from '@/lib/db';
import type { SavedNote, AlignmentReflection } from '@/types';
import { isAlignmentReflection } from '@/types';

export interface NoteRow {
    id: string;
    text: string;
    date_str: string;
    timestamp: number;
    duration_min: number;
    won: number;
    person_id: string | null;
    is_quick_note: number;
    ai_title: string | null;
    ai_summary: string | null;
    ai_model_used: string | null;
    is_alignment_reflection: number;
    alignment_score: number | null;
    stop_text: string | null;
    start_text: string | null;
    continue_text: string | null;
}

function rowToNote(row: NoteRow): SavedNote | AlignmentReflection {
    const base: SavedNote = {
        id: row.id,
        text: row.text,
        dateStr: row.date_str,
        timestamp: row.timestamp,
        durationMin: row.duration_min,
        won: !!row.won,
        personId: row.person_id ?? undefined,
        isQuickNote: !!row.is_quick_note,
        aiTitle: row.ai_title ?? undefined,
        aiSummary: row.ai_summary ? ((): string[] | undefined => { try { return JSON.parse(row.ai_summary) as string[]; } catch { return undefined; } })() : undefined,
        aiModelUsed: row.ai_model_used ?? undefined,
        isAlignmentReflection: !!row.is_alignment_reflection,
    };
    if (row.is_alignment_reflection) {
        return {
            ...base,
            isAlignmentReflection: true,
            alignmentScore: row.alignment_score ?? 0,
            stopText: row.stop_text ?? '',
            startText: row.start_text ?? '',
            continueText: row.continue_text ?? '',
        } as AlignmentReflection;
    }
    return base;
}

export async function getAllNotes(): Promise<(SavedNote | AlignmentReflection)[]> {
    const rows = await getAll<NoteRow>(`SELECT * FROM notes ORDER BY timestamp DESC`);
    return rows.map(rowToNote);
}

export async function getNoteById(id: string): Promise<SavedNote | AlignmentReflection | undefined> {
    const row = await getFirst<NoteRow>(`SELECT * FROM notes WHERE id = ?`, [id]);
    return row ? rowToNote(row) : undefined;
}

export async function insertNote(note: SavedNote): Promise<void> {
    const summaryJson = note.aiSummary ? JSON.stringify(note.aiSummary) : null;
    await run(
        `INSERT INTO notes (id, text, date_str, timestamp, duration_min, won, person_id, is_quick_note, ai_title, ai_summary, ai_model_used, is_alignment_reflection, alignment_score, stop_text, start_text, continue_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            note.id, note.text, note.dateStr, note.timestamp, note.durationMin,
            note.won ? 1 : 0, note.personId ?? null, note.isQuickNote ? 1 : 0,
            note.aiTitle ?? null, summaryJson, note.aiModelUsed ?? null,
            isAlignmentReflection(note) ? 1 : 0,
            isAlignmentReflection(note) ? note.alignmentScore : null,
            isAlignmentReflection(note) ? note.stopText : null,
            isAlignmentReflection(note) ? note.startText : null,
            isAlignmentReflection(note) ? note.continueText : null,
        ]
    );
}

export async function updateNote(id: string, updates: Partial<SavedNote>): Promise<void> {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.text !== undefined) { fields.push('text = ?'); values.push(updates.text); }
    if (updates.dateStr !== undefined) { fields.push('date_str = ?'); values.push(updates.dateStr); }
    if (updates.timestamp !== undefined) { fields.push('timestamp = ?'); values.push(updates.timestamp); }
    if (updates.durationMin !== undefined) { fields.push('duration_min = ?'); values.push(updates.durationMin); }
    if (updates.won !== undefined) { fields.push('won = ?'); values.push(updates.won ? 1 : 0); }
    if (updates.personId !== undefined) { fields.push('person_id = ?'); values.push(updates.personId ?? null); }
    if (updates.isQuickNote !== undefined) { fields.push('is_quick_note = ?'); values.push(updates.isQuickNote ? 1 : 0); }
    if (updates.aiTitle !== undefined) { fields.push('ai_title = ?'); values.push(updates.aiTitle ?? null); }
    if (updates.aiSummary !== undefined) { fields.push('ai_summary = ?'); values.push(updates.aiSummary ? JSON.stringify(updates.aiSummary) : null); }
    if (updates.aiModelUsed !== undefined) { fields.push('ai_model_used = ?'); values.push(updates.aiModelUsed ?? null); }
    if (updates.isAlignmentReflection !== undefined) { fields.push('is_alignment_reflection = ?'); values.push(updates.isAlignmentReflection ? 1 : 0); }

    if (fields.length === 0) return;
    values.push(id);
    await run(`UPDATE notes SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function deleteNote(id: string): Promise<void> {
    await run(`DELETE FROM notes WHERE id = ?`, [id]);
}

export async function clearAllAiMetadata(): Promise<void> {
    await run(`UPDATE notes SET ai_title = NULL, ai_summary = NULL, ai_model_used = NULL`);
}

export async function deleteAllNotes(): Promise<void> {
    await run(`DELETE FROM notes`);
}
