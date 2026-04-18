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
 *
 * Auto-lock behavior:
 * - Configurable inactivity timer while unlocked (resets on user activity, controlled by timeoutMins)
 * - Grace period when app goes to background (configurable, see BACKGROUND_LOCK_GRACE_MS) before locking
 * - Immediate lock if app goes to "inactive" state (e.g., control center)
 */

/** Default inactivity auto-lock timeout — overridden by timeoutMins parameter */
const AUTO_LOCK_TIMEOUT_MS = 180000;

/** Grace period before locking when app goes to background.
 * Allows brief interruptions like responding to a message or switching
 * to the camera for a vlog without requiring re-authentication.
 * Set to 0 via timeoutMins to lock immediately on background instead.
 */
const BACKGROUND_LOCK_GRACE_MS = 30000;

export function useSecurity(timeoutMins: number = 3) {
    /** Stage 2: full unlock — notes readable, delete available */
    const [isNotesUnlocked, setIsNotesUnlocked] = useState<boolean>(false);
    /** Stage 1.5: person profile details visible */
    const [isProfileUnlocked, setIsProfileUnlocked] = useState<boolean>(false);
    /** Stage 1: circles tab content visible */
    const [isCirclesUnlocked, setIsCirclesUnlocked] = useState<boolean>(false);
    /** Feed access: controlled by the central unlock (Stage 2) */
    const [isFeedUnlocked, setIsFeedUnlocked] = useState<boolean>(false);

    /** Auto-lock timer ref (inactivity timeout for full unlock, duration set by timeoutMins) */
    const lockTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    /** Grace period timer ref — allows brief background interruptions before locking */
    const backgroundGraceRef = useRef<NodeJS.Timeout | null>(null);

    /* ── Auto-lock after inactivity ─────────────────────────────── */
    const resetLockTimeout = useCallback(() => {
        if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
        if (timeoutMins === 0) return; // 0 means no inactivity timer, only lock on background
        lockTimeoutRef.current = setTimeout(() => {
            setIsNotesUnlocked(false);
            setIsProfileUnlocked(false);
            setIsCirclesUnlocked(false);
            setIsFeedUnlocked(false);
        }, timeoutMins * 60000);
    }, [timeoutMins]);

    /* ── Lock everything instantly ───────────────────────────────────── */
    const lockAll = useCallback(() => {
        setIsNotesUnlocked(false);
        setIsProfileUnlocked(false);
        setIsCirclesUnlocked(false);
        setIsFeedUnlocked(false);
        if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
        if (backgroundGraceRef.current) clearTimeout(backgroundGraceRef.current);
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

        // Auto-lock with grace period when app goes to background.
        // Brief background trips (responding to a message, opening camera)
        // get a grace period so the user doesn't have to re-authenticate.
        // Immediate lock for "inactive" state (control center, notification overlay).
        const appStateSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
            if (nextState === 'background') {
                // Start grace period — lock only if user doesn't return quickly
                if (backgroundGraceRef.current) clearTimeout(backgroundGraceRef.current);
                if (timeoutMins === 0) {
                    lockAll(); // Lock immediately on background
                } else {
                    backgroundGraceRef.current = setTimeout(() => {
                        lockAll();
                    }, BACKGROUND_LOCK_GRACE_MS);
                }
            } else if (nextState === 'inactive') {
                // Inactive = control center / notification overlay — lock immediately
                lockAll();
            } else if (nextState === 'active') {
                // App foregrounded — cancel any pending grace period lock
                if (backgroundGraceRef.current) {
                    clearTimeout(backgroundGraceRef.current);
                    backgroundGraceRef.current = null;
                }
                // Resume inactivity timer if still unlocked
                if (isNotesUnlocked) resetLockTimeout();
            }
        });

        return () => {
            if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
            if (backgroundGraceRef.current) clearTimeout(backgroundGraceRef.current);
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
