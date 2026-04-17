/**
 * Theme — Single source of truth for all design tokens.
 *
 * Naming conventions:
 *   danger*      — Opacity ladder from subtle (0.06) to overlay (0.45).
 *                   Order: dangerSubtle → dangerLight → dangerTint → dangerMedium
 *                          → dangerBorderLight → dangerAccent → dangerBorder
 *                          → dangerBorderMedium → dangerBorderStrong → dangerFill
 *                          → dangerFillStrong → dangerOverlayLight → dangerGradientEnd
 *   glass*       — Glassmorphism layers for translucent cards/sheets.
 *                   Use glassBackground for card fills, glassBorder for borders,
 *                   glassSurface/glassSurfaceMedium for nested containers.
 *   surface*    — Solid surfaces for AMOLED: surfaceDark (#0A0A0A) → surfaceLight (#222).
 *                   surfaceRaised (#1A1A1A) for elevated cards.
 *
 * Adding new tokens: append to the appropriate section with the naming pattern above.
 * This is an AMOLED-only theme — no light mode variant exists yet.
 */
import { CONFIG } from '@/config';

export const theme = {
    colors: {
        // AMOLED True Black Background
        background: '#000000',

        // Typography
        textPrimary: '#FFFFFF',
        textSecondary: 'rgba(255, 255, 255, 0.6)',
        textMuted: 'rgba(255, 255, 255, 0.3)',

        // Accents & Actions (True Red)
        primaryAction: '#FF2A2A',
        primaryActionText: '#FFFFFF',
        danger: '#FF2A2A',
        success: '#FFFFFF',

        // Semantic colors
        gold: '#FFD700',
        green: '#4ade80',
        orange: '#FF6B35',

        // Danger variants
        dangerSubtle: 'rgba(255, 42, 42, 0.06)',
        dangerLight: 'rgba(255, 42, 42, 0.08)',
        dangerTint: 'rgba(255, 42, 42, 0.1)',
        dangerMedium: 'rgba(255, 42, 42, 0.1)',
        dangerBorderLight: 'rgba(255, 42, 42, 0.12)',
        dangerAccent: 'rgba(255, 42, 42, 0.15)',
        dangerBorderMedium: 'rgba(255, 42, 42, 0.25)',
        dangerBorder: 'rgba(255, 42, 42, 0.2)',
        dangerBorderStrong: 'rgba(255, 42, 42, 0.3)',
        dangerFill: 'rgba(255, 42, 42, 0.15)',
        dangerFillStrong: 'rgba(255, 42, 42, 0.3)',
        dangerOverlayLight: 'rgba(255, 42, 42, 0.45)',
        dangerGradientEnd: 'rgba(255, 42, 42, 0.45)',

        // Deep Glassmorphism Containers
        glassBackground: 'rgba(255, 255, 255, 0.05)',
        glassBorder: 'rgba(255, 255, 255, 0.1)',
        glassHighlight: 'rgba(255, 255, 255, 0.15)',
        glassSurface: 'rgba(255, 255, 255, 0.06)',
        glassSurfaceMedium: 'rgba(255, 255, 255, 0.08)',
        glassBorderSubtle: 'rgba(255, 255, 255, 0.06)',
        glassBorderMedium: 'rgba(255, 255, 255, 0.12)',

        // Surface colors
        surfaceDark: '#0A0A0A',
        surfaceMedium: '#111',
        surfaceLight: '#222',
        surfaceRaised: '#1A1A1A',

        // Card & Modal containers
        cardBackground: 'rgba(255, 255, 255, 0.06)',
        modalBackground: 'rgba(0, 0, 0, 0.6)',

        // Overlay
        overlayDark: 'rgba(0, 0, 0, 0.4)',
        overlayMedium: 'rgba(0, 0, 0, 0.85)',
        deathOverlay: 'rgba(40, 35, 32, 0.95)',

        // Placeholder
        placeholder: '#555',

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
        weightExtraBold: '800' as const,
        weightBlack: '900' as const,
    },
    animation: {
        springDefault: { damping: 22, stiffness: 220, mass: 0.8 },
        springSnappy: { damping: 30, stiffness: 300, mass: 0.8 },
        springGentle: { damping: 18, stiffness: 180, mass: 0.8 },
        springLight: { damping: 20, stiffness: 200, mass: 0.5 },
    }
};
