// src/styles/theme.ts
import { CONFIG } from '../config';

export const theme = {
    colors: {
        // AMOLED True Black Background
        background: '#000000',
        backgroundStart: '#000000', // Kept for backwards compatibility with gradient
        backgroundEnd: '#000000',

        // Typography
        textPrimary: '#FFFFFF',
        textSecondary: 'rgba(255, 255, 255, 0.6)',
        textMuted: 'rgba(255, 255, 255, 0.3)',

        // Accents & Actions (True Red)
        primaryAction: '#FF2A2A',
        primaryActionText: '#FFFFFF',
        danger: '#FF2A2A',
        success: '#FFFFFF',

        // Deep Glassmorphism Containers
        glassBackground: 'rgba(255, 255, 255, 0.05)',
        glassBorder: 'rgba(255, 255, 255, 0.1)',
        glassHighlight: 'rgba(255, 255, 255, 0.15)',

        // Legacy fallbacks
        darkGrey: 'rgba(0, 0, 0, 0.3)',
        grey: 'rgba(255, 255, 255, 0.2)',
        lightGrey: 'rgba(255, 255, 255, 0.5)',
        border: 'rgba(255, 255, 255, 0.1)',
    },
    spacing: {
        xs: 4,
        sm: 8,
        md: 16,
        lg: 20,
        xl: 32,
        xxl: 48,
    },
    borderRadius: {
        sm: 12,
        md: 20,
        lg: 32,
        round: 100, // Pill shaped
    },
    typography: {
        fontFamily: 'System', // Will be overridden by user prefs where needed
        weightLight: '300' as const,
        weightRegular: '400' as const,
        weightMedium: '500' as const,
        weightBold: '600' as const,
    }
};
