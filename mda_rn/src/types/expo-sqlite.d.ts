/**
 * Minimal type declarations for expo-sqlite v15.
 *
 * These stubs satisfy the TypeScript compiler when the actual expo-sqlite
 * package is not installed in the workspace (e.g., during code review).
 * In a full build environment, the real package's built-in types take precedence.
 */

export interface SQLiteDatabase {
    execAsync(sql: string): Promise<void>;
    runAsync(sql: string, params?: unknown[]): Promise<void>;
    getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]>;
    getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null>;
    withTransactionAsync(fn: () => Promise<void>): Promise<void>;
    closeAsync(): Promise<void>;
}

export function openDatabaseAsync(name: string): Promise<SQLiteDatabase>;
