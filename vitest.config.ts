import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@/': path.resolve(__dirname, './src') + '/',
      '@process/': path.resolve(__dirname, './src/process') + '/',
      '@renderer/': path.resolve(__dirname, './src/renderer') + '/',
      '@worker/': path.resolve(__dirname, './src/worker') + '/',
      '@mcp/models/': path.resolve(__dirname, './src/common/models') + '/',
      '@mcp/types/': path.resolve(__dirname, './src/common') + '/',
      '@mcp/': path.resolve(__dirname, './src/common') + '/',
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/test_*.ts'],
    setupFiles: ['./tests/vitest.setup.ts'],
    testTimeout: 10000,
  },
});
