import { Vibration } from 'react-native';

let _hapticsEnabled = true;

/**
 * Vibrates the device with the given pattern, respecting the user's global
 * haptics preference. Use this instead of Vibration.vibrate() directly.
 *
 * @param pattern - Duration in ms, or array of [vibrate, pause, ...] intervals
 * @param repeat  - Whether to repeat the pattern indefinitely
 */
export function vibrate(pattern?: number | number[] | null, repeat?: boolean): void {
    if (!_hapticsEnabled) return;
    if (pattern === undefined || pattern === null) {
        Vibration.vibrate();
    } else {
        Vibration.vibrate(pattern, repeat);
    }
}

/**
 * Cancels any ongoing vibration.
 */
export function cancel(): void {
    Vibration.cancel();
}

/**
 * Toggles whether vibrations are allowed to proceed.
 */
export function setGlobalHapticsEnabled(enabled: boolean): void {
    _hapticsEnabled = enabled;
}
