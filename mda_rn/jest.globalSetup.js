// This runs BEFORE any test framework or preset setup
// Must set up globalThis.expo so jest-expo's setup.js doesn't crash

module.exports = async () => {
    // jest-expo preset's setup.js destructures globalThis.expo.EventEmitter
    if (!globalThis.expo) {
        globalThis.expo = {
            EventEmitter: require('events').EventEmitter,
            // The Expo winter runtime needs this symbol
            [Symbol.for('expo.builtin')]: true,
        };
    }

    // The Expo import.meta registration system
    if (!global.__ExpoImportMetaRegistry) {
        global.__ExpoImportMetaRegistry = {};
    }
};
