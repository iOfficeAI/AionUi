import { defineConfig } from 'vitest/config';
import path from 'path';

const aliases = {
  '@/': path.resolve(__dirname, './src') + '/',
  '@process/': path.resolve(__dirname, './src/process') + '/',
  '@renderer/': path.resolve(__dirname, './src/renderer') + '/',
  '@worker/': path.resolve(__dirname, './src/process/worker') + '/',
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
      reporter: ['text', 'text-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      // Cover ALL source code by default — new files are automatically included.
      // Only exclude files that genuinely cannot be unit-tested (entry points,
      // type-only files, static assets, etc.).
      include: ['src/**/*.{ts,tsx}', 'scripts/prepareBundledBun.js'],
      exclude: [
        // Type declaration files (no runtime code)
        'src/**/*.d.ts',

        // Electron entry points (require Electron runtime)
        'src/index.ts',
        'src/preload.ts',

        // Shims / polyfills
        'src/common/utils/shims/**',

        // Pure type / constant files
        'src/common/types/**',

        // Static assets and i18n JSON (no logic)
        'src/renderer/**/*.json',
        'src/renderer/**/*.svg',
        'src/renderer/**/*.css',

        // i18n config (JSON-only)
        'src/common/config/i18n-config.json',
      ],
      // Thresholds apply to the included file set.
      // Keeping them informational until coverage ramps up across all files.
      thresholds: {
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0,
      },
    },
  },
});
