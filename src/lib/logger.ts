/**
 * Structured Logger — Runtime-configurable log mode.
 *
 * Rules:
 * - error: Always shown (production + dev) — never suppressed, these are critical
 * - warn: Shown when logMode is enabled OR in __DEV__
 * - info / debug: Only shown when logMode is enabled (regardless of __DEV__)
 *
 * Log mode is toggled via Settings → Developer Tools. Turning on devMode
 * automatically enables logMode, but logMode can be turned off independently.
 */

let _logModeEnabled = __DEV__;

/** Enable or disable verbose logging at runtime */
export function setLogMode(enabled: boolean): void {
    _logModeEnabled = enabled;
}

/** Check if verbose logging is currently enabled */
export function getLogMode(): boolean {
    return _logModeEnabled;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Central log function. Prefer the tagged helpers below. */
export function logger(level: LogLevel, tag: string, message: string, ...args: unknown[]): void {
    const prefix = `[${tag}] ${message}`;
    if (level === 'error') {
        console.error(prefix, ...args);
        return;
    }
    if (!_logModeEnabled) return;
    if (level === 'warn') {
        console.warn(prefix, ...args);
    } else {
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
