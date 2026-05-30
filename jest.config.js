/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  // cloud/ uses Vitest, web/ uses its own toolchain — root Jest only covers extension + packages.
  testPathIgnorePatterns: ['/node_modules/', '/cloud/', '/web/', '/graveyard/', '/dist/'],
  moduleNameMapper: {
    '^@schema$': '<rootDir>/packages/schema/index',
    '^@schema/(.*)$': '<rootDir>/packages/schema/$1',
    '^@utils/(.*)$': '<rootDir>/packages/utils/$1',
    '^@shared/(.*)$': '<rootDir>/extension/src/shared/$1',
    '^@background/(.*)$': '<rootDir>/extension/src/background/$1',
    '^@content/(.*)$': '<rootDir>/extension/src/content/$1',
    '^@popup/(.*)$': '<rootDir>/extension/src/popup/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: './tsconfig.test.json',
        diagnostics: { ignoreCodes: ['TS151001'] },
      },
    ],
  },
  collectCoverageFrom: [
    'extension/src/shared/**/*.ts',
    'extension/src/background/**/*.ts',
    'extension/src/capture/**/*.ts',
    'extension/src/surfaces/**/*.ts',
    'packages/**/*.ts',
    '!**/*.d.ts',
    '!**/__tests__/**',
    '!packages/schema/index.ts',
    '!extension/src/background/index.ts',
  ],
};
