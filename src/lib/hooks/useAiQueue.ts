/**
 * DEPRECATED — This file is kept as a re-export to prevent import errors in
 * external consumers while they migrate to `useAiQueueContext()`.
 *
 * All new code MUST use `useAiQueueContext()` from `@/lib/hooks/useAiQueueProvider`.
 * The legacy logic (duplicate DeviceEventEmitter subscriptions, stale deps, etc.)
 * has been removed.
 */

export { useAiQueueContext as useAiQueue } from './useAiQueueProvider';
