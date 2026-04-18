import { Vibration } from 'react-native';

const originalVibrate = Vibration.vibrate;
let _hapticsEnabled = true;

/**
 * Globally monkey-patches React Native's Vibration module
 * to respect the user's global haptics preference.
 */
export const initHapticsMiddleware = () => {
    Vibration.vibrate = (pattern?: number | number[] | null, repeat?: boolean) => {
        if (!_hapticsEnabled) return;
        
        if (pattern === undefined || pattern === null) {
            originalVibrate();
        } else {
            originalVibrate(pattern, repeat);
        }
    };
};

/**
 * Toggles whether vibrations are allowed to proceed.
 */
export const setGlobalHapticsEnabled = (enabled: boolean) => {
    _hapticsEnabled = enabled;
};
