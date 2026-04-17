import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform, DeviceEventEmitter, AppState, type AppStateStatus } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

/**
 * useSecurity — Biometric-only security hook with central unlock.
 *
 * Central Unlock Pattern:
 * The Vision button (★) acts as the master lock/unlock for the ENTIRE app.
 * When unlocked (Stage 2), everything is accessible: notes, circles,
 * profiles, and feed. When locked, everything is hidden.
 *
 * Security Stages:
 * ┌─────────────────────────────┬──────────────────────────────────────────────┐
 * │ Stage 0 (locked)            │ Notes blurred, Circles locked, Feed locked   │
 * │ Stage 1 (circlesUnlocked)   │ Circles tab visible, notes still blurred     │
 * │ Stage 1.5 (profileUnlocked) │ Full person profile visible (bio, details)   │
 * │ Stage 2 (notesUnlocked)     │ Full access: notes, circles, feed, delete    │
 * └─────────────────────────────┴──────────────────────────────────────────────┘
 *
 * All stages use biometric auth (fingerprint/face). No PIN fallback.
 * Stage 2 automatically includes ALL lower stages.
 */
export function useSecurity() {
    /** Stage 2: full unlock — notes readable, delete available */
    const [isNotesUnlocked, setIsNotesUnlocked] = useState<boolean>(false);
    /** Stage 1.5: person profile details visible */
    const [isProfileUnlocked, setIsProfileUnlocked] = useState<boolean>(false);
    /** Stage 1: circles tab content visible */
    const [isCirclesUnlocked, setIsCirclesUnlocked] = useState<boolean>(false);
    /** Feed access: controlled by the central unlock (Stage 2) */
    const [isFeedUnlocked, setIsFeedUnlocked] = useState<boolean>(false);

    /** Auto-lock timer ref (10 min timeout for full unlock) */
    const lockTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    /* ── Auto-lock after 10 minutes of full unlock ───────────────────── */
    const resetLockTimeout = useCallback(() => {
        if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
        lockTimeoutRef.current = setTimeout(() => {
            setIsNotesUnlocked(false);
            setIsProfileUnlocked(false);
            setIsCirclesUnlocked(false);
            setIsFeedUnlocked(false);
        }, 180000); // 3 minutes
    }, []);

    /* ── Lock everything instantly ───────────────────────────────────── */
    const lockAll = useCallback(() => {
        setIsNotesUnlocked(false);
        setIsProfileUnlocked(false);
        setIsCirclesUnlocked(false);
        setIsFeedUnlocked(false);
        if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
    }, []);

    /**
     * Authenticate with biometrics.
     * Returns true if authentication succeeded, false otherwise.
     * Falls back gracefully if no biometric hardware is available.
     */
    const authenticate = useCallback(async (promptMessage: string): Promise<boolean> => {
        try {
            // Check biometric hardware availability
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            const isEnrolled = await LocalAuthentication.isEnrolledAsync();

            if (!hasHardware || !isEnrolled) {
                // No biometric hardware or not enrolled
                if (Platform.OS === 'web') {
                    // Web has no biometric API — bypass is acceptable
                    console.warn('[Security] No biometric support on web — access granted by default');
                    return true;
                }
                // On native: hardware exists but no enrollment → deny access
                // User must enroll biometrics in device settings first
                console.warn('[Security] Biometric hardware available but not enrolled — access denied');
                return false;
            }

            const result = await LocalAuthentication.authenticateAsync({
                promptMessage,
                cancelLabel: 'Cancel',
            });

            return result.success;
        } catch (e) {
            console.warn('Authentication error:', e);
            return false;
        }
    }, []);

    /**
     * Stage 1: Unlock Circles tab only.
     * Prompts biometric auth. On success, reveals Circles.
     * On cancel/fail, nothing changes.
     */
    const unlockCircles = useCallback(async (): Promise<boolean> => {
        const success = await authenticate('Confirm identity for Circles');
        if (success) {
            setIsCirclesUnlocked(true);
            return true;
        }
        return false;
    }, [authenticate]);

    /**
     * Stage 2: Unlock everything (notes + circles + profile + feed).
     * This is the CENTRAL unlock — triggered by the Vision ★ button.
     * Prompts biometric auth. On success, grants full access + starts timer.
     */
    const unlockNotes = useCallback(async (): Promise<boolean> => {
        const success = await authenticate('Unlock your notes');
        if (success) {
            setIsNotesUnlocked(true);
            setIsProfileUnlocked(true); // Stage 2 includes Stage 1.5
            setIsCirclesUnlocked(true); // Stage 2 includes Stage 1
            setIsFeedUnlocked(true);    // Stage 2 includes Feed
            resetLockTimeout();
            return true;
        }
        return false;
    }, [authenticate, resetLockTimeout]);

    /**
     * Stage 1.5: Unlock person profile details.
     * Prompts biometric auth. On success, reveals full profile (bio, birthday, etc.).
     * On cancel/fail, nothing changes.
     */
    const unlockProfile = useCallback(async (): Promise<boolean> => {
        // Already unlocked via Stage 2
        if (isNotesUnlocked) return true;
        const success = await authenticate('Verify identity to view profile');
        if (success) {
            setIsProfileUnlocked(true);
            setIsCirclesUnlocked(true); // Profile implies circles are visible
            return true;
        }
        return false;
    }, [authenticate, isNotesUnlocked]);

    /* ── Cleanup & AppState ───────────────────────────────────────────── */
    useEffect(() => {
        const sub = DeviceEventEmitter.addListener('RESET_LOCK_TIMER', () => {
            if (isNotesUnlocked) resetLockTimeout();
        });

        // Auto-lock when app goes to background (security best practice)
        const appStateSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
            if (nextState === 'background' || nextState === 'inactive') {
                lockAll();
            }
        });

        return () => {
            if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
            sub.remove();
            appStateSub.remove();
        };
    }, [isNotesUnlocked, resetLockTimeout, lockAll]);

    return {
        /** Stage 2: full access (read notes, delete) */
        isNotesUnlocked,
        /** Stage 1.5: person profile details visible */
        isProfileUnlocked,
        /** Stage 1: circles tab content visible */
        isCirclesUnlocked,
        /** Feed access: controlled by central Stage 2 unlock */
        isFeedUnlocked,
        /** Prompt biometric to unlock Circles tab only */
        unlockCircles,
        /** Prompt biometric to unlock person profile details */
        unlockProfile,
        /** Prompt biometric to unlock EVERYTHING (central unlock) */
        unlockNotes,
        /** Lock all tiers instantly */
        lockAll,
        /** Reset lock timeout when there is meaningful activity */
        keepAlive: resetLockTimeout,
    };
}
