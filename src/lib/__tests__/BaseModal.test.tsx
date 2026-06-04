/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import React from 'react';
import { render, act } from '@testing-library/react-native';
import { BaseModal } from '../../components/ui/BaseModal';
import * as RN from 'react-native';

// Mock safe area insets for testing in node
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 40, bottom: 20, left: 0, right: 0 }),
}));

// Mock theme to avoid undefined style errors during rendering
jest.mock('@/styles/theme', () => ({
    theme: {
        colors: {
            background: '#000000',
            primaryAction: '#ffffff',
            textPrimary: '#ffffff',
            textSecondary: '#cccccc',
            textMuted: '#888888',
            glassBackground: 'rgba(255,255,255,0.05)',
            glassBorder: 'rgba(255,255,255,0.1)',
            glassBorderFaint: 'rgba(255,255,255,0.05)',
            glassBorderMedium: 'rgba(255,255,255,0.15)',
            glassSurface: 'rgba(255,255,255,0.08)',
            glassSurfaceLow: 'rgba(255,255,255,0.04)',
            glassSurfaceMedium: 'rgba(255,255,255,0.12)',
            surfaceDark: '#121212',
            overlayDark: 'rgba(0,0,0,0.8)',
            grey: '#888888',
        },
        borderRadius: {
            sm: 8,
            md: 12,
            lg: 16,
        },
    },
}));

describe('BaseModal Keyboard/Resize Flicker Bug', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Set default screen height mock
        (global as any).__mockWindowHeight = 800;
    });

    afterEach(() => {
        delete (global as any).__mockWindowHeight;
    });

    it('triggers entrance animation exactly once when visible becomes true', () => {
        const { withSpring, withTiming } = require('react-native-reanimated');

        // Initial render: modal is closed
        const { rerender } = render(
            <BaseModal visible={false} onClose={jest.fn()}>
                <RN.Text>Modal Content</RN.Text>
            </BaseModal>,
        );

        expect(withSpring).not.toHaveBeenCalled();

        // Open the modal
        act(() => {
            rerender(
                <BaseModal visible={true} onClose={jest.fn()}>
                    <RN.Text>Modal Content</RN.Text>
                </BaseModal>,
            );
        });

        // The entrance spring animation should be triggered
        expect(withSpring).toHaveBeenCalledWith(0, expect.any(Object));
        expect(withTiming).toHaveBeenCalledWith(1, expect.any(Object));
    });

    it('does NOT re-trigger entrance animation or reset translateY when screen dimensions change (keyboard toggle)', () => {
        const { withSpring, withTiming } = require('react-native-reanimated');

        // Render visible modal
        const { rerender } = render(
            <BaseModal visible={true} onClose={jest.fn()}>
                <RN.Text>Modal Content</RN.Text>
            </BaseModal>,
        );

        // Record how many times withSpring/withTiming was called initially
        const initialSpringCalls = withSpring.mock.calls.length;
        const initialTimingCalls = withTiming.mock.calls.length;

        expect(initialSpringCalls).toBeGreaterThan(0);

        // Simulate keyboard opening (screen height shrinks from 800 to 500)
        (global as any).__mockWindowHeight = 500;

        // Trigger a re-render
        act(() => {
            rerender(
                <BaseModal visible={true} onClose={jest.fn()}>
                    <RN.Text>Modal Content</RN.Text>
                </BaseModal>,
            );
        });

        // Verify that withSpring and withTiming were NOT called again
        expect(withSpring.mock.calls.length).toBe(initialSpringCalls);
        expect(withTiming.mock.calls.length).toBe(initialTimingCalls);

        // Simulate keyboard closing (screen height returns to 800)
        (global as any).__mockWindowHeight = 800;

        // Trigger a re-render
        act(() => {
            rerender(
                <BaseModal visible={true} onClose={jest.fn()}>
                    <RN.Text>Modal Content</RN.Text>
                </BaseModal>,
            );
        });

        // Verify that still no additional calls were made
        expect(withSpring.mock.calls.length).toBe(initialSpringCalls);
        expect(withTiming.mock.calls.length).toBe(initialTimingCalls);
    });

    it('calculates modal height dynamically on iOS based on keyboard height', () => {
        const { Keyboard, Platform } = require('react-native');
        const { useAnimatedStyle } = require('react-native-reanimated');

        const originalOS = Platform.OS;
        Platform.OS = 'ios'; // Force iOS mode

        let keyboardShowCb: any = null;
        let keyboardHideCb: any = null;

        const addListenerSpy = jest.spyOn(Keyboard, 'addListener').mockImplementation((event: any, cb: any) => {
            if (event === 'keyboardWillShow') {
                keyboardShowCb = cb;
            } else if (event === 'keyboardWillHide') {
                keyboardHideCb = cb;
            }
            return { remove: jest.fn() };
        });

        // Render BaseModal with height=600. Screen height starts at 800.
        render(
            <BaseModal visible={true} onClose={jest.fn()} height={600}>
                <RN.Text>Modal Content</RN.Text>
            </BaseModal>,
        );

        // Retrieve the animation style callback containing height
        const animStyleCb = useAnimatedStyle.mock.calls
            .map((call: any) => call[0])
            .find((cb: any) => cb() && cb().height !== undefined);

        // Initial height (no keyboard): Math.min(600, 800 - 40 - 0 - 20) = 600
        expect(animStyleCb().height).toBe(600);
        expect(animStyleCb().bottom).toBe(-20);

        // Simulate keyboard opening (height 300)
        act(() => {
            keyboardShowCb({ endCoordinates: { height: 300 } });
        });

        // Retrieve latest style callback after state update
        const latestAnimStyleCb = useAnimatedStyle.mock.calls
            .map((call: any) => call[0])
            .reverse()
            .find((cb: any) => cb() && cb().height !== undefined);

        // Height should shrink: Math.min(600, 800 - 40 - 300 - 20) = 440
        expect(latestAnimStyleCb().height).toBe(440);
        expect(latestAnimStyleCb().bottom).toBe(280); // -20 + 300

        // Simulate keyboard closing
        act(() => {
            keyboardHideCb();
        });

        // Height should expand back to 600
        expect(latestAnimStyleCb().height).toBe(600);
        expect(latestAnimStyleCb().bottom).toBe(-20);

        // Clean up spyers and reset OS
        addListenerSpy.mockRestore();
        Platform.OS = originalOS;
    });

    it('calculates modal height dynamically on Android based on SCREEN_HEIGHT changes', () => {
        const { Platform } = require('react-native');
        const { useAnimatedStyle } = require('react-native-reanimated');

        const originalOS = Platform.OS;
        Platform.OS = 'android'; // Force Android mode

        // Render BaseModal with height=600. Screen height is 800.
        const { rerender } = render(
            <BaseModal visible={true} onClose={jest.fn()} height={600}>
                <RN.Text>Modal Content</RN.Text>
            </BaseModal>,
        );

        // Retrieve the animation style callback containing height
        const animStyleCb = useAnimatedStyle.mock.calls
            .map((call: any) => call[0])
            .find((cb: any) => cb() && cb().height !== undefined);

        // Initial height: Math.min(600, 800 - 40 - 0 - 20) = 600
        expect(animStyleCb().height).toBe(600);
        expect(animStyleCb().bottom).toBe(-20);

        // Simulate Android screen shrinking (keyboard open) by changing mock window height to 500
        (global as any).__mockWindowHeight = 500;

        // Trigger a re-render
        act(() => {
            rerender(
                <BaseModal visible={true} onClose={jest.fn()} height={600}>
                    <RN.Text>Modal Content</RN.Text>
                </BaseModal>,
            );
        });

        // Retrieve latest style callback after state update
        const latestAnimStyleCbAndroid = useAnimatedStyle.mock.calls
            .map((call: any) => call[0])
            .reverse()
            .find((cb: any) => cb() && cb().height !== undefined);

        // Height should shrink based on SCREEN_HEIGHT: Math.min(600, 500 - 40 - 0 - 20) = 440
        expect(latestAnimStyleCbAndroid().height).toBe(440);
        expect(latestAnimStyleCbAndroid().bottom).toBe(-20); // bottom remains -20 because parent view itself shrunk

        Platform.OS = originalOS;
    });
});
