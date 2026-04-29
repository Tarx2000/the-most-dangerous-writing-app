import { Platform } from 'react-native';

export const APP_VERSION = "1.5.7";

export const VERSION_HISTORY = [
    { version: 'v1.3.0', changes: ['True Black UI Overhaul: Library redesigned with native swipe-to-dismiss presentation style', 'Check-in Improvements: Fixed layout scaling, added urgent 7-day reflection glow reminder', 'Circles Refactor: Premium full-screen modal with interactive person search', 'Bug Fixes: Fixed Android keyboard padding constraints across application'] },
    { version: 'v1.2.0', changes: ['Performance optimizations: Removed input lag, upgraded to 60fps Reanimated UI, and implemented virtualized FlashLists'] },
    { version: 'v1.1.0', changes: ['Vlog Recording: Front camera video journal entries with compression', 'Video auto-play: Viewport-driven playback with manual pause override', 'Settings: Vlog quality and compression presets'] },
    { version: 'v1.0.0', changes: ['Circles: Relationship journal — link writing sessions to people', 'Library tabs: Notes & Circles views with person search', 'Mode toggle on start screen: Journal (default) vs Circles'] },
    { version: 'v0.9.0', changes: ['Writing UX: Fixed Android keyboard text-hiding bug via ScrollView wrapper', 'Fixed subpixel text-jumping layout thrashing by detaching danger border from flow', 'Added customizable Settings Menu (Font Size & Type)'] },
    { version: 'v0.8.0', changes: ['Complete mobile UX overhaul: Swipeable selectors for time and difficulty', 'Massive centralized WRITE button', 'Added explicit button to dismiss Game Over screen and resume typing'] },
    { version: 'v0.7.0', changes: ['Reverted to classic mobile-first styling', 'Added persistent floating button to Save & Home after losing', 'Polished UX for mobile devices'] },
];

export const CONFIG = {
    DIFFICULTIES: [
        { label: 'EASY', value: 12000, desc: '12s Idle Limit' },
        { label: 'MID', value: 8000, desc: '8s Idle Limit' },
        { label: 'HARD', value: 5000, desc: '5s Idle Limit' }
    ],
    BLUR_RATIO_START: 0.5,
    TICK_RATE_MS: 100,
    SESSION_OPTIONS_MINS: [3, 5, 10, 15, 30, 60],
    SAFE_BORDER_COLOR: 'rgba(50, 50, 50, 1)',
    DANGER_COLOR_RGB: { r: 255, g: 77, b: 77 },
    DANGER_COLOR_RGB_STR: '#ff4d4d',
    BACKGROUND_COLOR: '#000000',
    TEXT_COLOR: '#F3F4F6',
    FONTS: [
        { label: 'System (Sans)', value: Platform.OS === 'ios' ? 'System' : 'sans-serif' },
        { label: 'Serif (Classic)', value: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
        { label: 'Casual (Fun)', value: Platform.OS === 'ios' ? 'Chalkboard SE' : 'casual' },
        { label: 'Playfair Display', value: 'PlayfairDisplay_400Regular' },
        { label: 'Space Mono', value: 'SpaceMono_400Regular' },
        { label: 'Caveat', value: 'Caveat_400Regular' },
        { label: 'Lora', value: 'Lora_400Regular' },
        { label: 'Zilla Slab', value: 'ZillaSlab_400Regular' },
        { label: 'Crimson Pro', value: 'CrimsonPro_400Regular' },
        { label: 'DM Sans', value: 'DMSans_400Regular' },
        { label: 'Eagle Lake', value: 'EagleLake_400Regular' },
    ],
    SIZES: [
        { label: 'Small', value: 14, line: 22 },
        { label: 'Normal', value: 18, line: 28 },
        { label: 'Large', value: 24, line: 36 },
        { label: 'Giant', value: 32, line: 48 },
    ],

    /* ── Vlog Recording Settings ─────────────────────────────────────── */
    /** Shorter timer options for vlogs (in minutes) — video files are much larger than text */
    VLOG_SESSION_OPTIONS_MINS: [1, 2, 3, 5, 10, 15],
    /** Video quality for recording — '1080p' is the data-saver sweet spot */
    VLOG_VIDEO_QUALITY: '1080p' as const,
    /** Private subdirectory in documentDirectory for storing vlog files */
    VLOG_STORAGE_DIR: 'vlogs/',

    /* ── Compression Settings ─────────────────────────────────────────── */
    /**
     * CONFIGURABLE: Compression presets for post-recording video optimization.
     *
     * Each preset defines:
     * - maxSize: Maximum resolution boundary (0 = skip compression)
     * - bitrate: Target bitrate in bps for the compressor
     *
     * 'balanced' is the default — ~60% file size reduction with great quality.
     */
    VLOG_COMPRESSION_PRESETS: [
        { id: 'off', label: 'Off (Raw)', desc: 'No compression — largest files, original quality', maxSize: 0, bitrate: 0 },
        { id: 'light', label: 'Light', desc: '~40% smaller, virtually identical quality', maxSize: 1920, bitrate: 4_000_000 },
        { id: 'balanced', label: 'Balanced', desc: '~60% smaller, great quality (recommended)', maxSize: 1080, bitrate: 2_500_000 },
        { id: 'max', label: 'Maximum Savings', desc: '~80% smaller, good quality, smaller resolution', maxSize: 720, bitrate: 1_200_000 },
    ] as const,

    /**
     * CONFIGURABLE: Smart bitrate mapping per recording quality.
     * Replaces the old hardcoded 6Mbps — each quality level gets an
     * appropriate capture bitrate that balances quality and raw file size.
     */
    VLOG_BITRATE_MAP: {
        '720p': 2_500_000,
        '1080p': 4_500_000,
        '2160p': 12_000_000,
    } as Record<string, number>,

    /** AsyncStorage key for tracking pending (interrupted) compressions */
    PENDING_COMPRESSION_KEY: 'PENDING_COMPRESSIONS',

    /** AsyncStorage key for storing the fallback 4-digit security PIN */
    SECURITY_PIN_KEY: '@mda_security_pin',

    /* ── PIN Rate Limiting ─────────────────────────────────────────────── */
    /** AsyncStorage key for tracking consecutive failed PIN attempts */
    PIN_ATTEMPT_COUNT_KEY: '@mda_pin_attempt_count',
    /** AsyncStorage key for storing the timestamp when PIN lockout expires */
    PIN_LOCKOUT_UNTIL_KEY: '@mda_pin_lockout_until',
    /** Number of failed PIN attempts before triggering a lockout */
    PIN_MAX_ATTEMPTS: 3,
    /** Lockout duration in milliseconds after max failed attempts */
    PIN_LOCKOUT_DURATION_MS: 30_000,

    /* ── Check-in urgency ────────────────────────────────────────────── */
    /** Days before a check-in is flagged as urgent in the UI */
    CHECKIN_URGENT_DAYS: 7,
    /** Milliseconds equivalent of CHECKIN_URGENT_DAYS */
    CHECKIN_URGENT_MS: 7 * 24 * 60 * 60 * 1000,

    /* ── Dev Mode ────────────────────────────────────────────────────── */
    /** Milliseconds to long-press the settings button to toggle dev mode */
    DEV_MODE_LONG_PRESS_MS: 5_000,
    /** Milliseconds to show the dev mode toast notification */
    DEV_MODE_TOAST_DURATION_MS: 2_000,

    /* ── Pin Pad ─────────────────────────────────────────────────────── */
    /** Milliseconds to delay before processing a completed 4-digit PIN */
    PIN_DOT_DELAY_MS: 150,

    /* ── Permission & Countdown Delays ───────────────────────────────── */
    /** Milliseconds to wait after camera permission is granted before starting countdown */
    PERMISSION_GRANTED_DELAY_MS: 500,
    /** Milliseconds interval for the 3-2-1 countdown ticks */
    COUNTDOWN_INTERVAL_MS: 1_000,

    /* ── Startup Compression Delay ───────────────────────────────────── */
    /** Milliseconds to wait on app startup before checking for pending vlog compressions */
    PENDING_COMPRESSION_DELAY_MS: 2_000,
};
