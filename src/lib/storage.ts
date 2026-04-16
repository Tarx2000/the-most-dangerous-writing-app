/**
 * Storage Adapter — AsyncStorage-compatible API
 *
 * Wraps @react-native-async-storage/async-storage with a unified interface.
 * All methods return Promises matching the AsyncStorage API.
 *
 * NOTE: This adapter exists so we can swap the underlying storage implementation
 * (e.g., to MMKV for performance) without changing call sites. When running
 * in a development build (not Expo Go), you can switch to MMKV for faster
 * synchronous reads/writes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Storage adapter backed by AsyncStorage.
 * Compatible with Expo Go — no native module compilation required.
 */
export const storage = {
    setItem(key: string, value: string): Promise<void> {
        return AsyncStorage.setItem(key, value);
    },

    getItem(key: string): Promise<string | null> {
        return AsyncStorage.getItem(key);
    },

    removeItem(key: string): Promise<void> {
        return AsyncStorage.removeItem(key);
    },

    multiGet(keys: string[]): Promise<[string, string | null][]> {
        return AsyncStorage.multiGet(keys) as Promise<[string, string | null][]>;
    },

    multiSet(keyValuePairs: [string, string][]): Promise<void> {
        return AsyncStorage.multiSet(keyValuePairs);
    },

    multiRemove(keys: string[]): Promise<void> {
        return AsyncStorage.multiRemove(keys);
    },

    getAllKeys(): Promise<string[]> {
        return AsyncStorage.getAllKeys() as Promise<string[]>;
    },

    clearAll(): Promise<void> {
        return AsyncStorage.clear();
    },
};