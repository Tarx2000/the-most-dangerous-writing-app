const React = require('react');

// Basic globals for React Native tests
global.Platform = {
    OS: 'ios',
    select: (objs) => objs.ios || objs.default,
};

// Mock react-native
jest.mock('react-native', () => {
    const RN = jest.requireActual('react-native');
    RN.Vibration.vibrate = jest.fn();
    RN.Alert.alert = jest.fn();
    return RN;
});

// Manual Reanimated Mock
jest.mock('react-native-reanimated', () => {
    return {
        useSharedValue: jest.fn((val) => ({ value: val })),
        useAnimatedStyle: jest.fn(() => ({})),
        useDerivedValue: jest.fn((fn) => ({ value: fn() })),
        withTiming: jest.fn((val) => val),
        withSpring: jest.fn((val) => val),
        withSequence: jest.fn((...args) => args[0]),
        Easing: {
            out: jest.fn((fn) => fn),
            ease: jest.fn((t) => t),
            in: jest.fn((t) => t),
            inOut: jest.fn((t) => t),
        },
        default: {
            View: 'View',
            Text: 'Text',
            Image: 'Image',
            ScrollView: 'ScrollView',
        }
    };
});

// Simple worklets mock
jest.mock('react-native-worklets', () => ({
    scheduleOnUI: (fn) => fn,
    scheduleOnJS: (fn) => fn,
    scheduleOnRN: (fn) => fn,
    createWorklet: (fn) => fn,
    useWorklet: (fn) => fn,
    Worklets: {
        createContext: jest.fn(),
    }
}));
