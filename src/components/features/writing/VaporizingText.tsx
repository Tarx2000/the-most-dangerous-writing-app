import React, { useMemo } from 'react';
import { Text, StyleProp, TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, SharedValue } from 'react-native-reanimated';

/* ── CONFIGURATION VARIABLES ────────────────────────────────────────────────── */

/** Number of words from the end of the text that will undergo vaporization */
const WORDS_TO_VAPORIZE = 8;

/** The minimum opacity a word will decay to (e.g. 0.3 = 30% visibility) */
const MIN_OPACITY = 0.3;

/** The idle ratio (0.0 to 1.0) when the last word (index 0) starts to fade */
const FADE_START_RATIO_BASE = 0.3;

/** The idle ratio (0.0 to 1.0) when the last word (index 0) is fully faded */
const FADE_END_RATIO_BASE = 0.5;

/** Stagger step in idle ratio between successive words (moving backward) */
const STAGGER_STEP = 0.05;

/** Maximum ratio at which a fade start can be clamped */
const MAX_START_RATIO = 0.85;

/** Maximum ratio at which a fade end can be clamped */
const MAX_END_RATIO = 0.95;

/* ── COMPONENT ────────────────────────────────────────────────────────────── */

interface WordProps {
    word: string;
    index: number; // Stagger index: 0 is the last word, 1 is the 2nd-to-last, etc.
    idleTimeMsShared: SharedValue<number>;
    difficultyLimit: number;
}

/**
 * VaporizingWord — Renders a single word that decays in opacity on the UI thread.
 *
 * Utilizes Reanimated `useAnimatedStyle` to interpolate the word's opacity
 * based on the elapsed idle ratio. This avoids JavaScript thread blockages
 * and ensures fluid 60fps animations.
 */
const VaporizingWord: React.FC<WordProps> = React.memo(({ word, index, idleTimeMsShared, difficultyLimit }) => {
    const animatedStyle = useAnimatedStyle(() => {
        // Calculate the ratio of current idle time to the limit
        const ratio = difficultyLimit > 0 ? idleTimeMsShared.value / difficultyLimit : 0;

        // Apply staggered thresholds based on how far back the word is
        const start_r = Math.min(MAX_START_RATIO, FADE_START_RATIO_BASE + index * STAGGER_STEP);
        const end_r = Math.min(MAX_END_RATIO, FADE_END_RATIO_BASE + index * STAGGER_STEP);

        let opacity = 1.0;
        if (ratio > start_r) {
            if (ratio >= end_r) {
                opacity = MIN_OPACITY;
            } else {
                // Interpolate opacity between 1.0 and MIN_OPACITY
                const progress = (ratio - start_r) / (end_r - start_r);
                opacity = 1.0 - progress * (1.0 - MIN_OPACITY);
            }
        }

        return { opacity };
    });

    return <Animated.Text style={animatedStyle}>{word}</Animated.Text>;
});

interface VaporizingTextProps {
    text: string;
    idleTimeMsShared: SharedValue<number>;
    difficultyLimit: number;
    style?: StyleProp<TextStyle>;
}

/**
 * VaporizingText — Renders the text with word-by-word opacity decay.
 *
 * To match the layout of the standard TextInput, this component splits the text
 * while preserving all whitespaces, newlines, and layout markers. It filters
 * words to apply staggered opacity animations to the last `WORDS_TO_VAPORIZE`
 * words.
 *
 * Preserves standard React Native Text wrapping rules by nesting all token nodes
 * inside a single parent <Text> container.
 */
export const VaporizingText: React.FC<VaporizingTextProps> = React.memo(
    ({ text, idleTimeMsShared, difficultyLimit, style }) => {
        // Split the text into tokens of word vs whitespace, capturing spaces and newlines
        const tokens = useMemo(() => {
            if (!text) return [];
            return text.split(/(\s+)/);
        }, [text]);

        // Find the token array indices of all words (non-whitespace items)
        const wordIndices = useMemo(() => {
            const indices: number[] = [];
            tokens.forEach((token, index) => {
                if (token && /\S/.test(token)) {
                    indices.push(index);
                }
            });
            return indices;
        }, [tokens]);

        return (
            <Text style={style}>
                {tokens.map((token, i) => {
                    const wordIdx = wordIndices.indexOf(i);

                    // If it is a word token, determine if it falls under the vaporization threshold
                    if (wordIdx !== -1) {
                        const indexFromEnd = wordIndices.length - 1 - wordIdx;
                        if (indexFromEnd < WORDS_TO_VAPORIZE) {
                            return (
                                <VaporizingWord
                                    key={i}
                                    word={token}
                                    index={indexFromEnd}
                                    idleTimeMsShared={idleTimeMsShared}
                                    difficultyLimit={difficultyLimit}
                                />
                            );
                        }
                    }

                    // Otherwise, render it as standard static text
                    return <Text key={i}>{token}</Text>;
                })}
            </Text>
        );
    },
);
