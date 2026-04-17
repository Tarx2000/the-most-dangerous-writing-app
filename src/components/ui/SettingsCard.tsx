import React from 'react';
import { View, StyleSheet } from 'react-native';
import { theme } from '@/styles/theme';

interface SettingsCardProps {
    children: React.ReactNode;
    /** When true, adds a subtle gold border tint (e.g. dev mode active) */
    active?: boolean;
}

export const SettingsCard: React.FC<SettingsCardProps> = React.memo(({ children, active }) => (
    <View style={[styles.card, active && styles.cardActive]}>
        {children}
    </View>
));

const styles = StyleSheet.create({
    card: {
        backgroundColor: theme.colors.glassBackground,
        borderRadius: theme.borderRadius.md,
        padding: 20,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        marginTop: 10,
    },
    cardActive: {
        borderColor: theme.colors.gold,
        borderWidth: 2,
    },
});