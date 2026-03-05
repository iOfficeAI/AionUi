/**
 * Playwright + Electron test fixtures.
 *
 * Launches the Electron app once and shares the window across tests.
 * The renderer dev server (Vite) is started automatically by `electron-vite dev`.
 */
import { test as base, expect, type ElectronApplication, type Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'path';



type Fixtures = {
  electronApp: ElectronApplication;
  page: Page;
};

// Singleton – one app per test worker
let app: ElectronApplication | null = null;
let mainPage: Page | null = null;



function isDevToolsWindow(page: Page): boolean {
  return page.url().startsWith('devtools://');
}

async function resolveMainWindow(electronApp: ElectronApplication): Promise<Page> {
  const existingMainWindow = electronApp.windows().find((win) => !isDevToolsWindow(win));
  if (existingMainWindow) {
    await existingMainWindow.waitForLoadState('domcontentloaded');
    return existingMainWindow;
  }

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const win = await electronApp.waitForEvent('window', { timeout: 1_000 }).catch(() => null);
    if (win && !isDevToolsWindow(win)) {
      await win.waitForLoadState('domcontentloaded');
      return win;
    }
  }

  throw new Error('Failed to resolve main renderer window (non-DevTools).');
}

async function launchApp(): Promise<ElectronApplication> {
  const appPath = path.resolve(__dirname, '../..');

  const electronApp = await electron.launch({
    args: ['.'],

    cwd: appPath,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      AIONUI_EXTENSIONS_PATH: path.join(appPath, 'examples'),
      // Disable auto-update in tests
      AIONUI_DISABLE_AUTO_UPDATE: '1',
      // Avoid auto-opening DevTools (it interferes with Electron E2E in CI)
      AIONUI_DISABLE_DEVTOOLS: '1',
      AIONUI_E2E_TEST: '1',
      // Use a separate CDP port range for tests
      AIONUI_CDP_PORT: '0',
    },
    timeout: 60_000,
  });

  return electronApp;
}


export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  electronApp: async ({}, use) => {
    if (!app) {
      app = await launchApp();
    }
    await use(app);
  },

  page: async ({ electronApp }, use) => {
    if (!mainPage || mainPage.isClosed() || isDevToolsWindow(mainPage)) {
      mainPage = await resolveMainWindow(electronApp);
    }
    // Extra guard: wait briefly then re-check in case Electron replaces
    // the window during startup (e.g. splash → main transition).
    try {
      await mainPage.waitForLoadState('domcontentloaded', { timeout: 10_000 });
    } catch {
      // Page may have been replaced – resolve again
      mainPage = await resolveMainWindow(electronApp);
    }
    if (mainPage.isClosed()) {
      mainPage = await resolveMainWindow(electronApp);
    }
    await use(mainPage);
  },
});

// Cleanup after all tests
test.afterAll(async () => {
  if (app) {
    try {
      await app.evaluate(async ({ app }) => {
        app.exit(0);
      });
    } catch {
      // ignore: app may already be closed
    }

    await app.close().catch(() => {
      // ignore close errors during teardown
    });
    app = null;
    mainPage = null;
  }
});


export { expect };
