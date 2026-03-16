import { defineConfig } from 'vitest/config';
import path from 'path';

const aliases = {
  '@/': path.resolve(__dirname, './src') + '/',
  '@process/': path.resolve(__dirname, './src/process') + '/',
  '@renderer/': path.resolve(__dirname, './src/renderer') + '/',
  '@worker/': path.resolve(__dirname, './src/worker') + '/',
  '@mcp/models/': path.resolve(__dirname, './src/common/models') + '/',
  '@mcp/types/': path.resolve(__dirname, './src/common') + '/',
  '@mcp/': path.resolve(__dirname, './src/common') + '/',
};

export default defineConfig({
  resolve: {
    alias: aliases,
  },
  test: {
    globals: true,
    testTimeout: 10000,
    // Use projects to run different environments (Vitest 4+)
    projects: [
      // Node environment tests (existing tests)
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts', 'tests/unit/**/test_*.ts', 'tests/integration/**/*.test.ts'],
          exclude: ['tests/unit/**/*.dom.test.ts', 'tests/unit/**/*.dom.test.tsx'],
          setupFiles: ['./tests/vitest.setup.ts'],
        },
      },
      // jsdom environment tests (React component/hook tests)
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['tests/unit/**/*.dom.test.ts', 'tests/unit/**/*.dom.test.tsx'],
          setupFiles: ['./tests/vitest.dom.setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      reportsDirectory: './coverage',
      // 手动指定需要覆盖的源文件，确保只检测新增/修改的逻辑
      // 新增功能时，将对应的源文件路径添加到此数组
      // 例如: 'src/process/services/newService.ts'
      include: [
        // Process / bridge
        'src/process/services/autoUpdaterService.ts',
        'src/process/bridge/updateBridge.ts',
        'src/process/bridge/applicationBridge.ts',
        'src/utils/configureChromium.ts',
        // ACP
        'src/agent/acp/AcpAdapter.ts',
        'src/agent/acp/AcpConnection.ts',
        'src/agent/acp/acpConnectors.ts',
        'src/agent/acp/modelInfo.ts',
        // Common
        'src/common/chatLib.ts',
        'src/common/update/models/VersionInfo.ts',
        // Renderer utils
        'src/renderer/messages/useAutoScroll.ts',
        'src/renderer/utils/emitter.ts',
        // Extension system (only files with existing tests)
        'src/extensions/ExtensionLoader.ts',
        'src/extensions/{dependencyResolver,pathSafety,statePersistence,entryPointResolver,envResolver,fileResolver}.ts',
        'src/extensions/resolvers/WebuiResolver.ts',
      ],
      thresholds: {
        statements: 30,
        branches: 10,
        functions: 35,
        lines: 30,
      },
    },
  },
});
