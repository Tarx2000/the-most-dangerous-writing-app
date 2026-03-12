import { useState, useRef, useEffect, useCallback } from 'react';
import { Animated, Easing } from 'react-native';
import { CONFIG } from '@/config';

export function useSession(timeIndex: number, diffIndex: number) {
    const [sessionTimeSelected, setSessionTimeSelected] = useState<number>(0);
    const [sessionTimeRemaining, setSessionTimeRemaining] = useState<number>(0);
    const [idleTimeMs, setIdleTimeMs] = useState<number>(0);
    const [text, setText] = useState<string>('');
    const [hasLost, setHasLost] = useState<boolean>(false);
    const [isContinuingAfterLoss, setIsContinuingAfterLoss] = useState<boolean>(false);

    const sessionIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const idleIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const shakeAnimation = useRef(new Animated.Value(0)).current;
    const lossOverlayOpacity = useRef(new Animated.Value(0)).current;

    const clearTimers = useCallback(() => {
        if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
        if (idleIntervalRef.current) clearInterval(idleIntervalRef.current);
    }, []);

    const triggerDeathState = useCallback(() => {
        setHasLost(true);
        clearTimers();

        Animated.sequence([
            Animated.timing(shakeAnimation, { toValue: 15, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnimation, { toValue: -15, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnimation, { toValue: 15, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnimation, { toValue: 0, duration: 50, useNativeDriver: true }),
        ]).start();

        Animated.timing(lossOverlayOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
            easing: Easing.out(Easing.ease)
        }).start();

        setTimeout(() => { setText(''); }, 200);
    }, [clearTimers, shakeAnimation, lossOverlayOpacity]);

    const startSession = useCallback((isQuickNote?: boolean) => {
        const minutes = CONFIG.SESSION_OPTIONS_MINS[timeIndex] || 5;
        const difficultyLimit = CONFIG.DIFFICULTIES[diffIndex]?.value || 8000;

        const seconds = minutes * 60;
        setSessionTimeSelected(isQuickNote ? 0 : seconds);
        setSessionTimeRemaining(isQuickNote ? 0 : seconds);
        setIdleTimeMs(0);
        setText('');
        setHasLost(false);
        setIsContinuingAfterLoss(false);

        lossOverlayOpacity.setValue(0);
        shakeAnimation.setValue(0);
        clearTimers();

        // Quick Notes have no timers at all - no countdown, no idle death
        if (isQuickNote) return;

        // Session countdown timer (ticks every second)
        sessionIntervalRef.current = setInterval(() => {
            setSessionTimeRemaining((prev) => {
                if (prev <= 1) {
                    clearTimers();
                    setIdleTimeMs(0);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        // Idle death timer (ticks every TICK_RATE_MS)
        idleIntervalRef.current = setInterval(() => {
            setIdleTimeMs((prev) => {
                const newIdleTime = prev + CONFIG.TICK_RATE_MS;
                if (newIdleTime >= difficultyLimit) {
                    triggerDeathState();
                    return difficultyLimit;
                }
                return newIdleTime;
            });
        }, CONFIG.TICK_RATE_MS);
    }, [timeIndex, diffIndex, clearTimers, triggerDeathState, lossOverlayOpacity, shakeAnimation]);

    const handleTextChange = useCallback((newText: string) => {
        setText(newText);
        // Reset idle timer on any typing (works for both timed sessions and quick notes)
        if (!hasLost && !isContinuingAfterLoss) {
            setIdleTimeMs(0);
        }
    }, [hasLost, isContinuingAfterLoss]);

    const resumeWritingFreely = useCallback((onResumed?: () => void) => {
        setIsContinuingAfterLoss(true);
        Animated.timing(lossOverlayOpacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
        }).start(() => {
            setHasLost(false);
            if (onResumed) onResumed();
        });
        setIdleTimeMs(0);
    }, [lossOverlayOpacity]);

    /** [DEV MODE] Instantly skip the session timer to 0, simulating a completed session */
    const skipTimer = useCallback(() => {
        clearTimers();
        setSessionTimeRemaining(0);
        setIdleTimeMs(0);
    }, [clearTimers]);

    // Cleanup on unmount
    useEffect(() => {
        return () => clearTimers();
    }, [clearTimers]);

    return {
        text,
        sessionTimeSelected,
        sessionTimeRemaining,
        idleTimeMs,
        hasLost,
        isContinuingAfterLoss,
        shakeAnimation,
        lossOverlayOpacity,
        startSession,
        handleTextChange,
        resumeWritingFreely,
        clearTimers,
        skipTimer
    };
}
