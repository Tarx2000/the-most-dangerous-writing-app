// @ts-check
/**
 * Flat-config based ESLint configuration (ESLint v9 style).
 *
 * Replaces the legacy .eslintrc.js to remain compatible with ESLint v9+.
 * Core plugins: @eslint/js (recommended), typescript-eslint (tsc rules),
 * eslint-plugin-react-hooks, and basic custom rules.
 */
import js from '@eslint/js';
import ts from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default ts.config(
  {
    ignores: [
      'node_modules/',
      'assets/',
      'build/',
      'dist/',
      '.expo/',
      '.kilo/',
      'scripts/',
      'android/',
      'ios/',
      'coverage/',
      'plugins/',
      '**/__mocks__/**',
      '**/*.config.{js,mjs,cjs}',
      '**/*.setup.{js,mjs,cjs}',
      '**/*.globalSetup.{js,mjs,cjs}',
      'proxy-ollama.js',
      'balance.js',
      'fix-eslint.js',
      // Ignore third-party dot-directories and leftover skill copies
      '.*/',
      'skills/',
    ],
  },
  {
    // Base settings for every source file
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
        __DEV__: 'readonly',
      },
      parserOptions: {
        project: './tsconfig.json',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      // Code quality
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',

      // React Hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  // ESLint recommended
  js.configs.recommended,
  // TypeScript recommended + strict
  ...ts.configs.recommended,
  ...ts.configs.strict,
);
