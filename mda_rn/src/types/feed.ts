import type { SavedNote } from './note';
import type { SavedVlog } from './vlog';
import type { Person } from './person';

/**
 * FeedItemType — Visual classification of feed entries.
 * - tweet: short text entry (<100 words), shown in full
 * - story: long text entry (≥100 words), shown with preview + "Read more"
 * - clip: video journal entry
 * - checkin: alignment check-in with score
 */
export type FeedItemType = 'tweet' | 'story' | 'clip' | 'checkin';

/**
 * FeedItem — Unified feed entry wrapping all content types.
 * Sorted by timestamp for chronological display.
 */
export interface FeedItem {
    type: FeedItemType;
    timestamp: number;
    /** Text entry (journal, circle, or check-in) */
    note?: SavedNote;
    /** Video journal entry */
    vlog?: SavedVlog;
    /** Person name if this is a circle entry */
    personName?: string;
    /** Person object reference for avatar */
    person?: Person;
}
