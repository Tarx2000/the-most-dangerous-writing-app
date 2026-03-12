import { Platform } from 'react-native';

export const APP_VERSION = "1.2";

export const VERSION_HISTORY = [
    { version: 'v1.2.0', changes: ['Performance optimizations: Removed input lag, upgraded to 60fps Reanimated UI, and implemented virtualized FlashLists'] },
    { version: 'v6.0.0', changes: ['Circles: Relationship journal — link writing sessions to people', 'Library tabs: Notes & Circles views with person search', 'Mode toggle on start screen: Journal (default) vs Circles'] },
    { version: 'v5.0.0', changes: ['V6 Writing UX: Fixed Android keyboard text-hiding bug via ScrollView wrapper', 'Fixed subpixel text-jumping layout thrashing by detaching danger border from flow', 'Added customizable Settings Menu (Font Size & Type)'] },
    { version: 'v4.0.0', changes: ['Complete mobile UX overhaul: Swipeable selectors for time and difficulty', 'Massive centralized WRITE button', 'Added explicit button to dismiss Game Over screen and resume typing'] },
    { version: 'v3.0.0', changes: ['Reverted to classic mobile-first styling', 'Added persistent floating button to Save & Home after losing', 'Polished UX for mobile devices'] },
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
        { label: 'Mono (Code)', value: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
        { label: 'Casual (Fun)', value: Platform.OS === 'ios' ? 'Chalkboard SE' : 'casual' },
    ],
    SIZES: [
        { label: 'Small', value: 14, line: 22 },
        { label: 'Normal', value: 18, line: 28 },
        { label: 'Large', value: 24, line: 36 },
        { label: 'Giant', value: 32, line: 48 },
    ]
};
