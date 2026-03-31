/**
 * useAiStatus — Health check hook for the Ollama Cloud API.
 *
 * Pings the Ollama server every AI_HEALTH_CHECK_INTERVAL_MS (10s default)
 * and exposes a boolean `isOnline` + a manual `checkNow()` function.
 *
 * Usage: render a green/red dot indicator on the HomeScreen.
 * The ping uses /api/tags (lightweight, no model inference cost).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { pingServer, type AiConfig } from '@/lib/aiService';
import { AI_HEALTH_CHECK_INTERVAL_MS } from '@/config/ai';

export function useAiStatus(config?: AiConfig) {
    /** Whether the Ollama Cloud API is currently reachable */
    const [isOnline, setIsOnline] = useState<boolean | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    /** Run a single health check */
    const checkNow = useCallback(async () => {
        const result = await pingServer(config);
        setIsOnline(result);
        return result;
    }, [config]);

    useEffect(() => {
        // Initial check on mount
        checkNow();

        // Set up recurring interval
        intervalRef.current = setInterval(checkNow, AI_HEALTH_CHECK_INTERVAL_MS);

        // Pause polling when app goes to background, resume on foreground
        const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
            if (state === 'active') {
                checkNow();
                if (!intervalRef.current) {
                    intervalRef.current = setInterval(checkNow, AI_HEALTH_CHECK_INTERVAL_MS);
                }
            } else {
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }
            }
        });

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            subscription.remove();
        };
    }, [checkNow]);

    return { isOnline, checkNow };
}
