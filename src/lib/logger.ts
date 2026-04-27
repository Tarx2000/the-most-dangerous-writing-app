/**
 * Structured Logger — Reduces console noise in production while keeping
 * error logs visible everywhere.
 *
 * Rules:
 * - error: Always shown (production + dev)
 * - warn: Shown in dev, suppressed in production unless explicitly forced
 * - info / debug: Dev only
 */

const isDev = __DEV__;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Central log function. Prefer the tagged helpers below. */
export function logger(level: LogLevel, tag: string, message: string, ...args: unknown[]): void {
    const prefix = `[${tag}] ${message}`;
    if (level === 'error') {
        console.error(prefix, ...args);
    } else if (level === 'warn') {
        if (isDev) {
            console.warn(prefix, ...args);
        }
    } else if (isDev) {
        // eslint-disable-next-line no-console
        console.log(prefix, ...args);
    }
}

/** Tagged helpers for common domains */
export const logStorage = (level: LogLevel, message: string, ...args: unknown[]) => logger(level, 'Storage', message, ...args);
export const logAi = (level: LogLevel, message: string, ...args: unknown[]) => logger(level, 'AI', message, ...args);
export const logAiQueue = (level: LogLevel, message: string, ...args: unknown[]) => logger(level, 'AI Queue', message, ...args);
export const logCompressor = (level: LogLevel, message: string, ...args: unknown[]) => logger(level, 'Compressor', message, ...args);
export const logDb = (level: LogLevel, message: string, ...args: unknown[]) => logger(level, 'DB', message, ...args);
export const logStartup = (level: LogLevel, message: string, ...args: unknown[]) => logger(level, 'Startup', message, ...args);
