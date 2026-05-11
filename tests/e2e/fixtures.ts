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

/**
 * Auxiliary windows that are not the main renderer (ambient bubble, pet,
 * pet-confirm, pet-hit). Filter them out when resolving the main renderer
 * page so bridge calls land on the window that actually has `electronAPI`.
 */
function isSatelliteWindow(page: Page): boolean {
  const url = page.url().toLowerCase();
  return (
    url.includes('/ambient/') ||
    url.includes('/pet/') ||
    url.includes('ambient.html') ||
    url.includes('pet.html') ||
    url.includes('pet-hit.html') ||
    url.includes('pet-confirm.html')
  );
}

async function resolveMainWindow(electronApp: ElectronApplication): Promise<Page> {
  const existingMainWindow = electronApp.windows().find((win) => !isDevToolsWindow(win) && !isSatelliteWindow(win));
  if (existingMainWindow) {
    await existingMainWindow.waitForLoadState('domcontentloaded');
    return existingMainWindow;
  }

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const win = await electronApp.waitForEvent('window', { timeout: 1_000 }).catch(() => null);
    if (win && !isDevToolsWindow(win) && !isSatelliteWindow(win)) {
      await win.waitForLoadState('domcontentloaded');
      return win;
    }
    const existing = electronApp.windows().find((w) => !isDevToolsWindow(w) && !isSatelliteWindow(w));
    if (existing) {
      await existing.waitForLoadState('domcontentloaded');
      return existing;
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

/**
 * Launch an Electron app with optional extra environment variables.
 *
 * AC-M1-14 fixture contract: ambient E2E uses this to launch a *second* Electron
 * process with `AIONUI_AMBIENT=1` while the singleton remains ambient-unaware.
 * Regular (non-ambient) tests call this without `extraEnv` via the singleton path.
 *
 * @param extraEnv — merged on top of `commonEnv` (e.g. `{ AIONUI_AMBIENT: '1' }`).
 *                   Callers wanting to clear a var can pass an empty string.
 */
export async function launchAppWithEnv(extraEnv: Record<string, string> = {}): Promise<ElectronApplication> {
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
    ...extraEnv,
  };

  if (usePackaged) {
    const packaged = resolvePackagedApp();
    if (!packaged) {
      throw new Error(
        'E2E packaged mode: could not find packaged app under out/. ' +
          'Run `node scripts/build-with-builder.js auto --<platform> --pack-only` first.'
      );
    }

    console.log(
      `[E2E] Launching PACKAGED app: ${packaged.executablePath}${extraEnv.AIONUI_AMBIENT === '1' ? ' (ambient)' : ''}`
    );

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

    const expectAmbient = commonEnv.AIONUI_AMBIENT === '1';
    await waitForExpectedWindow(electronApp, expectAmbient, 8_000).catch(() => {
      /* best-effort */
    });
    return electronApp;
  }

  // Dev mode: launch via electron .
  console.log(`[E2E] Launching DEV app from: ${projectRoot}${extraEnv.AIONUI_AMBIENT === '1' ? ' (ambient)' : ''}`);

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

  // Playwright's `electron.launch` returns right after the Electron `ready`
  // event, but before our own `app.whenReady()` callback has finished
  // creating windows. Tests that inspect `BrowserWindow.getAllWindows()` in
  // `beforeAll` would otherwise observe an empty array and skip themselves
  // (e.g. `tests/e2e/specs/ambient-mode/bubble.e2e.ts` guards on it). Wait
  // up to ~8s for a useful window so downstream tests see a stable app.
  //
  // When AIONUI_AMBIENT=1 is set, we specifically wait for the ambient
  // bubble window (title matches /ambient|bubble/) — the app creates the
  // main window first, then ambient, so waiting on ambient also guarantees
  // main is already up.
  const expectAmbient = commonEnv.AIONUI_AMBIENT === '1';
  await waitForExpectedWindow(electronApp, expectAmbient, 12_000).catch(() => {
    // best-effort: if no window appears in 12s, let the individual spec decide
  });

  return electronApp;
}

/** Back-compat alias: singleton launch path uses this unchanged. */
async function launchApp(): Promise<ElectronApplication> {
  return launchAppWithEnv();
}

/**
 * Poll `BrowserWindow.getAllWindows()` until at least one non-destroyed
 * window exists (or an ambient-titled one, when requested). Returns early on
 * first sighting; rejects on timeout. This bridges the gap between
 * Playwright's `electron.launch` returning and the app's own whenReady
 * chain creating its first BrowserWindow.
 */
async function waitForExpectedWindow(
  electronApp: ElectronApplication,
  expectAmbient: boolean,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await electronApp
      .evaluate(({ BrowserWindow }, needAmbient: boolean) => {
        const alive = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
        if (!needAmbient) return alive.length > 0;
        return alive.some((w) => {
          const t = w.getTitle().toLowerCase();
          const u = w.webContents.getURL().toLowerCase();
          return t.includes('ambient') || t.includes('bubble') || u.includes('/ambient') || u.includes('ambient.html');
        });
      }, expectAmbient)
      .catch(() => false);
    if (found) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Expected window did not appear within ' + timeoutMs + 'ms');
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
    if (!mainPage || mainPage.isClosed() || isDevToolsWindow(mainPage) || isSatelliteWindow(mainPage)) {
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

    // Wait for the renderer's execution context to stabilize before handing
    // the page to the test. Electron app startup goes through renderer-side
    // route transitions (hash router lands on `#/guid` or similar) that
    // invalidate the current execution context — any `page.evaluate` during
    // that window fails with "Execution context destroyed". We wait for
    // `electronAPI` to be available (requires: preload ran + page loaded)
    // and then for a brief quiet period to avoid racing with navigation.
    const stableDeadline = Date.now() + 8_000;
    let lastOk = 0;
    while (Date.now() < stableDeadline) {
      const ok = await mainPage
        .evaluate(() => typeof (window as { electronAPI?: unknown }).electronAPI !== 'undefined')
        .catch(() => false);
      if (ok) {
        if (lastOk === 0) lastOk = Date.now();
        // Require 300ms of consecutive success (no navigation churn) before
        // we trust the page is stable. This is cheap compared to the alternative
        // of failing the first test that uses `page.evaluate`.
        if (Date.now() - lastOk >= 300) break;
      } else {
        lastOk = 0;
      }
      await new Promise((r) => setTimeout(r, 50));
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

// ── Ambient Fixture (AC-M1-14) ──────────────────────────────────────────────
//
// Independent Electron app instance for ambient-mode specs. Uses
// `AIONUI_AMBIENT=1` env var (AC-M1-11 feature flag — env var overrides
// settings). Runs as its own singleton so tests against ambient don't pollute
// the main app's state (settings file, window state) and vice versa.
//
// Usage (in a spec file under tests/e2e/specs/ambient-mode/):
//
//   import { ambientTest as test, expect } from '../../fixtures';
//   test('bubble appears', async ({ ambientApp, bubblePage }) => { ... });
//
// `ambientApp`   — the ElectronApplication for the ambient process.
// `bubblePage`   — Playwright Page bound to the ambient bubble window
//                  (resolved by title/url filter; null if not yet created).
// `electronApp`  — alias of `ambientApp` (so existing specs that used the
//                  singleton fixture's `electronApp` name keep compiling when
//                  they switch import to `ambientTest`).
// `page`         — alias of `bubblePage` (non-null contract — see below).
//                  If the ambient bubble window is not yet resolvable, tests
//                  that accept this fixture will be skipped with a clear
//                  message rather than receiving null.
//
// The ambient app is NOT relaunched between spec files (same singleton
// pattern as main `test`). Clean up on worker exit via `beforeExit` hook.

type AmbientFixtures = {
  ambientApp: ElectronApplication;
  bubblePage: Page | null;
  // Aliases so specs that previously consumed `electronApp` / `page` from the
  // singleton `test` can switch import to `ambientTest` without touching every
  // test-case signature.
  electronApp: ElectronApplication;
  page: Page;
};

let sharedAmbientApp: ElectronApplication | null = null;
let sharedBubblePage: Page | null = null;

/** Find the Playwright Page bound to the ambient bubble window. */
async function resolveBubblePage(app: ElectronApplication): Promise<Page | null> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    for (const win of app.windows()) {
      if (isDevToolsWindow(win)) continue;
      const url = win.url().toLowerCase();
      // Match ambient.html / /ambient / bubble pages. Main window URL wouldn't match.
      if (url.includes('ambient') || url.includes('bubble')) {
        return win;
      }
      // Also try matching via BrowserWindow title (URL may be `about:blank` briefly).
      const title = await win.title().catch(() => '');
      if (title.toLowerCase().includes('ambient') || title.toLowerCase().includes('bubble')) {
        return win;
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

export const ambientTest = base.extend<AmbientFixtures>({
  // eslint-disable-next-line no-empty-pattern
  ambientApp: async ({}, use) => {
    if (!sharedAmbientApp) {
      sharedAmbientApp = await launchAppWithEnv({ AIONUI_AMBIENT: '1' });
    }
    // Verify the app process is still alive; relaunch if it crashed
    try {
      await sharedAmbientApp.evaluate(() => true);
    } catch {
      console.log('[E2E ambient] App process lost – relaunching...');
      sharedAmbientApp = await launchAppWithEnv({ AIONUI_AMBIENT: '1' });
      sharedBubblePage = null;
    }
    await use(sharedAmbientApp);
  },

  bubblePage: async ({ ambientApp }, use) => {
    if (!sharedBubblePage || sharedBubblePage.isClosed()) {
      sharedBubblePage = await resolveBubblePage(ambientApp);
    }
    await use(sharedBubblePage);
  },

  // Alias: `electronApp` resolves to the ambient app.
  electronApp: async ({ ambientApp }, use) => {
    await use(ambientApp);
  },

  // Alias: `page` resolves to the bubble page (non-null contract).
  // If the bubble window isn't up yet, skip — Dev hasn't implemented ambient
  // impl, or the window is still spinning up. Tests relying on `page` must
  // accept this skip path; specs that want a nullable handle should consume
  // `bubblePage` directly.
  page: async ({ bubblePage }, use, testInfo) => {
    if (!bubblePage) {
      testInfo.skip(true, 'ambient bubble page not available (Dev impl pending or window not yet created)');
      return;
    }
    await use(bubblePage);
  },
});

// Cleanup for ambient app — register once alongside the main cleanup.
let ambientCleanupRegistered = false;
function registerAmbientCleanup(): void {
  if (ambientCleanupRegistered) return;
  ambientCleanupRegistered = true;
  process.on('beforeExit', async () => {
    if (sharedAmbientApp) {
      try {
        await sharedAmbientApp.evaluate(async ({ app: electronApp }) => {
          electronApp.exit(0);
        });
      } catch {
        // ignore
      }
      await sharedAmbientApp.close().catch(() => {});
      sharedAmbientApp = null;
      sharedBubblePage = null;
    }
  });
}
registerAmbientCleanup();

export { expect };
