/**
 * AI Queue Manager — Central AI Processing Authority
 *
 * This singleton module owns ALL AI processing state in the app.
 * No screen should call aiService directly for background processing.
 * Instead, screens enqueue jobs here and listen for completion events.
 *
 * Architecture:
 * - Jobs are persisted in storage so they survive app restarts
 * - Processing is sequential (one job at a time) with rate limiting
 * - Failed jobs retry up to AI_MAX_RETRIES times, then move to end of queue
 * - Batch processing orders by category: Journals → Circles → Check-ins
 * - Within each category, newest entries are processed first
 *
 * Events emitted via DeviceEventEmitter:
 * - AI_QUEUE_UPDATED: Queue state changed (new job, completion, etc.)
 *
 * Usage:
 *   import { aiQueue } from '@/lib/aiQueue';
 *   aiQueue.initialize(getAiConfig, getNotes, updateNote);
 *   aiQueue.enqueueNote(noteId, 'journal');
 */

import { DeviceEventEmitter, AppState, type NativeEventSubscription } from 'react-native';
import { logger } from '@/lib/logger';
import { storage } from '@/lib/storage';
import { processNote, pingServer, type AiConfig, type RelationshipContext, AiCancelToken } from '@/lib/aiService';
import { logAi } from '@/lib/aiLogger';
import {
    AI_STORAGE_KEYS,
    RATE_LIMIT_DELAY_MS,
    AI_MAX_RETRIES,
    AI_HEALTH_CHECK_INTERVAL_MS,
} from '@/config/ai';
import type { AiJob, AiJobCategory, AiQueueState, SavedNote, Person } from '@/types';
import { isAlignmentReflection } from '@/types';

/* ── Event Names ──────────────────────────────────────────────────────── */

/** Emitted whenever the queue state changes. Listeners get the full AiQueueState. */
export const AI_QUEUE_EVENT = 'AI_QUEUE_UPDATED';

/* ── Config Types ─────────────────────────────────────────────────────── */

/**
 * Callback types the queue needs from the app.
 * These are injected at init so the queue stays decoupled from storage hooks.
 */
type GetAiConfigFn = () => AiConfig;
type GetNoteByIdFn = (noteId: string) => SavedNote | undefined;
type UpdateNoteFn = (noteId: string, updates: Partial<SavedNote>) => Promise<void>;
type GetAllNotesFn = () => SavedNote[];
type GetPersonByIdFn = (personId: string) => Person | undefined;

/* ── Queue Manager Class ──────────────────────────────────────────────── */

class AiQueueManager {
    /** Maximum number of jobs before we reject enqueuing */
    private readonly MAX_QUEUE_SIZE = 1000;

    /** The persisted job queue */
    private jobs: AiJob[] = [];

    /** Whether the processor loop is currently running */
    private processing = false;

    /** Whether a batch cancel has been requested */
    private cancelRequested = false;

    /** Cancel token for the currently in-flight AI request */
    private currentCancelToken: AiCancelToken | null = null;

    /** Whether the queue has been initialized */
    private initialized = false;

    /** Batch metadata (null if processing single jobs) */
    private batchTotal: number | null = null;
    private batchCompleted = 0;

    /** Whether the AI server is online */
    private serverOnline: boolean | null = null;
    /** Last recorded error message when ping fails */
    private lastError?: string;
    /** Health check interval reference */
    private healthCheckInterval: ReturnType<typeof setTimeout> | null = null;
    /** AppState listener subscription — pauses health checks when backgrounded */
    private appStateSubscription: NativeEventSubscription | null = null;

    /** Injected dependencies */
    private getAiConfig: GetAiConfigFn = () => ({});
    private getNoteById: GetNoteByIdFn = () => undefined;
    private updateNote: UpdateNoteFn = async () => { };
    private getAllNotes: GetAllNotesFn = () => [];
    private getPersonById: GetPersonByIdFn = () => undefined;

    /* ── Initialization ────────────────────────────────────────────── */

    /** Check if the queue and health checks have been initialized */
    get isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Initialize the queue manager with app dependencies.
     * Must be called once on app startup (from HomeScreen).
     * Loads persisted queue, recovers orphaned jobs, and auto-starts processing.
     */
    async initialize(
        getAiConfig: GetAiConfigFn,
        getNoteById: GetNoteByIdFn,
        updateNote: UpdateNoteFn,
        getAllNotes: GetAllNotesFn,
        getPersonById?: GetPersonByIdFn
    ): Promise<void> {
        this.getAiConfig = getAiConfig;
        this.getNoteById = getNoteById;
        this.updateNote = updateNote;
        this.getAllNotes = getAllNotes;
        if (getPersonById) this.getPersonById = getPersonById;
        this.initialized = true;

        // Load persisted queue
        await this.loadQueue();

        // Recover orphaned jobs (stuck in 'processing' status from a crash)
        await this.recoverOrphans();


        // Check server status
        await this.checkHealth();

        // Start background health polling (only if there are pending jobs)
        this.startHealthChecks();

        // Listen to app lifecycle — pause health checks when backgrounded
        if (!this.appStateSubscription) {
            this.appStateSubscription = AppState.addEventListener('change', (nextState) => {
                if (nextState === 'active') {
                    // App foregrounded — check immediately and resume polling if needed
                    this.checkHealth();
                    if (this.getPendingJobs().length > 0) {
                        this.startHealthChecks();
                    }
                } else {
                    // App backgrounded — stop polling to save battery
                    this.stopHealthChecks();
                }
            });
        }

        // Auto-start processing if there are queued jobs
        this.emitState();
        if (this.getPendingJobs().length > 0) {
            this.startProcessing();
        }
    }

    /**
     * Perform a health check and update state. Automatically starts processing if it comes back online.
     */
    private async checkHealth(): Promise<void> {
        const wasOffline = this.serverOnline === false;
        const result = await pingServer(this.getAiConfig());

        this.serverOnline = result.online;
        this.lastError = result.error;
        this.emitState();

        if (wasOffline && result.online && this.getPendingJobs().length > 0) {
            this.startProcessing();
        }
    }

    /**
     * Start the health check interval if not already running.
     * Only starts if there are pending jobs (saves battery when idle).
     */
    private startHealthChecks(): void {
        if (!this.healthCheckInterval && this.getPendingJobs().length > 0) {
            this.healthCheckInterval = setInterval(() => this.checkHealth(), AI_HEALTH_CHECK_INTERVAL_MS);
        }
    }

    /**
     * Stop the health check interval.
     * Called when the queue is idle or the app is backgrounded.
     */
    private stopHealthChecks(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    /**
     * Cancel a specific job's in-flight AI request.
     * This aborts the XHR and marks the job as failed.
     * Background processing is intentional — this is for user-initiated cancellation.
     */
    cancelJob(jobId: string): void {
        const job = this.jobs.find(j => j.id === jobId && j.status === 'processing');
        if (!job) {
            logger("warn", "AI Queue", "Cannot cancel job " + jobId + ": not currently processing");
            return;
        }
        // Abort the in-flight XHR request
        if (this.currentCancelToken) {
            this.currentCancelToken.abort();
            this.currentCancelToken = null;
        }
        // Mark job as failed
        job.status = 'failed';
        job.error = 'Cancelled by user';
        job.completedAt = Date.now();
        this.processing = false;
        this.emitState();
    }

    /**
     * Fully shut down the queue manager.
     * Clears the health check interval and removes the AppState listener.
     * Call this when the app is being destroyed or the provider unmounts.
     */
    shutdown(): void {
        this.stopHealthChecks();
        if (this.appStateSubscription) {
            this.appStateSubscription.remove();
            this.appStateSubscription = null;
        }
        // Full state reset for clean re-initialization and test isolation
        this.jobs = [];
        this.processing = false;
        this.cancelRequested = false;
        this.serverOnline = null;
        this.lastError = undefined;
        this.batchTotal = null;
        this.batchCompleted = 0;
        this.initialized = false;
    }

    /**
     * Update dependencies when storage state changes.
     * Called by AiQueueProvider when notes/config update.
     */
    updateDependencies(
        getAiConfig: GetAiConfigFn,
        getNoteById: GetNoteByIdFn,
        updateNote: UpdateNoteFn,
        getAllNotes: GetAllNotesFn,
        getPersonById?: GetPersonByIdFn
    ): void {
        this.getAiConfig = getAiConfig;
        this.getNoteById = getNoteById;
        this.updateNote = updateNote;
        this.getAllNotes = getAllNotes;
        if (getPersonById) this.getPersonById = getPersonById;
    }

    /* ── Public API ────────────────────────────────────────────────── */

    /**
     * Enqueue a single note for AI processing.
     * Skips if the note is already in the queue.
     */
    async enqueueNote(noteId: string, category: AiJobCategory): Promise<void> {
        // Don't add duplicates
        if (this.jobs.some(j => j.noteId === noteId && j.status !== 'done' && j.status !== 'failed')) {
            logger("info", "AI Queue", `Note ${noteId} already in queue, skipping`);
            return;
        }

        const job: AiJob = {
            id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            noteId,
            category,
            status: 'queued',
            createdAt: Date.now(),
            retryCount: 0,
        };

        this.jobs.push(job);
        await this.persistQueue();

        await logAi({
            action: 'enqueue',
            noteId,
            model: this.getAiConfig().model || 'default',
            phase: 'both',
        });

        this.emitState();
        this.startProcessing();
    }

    /**
     * Enqueue a batch of notes for processing.
     * Orders by category (Journals → Circles → Check-ins),
     * and within each category by newest first.
     *
     * @param forceOverwrite - If true, also re-process notes that already have AI data
     * @param categoryFilter - Optional set of categories to include (e.g. only 'journal'). If omitted, all categories are processed.
     */
    async enqueueBatch(forceOverwrite: boolean = false, categoryFilter?: Set<AiJobCategory>): Promise<number> {
        const allNotes = this.getAllNotes();

        // Filter notes that need processing
        const notesToProcess = forceOverwrite
            ? allNotes
            : allNotes.filter(n =>
                !n.aiTitle ||
                (!n.aiSummary || n.aiSummary.length === 0) ||
                !n.aiModelUsed
            );

        if (notesToProcess.length === 0) return 0;

        // Categorize notes and apply optional category filter
        const categorized = notesToProcess
            .map(note => ({
                note,
                category: this.categorizeNote(note),
            }))
            .filter(({ category }) => !categoryFilter || categoryFilter.has(category));

        // Sort: category order (journal → circle → checkin), then newest first within category
        const categoryOrder: AiJobCategory[] = ['journal', 'circle', 'checkin'];
        categorized.sort((a, b) => {
            const catDiff = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
            if (catDiff !== 0) return catDiff;
            return b.note.timestamp - a.note.timestamp; // newest first
        });

        // Enqueue all (skip duplicates)
        let enqueued = 0;
        for (const { note, category } of categorized) {
            if (!this.jobs.some(j => j.noteId === note.id && j.status !== 'done' && j.status !== 'failed')) {
                this.jobs.push({
                    id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    noteId: note.id,
                    category,
                    status: 'queued',
                    createdAt: Date.now(),
                    retryCount: 0,
                });
                enqueued++;
            }
        }

        // Set batch metadata
        this.batchTotal = enqueued;
        this.batchCompleted = 0;
        this.cancelRequested = false;

        await this.persistQueue();
        this.emitState();
        this.startProcessing();

        return enqueued;
    }

    /** Cancel all pending batch jobs. The current job finishes normally. */
    async cancelBatch(): Promise<void> {
        this.cancelRequested = true;

        // Remove all queued jobs
        const cancelledJobs = this.jobs.filter(j => j.status === 'queued');
        this.jobs = this.jobs.filter(j => j.status !== 'queued');

        for (const job of cancelledJobs) {
            await logAi({
                action: 'cancel',
                noteId: job.noteId,
                model: this.getAiConfig().model || 'default',
                phase: 'both',
            });
        }

        if (this.currentCancelToken) {
            this.currentCancelToken.abort();
            this.currentCancelToken = null;
        }
        this.batchCompleted = 0;

        await this.persistQueue();
        this.emitState();
    }

    /** Check if a specific note is actively processing (for pulse animation) */
    isNoteActive(noteId: string): boolean {
        return this.jobs.some(
            j => j.noteId === noteId && j.status === 'processing'
        );
    }

    /** Check if a note is stuck waiting in the queue (for subtle indicator) */
    isNoteQueued(noteId: string): boolean {
        return this.jobs.some(
            j => j.noteId === noteId && j.status === 'queued'
        );
    }

    /** Get the current queue state for UI display */
    getState(): AiQueueState {
        const currentJob = this.jobs.find(j => j.status === 'processing') || null;
        const pendingJobs = this.getPendingJobs();

        return {
            isProcessing: this.processing,
            currentJob,
            pendingCount: pendingJobs.length,
            batchProgress: this.batchTotal !== null
                ? { current: this.batchCompleted, total: this.batchTotal }
                : null,
            currentCategory: currentJob?.category || null,
            serverOnline: this.serverOnline,
            lastError: this.lastError,
            jobs: [...this.jobs.filter(j => j.status === 'queued' || j.status === 'processing')],
        };
    }

    /* ── Processing Loop ───────────────────────────────────────────── */

    /** Start the processing loop if not already running */
    private startProcessing(): void {
        if (this.processing || !this.initialized) return;
        // Set processing flag synchronously BEFORE calling async processNext
        // to prevent overlapping loops from rapid enqueue + health-check calls.
        this.processing = true;
        this.processNext();
    }

    /** Process the next job in the queue */
    private async processNext(): Promise<void> {
        // Check for cancel
        if (this.cancelRequested) {
            this.processing = false;
            this.cancelRequested = false;
            this.emitState();
            return;
        }

        const nextJob = this.getNextJob();
        if (!nextJob) {
            // Queue is empty — stop polling to save battery
            this.processing = false;
            this.batchTotal = null;
            this.batchCompleted = 0;
            this.stopHealthChecks();
            this.emitState();
            return;
        }

        this.processing = true;

        // Check server health before processing
        if (this.serverOnline === false) {
            const result = await pingServer(this.getAiConfig());
            this.serverOnline = result.online;
            this.lastError = result.error;

            if (!result.online) {
                // Server offline — pause processing, will resume when server comes back
                this.processing = false;
                this.emitState();
                return;
            }
        }

        // Mark job as processing
        nextJob.status = 'processing';
        nextJob.startedAt = Date.now();
        await this.persistQueue();
        this.emitState();

        const config = this.getAiConfig();
        const note = this.getNoteById(nextJob.noteId);

        if (!note) {
            // Note was deleted while in queue — skip it
            nextJob.status = 'done';
            nextJob.completedAt = Date.now();
            await this.persistQueue();
            this.scheduleNext();
            return;
        }

        await logAi({
            action: 'start',
            noteId: nextJob.noteId,
            model: config.model || 'default',
            phase: 'both',
        });

        try {
            let relationship: RelationshipContext | undefined = undefined;
            if (nextJob.category === 'circle' && note.personId) {
                const person = this.getPersonById(note.personId);
                relationship = {
                    personName: person?.name || 'this person',
                    relationshipStatus: person?.relationship || 'an unknown person',
                };
            }

            // Create a cancel token for this job's AI request
            this.currentCancelToken = new AiCancelToken();
            const result = await processNote(note.text, config, relationship, this.currentCancelToken);
            this.currentCancelToken = null;

            if (result.failed) {
                throw new Error('AI processing returned empty results');
            }

            // Save results to the note
            await this.updateNote(nextJob.noteId, {
                aiTitle: result.title,
                aiSummary: result.summary,
                aiModelUsed: config.model || 'default',
            });

            // Mark job as done
            nextJob.status = 'done';
            nextJob.completedAt = Date.now();

            const duration = Date.now() - (nextJob.startedAt || Date.now());
            await logAi({
                action: 'success',
                noteId: nextJob.noteId,
                model: config.model || 'default',
                phase: 'both',
                durationMs: duration,
            });

            if (this.batchTotal !== null) {
                this.batchCompleted++;
            }
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : 'Unknown error';
            const duration = Date.now() - (nextJob.startedAt || Date.now());

            await logAi({
                action: 'fail',
                noteId: nextJob.noteId,
                model: config.model || 'default',
                phase: 'both',
                durationMs: duration,
                error: errMsg,
            });

            // If it's a network/timeout error, mark server as offline
            if (errMsg.includes('timeout') || errMsg.includes('Network') || errMsg.includes('fetch')) {
                this.serverOnline = false;
                this.lastError = errMsg;
            }

            if (nextJob.retryCount < AI_MAX_RETRIES) {
                // Retry: move to end of queue
                nextJob.retryCount++;
                nextJob.status = 'queued';
                nextJob.startedAt = undefined;

                await logAi({
                    action: 'retry',
                    noteId: nextJob.noteId,
                    model: config.model || 'default',
                    phase: 'both',
                });

                // Move to end of queue
                this.jobs = this.jobs.filter(j => j.id !== nextJob.id);
                this.jobs.push(nextJob);
            } else {
                // Max retries exceeded — mark as failed and move on
                nextJob.status = 'failed';
                nextJob.completedAt = Date.now();
                nextJob.error = errMsg;
            }
        }

        await this.persistQueue();
        this.emitState();
        this.scheduleNext();
    }

    /** Schedule the next job with rate limiting delay */
    private scheduleNext(): void {
        setTimeout(() => this.processNext(), RATE_LIMIT_DELAY_MS);
    }

    /* ── Queue Helpers ─────────────────────────────────────────────── */

    /** Get jobs that are waiting to be processed */
    private getPendingJobs(): AiJob[] {
        return this.jobs.filter(j => j.status === 'queued');
    }

    /** Get the next job to process (respects category ordering for batches) */
    private getNextJob(): AiJob | undefined {
        return this.jobs.find(j => j.status === 'queued');
    }

    /** Determine the category of a note based on its properties */
    private categorizeNote(note: SavedNote): AiJobCategory {
        if (isAlignmentReflection(note)) return 'checkin';
        if (note.personId) return 'circle';
        return 'journal';
    }

    /* ── Persistence ───────────────────────────────────────────────── */

    /** Save the current queue to storage */
    private async persistQueue(): Promise<void> {
        try {
            // Only persist queued and processing jobs (not done/failed)
            const toPersist = this.jobs.filter(
                j => j.status === 'queued' || j.status === 'processing'
            );
            await storage.setItem(
                AI_STORAGE_KEYS.QUEUE,
                JSON.stringify(toPersist)
            );
        } catch (err) {
            logger("warn", "AI Queue", "Failed to persist queue:", err);
        }
    }

    /** Load the queue from storage */
    private async loadQueue(): Promise<void> {
        try {
            const raw = await storage.getItem(AI_STORAGE_KEYS.QUEUE);
            if (raw) {
                this.jobs = JSON.parse(raw) as AiJob[];
            }
        } catch (err) {
            logger("warn", "AI Queue", "Failed to parse persisted queue, resetting:", err);
            this.jobs = [];
        }
    }

    /* ── Orphan Recovery ───────────────────────────────────────────── */

    /**
     * Recover jobs that were in 'processing' status when the app was killed.
     * These get reset to 'queued' so they are re-processed on next startup.
     */
    private async recoverOrphans(): Promise<void> {
        const orphans = this.jobs.filter(j => j.status === 'processing');
        for (const job of orphans) {
            job.status = 'queued';
            job.startedAt = undefined;

            await logAi({
                action: 'orphan_recovery',
                noteId: job.noteId,
                model: this.getAiConfig().model || 'default',
                phase: 'both',
            });
        }

        if (orphans.length > 0) {
            await this.persistQueue();
            logger("info", "AI Queue", `Recovered ${orphans.length} orphaned job(s)`);
        }
    }

    /* ── Event Emission ────────────────────────────────────────────── */

    /** Emit the current queue state to all listeners */
    private emitState(): void {
        DeviceEventEmitter.emit(AI_QUEUE_EVENT, this.getState());
    }
}

/* ── Singleton Export ──────────────────────────────────────────────────── */

/**
 * The single AI Queue Manager instance.
 * Import this wherever you need to interact with AI processing.
 */
export const aiQueue = new AiQueueManager();

