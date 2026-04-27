/**
 * Alignment Score Details — Single source of truth for score-to-visual mapping.
 *
 * Used by StartScreen, LibraryScreen, and FeedCard.
 * All colors reference theme tokens — consumers that need theme.colors
 * should call the function and spread the result.
 */

import { theme } from '@/styles/theme';

// Alignment score colors as theme tokens for easy reference
export const ALIGNMENT_COLORS = {
    struggling: '#ff4d4d',
    drifting: '#ff9933',
    okay: '#ffcc00',
    good: '#a2ff66',
    great: '#66ffcc',
    aligned: '#00ccff',
} as const;

// Glow variants (semi-transparent versions for shadows/backgrounds)
const ALIGNMENT_GLOWS = {
    struggling: 'rgba(255, 77, 77, 0.3)',
    drifting: 'rgba(255, 153, 51, 0.3)',
    okay: 'rgba(255, 204, 0, 0.3)',
    good: 'rgba(162, 255, 102, 0.3)',
    great: 'rgba(102, 255, 204, 0.3)',
    aligned: 'rgba(0, 204, 255, 0.3)',
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
type AlignmentIcon = typeof ALIGNMENT_ICONS[ScoreTier];

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
