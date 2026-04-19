module.exports = {
  extends: ['expo', 'plugin:react-hooks/recommended'],
  rules: {
    // TypeScript strictness
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

    // React best practices
    'react/no-unstable-nested-components': 'off',
    'react/display-name': 'off',

    // React Hooks — already enabled by plugin:react-hooks/recommended
    'react-hooks/exhaustive-deps': 'warn',

    // Import ordering
    'import/first': 'error',
    'import/no-duplicates': 'warn',

    // Code quality
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'prefer-const': 'error',
    'no-var': 'error',
  },
  env: {
    jest: true,
  },
};