import {
    getAlignmentScoreDetails,
    getAlignmentScoreColor,
    getAlignmentScoreFeed,
    ALIGNMENT_COLORS,
} from '@/lib/alignmentScores';

describe('alignmentScores', () => {
    describe('getAlignmentScoreDetails', () => {
        it('returns all fields for each tier', () => {
            const result = getAlignmentScoreDetails(1);
            expect(result).toHaveProperty('icon');
            expect(result).toHaveProperty('text');
            expect(result).toHaveProperty('color');
            expect(result).toHaveProperty('glow');
            expect(result).toHaveProperty('emoji');
            expect(result).toHaveProperty('label');
        });

        it('maps score 0-2 to "struggling" tier', () => {
            const s0 = getAlignmentScoreDetails(0);
            const s1 = getAlignmentScoreDetails(1);
            const s2 = getAlignmentScoreDetails(2);

            expect(s0.text).toBe('struggling');
            expect(s1.text).toBe('struggling');
            expect(s2.text).toBe('struggling');
            expect(s0.icon).toBe('emoticon-dead-outline');
            expect(s0.emoji).toBe('😵');
            expect(s0.color).toBe(ALIGNMENT_COLORS.struggling);
        });

        it('maps score 3-4 to "drifting" tier', () => {
            const s3 = getAlignmentScoreDetails(3);
            const s4 = getAlignmentScoreDetails(4);

            expect(s3.text).toBe('drifting');
            expect(s4.text).toBe('drifting');
            expect(s3.icon).toBe('emoticon-confused-outline');
            expect(s3.color).toBe(ALIGNMENT_COLORS.drifting);
        });

        it('maps score 5 to "okay" tier', () => {
            const result = getAlignmentScoreDetails(5);
            expect(result.text).toBe('okay');
            expect(result.icon).toBe('emoticon-neutral-outline');
            expect(result.color).toBe(ALIGNMENT_COLORS.okay);
        });

        it('maps score 6-7 to "good" tier', () => {
            const s6 = getAlignmentScoreDetails(6);
            const s7 = getAlignmentScoreDetails(7);

            expect(s6.text).toBe('good');
            expect(s7.text).toBe('good');
            expect(s6.icon).toBe('emoticon-happy-outline');
            expect(s6.color).toBe(ALIGNMENT_COLORS.good);
        });

        it('maps score 8-9 to "great" tier', () => {
            const s8 = getAlignmentScoreDetails(8);
            const s9 = getAlignmentScoreDetails(9);

            expect(s8.text).toBe('great');
            expect(s9.text).toBe('great');
            expect(s8.icon).toBe('emoticon-excited-outline');
            expect(s8.color).toBe(ALIGNMENT_COLORS.great);
        });

        it('maps score 10 to "aligned" tier', () => {
            const result = getAlignmentScoreDetails(10);
            expect(result.text).toBe('perfectly aligned');
            expect(result.icon).toBe('emoticon-cool-outline');
            expect(result.color).toBe(ALIGNMENT_COLORS.aligned);
        });

        it('clamps scores above 10 to "aligned"', () => {
            const result = getAlignmentScoreDetails(15);
            expect(result.text).toBe('perfectly aligned');
            expect(result.color).toBe(ALIGNMENT_COLORS.aligned);
        });

        it('clamps negative scores to "struggling"', () => {
            const result = getAlignmentScoreDetails(-1);
            expect(result.text).toBe('struggling');
            expect(result.color).toBe(ALIGNMENT_COLORS.struggling);
        });

        it('includes glow property with rgba format', () => {
            const result = getAlignmentScoreDetails(5);
            expect(result.glow).toMatch(/^rgba\(/);
        });

        it('all tiers produce consistent color mapping', () => {
            const tiers = [1, 3, 5, 7, 9, 10];
            const colors = tiers.map(s => getAlignmentScoreDetails(s).color);
            // All colors should be unique
            expect(new Set(colors).size).toBe(6);
        });
    });

    describe('getAlignmentScoreColor', () => {
        it('returns icon and color only', () => {
            const result = getAlignmentScoreColor(5);
            expect(Object.keys(result)).toEqual(['icon', 'color']);
            expect(result.icon).toBe('emoticon-neutral-outline');
            expect(result.color).toBe(ALIGNMENT_COLORS.okay);
        });

        it('matches color from full details', () => {
            for (const score of [1, 3, 5, 7, 9, 10]) {
                expect(getAlignmentScoreColor(score).color).toBe(
                    getAlignmentScoreDetails(score).color
                );
            }
        });
    });

    describe('getAlignmentScoreFeed', () => {
        it('returns emoji, color, and label', () => {
            const result = getAlignmentScoreFeed(1);
            expect(Object.keys(result)).toEqual(['emoji', 'color', 'label']);
            expect(result.emoji).toBe('😵');
            expect(result.label).toBe('Struggling');
        });

        it('label uses capitalized form (not lowercase text)', () => {
            const details = getAlignmentScoreDetails(5);
            const feed = getAlignmentScoreFeed(5);
            // label is "Okay" (capitalized), text is "okay" (lowercase)
            expect(feed.label).toBe('Okay');
            expect(details.text).toBe('okay');
        });

        it('matches color from full details', () => {
            for (const score of [1, 3, 5, 7, 9, 10]) {
                expect(getAlignmentScoreFeed(score).color).toBe(
                    getAlignmentScoreDetails(score).color
                );
            }
        });
    });
});