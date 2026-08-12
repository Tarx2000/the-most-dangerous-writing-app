/**
 * Stateful expo-video mock.
 * Tracks play()/pause() calls, emits events, and simulates time progression.
 * Catches bugs like: another component force-resuming after pause(),
 * missing timeUpdate events, broken togglePlayPause logic.
 */

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
        get playing() {
            return isPlaying;
        },
        set playing(v) {
            isPlaying = v;
            emit('playingChange', { isPlaying: v });
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
        // Internal test helpers
        _mockTime: (t) => {
            currentTime = t;
            emit('timeUpdate', { currentTime: t });
        },
        _getPlaying: () => isPlaying,
    };

    if (setupFn) setupFn(player);
    return player;
};

module.exports = {
    useVideoPlayer: jest.fn((uri, setupFn) => createPlayer(uri, setupFn)),
    VideoView: jest.fn(() => null),
};
