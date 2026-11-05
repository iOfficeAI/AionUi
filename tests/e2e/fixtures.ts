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

type RendererDiagnostic = {
  type: 'console' | 'pageerror' | 'requestfailed';
  text: string;
};

// Singleton – one app per test worker
let app: ElectronApplication | null = null;
let mainPage: Page | null = null;
const e2eStateSandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-state-'));
const e2eStateFile = path.join(e2eStateSandboxDir, 'extension-states.json');
// Disposable userData root so AionCore migrates a fresh DB per run instead of
// touching the developer's real database (a shared DB that fails migration
// blocks the whole app from booting). Consumed by configureChromium.ts.
const e2eUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-userdata-'));
const rendererDiagnostics = new WeakMap<Page, RendererDiagnostic[]>();

function isDevToolsWindow(page: Page): boolean {
  return page.url().startsWith('devtools://');
}

function attachRendererDiagnostics(page: Page): void {
  if (rendererDiagnostics.has(page)) return;

  const diagnostics: RendererDiagnostic[] = [];
  rendererDiagnostics.set(page, diagnostics);

  page.on('console', (message) => {
    if (!['error', 'warning'].includes(message.type())) return;
    diagnostics.push({ type: 'console', text: `${message.type()}: ${message.text()}` });
  });
  page.on('pageerror', (error) => {
    diagnostics.push({ type: 'pageerror', text: error.stack || error.message });
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? 'unknown';
    diagnostics.push({ type: 'requestfailed', text: `${request.url()} - ${failure}` });
  });
}

async function getRendererReadinessSnapshot(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const root = document.querySelector('#root');
    const scripts = Array.from(document.scripts)
      .map((script) => script.src || script.getAttribute('src') || '')
      .filter(Boolean);
    const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map((link) => (link as HTMLLinkElement).href || link.getAttribute('href') || '')
      .filter(Boolean);

    return {
      href: window.location.href,
      title: document.title,
      readyState: document.readyState,
      bodyTextLength: document.body?.innerText?.trim().length ?? 0,
      bodyHtmlSample: document.body?.innerHTML?.slice(0, 300) ?? '',
      rootExists: Boolean(root),
      rootChildCount: root?.children.length ?? -1,
      scriptCount: scripts.length,
      stylesheetCount: stylesheets.length,
      scripts,
      stylesheets,
    };
  });
}

async function ensureRendererAppMounted(page: Page): Promise<void> {
  attachRendererDiagnostics(page);
  await page.waitForLoadState('domcontentloaded', { timeout: 30_000 });

  try {
    await page.waitForFunction(
      () => {
        const root = document.querySelector('#root');
        return Boolean(root && root.children.length > 0 && document.scripts.length > 0);
      },
      undefined,
      { timeout: 30_000 }
    );
  } catch (error) {
    const snapshot = await getRendererReadinessSnapshot(page).catch((snapshotError: unknown) => ({
      snapshotError: snapshotError instanceof Error ? snapshotError.message : String(snapshotError),
    }));
    const diagnostics = rendererDiagnostics.get(page)?.slice(-20) ?? [];
    throw new Error(
      [
        'Electron renderer did not mount a non-empty app root.',
        `Wait failure: ${error instanceof Error ? error.message : String(error)}`,
        `Snapshot: ${JSON.stringify(snapshot, null, 2)}`,
        `Diagnostics: ${JSON.stringify(diagnostics, null, 2)}`,
      ].join('\n'),
      { cause: error }
    );
  }
}

/**
 * The main window's webContents id, published by the main process in
 * `createWindow`. `null` when the app has not created it yet (or is an older
 * build without the marker), in which case window resolution falls back to the
 * pre-marker rule — the one and only non-DevTools window, see `isMainWindow`.
 */
async function readMainWindowId(electronApp: ElectronApplication): Promise<number | null> {
  return electronApp
    .evaluate(() => (globalThis as typeof globalThis & { __aionuiMainWindowId?: number }).__aionuiMainWindowId ?? null)
    .catch(() => null);
}

/** How long a window gets to expose its own id before it is judged. */
const WINDOW_ID_TIMEOUT_MS = 5_000;

/**
 * Read `window.__windowId`, waiting for the preload to publish it. A window
 * that never publishes one resolves to `null`.
 */
async function readPageWindowId(page: Page): Promise<number | null> {
  return page
    .waitForFunction(() => (window as Window & { __windowId?: number }).__windowId ?? null, undefined, {
      timeout: WINDOW_ID_TIMEOUT_MS,
    })
    .then((handle) => handle.jsonValue() as Promise<number | null>)
    .catch(() => null);
}

/**
 * True when this page is the main window. Matching on the published id rather
 * than "the first non-DevTools window" keeps the suite correct once the app can
 * open a second window: a detached conversation window is a perfectly ordinary
 * non-DevTools window and would otherwise be picked at random.
 *
 * When the marker exists, a window must prove its id — a slow preload used to
 * read as "no id yet", which any window can claim, so a detached window could be
 * accepted as the main one.
 *
 * Without the marker the answer is a guess, and it is only sound when there is
 * nothing to confuse it with: a build that publishes no marker can open one
 * window, so the sole non-DevTools window is the main one. More than one
 * candidate means either the marker has not been published yet or the build is
 * not what we think it is — in both cases keep waiting rather than guess, which
 * is what stops a detached window from being accepted on the event path.
 */
async function isMainWindow(
  electronApp: ElectronApplication,
  page: Page,
  mainWindowId: number | null
): Promise<boolean> {
  if (isDevToolsWindow(page)) return false;
  if (mainWindowId !== null) return (await readPageWindowId(page)) === mainWindowId;
  const candidates = electronApp.windows().filter((win) => !isDevToolsWindow(win));
  return candidates.length === 1 && candidates[0] === page;
}

/**
 * Everything known about why the main window could not be resolved: the marker
 * the main process published, and the id every candidate window claimed. This
 * is the difference between "the suite is broken" and "the preload never ran in
 * window 3".
 */
async function describeUnresolvedMainWindow(
  electronApp: ElectronApplication,
  mainWindowId: number | null
): Promise<string> {
  const candidates = electronApp.windows().filter((win) => !isDevToolsWindow(win));
  const observed = await Promise.all(
    candidates.map(async (win) => `    ${win.url()} → __windowId=${String(await readPageWindowId(win))}`)
  );
  return [
    'Failed to resolve the main renderer window.',
    `  main process __aionuiMainWindowId: ${mainWindowId === null ? 'not published' : mainWindowId}`,
    `  non-DevTools windows seen: ${candidates.length}`,
    ...(observed.length > 0 ? observed : ['    (none)']),
  ].join('\n');
}

async function resolveMainWindow(electronApp: ElectronApplication): Promise<Page> {
  let mainWindowId: number | null = null;

  /**
   * Ask the question of everything open right now, not only of the window that
   * just fired an event. Two facts move independently — the marker appears when
   * the main process publishes it, and windows appear when they open — so a
   * candidate rejected on one pass can be the main window on the next without
   * any new window arriving. Re-testing only newly-evented windows would wait
   * for an event that has already happened and time out with the answer on
   * screen.
   */
  const findMainWindowNow = async (): Promise<Page | null> => {
    mainWindowId ??= await readMainWindowId(electronApp);
    const candidates = electronApp.windows();
    const candidateIsMain = await Promise.all(candidates.map((win) => isMainWindow(electronApp, win, mainWindowId)));
    return candidates.find((_win, index) => candidateIsMain[index]) ?? null;
  };

  const resolveWindowBefore = async (deadline: number): Promise<Page> => {
    const found = await findMainWindowNow();
    if (found) {
      await ensureRendererAppMounted(found);
      return found;
    }

    if (Date.now() >= deadline) {
      // No window proved it is the main one. Guessing here is how a detached
      // window ends up masquerading as main and a broken preload goes unnoticed
      // for a whole suite run, so fail with what was actually observed.
      throw new Error(await describeUnresolvedMainWindow(electronApp, mainWindowId));
    }

    // A new window is the usual reason the answer changes; the timeout doubles
    // as the pacing for re-reading the marker when no window event is coming.
    await electronApp.waitForEvent('window', { timeout: 1_000 }).catch(() => null);
    return resolveWindowBefore(deadline);
  };

  return resolveWindowBefore(Date.now() + 90_000);
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
    AIONUI_E2E_USER_DATA_DIR: process.env.AIONUI_E2E_USER_DATA_DIR || e2eUserDataDir,
    /**
     * 以前这里设 '0' 把 CDP 整个关掉，因为那时开 CDP 等于开 Chromium 的应用级
     * remote-debugging-port —— 无认证地暴露每个 WebContents，还会在多实例间抢端口，
     * 测试环境里不该冒这个险。
     *
     * 现在换成了单目标通道：端口由系统随机分配（不会抢），且必须带口令才能连。风险没了，
     * 而关着它意味着这套安全属性在 E2E 里永远测不到 —— 测试会静默 skip，看起来像通过。
     *
     * Previously '0', which disabled CDP entirely: back then enabling it meant enabling
     * Chromium's application-wide remote-debugging-port, which exposed every WebContents
     * unauthenticated and fought over a fixed port between instances — not a risk worth
     * taking in tests.
     *
     * That is now a single-target bridge on an OS-assigned port that requires a token, so
     * the risk is gone. Leaving it off would mean these security properties are never
     * exercised in E2E: the tests would silently skip and look like passes.
     */
    AIONUI_CDP_PORT: process.env.AIONUI_CDP_PORT || '9230',
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
        await ensureRendererAppMounted(mainPage);
      }
    } catch {
      // Page may have been replaced – resolve again
      mainPage = await resolveMainWindow(electronApp);
    }

    if (mainPage.isClosed()) {
      mainPage = await resolveMainWindow(electronApp);
    }
    await ensureRendererAppMounted(mainPage);
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
    fs.rmSync(e2eUserDataDir, { recursive: true, force: true });
  });

  // Synchronous fallback for abrupt termination
  process.on('exit', () => {
    try {
      fs.rmSync(e2eStateSandboxDir, { recursive: true, force: true });
      fs.rmSync(e2eUserDataDir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  });
}

registerCleanup();

export { expect };
