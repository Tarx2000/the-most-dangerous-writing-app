module.exports = {
    preset: 'jest-expo',
    setupFiles: ['<rootDir>/jest.setup.js'],
    transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@shopify/react-native-skia|flubber|react-native-reanimated|react-native-worklets)',
    ],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
    testPathIgnorePatterns: ['\\.live\\.test\\.ts$'],
    collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/types/**', '!src/**/*.d.ts'],
};
