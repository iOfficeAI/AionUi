import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/specs',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // Electron tests share one app instance
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Must be 1: tests share a singleton Electron app instance
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'tests/e2e/report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'tests/e2e/report' }]],
  use: {
    trace: 'on-first-retry',
    // screenshot/video are handled by our custom Electron fixture (see fixtures.ts)
    // since Playwright's built-in auto-screenshot requires its own `page` fixture.
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  outputDir: 'tests/e2e/results',
});
