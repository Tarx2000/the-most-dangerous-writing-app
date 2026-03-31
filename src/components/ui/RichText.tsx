import React from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';

interface RichTextProps {
    text: string;
    style?: StyleProp<TextStyle>;
    numberOfLines?: number;
}

export const RichText: React.FC<RichTextProps> = ({ text, style, numberOfLines }) => {
    if (!text) return null;
    
    // Split by **bold**, __bold__, *italic*, _italic_
    const parts = text.split(/(\*\*.*?\*\*|__.*?__|\*.*?\*|_[^_]+?_)/g);
    
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
};
