/**
 * Compression Queue Manager — Central Video Compression Authority
 *
 * This singleton module owns ALL video compression state in the app.
 * No screen should call compressVideo directly; instead, screens enqueue
 * jobs here and listen for completion events.
 *
 * Architecture:
 * - Jobs are persisted in storage so they survive app restarts
 * - Processing is sequential (one job at a time) to avoid CPU/memory thrashing
 * - Failed jobs retry up to COMPRESSION_MAX_RETRIES times, then show error
 * - Progress callbacks emit real-time state for UI progress bars
 * - Legacy migration: on first init, reads old PENDING_COMPRESSION_KEY entries
 *
 * Events emitted via DeviceEventEmitter:
 * - COMPRESSION_QUEUE_UPDATED: Queue state changed (new job, progress, completion)
 */

import { DeviceEventEmitter } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { logger, getLogMode } from '@/lib/logger';
import type { LogLevel } from '@/lib/logger';
import { storage } from '@/lib/storage';
import { compressVideo } from '@/lib/videoCompressor';
import { CONFIG } from '@/config';
import { generateId } from '@/lib/utils';
import type { CompressionJob, CompressionQueueState, SavedVlog } from '@/types';

/* ── Config ───────────────────────────────────────────────────────────── */

/** Maximum number of compression jobs before we reject enqueuing */
const MAX_QUEUE_SIZE = 50;

/** Maximum retries for a failed compression job */
const COMPRESSION_MAX_RETRIES = 2;

/** Hard timeout: if compression takes longer than 5 minutes, auto-fail */
const COMPRESSION_TIMEOUT_MS = 5 * 60 * 1000;

/** Rate limit between sequential jobs (milliseconds) */
const RATE_LIMIT_MS = 500;

/** AsyncStorage key for persisting the queue */
const STORAGE_KEY = 'COMPRESSION_JOBS_QUEUE';

/** AsyncStorage key for legacy pending compressions (to migrate) */
const LEGACY_KEY = CONFIG.PENDING_COMPRESSION_KEY;

/* ── Event Names ──────────────────────────────────────────────────────── */

/** Emitted whenever the queue state changes */
export const COMPRESSION_QUEUE_EVENT = 'COMPRESSION_QUEUE_UPDATED';

/* ── Queue Manager Class ──────────────────────────────────────────────── */

class CompressionQueueManager {
    private jobs: CompressionJob[] = [];
    private processing = false;
    private initialized = false;
    private updateVlogRef: ((id: string, patch: Partial<SavedVlog>) => Promise<void>) | null = null;

    /** In-flight job timeout timer */
    private timeoutId: ReturnType<typeof setTimeout> | null = null;
    /** Schedule-next timer */
    private scheduleTimeoutId: ReturnType<typeof setTimeout> | null = null;
    /** Currently running job ID (for progress association) */
    private currentJobId: string | null = null;

    /** Internal verbose logger — includes job context and is gated by logMode */
    private log(level: LogLevel, message: string, ...args: unknown[]): void {
        if (level !== 'error' && !getLogMode()) return;
        logger(level, 'CompressionQueue', message, ...args);
    }

    get isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Initialize the queue. Loads persisted jobs and migrates legacy pending queue.
     * Must be called once on app startup.
     */
    async initialize(updateVlog: (id: string, patch: Partial<SavedVlog>) => Promise<void>): Promise<void> {
        this.updateVlogRef = updateVlog;
        this.initialized = true;

        await this.loadQueue();
        await this.migrateLegacyQueue();
        await this.recoverOrphans();

        this.emitState();
        if (this.getPendingJobs().length > 0) {
            this.startProcessing();
        }
    }

    /**
     * Update the vlog update callback when storage context refreshes.
     */
    updateDependencies(updateVlog: (id: string, patch: Partial<SavedVlog>) => Promise<void>): void {
        this.updateVlogRef = updateVlog;
    }

    /** Update a vlog's metadata through the injected callback */
    private async updateVlog(id: string, patch: Partial<SavedVlog>): Promise<void> {
        if (!this.updateVlogRef) {
            this.log('warn', `updateVlog not injected yet, skipping ${id}`);
            return;
        }
        await this.updateVlogRef(id, patch);
    }

    /* ── Public API ────────────────────────────────────────────────── */

    /**
     * Enqueue a vlog for compression.
     * Skips if the vlog is already in the queue.
     */
    async enqueue(vlogId: string, filePath: string, presetId: string): Promise<void> {
        if (presetId === 'off') {
            this.log('info', `Skipping enqueue for ${vlogId} — preset is 'off'`);
            return;
        }

        const alreadyActive = this.jobs.some(
            (j) => j.vlogId === vlogId && j.status !== 'done' && j.status !== 'cancelled',
        );
        if (alreadyActive) {
            this.log('info', `Vlog ${vlogId} already in queue, skipping`);
            return;
        }

        const activeJobs = this.jobs.filter((j) => j.status === 'queued' || j.status === 'processing');
        if (activeJobs.length >= MAX_QUEUE_SIZE) {
            this.log('warn', `Queue at capacity (${MAX_QUEUE_SIZE}), dropping ${vlogId}`);
            return;
        }

        const job: CompressionJob = {
            id: generateId(),
            vlogId,
            filePath,
            presetId,
            status: 'queued',
            progress: 0,
            createdAt: Date.now(),
            retryCount: 0,
        };

        this.jobs.push(job);
        await this.persistQueue();
        this.emitState();
        this.startProcessing();
    }

    /**
     * Cancel a queued job. Active jobs cannot be cancelled because
     * react-native-compressor has no cancellation API.
     */
    async cancelJob(jobId: string): Promise<void> {
        const job = this.jobs.find((j) => j.id === jobId);
        if (!job) return;

        if (job.status === 'processing') {
            this.log('warn', `Cannot cancel active job ${jobId}: compressor has no cancel API`);
            return;
        }

        if (job.status === 'queued') {
            job.status = 'cancelled';
            job.completedAt = Date.now();
            this.log('info', `Cancelled queued job ${jobId}`);
            await this.persistQueue();
            this.emitState();
            this.startProcessing(); // Kick next if needed
        }
    }

    /** Retry a failed job by resetting it to queued */
    async retryJob(jobId: string): Promise<void> {
        const job = this.jobs.find((j) => j.id === jobId);
        if (!job) return;
        if (job.status !== 'failed' && job.status !== 'cancelled') return;

        job.status = 'queued';
        job.progress = 0;
        job.error = undefined;
        job.completedAt = undefined;
        job.retryCount += 1;
        this.log('info', `Retrying job ${jobId} (attempt ${job.retryCount})`);
        await this.persistQueue();
        this.emitState();
        this.startProcessing();
    }

    /** Remove all queued and failed jobs. Keep any active one running. */
    async clearPending(): Promise<void> {
        const before = this.jobs.length;
        this.jobs = this.jobs.filter((j) => j.status === 'processing');
        const removed = before - this.jobs.length;
        if (removed > 0) {
            this.log('info', `Cleared ${removed} pending/failed job(s)`);
            await this.persistQueue();
            this.emitState();
        }
    }

    /** Check if a specific vlog is actively being compressed */
    isVlogActive(vlogId: string): boolean {
        return this.jobs.some((j) => j.vlogId === vlogId && j.status === 'processing');
    }

    /** Check if a specific vlog is waiting in the queue */
    isVlogQueued(vlogId: string): boolean {
        return this.jobs.some((j) => j.vlogId === vlogId && j.status === 'queued');
    }

    /** Check if a specific vlog has any active job (queued or processing) */
    isVlogInQueue(vlogId: string): boolean {
        return this.jobs.some((j) => j.vlogId === vlogId && (j.status === 'queued' || j.status === 'processing'));
    }

    /** Get a specific job by vlog ID */
    getJobForVlog(vlogId: string): CompressionJob | undefined {
        return this.jobs.find((j) => j.vlogId === vlogId && j.status !== 'done' && j.status !== 'cancelled');
    }

    /** Get current queue state for UI display */
    getState(): CompressionQueueState {
        const currentJob = this.jobs.find((j) => j.status === 'processing') || null;
        const pendingJobs = this.getPendingJobs();
        return {
            isProcessing: this.processing,
            currentJob,
            pendingCount: pendingJobs.length,
            jobs: [
                ...this.jobs.filter(
                    (j) =>
                        j.status === 'queued' ||
                        j.status === 'processing' ||
                        j.status === 'failed' ||
                        j.status === 'cancelled',
                ),
            ],
        };
    }

    /** Get currently active or queued job count for quick badge use */
    getActiveCount(): number {
        return this.jobs.filter((j) => j.status === 'queued' || j.status === 'processing').length;
    }

    /** Shut down the queue. Clears timers. Called on app termination (if ever). */
    shutdown(): void {
        this.clearTimeout();
        this.clearSchedule();
        this.processing = false;
        this.currentJobId = null;
        this.initialized = false;
    }

    /* ── Processing Loop ───────────────────────────────────────────── */

    private startProcessing(): void {
        if (this.processing || !this.initialized) return;
        this.processNext();
    }

    private setJobTimeout(job: CompressionJob): void {
        this.clearTimeout();
        this.timeoutId = setTimeout(() => {
            this.log('error', `TIMEOUT: Job ${job.id} exceeded ${COMPRESSION_TIMEOUT_MS}ms`);
            job.status = 'failed';
            job.completedAt = Date.now();
            job.error = `Timed out after ${COMPRESSION_TIMEOUT_MS / 1000 / 60} minutes — compressor hung or device too slow`;
            this.processing = false;
            this.currentJobId = null;
            this.clearTimeout();
            this.persistQueue().then(() => {
                this.emitState();
                this.scheduleNext();
            });
        }, COMPRESSION_TIMEOUT_MS);
    }

    private clearTimeout(): void {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }

    private clearSchedule(): void {
        if (this.scheduleTimeoutId) {
            clearTimeout(this.scheduleTimeoutId);
            this.scheduleTimeoutId = null;
        }
    }

    private async processNext(): Promise<void> {
        if (!this.initialized) return;
        if (this.processing) return;

        await this.cleanupDoneJobs();

        const nextJob = this.getNextJob();
        if (!nextJob) {
            this.processing = false;
            this.currentJobId = null;
            this.emitState();
            return;
        }

        this.processing = true;
        nextJob.status = 'processing';
        nextJob.startedAt = Date.now();
        nextJob.progress = 0;
        this.currentJobId = nextJob.id;
        await this.persistQueue();
        this.emitState();

        this.setJobTimeout(nextJob);

        this.log(
            'info',
            `PROCESSING job ${nextJob.id} — vlog ${nextJob.vlogId}, preset ${nextJob.presetId}, file ${nextJob.filePath}`,
        );

        try {
            this.log('info', `Calling compressVideo for ${nextJob.vlogId} with preset ${nextJob.presetId}`);
            const result = await compressVideo(nextJob.filePath, nextJob.presetId, (progress: number) => {
                // Only update if this job is still the active one
                if (this.currentJobId === nextJob.id && nextJob.status === 'processing') {
                    nextJob.progress = progress;
                    this.emitState();
                }
            });

            this.clearTimeout();
            this.log(
                'info',
                `compressVideo returned for ${nextJob.vlogId}: wasCompressed=${result.wasCompressed}, outputSize=${(result.outputSizeBytes / 1024 / 1024).toFixed(1)} MB, savings=${result.savingsPercent}%`,
            );

            if (this.currentJobId !== nextJob.id || nextJob.status !== 'processing') {
                this.log(
                    'warn',
                    `Job ${nextJob.id} was cancelled or superseded during compression, discarding results`,
                );
                this.processing = false;
                this.currentJobId = null;
                this.scheduleNext();
                return;
            }

            // Update vlog metadata
            if (result.wasCompressed) {
                this.log(
                    'info',
                    `Updating vlog ${nextJob.vlogId} metadata: fileSize=${result.outputSizeBytes}, filePath=${result.outputUri}`,
                );
                await this.updateVlog(nextJob.vlogId, {
                    fileSizeBytes: result.outputSizeBytes,
                    originalFileSizeBytes: result.originalSizeBytes,
                    compressionPreset: nextJob.presetId,
                    compressionPending: false,
                    filePath: result.outputUri,
                });
                this.log('info', `Vlog ${nextJob.vlogId} DB update succeeded`);
                // Only delete the old file after DB update succeeds, so we don't
                // leave the record pointing to a deleted file if the DB fails.
                try {
                    this.log('info', `Deleting old vlog file ${nextJob.filePath}`);
                    await FileSystem.deleteAsync(nextJob.filePath, { idempotent: true });
                    this.log('info', `Old vlog file deleted successfully`);
                } catch (err) {
                    this.log('warn', 'Failed to delete old vlog file:', err);
                }
                // Update job filePath so future retries/inspections point to the new file
                nextJob.filePath = result.outputUri;
            } else {
                this.log('info', `No compression applied for ${nextJob.vlogId}, marking pending=false`);
                // Even if not compressed, mark not pending
                await this.updateVlog(nextJob.vlogId, {
                    compressionPending: false,
                });
            }

            nextJob.status = 'done';
            nextJob.completedAt = Date.now();
            nextJob.progress = 1;
            this.log(
                'info',
                `DONE job ${nextJob.id} — ${result.wasCompressed ? `${result.savingsPercent}% saved` : 'skipped (no savings or module unavailable)'}`,
            );
        } catch (error) {
            this.clearTimeout();
            const errMsg = error instanceof Error ? error.message : 'Unknown compression error';
            this.log('error', `FAILED job ${nextJob.id}: ${errMsg}`, error);

            if (nextJob.retryCount < COMPRESSION_MAX_RETRIES) {
                nextJob.retryCount += 1;
                nextJob.status = 'queued';
                nextJob.progress = 0;
                nextJob.startedAt = undefined;
                nextJob.error = undefined;
                this.log('info', `RETRY job ${nextJob.id} (attempt ${nextJob.retryCount})`);
            } else {
                nextJob.status = 'failed';
                nextJob.completedAt = Date.now();
                nextJob.error = errMsg;
                // Mark not pending so user sees it failed
                await this.updateVlog(nextJob.vlogId, {
                    compressionPending: false,
                });
            }
        }

        this.processing = false;
        this.currentJobId = null;
        await this.persistQueue();
        this.emitState();
        this.scheduleNext();
    }

    private scheduleNext(): void {
        if (!this.initialized) return;
        this.clearSchedule();
        this.scheduleTimeoutId = setTimeout(() => {
            this.scheduleTimeoutId = null;
            this.startProcessing();
        }, RATE_LIMIT_MS);
    }

    /* ── Queue Helpers ─────────────────────────────────────────────── */

    private getPendingJobs(): CompressionJob[] {
        return this.jobs.filter((j) => j.status === 'queued' || j.status === 'processing');
    }

    private getNextJob(): CompressionJob | undefined {
        return this.jobs.find((j) => j.status === 'queued');
    }

    /** Remove done/cancelled jobs older than 5 minutes to prevent bloat */
    private async cleanupDoneJobs(): Promise<void> {
        const cutoff = Date.now() - 5 * 60 * 1000;
        const before = this.jobs.length;
        this.jobs = this.jobs.filter(
            (j) => !((j.status === 'done' || j.status === 'cancelled') && (j.completedAt ?? 0) < cutoff),
        );
        if (this.jobs.length !== before) {
            await this.persistQueue();
        }
    }

    /* ── Persistence ───────────────────────────────────────────────── */

    private async persistQueue(): Promise<void> {
        try {
            const toPersist = this.jobs.filter(
                (j) => j.status === 'queued' || j.status === 'processing' || j.status === 'failed',
            );
            await storage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
        } catch (err) {
            this.log('warn', 'Failed to persist queue:', err);
        }
    }

    private async loadQueue(): Promise<void> {
        try {
            const raw = await storage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as unknown;
            if (!Array.isArray(parsed)) {
                this.jobs = [];
                return;
            }
            const valid: CompressionJob[] = [];
            for (const item of parsed) {
                if (this.isValidJob(item)) {
                    valid.push(item as CompressionJob);
                } else {
                    this.log('warn', 'Skipping malformed job:', item);
                }
            }
            this.jobs = valid;
        } catch (err) {
            this.log('warn', 'Failed to load queue:', err);
            this.jobs = [];
        }
    }

    private isValidJob(item: unknown): boolean {
        if (typeof item !== 'object' || item === null) return false;
        const j = item as Record<string, unknown>;
        return (
            typeof j.id === 'string' &&
            typeof j.vlogId === 'string' &&
            typeof j.filePath === 'string' &&
            typeof j.presetId === 'string' &&
            typeof j.status === 'string' &&
            ['queued', 'processing', 'done', 'failed', 'cancelled'].includes(j.status) &&
            typeof j.progress === 'number' &&
            typeof j.retryCount === 'number' &&
            typeof j.createdAt === 'number'
        );
    }

    /* ── Orphan Recovery ─────────────────────────────────────────────── */

    /**
     * Recover jobs stuck in 'processing' from a previous app crash.
     * Reset them to 'queued' so they are retried.
     */
    private async recoverOrphans(): Promise<void> {
        const orphans = this.jobs.filter((j) => j.status === 'processing');
        for (const job of orphans) {
            job.status = 'queued';
            job.startedAt = undefined;
            job.error = undefined;
            job.progress = 0;
            this.log('info', `Recovered orphan job ${job.id} for vlog ${job.vlogId}`);
        }
        if (orphans.length > 0) {
            await this.persistQueue();
        }
    }

    /* ── Legacy Migration ──────────────────────────────────────────── */

    /**
     * Migrate entries from the old PENDING_COMPRESSION_KEY format into the new queue.
     * Called once on first init. Clears the legacy key after migration.
     */
    private async migrateLegacyQueue(): Promise<void> {
        try {
            const raw = await storage.getItem(LEGACY_KEY);
            if (!raw) return;
            const legacy = JSON.parse(raw) as Array<{
                vlogId?: string;
                inputUri?: string;
                presetId?: string;
                createdAt?: number;
                filePath?: string;
            }>;
            if (!Array.isArray(legacy) || legacy.length === 0) return;

            let migrated = 0;
            for (const entry of legacy) {
                const vlogId = entry.vlogId;
                const filePath = entry.inputUri || entry.filePath;
                const presetId = entry.presetId;
                if (!vlogId || !filePath || !presetId) continue;

                const alreadyActive = this.jobs.some(
                    (j) => j.vlogId === vlogId && j.status !== 'done' && j.status !== 'cancelled',
                );
                if (alreadyActive) continue;

                // Check if file still exists before adding
                const info = await FileSystem.getInfoAsync(filePath);
                if (!info.exists) continue;

                this.jobs.push({
                    id: generateId(),
                    vlogId,
                    filePath,
                    presetId,
                    status: 'queued',
                    progress: 0,
                    createdAt: entry.createdAt ?? Date.now(),
                    retryCount: 0,
                });
                migrated++;
            }

            if (migrated > 0) {
                this.log('info', `Migrated ${migrated} legacy pending compression(s)`);
                await this.persistQueue();
            }

            // Always clear legacy key after migration attempt
            await storage.removeItem(LEGACY_KEY);
        } catch (err) {
            this.log('warn', 'Legacy migration failed:', err);
        }
    }

    /* ── Event Emission ────────────────────────────────────────────── */

    private emitState(): void {
        DeviceEventEmitter.emit(COMPRESSION_QUEUE_EVENT, this.getState());
    }
}

/* ── Singleton Export ───────────────────────────────────────────────────── */

/** The single Compression Queue Manager instance. */
export const compressionQueue = new CompressionQueueManager();
