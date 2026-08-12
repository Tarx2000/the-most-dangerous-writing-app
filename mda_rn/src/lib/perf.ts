/**
 * Performance Benchmarking — Dev-mode startup timing.
 *
 * Marks key milestones during app startup and logs the
 * elapsed time between them. Only active when devMode is true
 * (toggled in Developer Tools). All marks are no-ops in production.
 *
 * Usage:
 *   perf.mark('storage.start')
 *   perf.mark('storage.critical')
 *   perf.mark('storage.done')
 *   perf.log()  // prints timing table to console
 *
 * Milestones tracked:
 *   app.entry       → JS bundle loaded, App component mounting
 *   fonts.loaded     → Font assets finished loading
 *   storage.start    → AsyncStorage.multiGet called
 *   storage.critical → Critical data processed, first render possible
 *   storage.deferred → Deferred data (vlogs, AI, feed) processed
 *   storage.done     → loadAllData complete
 */

const marks: Record<string, number> = {};
let enabled = false;

/** Enable or disable perf tracking (called from dev mode toggle) */
export function setPerfEnabled(on: boolean) {
    enabled = on;
    if (on) marks['perf.enabled'] = Date.now();
}

/** Record a milestone timestamp. No-op when disabled. */
export function mark(label: string) {
    if (!enabled) return;
    marks[label] = Date.now();
}

/**
 * Print a timing summary to the console.
 * Shows elapsed time from each mark to the next, and total from first to last.
 * No-op when disabled.
 */
export function log() {
    if (!enabled) return;
    const entries = Object.entries(marks)
        .filter(([k]) => k !== 'perf.enabled')
        .sort(([, a], [, b]) => a - b);

    if (entries.length === 0) return;

    const first = entries[0][1];
    // Intentional performance utility output
    // eslint-disable-next-line no-console
    console.group('[Perf] Startup timing');
    let prev = first;
    for (const [label, ts] of entries) {
        // Intentional performance utility output
        // eslint-disable-next-line no-console
        console.log(`  ${label}: +${ts - first}ms (Δ${ts - prev}ms)`);
        prev = ts;
    }
    // Intentional performance utility output
    // eslint-disable-next-line no-console
    console.log(`  TOTAL: ${prev - first}ms`);
    // Intentional performance utility output
    // eslint-disable-next-line no-console
    console.groupEnd();
}
