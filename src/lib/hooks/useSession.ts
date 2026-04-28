import { useState, useRef, useEffect, useCallback } from 'react';
import { vibrate } from '@/lib/haptics';
import { useSharedValue, withTiming, withSequence, Easing, runOnJS } from 'react-native-reanimated';
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
 * Haptic feedback:
 * - Progressive haptic pattern triggers very late in the danger sequence
 *   (at 85%+ idle time) with escalating vibration intensity:
 *   - 85%: Quick double-tap warning
 *   - 92%: Urgent triple-tap
 *   - 97%+: Rapid escalating pattern until death
 *
 * @param timeIndex - Index into CONFIG.SESSION_OPTIONS_MINS
 * @param diffIndex - Index into CONFIG.DIFFICULTIES
 * @param inputRefRef - Ref to the TextInput for programmatic control (clear)
 */

/** Idle danger thresholds for progressive haptic feedback (0-1 ratio scale)
 *
 * Escalation pattern (starts subtle, builds exponentially):
 *   caution → warning → urgent → critical
 * Adjust thresholds via the constants below — do not hardcode values in comments.
 */
const HAPTIC_CAUTION_THRESHOLD = 0.70;   // Gentle nudge
const HAPTIC_WARNING_THRESHOLD = 0.80;   // Double-tap warning
const HAPTIC_URGENT_THRESHOLD = 0.90;    // Urgent triple-tap
const HAPTIC_CRITICAL_THRESHOLD = 0.95;  // Escalating rapid buzz

/** Track last haptic threshold fired to prevent repeated vibrations */
type HapticLevel = 'none' | 'caution' | 'warning' | 'urgent' | 'critical';

export function useSession(timeIndex: number, diffIndex: number, inputRefRef?: React.RefObject<{ clear: () => void } | null>) {
    const [sessionTimeSelected, setSessionTimeSelected] = useState<number>(0);
    const [sessionTimeRemaining, setSessionTimeRemaining] = useState<number>(0);
    const textRef = useRef<string>('');
    const [hasLost, setHasLost] = useState<boolean>(false);
    const [isContinuingAfterLoss, setIsContinuingAfterLoss] = useState<boolean>(false);

    const sessionIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const idleIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const deathTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const hasLostRef = useRef(hasLost);
    hasLostRef.current = hasLost;
    const isContinuingAfterLossRef = useRef(isContinuingAfterLoss);
    isContinuingAfterLossRef.current = isContinuingAfterLoss;

    /** SharedValue for idle time — updated every TICK_RATE_MS WITHOUT triggering React re-render */
    const idleTimeMsShared = useSharedValue(0);

    /** Shake animation shared value — runs on UI thread */
    const shakeAnimation = useSharedValue(0);
    /** Loss overlay opacity shared value — runs on UI thread */
    const lossOverlayOpacity = useSharedValue(0);

    /** Track the last haptic level fired to avoid duplicate vibrations at the same threshold */
    const lastHapticLevelRef = useRef<HapticLevel>('none');

    const clearTimers = useCallback(() => {
        if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
        if (idleIntervalRef.current) clearInterval(idleIntervalRef.current);
        if (deathTimeoutRef.current) clearTimeout(deathTimeoutRef.current);
    }, []);

    const triggerDeathState = useCallback(() => {
        vibrate([0, 200, 100, 200]);
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

        deathTimeoutRef.current = setTimeout(() => {
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
        // Reset haptic tracking on new session
        lastHapticLevelRef.current = 'none';
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

                // Progressive haptic feedback — only fires when crossing thresholds
                const ratio = newIdleTime / difficultyLimit;
                if (ratio >= HAPTIC_CRITICAL_THRESHOLD && lastHapticLevelRef.current !== 'critical') {
                    // Escalating rapid buzz — panic-inducing, nearly dead
                    lastHapticLevelRef.current = 'critical';
                    vibrate([0, 50, 25, 50, 25, 50, 25, 80]);
                } else if (ratio >= HAPTIC_URGENT_THRESHOLD && lastHapticLevelRef.current === 'warning') {
                    // Urgent triple rapid pulse
                    lastHapticLevelRef.current = 'urgent';
                    vibrate([0, 40, 25, 40]);
                } else if (ratio >= HAPTIC_WARNING_THRESHOLD && lastHapticLevelRef.current === 'caution') {
                    // Double-tap — clear warning, danger is building
                    lastHapticLevelRef.current = 'warning';
                    vibrate([0, 30, 50, 30]);
                } else if (ratio >= HAPTIC_CAUTION_THRESHOLD && lastHapticLevelRef.current === 'none') {
                    // Single short pulse — gentle nudge to keep going
                    lastHapticLevelRef.current = 'caution';
                    vibrate(20);
                }
            }
        }, CONFIG.TICK_RATE_MS);
    }, [timeIndex, diffIndex, clearTimers, triggerDeathState, lossOverlayOpacity, shakeAnimation, idleTimeMsShared, inputRefRef]);

    const handleTextChange = useCallback((newText: string) => {
        textRef.current = newText;
        // Reset idle timer on any typing (works for both timed sessions and quick notes)
        if (!hasLostRef.current && !isContinuingAfterLossRef.current) {
            idleTimeMsShared.value = 0;
            // Reset haptic level so thresholds fire again if user idles again
            lastHapticLevelRef.current = 'none';
        }
    }, [idleTimeMsShared]);

    const resumeWritingFreely = useCallback((onResumed?: () => void) => {
        setIsContinuingAfterLoss(true);

        const finishResume = () => {
            setHasLost(false);
            if (onResumed) onResumed();
        };

        lossOverlayOpacity.value = withTiming(0, { duration: 300 }, (finished) => {
            if (finished) {
                runOnJS(finishResume)();
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
