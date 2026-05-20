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

export const theme = {
    colors: {
        // AMOLED True Black Background
        background: '#000000',

        // Typography
        textPrimary: '#FFFFFF',
        textSecondary: 'rgba(255, 255, 255, 0.6)',
        textMuted: 'rgba(255, 255, 255, 0.3)',
        textBody: 'rgba(255, 255, 255, 0.85)', // High-readability body text
        textInput: 'rgba(255, 255, 255, 0.9)', // Editable text areas
        textTweet: 'rgba(255, 255, 255, 0.88)', // Tweet-style short entries
        textBodyDim: 'rgba(255, 255, 255, 0.7)', // Dimmed body text (previews)
        textDim: 'rgba(255, 255, 255, 0.4)', // Very dim text (timers, labels)

        // Accents & Actions (True Red)
        primaryAction: '#FF2A2A',
        primaryActionText: '#FFFFFF',
        danger: '#FF2A2A',
        success: '#FFFFFF',

        // Semantic colors
        gold: '#FFD700',
        green: '#4ade80',
        orange: '#FF6B35',
        suggestionError: '#ff6b6b',

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
        dangerPressed: 'rgba(255, 42, 42, 0.7)',

        // Deep Glassmorphism Containers
        glassBackground: 'rgba(255, 255, 255, 0.05)',
        glassBorder: 'rgba(255, 255, 255, 0.1)',
        glassBorderFaint: 'rgba(255, 255, 255, 0.05)', // Ultra-subtle border (0.05 opacity)
        glassHighlight: 'rgba(255, 255, 255, 0.15)',
        glassSurface: 'rgba(255, 255, 255, 0.06)',
        glassSurfaceMedium: 'rgba(255, 255, 255, 0.08)',
        glassSurfaceMinimal: 'rgba(255, 255, 255, 0.03)',
        glassSurfaceSubtle: 'rgba(255, 255, 255, 0.02)',
        glassSurfaceLow: 'rgba(255, 255, 255, 0.04)',
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
        overlayLockAndroid: 'rgba(10, 10, 10, 0.88)',

        // Overlay
        overlayDark: 'rgba(0, 0, 0, 0.4)',
        overlayMedium: 'rgba(0, 0, 0, 0.85)',
        overlayStrong: 'rgba(0, 0, 0, 0.9)',
        overlayVideoMuted: 'rgba(0, 0, 0, 0.6)', // Video mute button background
        overlayVideoStrong: 'rgba(0, 0, 0, 0.7)', // Video duration badge background
        overlaySubtle: 'rgba(0, 0, 0, 0.1)', // Very subtle dark overlay (gradient stops)
        overlayLight: 'rgba(0, 0, 0, 0.2)', // Light dark overlay (gradient stops)
        overlaySoft: 'rgba(0, 0, 0, 0.5)', // Soft dark overlay (gradient midpoints)
        deathOverlay: 'rgba(40, 35, 32, 0.95)',
        overlayPopup: 'rgba(0, 0, 0, 0.92)', // Full-screen popup overlays (streak, etc.)

        // Video / clip accents
        videoAccentTint: 'rgba(255, 107, 53, 0.1)', // Video card avatar background tint
        videoAccentBorder: 'rgba(255, 107, 53, 0.15)', // Video card avatar border
        videoFlashBackground: 'rgba(0, 0, 0, 0.4)', // Play/pause flash icon background

        // Shadows
        shadowDark: '#000000',

        // Navigation bar
        navIconActive: 'rgba(255, 255, 255, 1)',
        navIconInactive: 'rgba(255, 255, 255, 0.35)',
        navPillBackground: 'rgba(5, 5, 5, 0.55)',
        navPillBorder: 'rgba(255, 255, 255, 0.18)',
        navPillShadow: 'rgba(0, 0, 0, 0.9)',
        navIndicatorBackground: 'rgba(255, 255, 255, 0.12)',
        navIndicatorBorder: 'rgba(255, 255, 255, 0.08)',
        navSpecularHighlightStart: 'rgba(255, 255, 255, 0.28)',
        navSpecularHighlightMid: 'rgba(255, 255, 255, 0.04)',

        // Specular borders (used for double-border glassmorphism highlights)
        specularBorderStart: 'rgba(255, 255, 255, 0.3)',
        specularBorderEnd: 'rgba(255, 255, 255, 0.03)',
        specularBorderCardStart: 'rgba(255, 255, 255, 0.25)',

        // Grammar suggestion accents
        suggestionBackground: 'rgba(255, 215, 0, 0.06)',
        suggestionBorder: 'rgba(255, 200, 50, 0.12)',

        // Gold accents (used in dev tools, calendar highlights, etc.)
        goldBackground: 'rgba(255, 215, 0, 0.05)',
        goldBorder: 'rgba(255, 215, 0, 0.3)',
        goldTint: 'rgba(255, 215, 0, 0.15)',
        goldBorderLight: 'rgba(255, 215, 0, 0.08)',

        // Success/green accents
        successFill: 'rgba(74, 222, 128, 0.1)',
        successBorder: 'rgba(74, 222, 128, 0.15)',

        // Surface overlay (semi-transparent dark for cards over video/camera)
        surfaceOverlay: 'rgba(18, 18, 18, 0.85)',
        surfaceOverlayLight: 'rgba(0, 0, 0, 0.2)',

        // Danger overlay for destructive actions (buttons, modals)
        dangerOverlayStrong: 'rgba(255, 100, 100, 0.8)',
        dangerIconOverlay: 'rgba(255, 100, 100, 0.8)', // Alias — icon tint for locked/unsafe states
        dangerFillLight: 'rgba(255, 100, 100, 0.2)',

        // Developer / debug accents
        devBlue: '#3296FF',
        devPurple: '#6464FF',
        devOrange: '#FFA500',

        // Success/green accents (extended)
        successTint: 'rgba(74, 222, 128, 0.1)', // Light green tint (grammar apply btn, etc.)

        // Gold accents (extended)
        goldSubtle: 'rgba(255, 215, 0, 0.08)',
        goldFill: 'rgba(255, 215, 0, 0.15)',
        goldFillMedium: 'rgba(255, 215, 0, 0.2)',

        // Orange accents (extended)
        orangeFill: 'rgba(255, 165, 0, 0.15)',

        // Info / semantic category fills
        infoFill: 'rgba(50, 150, 255, 0.15)',
        purpleFill: 'rgba(100, 100, 255, 0.15)',

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
        springDefault: { damping: 30, stiffness: 200, mass: 0.8 },
        springSnappy: { damping: 35, stiffness: 250, mass: 0.8 },
        springGentle: { damping: 26, stiffness: 120, mass: 0.8 },
        springLight: { damping: 28, stiffness: 150, mass: 0.5 },
        springFeed: { damping: 32, stiffness: 160, mass: 0.9 },
    },
};
