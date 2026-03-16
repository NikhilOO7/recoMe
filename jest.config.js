/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@intelligence/(.*)$': '<rootDir>/src/intelligence/$1',
    '^@data/(.*)$': '<rootDir>/src/data/$1',
    '^@background/(.*)$': '<rootDir>/src/background/$1',
    '^@content/(.*)$': '<rootDir>/src/content/$1',
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
    'src/intelligence/**/*.ts',
    'src/data/**/*.ts',
    'src/shared/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
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
