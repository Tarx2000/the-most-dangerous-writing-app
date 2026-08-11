/**
 * Alignment Score Details — Single source of truth for score-to-visual mapping.
 *
 * Used by StartScreen, LibraryScreen, and FeedCard.
 * All colors reference theme tokens — consumers that need theme.colors
 * should call the function and spread the result.
 */

import { theme } from '@/styles/theme';

export const ALIGNMENT_COLORS = {
    struggling: theme.colors.alignmentStruggling,
    drifting: theme.colors.alignmentDrifting,
    okay: theme.colors.alignmentOkay,
    good: theme.colors.alignmentGood,
    great: theme.colors.alignmentGreat,
    aligned: theme.colors.alignmentAligned,
} as const;

// Glow variants (semi-transparent versions for shadows/backgrounds)
const ALIGNMENT_GLOWS = {
    struggling: theme.colors.alignmentGlowStruggling,
    drifting: theme.colors.alignmentGlowDrifting,
    okay: theme.colors.alignmentGlowOkay,
    good: theme.colors.alignmentGlowGood,
    great: theme.colors.alignmentGlowGreat,
    aligned: theme.colors.alignmentGlowAligned,
} as const;

// MaterialCommunityIcons names for each tier
const ALIGNMENT_ICONS = {
    struggling: 'emoticon-dead-outline',
    drifting: 'emoticon-confused-outline',
    okay: 'emoticon-neutral-outline',
    good: 'emoticon-happy-outline',
    great: 'emoticon-excited-outline',
    aligned: 'emoticon-cool-outline',
} as const;

// Emoji + label for FeedCard-style display
const ALIGNMENT_EMOJIS = {
    struggling: '😵',
    drifting: '😕',
    okay: '😐',
    good: '😊',
    great: '😄',
    aligned: '😎',
} as const;

const ALIGNMENT_LABELS = {
    struggling: 'Struggling',
    drifting: 'Drifting',
    okay: 'Okay',
    good: 'Good',
    great: 'Great',
    aligned: 'Aligned',
} as const;

const ALIGNMENT_TEXT_LOWER = {
    struggling: 'struggling',
    drifting: 'drifting',
    okay: 'okay',
    good: 'good',
    great: 'great',
    aligned: 'perfectly aligned',
} as const;

type ScoreTier = keyof typeof ALIGNMENT_COLORS;
type AlignmentIcon = (typeof ALIGNMENT_ICONS)[ScoreTier];

function getTier(score: number): ScoreTier {
    if (score <= 2) return 'struggling';
    if (score <= 4) return 'drifting';
    if (score === 5) return 'okay';
    if (score <= 7) return 'good';
    if (score <= 9) return 'great';
    return 'aligned';
}

/** Full score details — icon, text, color, glow (used by StartScreen) */
export interface AlignmentScoreDetails {
    icon: AlignmentIcon;
    text: string;
    color: string;
    glow: string;
    emoji: string;
    label: string;
}

export function getAlignmentScoreDetails(score: number): AlignmentScoreDetails {
    const tier = getTier(score);
    return {
        icon: ALIGNMENT_ICONS[tier],
        text: ALIGNMENT_TEXT_LOWER[tier],
        color: ALIGNMENT_COLORS[tier],
        glow: ALIGNMENT_GLOWS[tier],
        emoji: ALIGNMENT_EMOJIS[tier],
        label: ALIGNMENT_LABELS[tier],
    };
}

/** Minimal score details — icon + color only (used by LibraryScreen) */
export function getAlignmentScoreColor(score: number): { icon: AlignmentIcon; color: string } {
    const tier = getTier(score);
    return { icon: ALIGNMENT_ICONS[tier], color: ALIGNMENT_COLORS[tier] };
}

/** Feed-style score details — emoji + color + label (used by FeedCard) */
export function getAlignmentScoreFeed(score: number): { emoji: string; color: string; label: string } {
    const tier = getTier(score);
    return { emoji: ALIGNMENT_EMOJIS[tier], color: ALIGNMENT_COLORS[tier], label: ALIGNMENT_LABELS[tier] };
}
