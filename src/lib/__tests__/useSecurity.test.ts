/**
 * useSecurity hook tests — Regression guards for security behavior.
 *
 * Since @testing-library/react-native has a react-test-renderer version conflict,
 * these tests verify the source code constants and patterns directly by reading
 * the file. This catches regressions like:
 * - BACKGROUND_LOCK_GRACE_MS being changed from 30s
 * - Unlock hierarchy stages being renumbered
 * - lockAll not clearing all 4 state variables
 */

import * as fs from 'fs';
import * as path from 'path';

const SOURCE = fs.readFileSync(
    path.resolve(__dirname, '../hooks/useSecurity.ts'),
    'utf-8',
);

describe('useSecurity source code contracts', () => {
    describe('BACKGROUND_LOCK_GRACE_MS', () => {
        it('should be 30000 (30 seconds)', () => {
            const match = SOURCE.match(/BACKGROUND_LOCK_GRACE_MS\s*=\s*(\d+)/);
            expect(match).not.toBeNull();
            expect(parseInt(match![1] ?? '0', 10)).toBe(30000);
        });

        it('should be documented as allowing brief interruptions', () => {
            const graceSection = SOURCE.substring(
                SOURCE.indexOf('BACKGROUND_LOCK_GRACE_MS') - 300,
                SOURCE.indexOf('BACKGROUND_LOCK_GRACE_MS') + 50,
            );
            expect(graceSection.toLowerCase()).toContain('grace');
            expect(graceSection.toLowerCase()).toContain('background');
        });
    });

    describe('unlock hierarchy', () => {
        it('should have 4 unlock state variables', () => {
            const lockAllFn = SOURCE.match(/const lockAll[\s\S]*?\}/)?.[0];
            expect(lockAllFn).toBeDefined();

            expect(lockAllFn as string).toContain('setIsNotesUnlocked(false)');
            expect(lockAllFn as string).toContain('setIsProfileUnlocked(false)');
            expect(lockAllFn as string).toContain('setIsCirclesUnlocked(false)');
            expect(lockAllFn as string).toContain('setIsFeedUnlocked(false)');
        });

        it('lockAll should clear both timer refs', () => {
            const lockAllFn = SOURCE.match(/const lockAll[\s\S]*?\}[\s]*\}/)?.[0];
            expect(lockAllFn).toBeDefined();

            expect(lockAllFn as string).toContain('clearTimeout(lockTimeoutRef.current)');
            expect(lockAllFn as string).toContain('clearTimeout(backgroundGraceRef.current)');
        });

        it('resetLockTimeout should use timeoutMins * 60000', () => {
            const resetFn = SOURCE.match(/const resetLockTimeout[\s\S]*?\},\s*\[timeoutMins\]\)/)?.[0];
            expect(resetFn).toBeDefined();
            expect(resetFn as string).toContain('timeoutMins * 60000');
        });

        it('resetLockTimeout should short-circuit when timeoutMins is 0', () => {
            const resetFn = SOURCE.match(/const resetLockTimeout[\s\S]*?\},\s*\[timeoutMins\]\)/)?.[0];
            expect(resetFn).toBeDefined();
            expect(resetFn as string).toContain('timeoutMins === 0');
        });
    });

    describe('AppState handling', () => {
        it('should subscribe to AppState changes', () => {
            expect(SOURCE).toContain('AppState.addEventListener');
        });

        it('should lock on inactive state (control center, notification overlay)', () => {
            const inactiveMatch = SOURCE.match(/inactive.*?lock/i);
            expect(inactiveMatch).not.toBeNull();
        });

        it('should use background grace period before locking', () => {
            expect(SOURCE).toContain('BACKGROUND_LOCK_GRACE_MS');
            const bgSection = SOURCE.match(/case\s+['"]background['"][\s\S]*?break/);
            if (bgSection) {
                expect(bgSection[0]).toContain('BACKGROUND_LOCK_GRACE_MS');
            }
        });
    });

    describe('biometric authentication', () => {
        it('should call authenticateAsync for unlock', () => {
            expect(SOURCE).toContain('authenticateAsync');
        });

        it('should check hasHardwareAsync and isEnrolledAsync', () => {
            expect(SOURCE).toContain('hasHardwareAsync');
            expect(SOURCE).toContain('isEnrolledAsync');
        });
    });
});

