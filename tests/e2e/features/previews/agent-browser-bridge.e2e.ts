/**
 * Agent browser control — the single-target CDP bridge.
 *
 * Regression coverage for the vulnerability this bridge replaced. Chromium's
 * `remote-debugging-port` switch is application-wide with no per-target ACL, so enabling
 * it exposed every WebContents — including the main window and its preload bridge — to any
 * local process, unauthenticated. Agent browser control defaults to on, so that was the
 * default posture.
 *
 * These tests assert the properties that make the replacement safe, against a real running
 * app:
 *   1. Nothing listens on the old application-wide port.
 *   2. The bridge advertises exactly one page target.
 *   3. The WebSocket refuses a missing, wrong, or prefix-of-correct token.
 *   4. The bridge refuses to attach to the main window.
 *
 * The network probes deliberately run from the test process rather than inside the app:
 * that is the actual threat model — another local process trying to connect.
 *
 * Each is a property that, if it silently regressed, would re-open the hole while every
 * user-visible feature still appeared to work.
 */
import http from 'node:http';
import { WebSocket } from 'ws';
import type { ElectronApplication } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { invokeBridge } from '../../helpers/bridge';

/** The port Chromium's app-wide switch used to occupy. Must now be dead. */
const LEGACY_APP_WIDE_PORT = 9230;

type BridgeEnv = { port: number | null; token: string | null };

/**
 * Read the bridge's port and token from the main process env, where startup published
 * them. Asking the app (rather than guessing) is what keeps the test correct given the
 * port is OS-assigned.
 *
 * Polls because the bridge starts late in app startup, after the first window is already
 * interactive — reading once races startup and yields a token-less result.
 */
const readBridgeEnv = async (electronApp: ElectronApplication): Promise<BridgeEnv> => {
  const readOnce = (): Promise<BridgeEnv> =>
    electronApp.evaluate(async () => {
      const rawPort = process.env.AIONUI_CDP_ACTIVE_PORT;
      const parsed = rawPort ? Number(rawPort) : NaN;
      return {
        port: Number.isInteger(parsed) && parsed > 0 ? parsed : null,
        token: process.env.AIONUI_CDP_BRIDGE_TOKEN ?? null,
      };
    });

  const deadline = Date.now() + 30_000;
  let latest = await readOnce();
  while ((latest.port === null || !latest.token) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    latest = await readOnce();
  }
  return latest;
};

/** GET a path off the bridge from this process; null when nothing is listening. */
const httpGetFromTestProcess = (port: number, path: string): Promise<string | null> =>
  new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path, timeout: 5_000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += String(chunk)));
      res.on('end', () => resolve(body));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });

/** Attempt a WebSocket upgrade and report only whether it was accepted. */
const tryWebSocket = (url: string): Promise<'open' | 'refused'> =>
  new Promise((resolve) => {
    const socket = new WebSocket(url);
    const settle = (result: 'open' | 'refused') => {
      try {
        socket.close();
      } catch {
        // already closing
      }
      resolve(result);
    };
    socket.on('open', () => settle('open'));
    socket.on('error', () => settle('refused'));
    setTimeout(() => settle('refused'), 5_000);
  });

test.describe('Agent browser control (single-target CDP bridge)', () => {
  test('publishes a bridge port and token to the process tree', async ({ electronApp }) => {
    /**
     * The MCP inherits both and exits without them, so their absence is not cosmetic: it
     * is the difference between driving the in-app browser and driving a hidden Chrome the
     * user cannot see.
     */
    const { port, token } = await readBridgeEnv(electronApp);
    expect(port).not.toBeNull();
    expect(token).toBeTruthy();
    expect((token ?? '').length).toBeGreaterThanOrEqual(32);
  });

  test('does not leave the old application-wide debugging port open', async ({ electronApp }) => {
    /**
     * The whole point of the change. If this fails the app is exposing every WebContents
     * again, however well the rest of the bridge behaves.
     */
    const { port } = await readBridgeEnv(electronApp);
    // Guard against a false pass: if the bridge happened to land on the legacy port, a
    // reachable port would not mean the old switch was back.
    expect(port).not.toBe(LEGACY_APP_WIDE_PORT);
    expect(await httpGetFromTestProcess(LEGACY_APP_WIDE_PORT, '/json/version')).toBeNull();
  });

  test('advertises exactly one page target over discovery', async ({ electronApp }) => {
    const { port } = await readBridgeEnv(electronApp);
    expect(port).not.toBeNull();

    const body = await httpGetFromTestProcess(port as number, '/json/list');
    expect(body).not.toBeNull();

    const targets = JSON.parse(body as string) as Array<{ type: string; webSocketDebuggerUrl: string }>;
    // Exactly one: puppeteer must never be handed a second target to choose from.
    expect(targets).toHaveLength(1);
    expect(targets[0].type).toBe('page');
    /**
     * Discovery hands back a tokened ws address. That is how the token reaches puppeteer,
     * which cannot carry a query string on browserURL itself — `new URL(path, base)` drops
     * it when the path is absolute.
     */
    expect(targets[0].webSocketDebuggerUrl).toContain('token=');
  });

  test('refuses a WebSocket upgrade without a valid token', async ({ electronApp }) => {
    const { port, token } = await readBridgeEnv(electronApp);
    expect(port).not.toBeNull();
    expect(token).toBeTruthy();

    const base = `ws://127.0.0.1:${port}/aionui-cdp`;

    expect(await tryWebSocket(base)).toBe('refused');
    expect(await tryWebSocket(`${base}?token=not-the-token`)).toBe('refused');
    /**
     * A prefix of the real token must fail too. Comparing with `startsWith`, or bailing out
     * on the first differing character, would accept this and leak the token one character
     * at a time.
     */
    expect(await tryWebSocket(`${base}?token=${(token as string).slice(0, -1)}`)).toBe('refused');
    // Control: the correct token does get through, so the refusals above mean something.
    expect(await tryWebSocket(`${base}?token=${token}`)).toBe('open');
  });

  test('refuses to attach the bridge to the main window', async ({ electronApp, page }) => {
    /**
     * The core containment guarantee, exercised through the real attack path.
     *
     * The bridge learns its target from a renderer-reported webContents id, so the
     * dangerous case is something reporting the *main window's* id: that window carries the
     * preload bridge, and attaching to it would hand an agent the whole application —
     * precisely the hole in the app-wide switch.
     */
    const mainWindowContentsId = await electronApp.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
      return win ? win.webContents.id : null;
    });
    expect(mainWindowContentsId).not.toBeNull();

    const result = await invokeBridge<{ success: boolean; msg?: string }>(
      page,
      'app.report-browser-webcontents-id',
      { webContentsId: mainWindowContentsId },
      10_000
    );

    expect(result.success).toBe(false);
    // Assert on the reason so a regression surfaces as a changed message rather than a
    // silently permissive attach.
    expect(result.msg ?? '').toMatch(/only the in-app browser webview|Refusing to attach/i);
  });
});
