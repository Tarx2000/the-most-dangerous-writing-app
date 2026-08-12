export const TWEET_THRESHOLD = 45;

export function isTweet(wordCount: number): boolean {
    return wordCount <= TWEET_THRESHOLD;
}
