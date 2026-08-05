import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { storage } from '@/lib/storage';
import { logger } from '@/lib/logger';

const DB_NAME = 'mda_v2.db';
let dbInstance: SQLiteDatabase | null = null;
let dbOpeningPromise: Promise<SQLiteDatabase> | null = null;

export async function getDb(): Promise<SQLiteDatabase> {
    if (dbInstance) return dbInstance;
    if (dbOpeningPromise) return dbOpeningPromise;

    dbOpeningPromise = openDatabaseAsync(DB_NAME)
        .then(async (db: SQLiteDatabase) => {
            await migrate(db);
            dbInstance = db;
            return db;
        })
        .catch((err: unknown) => {
            // Reset the cached promise so a later call can retry. A permanently
            // rejected promise would otherwise brick EVERY future DB operation
            // for the rest of the app session.
            dbOpeningPromise = null;
            throw err;
        });

    return dbOpeningPromise;
}

export async function closeDb(): Promise<void> {
    if (dbInstance) {
        await dbInstance.closeAsync();
        dbInstance = null;
    }
    dbOpeningPromise = null;
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

/**
 * True when the error message signals a schema change that was ALREADY applied
 * (e.g. `ALTER TABLE ... ADD COLUMN` on a column that already exists). These are
 * treated as "already migrated" so a stale schema version can never brick the
 * app or crash startup with a duplicate-column exception.
 */
function isAlreadyAppliedError(err: unknown): boolean {
    const message =
        typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message?: string }).message)
            : String(err);
    return /duplicate column name/i.test(message) || /already exists/i.test(message);
}

/**
 * Read the schema version stored inside the DB file itself (`PRAGMA user_version`).
 * Unlike AsyncStorage this value lives in the database file, so it survives file
 * copies and backup restores and can never drift out of sync with the actual schema.
 */
async function readPragmaVersion(db: SQLiteDatabase): Promise<number> {
    try {
        const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
        const version = Number(row?.user_version);
        return Number.isFinite(version) && version > 0 ? Math.floor(version) : 0;
    } catch {
        return 0;
    }
}

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
    {
        version: 3,
        name: 'Add is_tweet column',
        up: [
            `ALTER TABLE notes ADD COLUMN is_tweet INTEGER NOT NULL DEFAULT 0;`,
            `UPDATE notes SET is_tweet = 1 WHERE (LENGTH(text) - LENGTH(REPLACE(text, ' ', '')) + 1) <= 45;`,
        ],
    },
    {
        version: 4,
        name: 'Add pillars, advice_cards, and pillar_logs tables',
        up: [
            `CREATE TABLE IF NOT EXISTS pillars (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                type TEXT NOT NULL,
                scope TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                adaptive_days INTEGER NOT NULL DEFAULT 14,
                is_active INTEGER NOT NULL DEFAULT 1
            );`,
            `CREATE TABLE IF NOT EXISTS advice_cards (
                id TEXT PRIMARY KEY,
                text TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                last_reflected_at INTEGER,
                reflection_count INTEGER NOT NULL DEFAULT 0,
                is_active INTEGER NOT NULL DEFAULT 1
            );`,
            `CREATE TABLE IF NOT EXISTS pillar_logs (
                id TEXT PRIMARY KEY,
                pillar_id TEXT NOT NULL,
                value_num REAL,
                value_str TEXT,
                timestamp INTEGER NOT NULL,
                note_id TEXT,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
            );`,
            `CREATE INDEX IF NOT EXISTS idx_pillar_logs_timestamp ON pillar_logs(timestamp);`,
            `CREATE INDEX IF NOT EXISTS idx_pillar_logs_pillar ON pillar_logs(pillar_id);`,
            `ALTER TABLE notes ADD COLUMN pillar_id TEXT;`,
            `ALTER TABLE notes ADD COLUMN advice_id TEXT;`,
            `ALTER TABLE notes ADD COLUMN pillar_value REAL;`,
            `INSERT OR IGNORE INTO pillars (id, title, type, scope, created_at, adaptive_days, is_active) VALUES
             ('mock_pillar_sleep', 'Sleep Duration', 'time', 'daily', (strftime('%s','now') * 1000), 14, 1),
             ('mock_pillar_comfort', 'Leaving Comfort Zone', 'rating', 'adaptive', (strftime('%s','now') * 1000), 14, 1),
             ('mock_pillar_mindfulness', 'Daily Mindfulness', 'boolean', 'daily', (strftime('%s','now') * 1000), 14, 1);`,
            `INSERT OR IGNORE INTO advice_cards (id, text, created_at, last_reflected_at, reflection_count, is_active) VALUES
             ('mock_advice_listen', 'Listen 80%, speak 20%', (strftime('%s','now') * 1000), NULL, 0, 1),
             ('mock_advice_comfort', 'Do one thing each day that scares you', (strftime('%s','now') * 1000), NULL, 0, 1);`,
        ],
    },
    {
        version: 5,
        name: 'Add description and last_edited_at to pillars',
        up: [
            `ALTER TABLE pillars ADD COLUMN description TEXT;`,
            `ALTER TABLE pillars ADD COLUMN last_edited_at INTEGER;`,
            `UPDATE pillars SET last_edited_at = created_at WHERE last_edited_at IS NULL;`,
        ],
    },
    {
        version: 6,
        name: 'Add versioning to pillars and notes',
        up: [
            `CREATE TABLE IF NOT EXISTS pillar_versions (
                id TEXT PRIMARY KEY,
                pillar_id TEXT NOT NULL,
                version INTEGER NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                created_at INTEGER NOT NULL
            );`,
            `ALTER TABLE pillars ADD COLUMN version INTEGER NOT NULL DEFAULT 1;`,
            `ALTER TABLE notes ADD COLUMN pillar_version INTEGER;`,
            `INSERT OR IGNORE INTO pillar_versions (id, pillar_id, version, title, description, created_at)
             SELECT id || '_v1', id, 1, title, description, created_at FROM pillars;`,
        ],
    },
];

async function migrate(db: SQLiteDatabase): Promise<void> {
    // The schema version is tracked in TWO places:
    //  1. PRAGMA user_version  — stored INSIDE the DB file (survives backup restores & file copies).
    //  2. AsyncStorage key     — legacy tracker from earlier app versions.
    // We always take the MAX of both so the recorded version can never be lower
    // than the actual on-disk schema. This is the key guard that prevents a stale
    // version from re-running ALTER TABLE and crashing on "duplicate column name".
    const rawVersion = await storage.getItem(SCHEMA_VERSION_KEY).catch(() => null);
    const parsedAsyncVersion = parseInt(rawVersion ?? '', 10);
    const asyncVersion = Number.isNaN(parsedAsyncVersion) ? 0 : parsedAsyncVersion;
    const pragmaVersion = await readPragmaVersion(db);
    let currentVersion = Math.max(asyncVersion, pragmaVersion);

    for (const migration of MIGRATIONS) {
        if (migration.version <= currentVersion) continue;

        try {
            await db.withTransactionAsync(async () => {
                for (const sql of migration.up) {
                    try {
                        await db.execAsync(sql);
                    } catch (err) {
                        // Self-heal: if the statement failed because the change was
                        // already applied (stale version), skip it and move on.
                        if (isAlreadyAppliedError(err)) {
                            logger(
                                'warn',
                                'Migration',
                                `Skipping already-applied statement in v${migration.version}: ${sql.slice(0, 60)}…`,
                                err,
                            );
                            continue;
                        }
                        throw err;
                    }
                }
            });
            currentVersion = migration.version;
            logger('info', 'Migration', `Applied migration v${migration.version} (${migration.name})`);
        } catch (err) {
            // NEVER brick the app over a migration problem. Log it and continue so
            // the database is still returned and the app can boot best-effort.
            logger(
                'error',
                'Migration',
                `Migration v${migration.version} (${migration.name}) failed — continuing`,
                err,
            );
        }
    }

    // Persist the resolved version in both stores (best-effort; never fatal).
    // Writing PRAGMA user_version makes future launches self-healing even if the
    // AsyncStorage key is wiped — the DB file itself remembers its own schema level.
    if (pragmaVersion < currentVersion) {
        try {
            await db.execAsync(`PRAGMA user_version = ${currentVersion};`);
        } catch (err) {
            logger('warn', 'Migration', 'Could not persist PRAGMA user_version', err);
        }
    }
    if (asyncVersion < currentVersion) {
        try {
            await storage.setItem(SCHEMA_VERSION_KEY, String(currentVersion));
        } catch (err) {
            logger('warn', 'Migration', 'Could not persist schema version in AsyncStorage', err);
        }
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

export type BindValue = string | number | null | undefined | boolean;

/**
 * Convert `null` bind params into **holes** in a sparse array.
 *
 * expo-sqlite v15 on Android receives bind params as `Map<String, Any>` — a
 * **non-nullable** Kotlin map. Its `AnyTypeConverter` maps BOTH `null` AND
 * `undefined` to `ReadableType.Null` and throws `NullArgumentException`.
 *
 * `normalizeParams()` uses `reduce()` to index-key the array. `reduce()`
 * **skips holes entirely**, so the key is never emitted. The native
 * `sqlite3_clear_bindings()` call (executed before every run) defaults all
 * unbound positions to SQL NULL — exactly what we need.
 */
export function sanitizeBindParams(params: BindValue[] | undefined): (string | number | boolean | undefined)[] {
    if (!params) return [];
    const out = [...params] as (string | number | boolean | undefined)[];
    for (let i = 0; i < out.length; i++) {
        // Use loose equality to match both null and undefined.
        // This ensures undefined parameters passed in are safely stripped,
        // avoiding NullArgumentException on Android.
        if (out[i] == null) {
            // `delete` on a TypedArray index creates a sparse hole.
            // `reduce()` skips holes, so normalizeParams never emits this key.
            // This is an intentional workaround for the expo-sqlite v15 null/undefined bridge bug.
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete (out as unknown as Record<number, unknown>)[i];
        }
    }
    return out;
}

export async function run(sql: string, params?: BindValue[]): Promise<void> {
    const db = await getDb();
    await db.runAsync(sql, sanitizeBindParams(params) as (string | number | null | boolean)[]);
}

export async function getAll<T>(sql: string, params?: BindValue[]): Promise<T[]> {
    const db = await getDb();
    return db.getAllAsync<T>(sql, sanitizeBindParams(params) as (string | number | null | boolean)[]);
}

export async function getFirst<T>(sql: string, params?: BindValue[]): Promise<T | undefined> {
    const db = await getDb();
    const row = await db.getFirstAsync<T>(sql, sanitizeBindParams(params) as (string | number | null | boolean)[]);
    return row ?? undefined;
}
