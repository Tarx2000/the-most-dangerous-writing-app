import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { theme } from '@/styles/theme';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
}

export const EmptyLibraryState: React.FC<Props> = ({ icon, title, description, actionLabel, onAction }) => {
    return (
        <View style={styles.container}>
            <View style={styles.iconContainer}>
                <LinearGradient
                    colors={[theme.colors.dangerFill, 'transparent']}
                    style={StyleSheet.absoluteFillObject}
                />
                <MaterialCommunityIcons name={icon} size={48} color={theme.colors.primaryAction} />
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.description}>{description}</Text>

            {actionLabel && onAction && (
                <AnimatedScaleButton style={styles.actionButton} onPress={onAction}>
                    <Text style={styles.actionButtonText}>{actionLabel}</Text>
                    <MaterialCommunityIcons name="arrow-right" size={16} color={theme.colors.background} />
                </AnimatedScaleButton>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
        marginTop: 60,
        paddingBottom: 80,
    },
    iconContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: theme.colors.glassSurfaceMinimal,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: theme.colors.glassSurfaceMedium,
        overflow: 'hidden',
    },
    title: {
        color: theme.colors.textPrimary,
        fontSize: 22,
        fontWeight: '800',
        marginBottom: 12,
        textAlign: 'center',
        letterSpacing: 0.5,
    },
    description: {
        color: theme.colors.textSecondary,
        fontSize: 15,
        lineHeight: 24,
        textAlign: 'center',
        marginBottom: 32,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.textPrimary,
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 100,
        gap: 8,
        shadowColor: theme.colors.textPrimary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 15,
        elevation: 8,
    },
    actionButtonText: {
        color: theme.colors.background,
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
});
