/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * End-to-end reproduction of #4155: "a paired browser dies roughly 24 hours
 * after pairing — endless 401 + WebSocket reconnect loop".
 *
 * Everything below the test is real: the shipped WebUI adapters
 * (`httpBridge.ts`, `browser.ts`, `sessionRefresh.ts`) run unmodified, talking
 * over real TCP through the real web host (`startStaticServer`, including its
 * `/api/*` reverse proxy and its `/ws` splice) to a stub aioncore. Only Core
 * itself is a stub, and only so its clock can be moved.
 *
 * **Fast-forward.** The stub carries the production lifetimes — a 24 h access
 * token, a 30 d refresh/pairing cookie — and decides validity against a virtual
 * clock. `core.advance(ACCESS_TTL_MS)` is therefore literally "the next day" for
 * every token in the system and costs no wall-clock time. Client-side timers stay
 * real, because real sockets and real HTTP need them; the waits the tests
 * actually perform are all under two seconds.
 *
 * Each test pairs, jumps a day, then opens the WebUI **once** — the phone being
 * picked up the next morning, which is the reproduction the issue describes.
 * Two sockets come up on that load: the bridge socket (`browser.ts`) and the
 * realtime stream (`httpBridge.ts`). Both are counted.
 *
 * The two outcomes asserted here are the two the issue named as acceptable:
 *
 *   > Either the session is transparently renewed and the WebUI keeps working,
 *   > or […] the phone lands cleanly on the pairing screen.
 *
 * A session that can be renewed is renewed, invisibly (`renewable`). A session
 * that cannot — the paired browser, handed a Core JWT and nothing to renew it
 * with — gives up once, quietly, and routes to login (`paired`). Neither may
 * loop, and "does not loop" is measured server-side in request counts rather
 * than inferred from client state.
 *
 * ## Pointing this at the packaged web host
 *
 * The paired-browser session lifecycle itself lives in the packaged
 * `@aionui/web-host`, not in this repository, so what runs here by default is the
 * open-source static server with the pairing cookie shapes reproduced by hand.
 * Set `AIONUI_WEBHOST_UNDER_TEST` to a module exporting `startStaticServer` to run
 * the identical scenarios against a build that has the real pairing layer.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ACCESS_COOKIE,
  ACCESS_TTL_MS,
  REFRESH_COOKIE,
  startCoreStub,
  type CoreStub,
  type SessionMode,
} from './webui-session/coreStub';
import { installBrowserGlobals, removeBrowserGlobals, type BrowserHarness } from './webui-session/browserHarness';
import { startStaticServer, type StaticServerHandle } from '../../packages/web-host/src/static-server';

const platformMock = vi.hoisted(() => ({ adapter: vi.fn() }));
vi.mock('@/common/platform/bridge', () => ({ bridge: { adapter: platformMock.adapter } }));

type BridgeAdapter = {
  emit: (name: string, data: unknown) => void;
  on: (emitter: { emit: (name: string, data: unknown) => void }) => void;
};

type RealtimeModule = typeof import('@/common/adapter/httpBridge');

/** How long the client is driven while asserting that nothing storms. */
const STORM_WINDOW_MS = 1200;
/** A day, plus a minute so nothing turns on the boundary. */
const ONE_DAY_LATER_MS = ACCESS_TTL_MS + 60_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function resolveStartWebHost(): Promise<typeof startStaticServer> {
  const override = process.env.AIONUI_WEBHOST_UNDER_TEST;
  if (!override) return startStaticServer;
  const mod = (await import(/* @vite-ignore */ override)) as { startStaticServer?: typeof startStaticServer };
  if (!mod.startStaticServer) {
    throw new Error(`AIONUI_WEBHOST_UNDER_TEST=${override} does not export startStaticServer`);
  }
  return mod.startStaticServer;
}

function makeStaticDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aionui-webui-e2e-'));
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>webui</title>');
  return dir;
}

describe('WebUI session lifetime, 24h after pairing (#4155)', () => {
  let core: CoreStub;
  let host: StaticServerHandle;
  let harness: BrowserHarness;

  /** Boot Core + the web host, then pair: log in so the browser holds real cookies. */
  async function pair(mode: SessionMode): Promise<void> {
    core = await startCoreStub();
    core.setSessionMode(mode);
    const startWebHost = await resolveStartWebHost();
    host = await startWebHost({ staticDir: makeStaticDir(), backendPort: core.port, port: 0 });
    harness = installBrowserGlobals(host.localUrl);

    const response = await globalThis.fetch('/login', { method: 'POST' });
    expect(response.status).toBe(200);
  }

  /**
   * Open the WebUI: a fresh copy of the client, as a page load gives. Module
   * state (sockets, the refresh latch) starts clean; the cookie jar persists,
   * exactly as a browser's would. Called at most once per test, so every request
   * the stub sees belongs to exactly one client.
   */
  async function openWebUi(): Promise<{ realtime: RealtimeModule; bridgeAdapter: BridgeAdapter }> {
    vi.resetModules();
    platformMock.adapter.mockClear();
    const realtime = await import('@/common/adapter/httpBridge');
    await import('@/common/adapter/browser');
    const bridgeAdapter = platformMock.adapter.mock.calls[0]?.[0] as BridgeAdapter | undefined;
    if (!bridgeAdapter) throw new Error('browser adapter did not initialize');
    bridgeAdapter.on({ emit: () => {} });
    return { realtime, bridgeAdapter };
  }

  /**
   * Drive the client the way the SPA does when every request fails: revalidate
   * data, push realtime frames, re-subscribe. Before #4178 each of those
   * re-dialled the realtime socket and spent another refresh POST.
   */
  async function driveClient(realtime: RealtimeModule, bridgeAdapter: BridgeAdapter, windowMs: number): Promise<void> {
    const until = Date.now() + windowMs;
    let round = 0;
    while (Date.now() < until) {
      round += 1;
      // Sequential by design: the measurement is the rate a real client drives the
      // adapters at, which parallelising would destroy.
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await realtime.httpRequest('GET', '/api/teams').catch(() => undefined);
      realtime.wsSend('fs', { round });
      realtime.wsEmitter(`scm-${round}`).on(() => {});
      bridgeAdapter.emit(`probe-${round}`, {});
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await sleep(25);
    }
  }

  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    // Order matters: hang up the client's sockets first, then the stub's, then
    // close the listeners. `startStaticServer.stop()` waits on live connections,
    // and Node's fetch keeps its HTTP connections alive, so the close is also
    // bounded rather than trusted.
    harness?.dispose();
    core?.dropRealtimeClients();
    await Promise.race([host?.stop() ?? Promise.resolve(), sleep(2000)]);
    await core?.close();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    removeBrowserGlobals();
  });

  it('works normally on the day it was paired', async () => {
    await pair('paired');
    const { realtime } = await openWebUi();

    await expect(realtime.httpRequest('GET', '/api/teams')).resolves.toEqual({ ok: true });
    realtime.wsEmitter('fs').on(() => {});
    await sleep(300);

    expect(core.counts.apiUnauthorized).toBe(0);
    expect(core.counts.refresh).toBe(0);
    // Bridge socket + realtime stream, both authenticated, both still up.
    expect(core.counts.wsUpgrade).toBe(2);
  });

  it('renews a renewable session transparently a day later', async () => {
    await pair('renewable');
    expect(harness.jar.names()).toContain(REFRESH_COOKIE);
    const accessOnPairingDay = harness.jar.get(ACCESS_COOKIE);

    core.advance(ONE_DAY_LATER_MS);
    const { realtime } = await openWebUi();

    // The access token is dead, the refresh cookie is not. One silent refresh,
    // then the original request is replayed — the caller never sees the 401.
    await expect(realtime.httpRequest('GET', '/api/teams')).resolves.toEqual({ ok: true });
    expect(core.counts.refreshRejected).toBe(0);
    expect(harness.jar.get(ACCESS_COOKIE)).not.toBe(accessOnPairingDay);

    await sleep(500);
    // Renewed, so the WebUI keeps working: no logout, no pairing screen.
    expect(harness.hash()).not.toContain('/login');
    await expect(realtime.httpRequest('GET', '/api/teams')).resolves.toEqual({ ok: true });
  });

  it('gives up once and routes a paired browser to login a day later — no loop', async () => {
    await pair('paired');
    // A paired browser is handed a Core session and nothing to renew it with.
    expect(harness.jar.names()).toContain(ACCESS_COOKIE);
    expect(harness.jar.names()).not.toContain(REFRESH_COOKIE);

    core.advance(ONE_DAY_LATER_MS);
    const { realtime, bridgeAdapter } = await openWebUi();
    await driveClient(realtime, bridgeAdapter, STORM_WINDOW_MS);
    await sleep(400);

    // The refresh endpoint has no credential to accept, so asking twice is
    // asking forever. Exactly one POST, then the latch answers.
    //
    // Measured on this same window against the pre-#4178 adapters: 84 refresh
    // POSTs and 43 `/ws` upgrades, i.e. ~52 and ~27 per second — #4155's
    // "that full burst repeats every ~1 s", quantified.
    expect(core.counts.refresh).toBe(1);
    expect(core.counts.refreshRejected).toBe(1);

    // Neither socket re-dials a backend that will only close it again. In fact
    // one upgrade covers both: whichever socket asks first latches the session as
    // expired, and the other never gets as far as dialling.
    expect(core.counts.wsUpgrade).toBeLessThanOrEqual(3);

    // #4155's "Expected Behavior": the phone lands cleanly on the pairing screen.
    expect(harness.hash()).toContain('/login');
  });

  it('stays bounded when the stream is closed 1008 with no error frame', async () => {
    await pair('paired');
    // No `realtime.error` frame, just the policy-violation close. The bridge
    // socket treats a bare 1008 as a generic drop by design and keeps retrying;
    // what must hold is that the retry is on the backoff, not per emit.
    core.setRealtimeRejection('close-only');

    core.advance(ONE_DAY_LATER_MS);
    const { realtime, bridgeAdapter } = await openWebUi();
    await driveClient(realtime, bridgeAdapter, STORM_WINDOW_MS);
    await sleep(400);

    // The realtime socket does read 1008 as auth, so it refreshes once and latches.
    expect(core.counts.refresh).toBe(1);
    // The bridge socket keeps retrying, but on its 500ms→8s backoff: 3 dials over
    // this window. Unpatched the same window produced 84 refresh POSTs and 45
    // upgrades, because the retry rate tracked the emit rate instead.
    expect(core.counts.wsUpgrade).toBeLessThanOrEqual(6);
  });

  it('keeps a renewable session alive across a transient refresh outage', async () => {
    await pair('renewable');
    core.advance(ONE_DAY_LATER_MS);
    core.setRefreshStatus(503);
    const { realtime } = await openWebUi();

    await expect(realtime.httpRequest('GET', '/api/teams')).rejects.toMatchObject({ status: 401 });
    const afterFirstFailure = core.counts.refresh;

    // A 503 says nothing about the session, so the client must neither sign the
    // user out nor hammer the endpoint. The cooldown collapses the burst — 11
    // POSTs became 1.
    for (let i = 0; i < 10; i++) {
      // Concurrent calls would collapse into the refresh single-flight and prove
      // nothing about the cooldown, so these go one at a time.
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await realtime.httpRequest('GET', '/api/teams').catch(() => undefined);
    }
    // Upper bound rather than equality: the cooldown is wall-clock, so on a slow
    // runner the burst can straddle its expiry and legitimately spend a second
    // POST. Unpatched the same burst spent 11, so this still discriminates.
    expect(core.counts.refresh).toBeLessThanOrEqual(afterFirstFailure + 1);
    expect(harness.hash()).not.toContain('/login');

    // Endpoint comes back after the cooldown; the session was never lost.
    core.setRefreshStatus(null);
    await sleep(1100);
    await expect(realtime.httpRequest('GET', '/api/teams')).resolves.toEqual({ ok: true });
  });

  it('forwards the browser session verbatim — the web host owns no session of its own', async () => {
    await pair('paired');
    core.advance(ONE_DAY_LATER_MS);
    const { realtime } = await openWebUi();

    const staleAccess = harness.jar.get(ACCESS_COOKIE);
    await realtime.httpRequest('GET', '/api/teams').catch(() => undefined);

    // Documents the open-source proxy's contract rather than a defect in it:
    // `forwardToBackend()` copies `req.headers` through unchanged, so whatever
    // the browser holds is what Core adjudicates. #4155's suggested fix 1 — the
    // web host owning and renewing a Core session on the browser's behalf —
    // would change this assertion, which is exactly when it should be revisited.
    expect(core.apiCookieHeaders.at(-1)).toContain(`${ACCESS_COOKIE}=${staleAccess}`);
    expect(core.counts.apiUnauthorized).toBeGreaterThan(0);
  });
});
