/**
 * Playwright + Electron test fixtures.
 *
 * Launches the Electron app once and shares the window across tests.
 *
 * Two modes:
 *   1. **Packaged mode** (CI default): Launches from electron-builder's unpacked output
 *      (e.g. out/linux-unpacked/aionui, out/mac-arm64/AionUi.app, out/win-unpacked/AionUi.exe).
 *      This validates that packaged resources are intact.
 *   2. **Dev mode** (local default): Launches via `electron .` from project root with
 *      the Vite dev server (electron-vite dev).
 *
 * Set `E2E_PACKAGED=1` to force packaged mode, or `E2E_DEV=1` to force dev mode.
 */
import { test as base, expect, type ElectronApplication, type Page, type TestInfo } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';

type Fixtures = {
  electronApp: ElectronApplication;
  page: Page;
};

// Singleton – one app per test worker
let app: ElectronApplication | null = null;
let mainPage: Page | null = null;
const e2eStateSandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-state-'));
const e2eStateFile = path.join(e2eStateSandboxDir, 'extension-states.json');

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

/**
 * Resolve the path to the packaged Electron executable under out/.
 * Returns { executablePath, cwd } or null if not found.
 */
function resolvePackagedApp(): { executablePath: string; cwd: string } | null {
  const projectRoot = path.resolve(__dirname, '../..');
  const outDir = path.join(projectRoot, 'out');
  if (!fs.existsSync(outDir)) return null;

  const platform = process.platform;

  if (platform === 'win32') {
    // out/win-unpacked/AionUi.exe  or  out/win-x64-unpacked/AionUi.exe
    for (const dir of ['win-unpacked', 'win-x64-unpacked', 'win-arm64-unpacked']) {
      const exe = path.join(outDir, dir, 'AionUi.exe');
      if (fs.existsSync(exe)) return { executablePath: exe, cwd: path.join(outDir, dir) };
    }
  } else if (platform === 'darwin') {
    // out/mac-arm64/AionUi.app/Contents/MacOS/AionUi  or  out/mac/AionUi.app/...
    for (const dir of ['mac-arm64', 'mac-x64', 'mac', 'mac-universal']) {
      const macDir = path.join(outDir, dir);
      if (!fs.existsSync(macDir)) continue;
      const appBundle = fs.readdirSync(macDir).find((f) => f.endsWith('.app'));
      if (appBundle) {
        const exe = path.join(macDir, appBundle, 'Contents', 'MacOS', 'AionUi');
        if (fs.existsSync(exe)) return { executablePath: exe, cwd: macDir };
      }
    }
  } else {
    // Linux: out/linux-unpacked/aionui  (lowercase executable name)
    for (const dir of ['linux-unpacked', 'linux-x64-unpacked', 'linux-arm64-unpacked']) {
      const dirPath = path.join(outDir, dir);
      if (!fs.existsSync(dirPath)) continue;
      // Try common executable names
      for (const name of ['aionui', 'AionUi']) {
        const exe = path.join(dirPath, name);
        if (fs.existsSync(exe)) return { executablePath: exe, cwd: dirPath };
      }
    }
  }

  return null;
}

function shouldUsePackagedMode(): boolean {
  if (process.env.E2E_PACKAGED === '1') return true;
  if (process.env.E2E_DEV === '1') return false;
  // Default: packaged in CI, dev locally
  return !!process.env.CI;
}

async function launchApp(): Promise<ElectronApplication> {
  const projectRoot = path.resolve(__dirname, '../..');
  const usePackaged = shouldUsePackagedMode();

  const commonEnv = {
    ...process.env,
    AIONUI_EXTENSIONS_PATH: process.env.AIONUI_EXTENSIONS_PATH || path.join(projectRoot, 'examples'),
    AIONUI_EXTENSION_STATES_FILE: process.env.AIONUI_EXTENSION_STATES_FILE || e2eStateFile,
    AIONUI_DISABLE_AUTO_UPDATE: '1',
    AIONUI_DISABLE_DEVTOOLS: '1',
    AIONUI_E2E_TEST: '1',
    AIONUI_CDP_PORT: '0',
  };

  if (usePackaged) {
    const packaged = resolvePackagedApp();
    if (!packaged) {
      throw new Error(
        'E2E packaged mode: could not find packaged app under out/. ' +
          'Run `node scripts/build-with-builder.js auto --<platform> --pack-only` first.'
      );
    }

    console.log(`[E2E] Launching PACKAGED app: ${packaged.executablePath}`);

    const launchArgs: string[] = [];
    if (process.platform === 'linux' && process.env.CI) {
      launchArgs.push('--no-sandbox');
    }

    const electronApp = await electron.launch({
      executablePath: packaged.executablePath,
      args: launchArgs,
      cwd: packaged.cwd,
      env: {
        ...commonEnv,
        NODE_ENV: 'production',
      },
      timeout: 60_000,
    });

    return electronApp;
  }

  // Dev mode: launch via electron .
  console.log(`[E2E] Launching DEV app from: ${projectRoot}`);

  const launchArgs = ['.'];
  if (process.platform === 'linux' && process.env.CI) {
    launchArgs.push('--no-sandbox');
  }

  const electronApp = await electron.launch({
    args: launchArgs,
    cwd: projectRoot,
    env: {
      ...commonEnv,
      NODE_ENV: 'development',
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

    // Verify the app process is still alive; relaunch if it crashed
    try {
      await app.evaluate(() => true);
    } catch {
      console.log('[E2E] App process lost – relaunching...');
      app = await launchApp();
      mainPage = null; // force window re-resolution
    }

    await use(app);
  },

  page: async ({ electronApp }, use, testInfo: TestInfo) => {
    if (!mainPage || mainPage.isClosed() || isDevToolsWindow(mainPage)) {
      mainPage = await resolveMainWindow(electronApp);
    }

    // Only wait for DOM when the page is brand-new or was replaced.
    // For an already-resolved page, skip the expensive waitForLoadState
    // to speed up consecutive tests sharing the same window.
    try {
      if (mainPage.url() === 'about:blank' || mainPage.url() === '') {
        await mainPage.waitForLoadState('domcontentloaded', { timeout: 15_000 });
      }
    } catch {
      // Page may have been replaced – resolve again
      mainPage = await resolveMainWindow(electronApp);
    }

    if (mainPage.isClosed()) {
      mainPage = await resolveMainWindow(electronApp);
    }
    await use(mainPage);

    // Attach screenshot on failure so it appears in the HTML report.
    // Playwright's built-in `screenshot: 'only-on-failure'` relies on its
    // own `page` fixture, which we override for Electron — so we do it manually.
    if (testInfo.status !== testInfo.expectedStatus && mainPage && !mainPage.isClosed()) {
      try {
        const screenshot = await mainPage.screenshot();
        await testInfo.attach('screenshot-on-failure', {
          body: screenshot,
          contentType: 'image/png',
        });
      } catch {
        // best-effort: page may have crashed
      }
    }
  },
});

// ── Cleanup ──────────────────────────────────────────────────────────────────
// IMPORTANT: Do NOT use `test.afterAll` here. Playwright runs afterAll at the
// end of **every** test.describe block, which would close and relaunch the
// Electron app between describe blocks — each relaunch costs ~25-30 seconds.
//
// Instead, register a one-time process exit handler so the singleton app stays
// alive for the entire worker lifetime (all spec files, all describe blocks).
let cleanupRegistered = false;
function registerCleanup(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  // Async cleanup before the worker process exits
  process.on('beforeExit', async () => {
    if (app) {
      try {
        await app.evaluate(async ({ app: electronApp }) => {
          electronApp.exit(0);
        });
      } catch {
        // ignore: app may already be closed
      }
      await app.close().catch(() => {});
      app = null;
      mainPage = null;
    }
    fs.rmSync(e2eStateSandboxDir, { recursive: true, force: true });
  });

  // Synchronous fallback for abrupt termination
  process.on('exit', () => {
    try {
      fs.rmSync(e2eStateSandboxDir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  });
}

registerCleanup();

export { expect };
