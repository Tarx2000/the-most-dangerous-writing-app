import { run, getAll } from '@/lib/db';

export interface SettingRow {
    key: string;
    value: string;
}

export async function getSetting(key: string): Promise<string | undefined> {
    const row = await (await import('@/lib/db')).getFirst<SettingRow>(
        `SELECT value FROM settings WHERE key = ?`, [key]
    );
    return row?.value ?? undefined;
}

export async function setSetting(key: string, value: string): Promise<void> {
    await run(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, value, Date.now()]
    );
}

export async function deleteSetting(key: string): Promise<void> {
    await run(`DELETE FROM settings WHERE key = ?`, [key]);
}

export async function getAllSettings(): Promise<Record<string, string>> {
    const rows = await getAll<SettingRow>(`SELECT * FROM settings`);
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    return map;
}

export async function deleteAllSettings(): Promise<void> {
    await run(`DELETE FROM settings`);
}
