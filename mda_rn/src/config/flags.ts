export interface FeatureFlags {
    ENABLE_TWEET_IN_JOURNAL_MODE: boolean;
    ENABLE_TWEET_IN_CIRCLE_MODE: boolean;
    ENABLE_TWEET_FILTER_IN_FEED: boolean;
    ENABLE_CIRCLE_TWEET_FEED: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
    ENABLE_TWEET_IN_JOURNAL_MODE: true,
    ENABLE_TWEET_IN_CIRCLE_MODE: true,
    ENABLE_TWEET_FILTER_IN_FEED: true,
    ENABLE_CIRCLE_TWEET_FEED: true,
};

export const FEATURE_FLAG_STORAGE_KEY = 'FEATURE_FLAGS';

export const FEATURE_FLAG_METADATA: Record<keyof FeatureFlags, { label: string; description: string }> = {
    ENABLE_TWEET_IN_JOURNAL_MODE: {
        label: 'Journal Tweets',
        description: 'Show Tweet button in Journal mode on the Start screen',
    },
    ENABLE_TWEET_IN_CIRCLE_MODE: {
        label: 'Circle Tweets',
        description: 'Show Tweet button (replaces Quick Note) in Circle mode',
    },
    ENABLE_TWEET_FILTER_IN_FEED: {
        label: 'Feed Tweet Filter',
        description: 'Show checkbox filters for tweet/journal/vlog types in Feed',
    },
    ENABLE_CIRCLE_TWEET_FEED: {
        label: 'Circle Tweet Feed',
        description: 'Show tweet micro-feed per person in Circle library view',
    },
};
