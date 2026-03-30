import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

/**
 * useSecurity — Biometric-only security hook with two-tier unlock.
 *
 * Security Stages:
 * ┌─────────────────────────────┬──────────────────────────────────────────────┐
 * │ Stage 0 (locked)            │ Notes are blurred, Circles tab is locked     │
 * │ Stage 1 (circlesUnlocked)   │ Circles tab visible, notes still blurred     │
 * │ Stage 1.5 (profileUnlocked) │ Full person profile visible (bio, details)   │
 * │ Stage 2 (notesUnlocked)     │ Full access: read notes, delete, etc.        │
 * └─────────────────────────────┴──────────────────────────────────────────────┘
 *
 * All stages use biometric auth (fingerprint/face). No PIN fallback.
 * Stage 2 automatically includes Stage 1 + 1.5 access.
 */
export function useSecurity() {
    /** Stage 2: full unlock — notes readable, delete available */
    const [isNotesUnlocked, setIsNotesUnlocked] = useState<boolean>(false);
    /** Stage 1.5: person profile details visible */
    const [isProfileUnlocked, setIsProfileUnlocked] = useState<boolean>(false);
    /** Stage 1: circles tab content visible */
    const [isCirclesUnlocked, setIsCirclesUnlocked] = useState<boolean>(false);

    /** Auto-lock timer ref (10 min timeout for full unlock) */
    const lockTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    /* ── Auto-lock after 10 minutes of full unlock ───────────────────── */
    const resetLockTimeout = useCallback(() => {
        if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
        lockTimeoutRef.current = setTimeout(() => {
            setIsNotesUnlocked(false);
            setIsProfileUnlocked(false);
            setIsCirclesUnlocked(false);
        }, 600000); // 10 minutes
    }, []);

    /* ── Lock everything instantly ───────────────────────────────────── */
    const lockAll = useCallback(() => {
        setIsNotesUnlocked(false);
        setIsProfileUnlocked(false);
        setIsCirclesUnlocked(false);
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

            if (!hasHardware || !isEnrolled || Platform.OS === 'web') {
                // No biometric available — allow access (no PIN fallback)
                return true;
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
     * Stage 2: Unlock everything (notes readable + circles visible).
     * Prompts biometric auth. On success, grants full access + starts timer.
     * On cancel/fail, nothing changes.
     */
    const unlockNotes = useCallback(async (): Promise<boolean> => {
        const success = await authenticate('Unlock your notes');
        if (success) {
            setIsNotesUnlocked(true);
            setIsProfileUnlocked(true); // Stage 2 includes Stage 1.5
            setIsCirclesUnlocked(true); // Stage 2 includes Stage 1
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

    /* ── Cleanup ─────────────────────────────────────────────────────── */
    useEffect(() => {
        return () => {
            if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
        };
    }, []);

    return {
        /** Stage 2: full access (read notes, delete) */
        isNotesUnlocked,
        /** Stage 1.5: person profile details visible */
        isProfileUnlocked,
        /** Stage 1: circles tab content visible */
        isCirclesUnlocked,
        /** Prompt biometric to unlock Circles tab only */
        unlockCircles,
        /** Prompt biometric to unlock person profile details */
        unlockProfile,
        /** Prompt biometric to unlock everything */
        unlockNotes,
        /** Lock all tiers instantly */
        lockAll,
    };
}
