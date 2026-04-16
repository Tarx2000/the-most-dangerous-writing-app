module.exports = {
  // Don't use 'jest-expo' preset — it crashes with import.meta on SDK 55
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['babel-jest', {
      presets: [
        ['babel-preset-expo', { jsxImportSource: 'react-native' }],
      ],
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@shopify/react-native-skia|flubber)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Mock expo's winter runtime to avoid import.meta crash in Jest
    '^expo$': '<rootDir>/src/__mocks__/expo.js',
    '^expo/src/winter$': '<rootDir>/src/__mocks__/expo.js',
    '^expo-modules-core$': '<rootDir>/src/__mocks__/expo-modules-core.js',
    '^expo-modules-core/src/polyfill/dangerous-internal$': '<rootDir>/src/__mocks__/expo-modules-core.js',
    // Mock all other expo-* packages
    '^expo-(.*)$': '<rootDir>/src/__mocks__/expo-module.js',
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/types/**',
    '!src/**/*.d.ts',
  ],
};