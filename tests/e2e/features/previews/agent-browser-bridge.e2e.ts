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
import { execSync } from 'node:child_process';
import { WebSocket } from 'ws';
import type { ElectronApplication } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { invokeBridge } from '../../helpers/bridge';
import { SINGLE_TARGET_ID } from '@process/resources/builtinMcp/cdpTargetProtocol';

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
     *
     * Note this only checks the *root* of the tree. The aioncore assertion below is what
     * verifies the values actually propagate — see the comment there.
     */
    const { port, token } = await readBridgeEnv(electronApp);
    expect(port).not.toBeNull();
    expect(token).toBeTruthy();
    expect((token ?? '').length).toBeGreaterThanOrEqual(32);
  });

  test('aioncore inherits the bridge port and token, so the browser MCP can start', async ({ electronApp }) => {
    /**
     * Regression test for a bug that shipped past the whole rest of this file.
     *
     * The port and token reach the agent purely by process inheritance: aioncore is spawned
     * with `{ ...process.env }`, and the browser MCP is aioncore's child. Inheritance is a
     * snapshot taken at spawn time, so if the bridge starts *after* aioncore, aioncore
     * inherits no token and a stale port, the MCP exits(1) for want of credentials, and
     * agent browser control is dead — while manual browsing, tabs and history all keep
     * working, so nothing looks broken.
     *
     * The other tests here read these values from the Electron main process, which is the
     * layer that *sets* them, and the puppeteer checks dial the bridge directly. All of them
     * pass with the bug present. Only comparing against the actual child process catches it.
     */
    const { port, token } = await readBridgeEnv(electronApp);
    expect(port).not.toBeNull();
    expect(token).toBeTruthy();

    const mainPid = electronApp.process().pid;

    // Match on --parent-pid so a separately installed AionUi (or another dev instance)
    // cannot be mistaken for the backend this test launched.
    const readOurAioncoreEnv = (): { token: string | null; activePort: string | null } | null => {
      let listing = '';
      try {
        listing = execSync('ps -eo pid,args | grep -i aioncore | grep -v grep || true', { encoding: 'utf8' });
      } catch {
        return null;
      }
      for (const line of listing.split('\n').filter(Boolean)) {
        const parent = line.match(/--parent-pid (\d+)/);
        if (!parent || Number(parent[1]) !== mainPid) continue;
        const pid = line.trim().split(/\s+/)[0];
        let env = '';
        try {
          env = execSync(`ps -p ${pid} -wwE -o command= 2>/dev/null || true`, { encoding: 'utf8' });
        } catch {
          return null;
        }
        return {
          token: env.match(/AIONUI_CDP_BRIDGE_TOKEN=(\S+)/)?.[1] ?? null,
          activePort: env.match(/AIONUI_CDP_ACTIVE_PORT=(\d+)/)?.[1] ?? null,
        };
      }
      return null;
    };

    // The backend may still be coming up when this test starts.
    const deadline = Date.now() + 30_000;
    let inherited = readOurAioncoreEnv();
    while (inherited === null && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      inherited = readOurAioncoreEnv();
    }

    // `ps -E` is not available on every platform; skip rather than fail where it is not.
    test.skip(inherited === null, 'could not read the backend process environment on this platform');

    expect(inherited?.token).toBe(token);
    expect(inherited?.activePort).toBe(String(port));
  });

  test('does not expose the app over the old application-wide debugging port', async ({ electronApp }) => {
    /**
     * The whole point of the change. If this regresses, the app is exposing every
     * WebContents again, however well the rest of the bridge behaves.
     *
     * Asks "does *this* app answer on the legacy port?" rather than "is the legacy port
     * free?". The port is a fixed well-known number, so anything else on the machine can be
     * listening on it — a stray Chrome, or another AionUi dev instance still running the
     * app-wide switch. A bare reachability check would fail for reasons unrelated to this
     * code, and a name match like /aionui/ cannot tell a *different* AionUi from our own.
     *
     * The bridge's fixed targetId is the reliable discriminator: it appears only in a
     * response served by this bridge, and Chromium's own endpoint never mints it.
     */
    const { port } = await readBridgeEnv(electronApp);
    // Guard against a false pass: if the bridge itself landed on the legacy port, a
    // reachable port would not mean the old switch was back.
    expect(port).not.toBe(LEGACY_APP_WIDE_PORT);

    const legacyBody = await httpGetFromTestProcess(LEGACY_APP_WIDE_PORT, '/json/list');
    if (legacyBody === null) return; // Nothing listening at all — the strongest outcome.

    // Something answered, but it must not be this app's bridge or targets.
    expect(legacyBody).not.toContain(SINGLE_TARGET_ID);

    /**
     * And it must not be *our* renderer. Chromium's app-wide endpoint lists targets by URL,
     * so if the switch were back for this instance its own window would appear here. Compare
     * against the URL this app actually loaded rather than the product name, so a second
     * AionUi checkout on the same machine cannot fail this test.
     */
    const ourRendererUrl = await electronApp.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
      return win?.webContents.getURL() ?? null;
    });
    if (ourRendererUrl) {
      expect(legacyBody).not.toContain(ourRendererUrl);
    }
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
