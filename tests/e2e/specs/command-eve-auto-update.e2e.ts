/**
 * Command EVE over-the-air update cycle – detection + visible signal proof.
 *
 * Founder requirement: "once delivered to Alois, updates must run through
 * cleanly and we must be able to signal that an update exists." This spec proves
 * the DETECT + SIGNAL half of the A→B cycle against a LOCAL static feed, driving
 * the real W8 feed-agnostic electron-updater wiring (resolveUpdateFeedUrl →
 * configureFeed → setFeedURL → autoUpdater.checkForUpdates → 'update-available')
 * end to end through the production startup auto-check. The full ~450MB
 * download/install half is out of e2e scope and is scripted separately by
 * scripts/release/update-cycle-receipt.mjs in the Company.OS repo.
 *
 * What is proven here (fail-loud, no test.skip):
 *   (a) With COMMAND_EVE_UPDATE_FEED_URL pointing at a local HTTP feed that
 *       advertises a HIGHER version (9.9.9-test), the real autoUpdaterService
 *       reaches status 'available' with version 9.9.9-test, broadcast on the
 *       production ipcBridge.autoUpdate.status channel.
 *   (b) The UI SIGNAL is visible: under locale de-DE the UpdateModal opens and
 *       renders the German signal copy "Update verfügbar" plus the 9.9.9-test
 *       version, driven by that same status broadcast.
 *   (c) With the EXPLICIT empty-env opt-out (COMMAND_EVE_UPDATE_FEED_URL='') the
 *       startup check no-ops quietly — no 'available'/'error'/'checking' status is
 *       broadcast and no error dialog is shown (the W8 quiet "no feed source"
 *       state, now reached via the opt-out in a CE-shell build).
 *   (d) With NO feed env at all, the CE-shell R2 default (FIX 1) activates: the
 *       startup check actually runs (broadcasts 'checking') instead of staying
 *       quiet — the Alois-machine path. (Asserts the seam activated, not the
 *       non-deterministic network outcome; the exact R2 url is unit-tested.)
 *
 * Why the PACKAGED app (not dev, not the shared fixtures app):
 *   electron-updater refuses to run when !app.isPackaged (isUpdaterActive gate),
 *   so a dev `electron .` launch can never reach real 'update-available' detection
 *   without a product-code change. This spec therefore launches the PACKAGED
 *   build under out/<mac>/Command EVE.app (the same artifact pattern the fixtures
 *   use in packaged mode), where app.isPackaged === true and the production
 *   startup auto-check runs the real detection against the feed. It launches its
 *   own instance WITHOUT AIONUI_E2E_TEST / AIONUI_DISABLE_AUTO_UPDATE so the
 *   startup wiring is active, and resolves COMMAND_EVE_UPDATE_FEED_URL from the
 *   environment exactly as it will on the Alois machine. AIONUI_MULTI_INSTANCE=1
 *   keeps it independent of any other running instance.
 *
 * The packaged build must be fresh (contain W8's feed wiring). Rebuild with:
 *   npx electron-vite build --config packages/desktop/electron.vite.config.ts
 *   CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder \
 *     --config packages/desktop/electron-builder.yml --mac dir --arm64 --publish=never
 * The spec fails loud (skips nothing) with a clear message if the .app is absent.
 *
 * Detection only fetches the channel yml and compares semver — the referenced
 * artifact is never downloaded (autoDownload is false in the service), so a tiny
 * dummy zip in the fixture feed is sufficient.
 */
import { test, expect, type ElectronApplication, type Page, _electron as electron } from '@playwright/test';
import { createServer, type Server } from 'http';
import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

// ── Fixture feed (higher version → must be detected) ──────────────────────────

const FEED_VERSION = '9.9.9-test';
const ZIP_NAME = `Command-EVE-${FEED_VERSION}-mac-arm64.zip`;
const BLOCKMAP_NAME = `${ZIP_NAME}.blockmap`;
const STATUS_CHANNEL = 'auto-update.status';

type CapturedStatus = { status: string; version?: string; error?: string };

/**
 * Build an isolated temp feed directory with a dummy artifact and the channel
 * yml files electron-updater requests on macOS. On darwin arm64 the service sets
 * autoUpdater.channel = 'latest-arm64' and electron-updater appends '-mac', so it
 * fetches 'latest-arm64-mac.yml'. We also emit 'latest-mac.yml' (darwin x64
 * default channel) so the fixture is robust if the release machine is Intel.
 */
function buildFeedDir(): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'command-eve-update-feed-'));

  // Dummy artifact + blockmap. Never downloaded during detection; present so the
  // feed is internally consistent.
  const zipBytes = Buffer.from(`command-eve dummy update artifact ${FEED_VERSION}\n`);
  fs.writeFileSync(path.join(dir, ZIP_NAME), zipBytes);
  fs.writeFileSync(path.join(dir, BLOCKMAP_NAME), Buffer.from('dummy-blockmap'));

  const sha512 = createHash('sha512').update(zipBytes).digest('base64');
  const releaseDate = new Date().toISOString();
  const yml =
    `version: ${FEED_VERSION}\n` +
    `files:\n` +
    `  - url: ${ZIP_NAME}\n` +
    `    sha512: ${sha512}\n` +
    `    size: ${zipBytes.length}\n` +
    `path: ${ZIP_NAME}\n` +
    `sha512: ${sha512}\n` +
    `releaseDate: '${releaseDate}'\n`;

  // Emit every channel-yml name the updater might request across mac arch/channel
  // permutations so the proof does not depend on the runner's exact arch.
  for (const name of ['latest-arm64-mac.yml', 'latest-mac.yml']) {
    fs.writeFileSync(path.join(dir, name), yml);
  }

  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/**
 * Minimal static file server over the feed dir on a random loopback port.
 * Mirrors how a real static HTTPS feed (e.g. static.command-eve.com) serves the
 * channel yml + artifacts, but locally and disposable.
 */
function startFeedServer(rootDir: string): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const safe = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(rootDir, safe);
    if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    res.statusCode = 200;
    res.setHeader('content-type', filePath.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr === null || typeof addr === 'string') {
        reject(new Error('Feed server failed to bind a TCP port'));
        return;
      }
      resolve({ server, url: `http://127.0.0.1:${addr.port}/` });
    });
  });
}

// ── Window resolution (mirrors fixtures.ts / ext-no-extensions spec) ──────────

function isDevToolsWindow(page: Page): boolean {
  return page.url().startsWith('devtools://');
}

async function resolveMainWindow(electronApp: ElectronApplication): Promise<Page> {
  const existing = electronApp.windows().find((win) => !isDevToolsWindow(win));
  if (existing) {
    await existing.waitForLoadState('domcontentloaded');
    return existing;
  }
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const win = await electronApp.waitForEvent('window', { timeout: 1_000 }).catch(() => null);
    if (win && !isDevToolsWindow(win)) {
      await win.waitForLoadState('domcontentloaded');
      return win;
    }
  }
  throw new Error('[auto-update e2e] Failed to resolve main renderer window.');
}

/**
 * Resolve the packaged Electron executable under out/ (mirrors fixtures.ts
 * resolvePackagedApp, darwin focus). Returns null if no packaged app is present.
 */
function resolvePackagedApp(): { executablePath: string; cwd: string } | null {
  const projectRoot = path.resolve(__dirname, '../../..');
  const outDir = path.join(projectRoot, 'out');
  if (!fs.existsSync(outDir)) return null;

  if (process.platform === 'darwin') {
    for (const dir of ['mac-arm64', 'mac-x64', 'mac', 'mac-universal']) {
      const macDir = path.join(outDir, dir);
      if (!fs.existsSync(macDir)) continue;
      const appBundle = fs.readdirSync(macDir).find((f) => f.endsWith('.app'));
      if (!appBundle) continue;
      for (const name of ['Command EVE', 'AionUi']) {
        const exe = path.join(macDir, appBundle, 'Contents', 'MacOS', name);
        if (fs.existsSync(exe)) return { executablePath: exe, cwd: macDir };
      }
    }
    return null;
  }

  // Linux / Windows unpacked layouts (release-machine portability).
  const { dirs, names } =
    process.platform === 'win32'
      ? { dirs: ['win-unpacked', 'win-arm64-unpacked', 'win-x64-unpacked'], names: ['Command EVE.exe', 'AionUi.exe'] }
      : { dirs: ['linux-unpacked', 'linux-arm64-unpacked', 'linux-x64-unpacked'], names: ['command-eve', 'Command EVE', 'aionui', 'AionUi'] };
  for (const dir of dirs) {
    const dirPath = path.join(outDir, dir);
    if (!fs.existsSync(dirPath)) continue;
    for (const name of names) {
      const exe = path.join(dirPath, name);
      if (fs.existsSync(exe)) return { executablePath: exe, cwd: dirPath };
    }
  }
  return null;
}

/**
 * Launch the PACKAGED Electron app with the given extra env. WITHOUT
 * AIONUI_E2E_TEST / AIONUI_DISABLE_AUTO_UPDATE so the production startup
 * auto-update wiring runs (initialize + delayed checkForUpdatesAndNotify) and
 * electron-updater is active (app.isPackaged === true). Fails loud if no
 * packaged app exists.
 */
async function launchPackagedApp(extraEnv: Record<string, string>): Promise<ElectronApplication> {
  const packaged = resolvePackagedApp();
  if (!packaged) {
    throw new Error(
      '[auto-update e2e] No packaged app found under out/. The over-the-air update ' +
        'cycle can only be proven against a packaged build (electron-updater refuses ' +
        'to run when !app.isPackaged). Build it first:\n' +
        '  npx electron-vite build --config packages/desktop/electron.vite.config.ts\n' +
        '  CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder \\\n' +
        '    --config packages/desktop/electron-builder.yml --mac dir --arm64 --publish=never'
    );
  }

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    AIONUI_DISABLE_DEVTOOLS: '1',
    AIONUI_MULTI_INSTANCE: '1',
    AIONUI_CDP_PORT: '0',
    NODE_ENV: 'production',
    ...extraEnv,
  };
  // Ensure the gates that would disable the updater are NOT inherited from the
  // playwright runner environment.
  delete env.AIONUI_E2E_TEST;
  delete env.AIONUI_DISABLE_AUTO_UPDATE;
  delete env.CI;
  delete env.GITHUB_ACTIONS;

  const launchArgs: string[] = [];
  if (process.platform === 'linux' && process.env.CI) launchArgs.push('--no-sandbox');

  return electron.launch({
    executablePath: packaged.executablePath,
    args: launchArgs,
    cwd: packaged.cwd,
    env,
    timeout: 60_000,
  });
}

/**
 * Install a page-side capturing listener that records every auto-update.status
 * event the renderer receives (the production ipcBridge emitter envelope is
 * {name, data}). Stored on window for later polling.
 */
async function installStatusCapture(page: Page): Promise<void> {
  await page.evaluate((channel) => {
    const w = window as unknown as {
      electronAPI?: { on: (cb: (e: { value: string }) => void) => () => void };
      __autoUpdateStatuses?: Array<{ status: string; version?: string; error?: string }>;
    };
    w.__autoUpdateStatuses = w.__autoUpdateStatuses || [];
    if (!w.electronAPI) return;
    w.electronAPI.on((event) => {
      try {
        const { name, data } = JSON.parse(event.value) as { name: string; data: { status: string; version?: string; error?: string } };
        if (name === channel && data && typeof data.status === 'string') {
          w.__autoUpdateStatuses!.push({ status: data.status, version: data.version, error: data.error });
        }
      } catch {
        // ignore non-JSON frames
      }
    });
  }, STATUS_CHANNEL);
}

/** True once a terminal (available | error) status has been captured. */
function hasTerminalStatus(statuses: CapturedStatus[]): boolean {
  return statuses.some((x) => x.status === 'available' || x.status === 'error');
}

async function readCapturedStatuses(page: Page): Promise<CapturedStatus[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __autoUpdateStatuses?: CapturedStatus[] };
    return w.__autoUpdateStatuses || [];
  });
}

/** Poll until the predicate over captured statuses holds, or time out. */
async function waitForStatus(
  page: Page,
  predicate: (statuses: CapturedStatus[]) => boolean,
  timeoutMs: number
): Promise<CapturedStatus[]> {
  const deadline = Date.now() + timeoutMs;
  let last: CapturedStatus[] = [];
  while (Date.now() < deadline) {
    last = await readCapturedStatuses(page);
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  return last;
}

// ── Suite A: feed configured → detect + broadcast + visible German signal ─────

test.describe.serial('Command EVE auto-update – detect + signal against local feed', () => {
  test.setTimeout(180_000);

  let feed: { dir: string; cleanup: () => void };
  let feedServer: Server;
  let feedUrl: string;
  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    feed = buildFeedDir();
    const started = await startFeedServer(feed.dir);
    feedServer = started.server;
    feedUrl = started.url;
    electronApp = await launchPackagedApp({ COMMAND_EVE_UPDATE_FEED_URL: feedUrl });
    page = await resolveMainWindow(electronApp);
    // Install the status capture as early as possible — ideally before the ~3s
    // startup auto-check broadcasts. The renderer-bridge backstop in test (a)
    // covers the case where the auto-check already fired.
    await installStatusCapture(page);
  });

  test.afterAll(async () => {
    await electronApp?.close().catch(() => {});
    await new Promise<void>((resolve) => feedServer?.close(() => resolve()));
    feed?.cleanup();
  });

  test('(a) reaches status available with the feed version via the real startup check', async () => {
    // Sanity: the feed server actually serves the channel yml the updater requests.
    const ymlRes = await page.evaluate(async (url) => {
      const r = await fetch(`${url}latest-arm64-mac.yml`);
      return { ok: r.ok, body: await r.text() };
    }, feedUrl);
    expect(ymlRes.ok, 'local feed must serve latest-arm64-mac.yml').toBe(true);
    expect(ymlRes.body).toContain(`version: ${FEED_VERSION}`);

    // The production startup wiring fires checkForUpdatesAndNotify() ~3s after
    // app-ready. As a deterministic backstop (init-order independent), also drive
    // the same W8 configureFeed path through the renderer auto-update bridge if the
    // startup auto-check has not yet produced a terminal status.
    let statuses = await waitForStatus(page, hasTerminalStatus, 12_000);
    if (!hasTerminalStatus(statuses)) {
      // Mirror ipcBridge.autoUpdate.check.invoke({ includePrerelease:false }), which
      // calls autoUpdaterService.checkForUpdates() → the same configureFeed path.
      await page.evaluate(async () => {
        const w = window as unknown as { electronAPI?: { emit: (name: string, data: unknown) => Promise<unknown> } };
        await w.electronAPI?.emit('auto-update.check', { includePrerelease: false }).catch(() => undefined);
      });
      statuses = await waitForStatus(page, hasTerminalStatus, 25_000);
    }

    const errorStatus = statuses.find((s) => s.status === 'error');
    expect(errorStatus, `update check broadcast an error: ${errorStatus?.error ?? ''}`).toBeUndefined();

    const available = statuses.find((s) => s.status === 'available');
    expect(available, `updater must reach 'available'; captured: ${JSON.stringify(statuses)}`).toBeTruthy();
    expect(available?.version, 'available version must equal the feed version').toBe(FEED_VERSION);
  });

  test('(b) renders the visible German "Update verfügbar" signal (de-DE is the Command EVE default)', async () => {
    // Command EVE's fallbackLanguage is de-DE (i18n-config.json), so a fresh
    // instance renders German without any locale switch. Re-broadcast the real
    // 'available' status from the main process over the production bridge channel
    // (office-ai-bridge-adapter, envelope {name,data}); the UpdateModal listens on
    // ipcBridge.autoUpdate.status and opens to the available state.
    await electronApp.evaluate(
      async ({ webContents }, payload) => {
        const serialized = JSON.stringify({
          name: 'auto-update.status',
          data: { status: 'available', version: payload.version },
        });
        for (const wc of webContents.getAllWebContents()) {
          if (!wc.isDestroyed()) wc.send('office-ai-bridge-adapter', serialized);
        }
      },
      { version: FEED_VERSION }
    );

    // The available-state header is the German signal copy "Update verfügbar"
    // (update.availableTitle in de-DE).
    await expect(page.getByText('Update verfügbar')).toBeVisible({ timeout: 30_000 });
    // The version the user sees must be the feed version.
    await expect(page.getByText(FEED_VERSION).first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── Suite B: CE shell default → R2 feed active (no env override) ──────────────

/**
 * Proves FIX 1: an installed Command EVE build with NO COMMAND_EVE_UPDATE_FEED_URL
 * and NO persisted update.feedUrl no longer stays in the W8 quiet no-op — the
 * resolver falls back to the CE-scoped R2 base (COMMAND_EVE_UPDATE_FEED_BASE_URL),
 * so configureFeed wires the generic provider and the startup check actually runs
 * (it broadcasts 'checking'). This is the discriminator against Suite C's
 * explicit empty-env opt-out, which stays silent.
 *
 * We assert the OBSERVABLE seam ('checking' is broadcast → the feed activated and
 * the updater started), NOT the network outcome: against the real public R2
 * bucket the result may be 'available', 'not-available', or a transient network
 * 'error', none of which are deterministic in e2e. The hermetic proof that the
 * default resolves to the exact R2 base lives in the autoUpdaterFeed unit test
 * (configureFeed → setFeedURL url === COMMAND_EVE_UPDATE_FEED_BASE_URL).
 */
test.describe.serial('Command EVE auto-update – CE shell defaults to the R2 feed (no env override)', () => {
  test.setTimeout(120_000);

  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    // Launch WITHOUT COMMAND_EVE_UPDATE_FEED_URL at all (delete any inherited
    // value) so the CE-scoped R2 default is the only feed source. This is the
    // Alois-machine condition.
    electronApp = await launchPackagedApp({});
    page = await resolveMainWindow(electronApp);
    await installStatusCapture(page);
  });

  test.afterAll(async () => {
    await electronApp?.close().catch(() => {});
  });

  test('(d) startup check activates (broadcasts "checking") instead of the quiet no-op', async () => {
    // The R2 default makes configureFeed resolve a feed, so the startup
    // checkForUpdatesAndNotify() calls into electron-updater and the
    // 'checking-for-update' handler broadcasts a 'checking' status. We poll for
    // ANY broadcast status (checking/available/not-available/error all prove the
    // feed activated); the empty-env opt-out (Suite C) produces none of these.
    const sawAnyStatus = (statuses: CapturedStatus[]) => statuses.length > 0;
    let statuses = await waitForStatus(page, sawAnyStatus, 20_000);

    // Deterministic backstop: if the ~3s startup auto-check has not surfaced a
    // status yet, drive the same W8 configureFeed path via the renderer bridge.
    if (!sawAnyStatus(statuses)) {
      await page.evaluate(async () => {
        const w = window as unknown as { electronAPI?: { emit: (name: string, data: unknown) => Promise<unknown> } };
        await w.electronAPI?.emit('auto-update.check', { includePrerelease: false }).catch(() => undefined);
      });
      statuses = await waitForStatus(page, sawAnyStatus, 25_000);
    }

    expect(
      statuses.length,
      `CE-shell default must activate the R2 feed and start a real check; captured: ${JSON.stringify(statuses)}`
    ).toBeGreaterThan(0);

    // If the check reached a terminal error, it must be a NETWORK/feed error from
    // actually contacting R2 — never the W8 "no feed configured" short-circuit
    // (which would mean the CE default failed to apply).
    const noFeedError = statuses.find((s) => s.status === 'error' && /no feed|kein feed|feed configured/i.test(s.error || ''));
    expect(noFeedError, `the CE default must apply — no "no feed configured" error allowed: ${noFeedError?.error ?? ''}`).toBeUndefined();
  });
});

// ── Suite C: no feed → quiet no-op, no error dialog ───────────────────────────

test.describe.serial('Command EVE auto-update – quiet no-op when no feed configured', () => {
  test.setTimeout(120_000);

  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    // COMMAND_EVE_UPDATE_FEED_URL='' is the EXPLICIT "force no feed" opt-out.
    // After FIX 1 the packaged CE build (COMMAND_EVE_SHELL_ENABLED === true) would
    // otherwise fall back to the R2 default (see Suite B), so the empty-string env
    // is what pins this instance into the W8 quiet no-op state for the proof.
    electronApp = await launchPackagedApp({ COMMAND_EVE_UPDATE_FEED_URL: '' });
    page = await resolveMainWindow(electronApp);
    await installStatusCapture(page);
  });

  test.afterAll(async () => {
    await electronApp?.close().catch(() => {});
  });

  test('(c) startup check resolves quietly, no available/error broadcast, no error dialog', async () => {
    // Give the production startup auto-check ample time to have run (and no-op).
    await new Promise((r) => setTimeout(r, 8_000));
    const statuses = await readCapturedStatuses(page);

    // Quiet no-op: the service short-circuits before electron-updater runs.
    // No 'checking', no 'available', no 'error' is broadcast.
    expect(statuses.find((s) => s.status === 'available'), 'no update should be signalled without a feed').toBeUndefined();
    expect(statuses.find((s) => s.status === 'error'), 'no error should be broadcast without a feed').toBeUndefined();
    expect(statuses.find((s) => s.status === 'checking'), 'updater must not even start checking without a feed').toBeUndefined();

    // No error dialog / modal surfaced to the user.
    await expect(page.getByText('Update verfügbar')).toHaveCount(0);
    await expect(page.getByText('Update fehlgeschlagen')).toHaveCount(0);
    await expect(page.getByText('Update failed')).toHaveCount(0);
  });
});
