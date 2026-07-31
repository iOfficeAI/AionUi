import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/build-scripts/brandingPolicy.test.ts'],
  },
});
