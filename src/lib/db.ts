import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { storage } from '@/lib/storage';
import { logger } from '@/lib/logger';

const DB_NAME = 'mda_v2.db';
let dbInstance: SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLiteDatabase> {
    if (dbInstance) return dbInstance;
    dbInstance = await openDatabaseAsync(DB_NAME);
    await migrate(dbInstance);
    return dbInstance;
}

export async function closeDb(): Promise<void> {
    if (dbInstance) {
        await dbInstance.closeAsync();
        dbInstance = null;
    }
}

export function resetDbInstance(): void {
    dbInstance = null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MIGRATIONS — Schema versioning with per-step transactions
   ═══════════════════════════════════════════════════════════════════════════ */

const SCHEMA_VERSION_KEY = '__DB_SCHEMA_VERSION__';

type Migration = {
    version: number;
    name: string;
    up: string[];
};

const MIGRATIONS: Migration[] = [
    {
        version: 1,
        name: 'Initial schema',
        up: [
            `CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                text TEXT NOT NULL,
                date_str TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                duration_min INTEGER NOT NULL DEFAULT 0,
                won INTEGER NOT NULL DEFAULT 0,
                person_id TEXT,
                is_quick_note INTEGER NOT NULL DEFAULT 0,
                ai_title TEXT,
                ai_summary TEXT,
                ai_model_used TEXT,
                is_alignment_reflection INTEGER NOT NULL DEFAULT 0,
                alignment_score INTEGER,
                stop_text TEXT,
                start_text TEXT,
                continue_text TEXT,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
            );`,
            `CREATE INDEX IF NOT EXISTS idx_notes_timestamp ON notes(timestamp);`,
            `CREATE INDEX IF NOT EXISTS idx_notes_person ON notes(person_id);`,
            `CREATE TABLE IF NOT EXISTS persons (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                nickname TEXT,
                relationship TEXT,
                birthday TEXT,
                bio TEXT,
                custom_relationships TEXT
            );`,
            `CREATE TABLE IF NOT EXISTS vlogs (
                id TEXT PRIMARY KEY,
                file_path TEXT NOT NULL,
                date_str TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                duration_sec INTEGER NOT NULL,
                file_size_bytes INTEGER NOT NULL DEFAULT 0,
                thumbnail_path TEXT,
                compression_preset TEXT,
                original_file_size_bytes INTEGER,
                compression_pending INTEGER NOT NULL DEFAULT 0
            );`,
            `CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
            );`,
            `CREATE TABLE IF NOT EXISTS feed_bookmarks (
                note_id TEXT PRIMARY KEY,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
            );`,
            `CREATE TABLE IF NOT EXISTS feed_comments (
                note_id TEXT PRIMARY KEY,
                comment TEXT NOT NULL,
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
            );`,
        ],
    },
    {
        version: 2,
        name: 'Add ai queue log tables',
        up: [
            `CREATE TABLE IF NOT EXISTS ai_jobs (
                id TEXT PRIMARY KEY,
                note_id TEXT NOT NULL,
                category TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                started_at INTEGER,
                completed_at INTEGER,
                error TEXT,
                retry_count INTEGER NOT NULL DEFAULT 0
            );`,
            `CREATE TABLE IF NOT EXISTS ai_logs (
                timestamp INTEGER NOT NULL,
                action TEXT NOT NULL,
                note_id TEXT,
                model TEXT NOT NULL,
                phase TEXT NOT NULL,
                duration_ms INTEGER,
                error TEXT
            );`,
        ],
    },
];

async function migrate(db: SQLiteDatabase): Promise<void> {
    const rawVersion = await storage.getItem(SCHEMA_VERSION_KEY);
    let currentVersion = rawVersion ? parseInt(rawVersion, 10) : 0;
    if (Number.isNaN(currentVersion)) currentVersion = 0;

    for (const migration of MIGRATIONS) {
        if (migration.version > currentVersion) {
            await db.withTransactionAsync(async () => {
                for (const sql of migration.up) {
                    await db.execAsync(sql);
                }
            });
            await storage.setItem(SCHEMA_VERSION_KEY, String(migration.version));
            currentVersion = migration.version;
        }
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

export type BindValue = string | number | null;

export async function run(sql: string, params?: BindValue[]): Promise<void> {
    const db = await getDb();
    await db.runAsync(sql, params ?? []);
}

export async function getAll<T>(sql: string, params?: BindValue[]): Promise<T[]> {
    const db = await getDb();
    return db.getAllAsync<T>(sql, params ?? []);
}

export async function getFirst<T>(sql: string, params?: BindValue[]): Promise<T | undefined> {
    const db = await getDb();
    const rows = await db.getAllAsync<T>(sql, params ?? []);
    return rows[0];
}
