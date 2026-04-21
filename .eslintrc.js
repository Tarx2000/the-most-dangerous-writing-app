module.exports = {
  extends: ['expo', 'plugin:react-hooks/recommended'],
  rules: {
    // TypeScript strictness
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

    // React best practices
    // Inline components (arrow fns returned from render fns) are flagged here.
    // If you intentionally define a small purely-presentational component inline
    // that never appears in a hot path, suppress it with a comment per-instance
    // rather than blanket-disabling the rule.
    'react/no-unstable-nested-components': ['error', { 'allowedForComponents': ['ShimmerLine'] }],
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
