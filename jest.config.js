module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/tests/**/*.ts',
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@process/(.*)$': '<rootDir>/src/process/$1',
    '^@renderer/(.*)$': '<rootDir>/src/renderer/$1',
    '^@worker/(.*)$': '<rootDir>/src/worker/$1',
    '^@mcp/(.*)$': '<rootDir>/src/common/$1',
    '^@mcp/models/(.*)$': '<rootDir>/src/common/models/$1',
    '^@mcp/types/(.*)$': '<rootDir>/src/common/$1'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
  testTimeout: 10000,
  verbose: true
};