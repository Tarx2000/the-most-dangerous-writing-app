import { useState, useRef, useEffect, useCallback } from 'react';
import { useSharedValue, withTiming, withSequence, Easing } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { CONFIG } from '@/config';

/**
 * useSession — Core hook for managing a writing session.
 *
 * Performance strategy:
 * - `idleTimeMsShared` is a Reanimated SharedValue. The idle timer ticks every
 *   100ms but updates ONLY this shared value, NOT React state. This prevents
 *   10Hz re-renders of WritingScreen and all its children.
 * - `textRef` stores the text in a ref (uncontrolled TextInput pattern) so
 *   typing does not cause React re-renders.
 * - Animations (shake, loss overlay) use Reanimated SharedValues + withTiming
 *   for 60fps UI-thread animations.
 *
 * @param timeIndex - Index into CONFIG.SESSION_OPTIONS_MINS
 * @param diffIndex - Index into CONFIG.DIFFICULTIES
 * @param inputRefRef - Ref to the TextInput for programmatic control (clear)
 */
export function useSession(timeIndex: number, diffIndex: number, inputRefRef?: React.RefObject<any>) {
    const [sessionTimeSelected, setSessionTimeSelected] = useState<number>(0);
    const [sessionTimeRemaining, setSessionTimeRemaining] = useState<number>(0);
    const textRef = useRef<string>('');
    const [hasLost, setHasLost] = useState<boolean>(false);
    const [isContinuingAfterLoss, setIsContinuingAfterLoss] = useState<boolean>(false);

    const sessionIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const idleIntervalRef = useRef<NodeJS.Timeout | null>(null);

    /** SharedValue for idle time — updated every TICK_RATE_MS WITHOUT triggering React re-render */
    const idleTimeMsShared = useSharedValue(0);

    /** Shake animation shared value — runs on UI thread */
    const shakeAnimation = useSharedValue(0);
    /** Loss overlay opacity shared value — runs on UI thread */
    const lossOverlayOpacity = useSharedValue(0);

    const clearTimers = useCallback(() => {
        if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
        if (idleIntervalRef.current) clearInterval(idleIntervalRef.current);
    }, []);

    const triggerDeathState = useCallback(() => {
        setHasLost(true);
        clearTimers();

        shakeAnimation.value = withSequence(
            withTiming(15, { duration: 50 }),
            withTiming(-15, { duration: 50 }),
            withTiming(15, { duration: 50 }),
            withTiming(0, { duration: 50 })
        );

        lossOverlayOpacity.value = withTiming(1, {
            duration: 300,
            easing: Easing.out(Easing.ease)
        });

        setTimeout(() => { 
            textRef.current = ''; 
            if (inputRefRef && inputRefRef.current) {
                inputRefRef.current.clear();
            }
        }, 200);
    }, [clearTimers, shakeAnimation, lossOverlayOpacity, inputRefRef]);

    const startSession = useCallback((isQuickNote?: boolean) => {
        const minutes = CONFIG.SESSION_OPTIONS_MINS[timeIndex] || 5;
        const difficultyLimit = CONFIG.DIFFICULTIES[diffIndex]?.value || 8000;

        const seconds = minutes * 60;
        setSessionTimeSelected(isQuickNote ? 0 : seconds);
        setSessionTimeRemaining(isQuickNote ? 0 : seconds);
        idleTimeMsShared.value = 0;
        textRef.current = '';
        if (inputRefRef && inputRefRef.current) {
            inputRefRef.current.clear();
        }
        setHasLost(false);
        setIsContinuingAfterLoss(false);

        lossOverlayOpacity.value = 0;
        shakeAnimation.value = 0;
        clearTimers();

        // Quick Notes have no timers at all - no countdown, no idle death
        if (isQuickNote) return;

        // Session countdown timer (ticks every second)
        sessionIntervalRef.current = setInterval(() => {
            setSessionTimeRemaining((prev) => {
                if (prev <= 1) {
                    clearTimers();
                    idleTimeMsShared.value = 0;
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        // Idle death timer — updates SharedValue only, NO React state update
        idleIntervalRef.current = setInterval(() => {
            const newIdleTime = idleTimeMsShared.value + CONFIG.TICK_RATE_MS;
            if (newIdleTime >= difficultyLimit) {
                triggerDeathState();
                idleTimeMsShared.value = difficultyLimit;
            } else {
                idleTimeMsShared.value = newIdleTime;
            }
        }, CONFIG.TICK_RATE_MS);
    }, [timeIndex, diffIndex, clearTimers, triggerDeathState, lossOverlayOpacity, shakeAnimation, idleTimeMsShared]);

    const handleTextChange = useCallback((newText: string) => {
        textRef.current = newText;
        // Reset idle timer on any typing (works for both timed sessions and quick notes)
        if (!hasLost && !isContinuingAfterLoss) {
            idleTimeMsShared.value = 0;
        }
    }, [hasLost, isContinuingAfterLoss, idleTimeMsShared]);

    const resumeWritingFreely = useCallback((onResumed?: () => void) => {
        setIsContinuingAfterLoss(true);
        
        const finishResume = () => {
            setHasLost(false);
            if (onResumed) onResumed();
        };

        lossOverlayOpacity.value = withTiming(0, { duration: 300 }, (finished) => {
            if (finished) {
                scheduleOnRN(finishResume);
            }
        });
        idleTimeMsShared.value = 0;
    }, [lossOverlayOpacity, idleTimeMsShared]);

    /** [DEV MODE] Instantly skip the session timer to 0, simulating a completed session */
    const skipTimer = useCallback(() => {
        clearTimers();
        setSessionTimeRemaining(0);
        idleTimeMsShared.value = 0;
    }, [clearTimers, idleTimeMsShared]);

    // Cleanup on unmount
    useEffect(() => {
        return () => clearTimers();
    }, [clearTimers]);

    return {
        textRef,
        sessionTimeSelected,
        sessionTimeRemaining,
        idleTimeMsShared,
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
