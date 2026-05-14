import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['extension/src/**/*.{ts,tsx}', 'brain/src/**/*.{ts,tsx}', 'agent/src/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs['recommended'].rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', disallowTypeAnnotations: false }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // P0.3: Flag innerHTML/outerHTML assignments to prevent XSS regressions.
      // Approved usage must go through escapeHtml() or sanitizePromptHtml() helpers.
      'no-restricted-properties': ['error',
        { object: 'element', property: 'innerHTML', message: 'Use escapeHtml() or sanitizePromptHtml() helper instead of raw innerHTML. See P0.3.' },
        { object: 'el', property: 'innerHTML', message: 'Use escapeHtml() or sanitizePromptHtml() helper instead of raw innerHTML. See P0.3.' },
      ],
    },
  },
  {
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // cloud/ has its own tooling (cloud/tsconfig.json + vitest), web/ has its
    // own eslint.config.mjs, mobile/ uses Expo's setup, and graveyard/ is
    // intentionally out of build. None of these should be linted from root.
    ignores: [
      'dist/**',
      'node_modules/**',
      '*.config.js',
      '*.config.mjs',
      'cloud/**',
      'web/**',
      'mobile/**',
      'graveyard/**',
    ],
  },
];
