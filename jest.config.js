/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleNameMapper: {
    // Shared packages
    '^@schema$': '<rootDir>/packages/schema/index',
    '^@schema/(.*)$': '<rootDir>/packages/schema/$1',
    '^@utils/(.*)$': '<rootDir>/packages/utils/$1',
    '^@ui/(.*)$': '<rootDir>/packages/ui/$1',
    // Extension
    '^@shared/(.*)$': '<rootDir>/extension/src/shared/$1',
    '^@background/(.*)$': '<rootDir>/extension/src/background/$1',
    '^@content/(.*)$': '<rootDir>/extension/src/content/$1',
    '^@popup/(.*)$': '<rootDir>/extension/src/popup/$1',
    '^@devtools/(.*)$': '<rootDir>/extension/src/devtools/$1',
    // Brain
    '^@intelligence/(.*)$': '<rootDir>/brain/src/$1',
    '^@brain/(.*)$': '<rootDir>/brain/src/$1',
    // Agent
    '^@agent/(.*)$': '<rootDir>/agent/src/$1',
    // Data
    '^@data/(.*)$': '<rootDir>/brain/src/storage/$1',
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
    'agent/src/**/*.ts',
    'brain/src/**/*.ts',
    'extension/src/shared/**/*.ts',
    'extension/src/background/**/*.ts',
    'packages/**/*.ts',
    '!**/*.d.ts',
    '!**/__tests__/**',
    // Exclude DOM-dependent files (require browser environment / e2e tests)
    '!extension/src/content/**',
    '!extension/src/popup/**',
    '!extension/src/devtools/**',
    // Exclude IndexedDB bootstrap (mocked in all tests)
    '!brain/src/storage/db.ts',
    // Exclude barrel re-exports
    '!packages/schema/index.ts',
    '!brain/src/index.ts',
    '!agent/src/index.ts',
    '!agent/src/insights/index.ts',
    '!extension/src/background/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};
