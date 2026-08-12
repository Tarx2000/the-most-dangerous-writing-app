/**
 * Console Capture — In-memory log buffer for developer tools.
 *
 * Intercepts console.log / warn / error calls and stores the last
 * MAX_CAPTURED_LOGS entries so they can be displayed in the
 * Developer Tools panel alongside the AI processing log.
 *
 * Only active when devMode is enabled to avoid production overhead.
 */
/* eslint-disable no-console */
export interface CapturedLog {
    level: 'log' | 'warn' | 'error' | 'info';
    message: string;
    timestamp: number;
}

const MAX_CAPTURED_LOGS = 300;

let capturedLogs: CapturedLog[] = [];
let isCapturing = false;

/** Original console methods — preserved so we can still print to terminal */
const original = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
};

/** Stringify arguments the same way console.log does */
function stringifyArgs(args: unknown[]): string {
    return args
        .map((a) => {
            if (typeof a === 'string') return a;
            try {
                return JSON.stringify(a);
            } catch {
                return String(a);
            }
        })
        .join(' ');
}

/** Wrap a console method to also push to our buffer */
function wrapMethod(level: CapturedLog['level']) {
    return function (...args: unknown[]) {
        // Always call original first so terminal still gets output
        original[level].apply(console, args as never);

        if (!isCapturing) return;

        const message = stringifyArgs(args);
        capturedLogs.push({ level, message, timestamp: Date.now() });

        // FIFO trim
        if (capturedLogs.length > MAX_CAPTURED_LOGS) {
            capturedLogs = capturedLogs.slice(capturedLogs.length - MAX_CAPTURED_LOGS);
        }
    };
}

/** Start capturing console output */
export function startConsoleCapture(): void {
    if (isCapturing) return;
    isCapturing = true;

    console.log = wrapMethod('log');
    console.warn = wrapMethod('warn');
    console.error = wrapMethod('error');
    console.info = wrapMethod('info');
}

/** Stop capturing and restore original console methods */
export function stopConsoleCapture(): void {
    if (!isCapturing) return;
    isCapturing = false;

    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
    console.info = original.info;
}

/** Get current captured logs (newest last) */
export function getCapturedLogs(): CapturedLog[] {
    return [...capturedLogs];
}

/** Clear the in-memory buffer */
export function clearCapturedLogs(): void {
    capturedLogs = [];
}

/** Check if capture is currently active */
export function getIsCapturing(): boolean {
    return isCapturing;
}
