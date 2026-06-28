const React = require('react');

// Basic globals for React Native tests
global.Platform = {
    OS: 'ios',
    select: (objs) => objs.ios || objs.default,
};

if (typeof global.__DEV__ === 'undefined') {
    global.__DEV__ = true;
}

// Polyfill XMLHttpRequest for live API tests in Node
const XMLHttpRequest = require('xhr2');
global.XMLHttpRequest = XMLHttpRequest;

// AsyncStorage mock
jest.mock('@react-native-async-storage/async-storage', () => ({
    setItem: jest.fn(),
    getItem: jest.fn(),
    removeItem: jest.fn(),
    getAllKeys: jest.fn(() => Promise.resolve([])),
    multiGet: jest.fn(() => Promise.resolve([])),
    multiSet: jest.fn(() => Promise.resolve()),
    multiRemove: jest.fn(() => Promise.resolve()),
}));

// Vector icons mock
jest.mock('@expo/vector-icons', () => ({
    MaterialCommunityIcons: Object.assign(
        function MaterialCommunityIconsMock() {
            return null;
        },
        { font: { 'material-community': 1 } },
    ),
    Feather: Object.assign(
        function FeatherMock() {
            return null;
        },
        { font: { feather: 1 } },
    ),
}));

// AnimatedScaleButton mock
jest.mock('@/components/ui/AnimatedScaleButton', () => ({
    AnimatedScaleButton: function AnimatedScaleButtonMock({ children }) {
        return children || null;
    },
}));

// Mock react-native
jest.mock('react-native', () => {
    const mockReact = require('react');
    const RN = jest.requireActual('react-native');
    RN.Vibration.vibrate = jest.fn();
    RN.Alert.alert = jest.fn();
    Object.defineProperty(RN, 'useWindowDimensions', {
        configurable: true,
        writable: true,
        value: jest.fn(() => ({
            height: global.__mockWindowHeight || 800,
            width: 400,
            scale: 2,
            fontScale: 1,
        })),
    });
    // Make View's measureInWindow synchronous for tests
    const mockOriginalView = RN.View;
    RN.View = mockReact.forwardRef((props, ref) => {
        mockReact.useImperativeHandle(ref, () => ({
            measureInWindow: (cb) => cb(0, 0, 200, 300),
        }));
        return mockReact.createElement(mockOriginalView, props);
    });
    return RN;
});

// Manual Reanimated Mock
jest.mock('react-native-reanimated', () => {
    return {
        __esModule: true,
        View: 'View',
        Text: 'Text',
        Image: 'Image',
        ScrollView: 'ScrollView',
        configureReanimatedLogger: jest.fn(),
        ReanimatedLogLevel: {
            warn: 'warn',
            error: 'error',
        },
        useSharedValue: jest.fn((val) => {
            const React = require('react');
            const ref = React.useRef(null);
            if (ref.current === null) {
                ref.current = { value: val };
            }
            return ref.current;
        }),
        useAnimatedStyle: jest.fn(() => ({})),
        useDerivedValue: jest.fn((fn) => ({ value: fn() })),
        useAnimatedReaction: jest.fn(),
        useAnimatedScrollHandler: jest.fn(() => ({})),
        withTiming: jest.fn((val) => val),
        withSpring: jest.fn((val) => val),
        withSequence: jest.fn((...args) => args[0]),
        createAnimatedComponent: jest.fn((comp) => comp),
        runOnJS: jest.fn((fn) => fn),
        interpolate: jest.fn((val) => val),
        cancelAnimation: jest.fn(),
        Extrapolation: { CLAMP: 'clamp' },
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
            createAnimatedComponent: jest.fn((comp) => comp),
        },
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
    },
}));

// Gesture handler mock
jest.mock('react-native-gesture-handler', () => {
    const createChainedGesture = () => {
        const chain = {
            minDistance: () => chain,
            activeOffsetY: () => chain,
            onUpdate: () => chain,
            onEnd: () => chain,
        };
        return chain;
    };
    return {
        Gesture: {
            Pan: createChainedGesture,
            Tap: createChainedGesture,
        },
        GestureDetector: function GestureDetectorMock({ children }) {
            return children || null;
        },
        GestureHandlerRootView: function GestureHandlerRootViewMock({ children }) {
            return children || null;
        },
        ScrollView: function ScrollViewMock({ children }) {
            return children || null;
        },
    };
});

// Compressor mock
jest.mock('react-native-compressor', () => ({
    Video: {
        compress: jest.fn(() => Promise.resolve({ path: 'file:///compressed.mp4', size: 1000 })),
    },
}));

// expo-file-system mock
const mockFileSystem = {
    getInfoAsync: jest.fn(() => Promise.resolve({ exists: false, size: 5000000 })),
    deleteAsync: jest.fn(() => Promise.resolve()),
    readAsStringAsync: jest.fn(() => Promise.resolve('')),
    writeAsStringAsync: jest.fn(() => Promise.resolve()),
    cacheDirectory: 'file:///mock-cache/',
    EncodingType: {
        UTF8: 'utf8',
    },
};
jest.mock('expo-file-system', () => mockFileSystem);
jest.mock('expo-file-system/legacy', () => mockFileSystem);

// Stateful expo-video mock — tracks play/pause, emits events, simulates time
jest.mock('expo-video', () => {
    const listeners = new Map();
    let currentTime = 0;
    let isPlaying = false;
    let duration = 120;
    let loop = false;
    let volume = 1;

    const emit = (event, payload) => {
        const subs = listeners.get(event) || [];
        subs.forEach((cb) => cb(payload));
    };

    const createPlayer = (uri, setupFn) => {
        currentTime = 0;
        isPlaying = false;
        duration = 120;
        loop = false;
        volume = 1;
        listeners.clear();

        const player = {
            play: jest.fn(() => {
                isPlaying = true;
                emit('playingChange', { isPlaying: true });
            }),
            pause: jest.fn(() => {
                isPlaying = false;
                emit('playingChange', { isPlaying: false });
            }),
            get currentTime() {
                return currentTime;
            },
            set currentTime(v) {
                currentTime = v;
                emit('timeUpdate', { currentTime: v });
            },
            get duration() {
                return duration;
            },
            set duration(v) {
                duration = v;
            },
            get loop() {
                return loop;
            },
            set loop(v) {
                loop = v;
            },
            get volume() {
                return volume;
            },
            set volume(v) {
                volume = v;
            },
            addListener: jest.fn((event, callback) => {
                if (!listeners.has(event)) listeners.set(event, []);
                listeners.get(event).push(callback);
                return {
                    remove: () => {
                        const arr = listeners.get(event) || [];
                        const idx = arr.indexOf(callback);
                        if (idx >= 0) arr.splice(idx, 1);
                    },
                };
            }),
            _mockTime: (t) => {
                currentTime = t;
                emit('timeUpdate', { currentTime: t });
            },
            _getPlaying: () => isPlaying,
        };

        if (setupFn) setupFn(player);
        return player;
    };

    return {
        useVideoPlayer: jest.fn((uri, setupFn) => createPlayer(uri, setupFn)),
        VideoView: jest.fn(() => null),
    };
});

// Mock expo-sqlite globally to support integration tests loading repositories
jest.mock('expo-sqlite', () => ({
    openDatabaseAsync: jest.fn(() =>
        Promise.resolve({
            withTransactionAsync: jest.fn(async (fn) => await fn()),
            execAsync: jest.fn().mockResolvedValue(undefined),
            runAsync: jest.fn().mockResolvedValue(undefined),
            getAllAsync: jest.fn().mockResolvedValue([]),
            getFirstAsync: jest.fn().mockResolvedValue(null),
            closeAsync: jest.fn().mockResolvedValue(undefined),
        }),
    ),
}));

// Mock expo-camera
jest.mock('expo-camera', () => ({
    CameraView: () => null,
    useCameraPermissions: jest.fn(() => [{ granted: true, canAskAgain: true }, jest.fn()]),
}));

// Mock expo-local-authentication
jest.mock('expo-local-authentication', () => ({
    hasHardwareAsync: jest.fn().mockResolvedValue(true),
    isEnrolledAsync: jest.fn().mockResolvedValue(true),
    authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
}));

// Mock expo-sharing
jest.mock('expo-sharing', () => ({
    isAvailableAsync: jest.fn().mockResolvedValue(true),
    shareAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock expo-video-thumbnails
jest.mock('expo-video-thumbnails', () => ({
    getThumbnailAsync: jest.fn().mockResolvedValue({ uri: 'file:///thumbnail.jpg' }),
}));

// Mock expo-keep-awake
jest.mock('expo-keep-awake', () => ({
    useKeepAwake: jest.fn(),
    activateKeepAwakeAsync: jest.fn(),
    deactivateKeepAwake: jest.fn(),
}));
