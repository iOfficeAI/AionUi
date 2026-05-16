import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,unit.test}.ts', 'tests/**/*.test.ts'],
    testTimeout: 10_000,
  },
});
