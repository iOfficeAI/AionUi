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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      reportsDirectory: './coverage',
      // 手动指定需要覆盖的源文件，确保只检测新增/修改的逻辑
      // 新增功能时，将对应的源文件路径添加到此数组
      // 例如: 'src/process/services/newService.ts'
      include: ['src/process/services/autoUpdaterService.ts', 'src/process/bridge/updateBridge.ts'],
      thresholds: {
        statements: 30,
        branches: 10,
        functions: 35,
        lines: 30,
      },
    },
  },
});
