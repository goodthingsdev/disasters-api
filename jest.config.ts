import type { JestConfigWithTsJest } from 'ts-jest';

const config: JestConfigWithTsJest = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['./jest.setup.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: true,
      tsconfig: 'tsconfig.json',
    },
  },
  moduleNameMapper: {
    '^(.{1,2}/.*).js$': '$1',
  },
  testMatch: [
    '**/?(*.)+(test|spec).[jt]s',
    '**/app.test.ts',
    '**/index.test.ts',
    '**/graphql/*.test.ts',
    '**/middleware/*.test.ts',
    '**/routes/*.test.ts',
    '**/services/*.test.ts',
    '**/validation/*.test.ts',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    'disasters.e2e.test.[jt]s$',
    'app.exit.coverage.test.[jt]s$',
    'app.coverage.test.[jt]s$',
    'routes.coverage.test.[jt]s$',
    'services.coverage.test.[jt]s$',
  ],
  collectCoverageFrom: [
    '**/*.{ts,js}',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/*.d.ts',
    '!**/jest.setup.ts',
    '!**/jest.config.ts',
    '!**/coverage/**',
    '!**/openapi.json',
    '!**/*.test.ts',
    '!**/*.e2e.test.ts',
    '!**/*.coverage.test.ts',
    '!**/index.ts',
    '!**/eslint.config.js',
    '!**/copy-openapi.js',
    '!**/validate-openapi.js',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '.test.ts$',
    '.e2e.test.ts$',
    '.coverage.test.ts$',
  ],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
};

export default config;
