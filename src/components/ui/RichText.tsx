import React, { useMemo } from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';

interface RichTextProps {
    text: string;
    style?: StyleProp<TextStyle>;
    numberOfLines?: number;
}

/**
 * RichText — Renders markdown-style bold/italic text.
 *
 * Splits text on **bold**, __bold__, *italic*, _italic_ patterns
 * and wraps matches in styled <Text> nodes.
 *
 * Memoized to avoid expensive regex splits on every render,
 * especially important inside NoteCard within FlashList.
 */
export const RichText: React.FC<RichTextProps> = React.memo(({ text, style, numberOfLines }) => {
    /** Memoize the regex split so it only recalculates when text changes */
    const parts = useMemo(
        () => text ? text.split(/(\*\*.*?\*\*|__.*?__|\*.*?\*|_[^_]+?_)/g) : [],
        [text]
    );

    if (!text) return null;

    return (
        <Text style={style} numberOfLines={numberOfLines}>
            {parts.map((part, i) => {
                if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
                    return <Text key={i} style={[{ fontWeight: 'bold' }, style]}>{part.slice(2, -2)}</Text>;
                }
                if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
                    return <Text key={i} style={[{ fontStyle: 'italic' }, style]}>{part.slice(1, -1)}</Text>;
                }
                return <Text key={i} style={style}>{part}</Text>;
            })}
        </Text>
    );
});
