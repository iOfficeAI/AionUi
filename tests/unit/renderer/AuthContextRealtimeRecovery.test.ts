/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The login flow is the only code allowed to wake a session whose refresh
 * credential has been latched as expired. Keep this test on the real adapter
 * path: the sockets go through the static-server proxy to the Core stub, while
 * AuthProvider is mounted in a small JSDOM document.
 */

import { JSDOM } from 'jsdom';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanup, render, waitFor } from '@testing-library/react';
import React from 'react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_TTL_MS, startCoreStub, type CoreStub } from '../../integration/webui-session/coreStub';
import {
  installBrowserGlobals,
  removeBrowserGlobals,
  type BrowserHarness,
} from '../../integration/webui-session/browserHarness';
import { startStaticServer, type StaticServerHandle } from '../../../packages/web-host/src/static-server';

const ONE_DAY_LATER_MS = ACCESS_TTL_MS + 60_000;
const WAIT_TIMEOUT_MS = 8_000;
const STORM_WINDOW_MS = 1_200;

type Login = (params: { username: string; password: string; remember?: boolean }) => Promise<{ success: boolean }>;

type AuthSnapshot = {
  login: Login;
  status: string;
};

type BridgeAdapter = {
  emit: (name: string, data: unknown) => void;
  on: (emitter: { emit: (name: string, data: unknown) => void }) => void;
};

const platformMock = vi.hoisted(() => ({
  adapter: vi.fn((config: { on: (emitter: { emit: (name: string, data: unknown) => void }) => void }) => {
    config.on({ emit: () => {} });
  }),
}));
vi.mock('@/common/platform/bridge', () => ({ bridge: { adapter: platformMock.adapter } }));

type DomGlobals = {
  dom: JSDOM;
  previous: Map<string, PropertyDescriptor | undefined>;
};

const DOM_GLOBAL_NAMES = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Node',
  'Event',
  'MessageEvent',
  'localStorage',
] as const;

function installDomGlobals(origin: string): DomGlobals {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: origin });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  const values: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    Event: dom.window.Event,
    MessageEvent: dom.window.MessageEvent,
    localStorage: dom.window.localStorage,
  };

  for (const name of DOM_GLOBAL_NAMES) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: values[name],
    });
  }

  return { dom, previous };
}

function restoreDomGlobals({ dom, previous }: DomGlobals): void {
  dom.window.close();
  for (const name of DOM_GLOBAL_NAMES) {
    const descriptor = previous.get(name);
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      delete (globalThis as Record<string, unknown>)[name];
    }
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function makeStaticDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aionui-auth-recovery-'));
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>webui</title>');
  return dir;
}

describe('AuthProvider realtime recovery', () => {
  let core: CoreStub;
  let host: StaticServerHandle;
  let harness: BrowserHarness;
  let domGlobals: DomGlobals;

  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    cleanup();
    vi.unstubAllGlobals();
    harness?.dispose();
    core?.dropRealtimeClients();
    await Promise.race([host?.stop() ?? Promise.resolve(), sleep(2000)]);
    await core?.close();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    if (domGlobals) restoreDomGlobals(domGlobals);
    removeBrowserGlobals();
  });

  it('wakes both parked realtime sockets through the real login flow', { timeout: 40_000 }, async () => {
    core = await startCoreStub();
    core.setSessionMode('paired');
    host = await startStaticServer({
      staticDir: makeStaticDir(),
      backendPort: core.port,
      port: 0,
    });

    // Install the cookie-aware fetch and WebSocket first; then replace only the
    // fake window/document with a real JSDOM pair for React and AuthProvider.
    harness = installBrowserGlobals(host.localUrl);
    const harnessFetch = globalThis.fetch;
    const harnessWebSocket = (globalThis as typeof globalThis & { WebSocket: unknown }).WebSocket;
    domGlobals = installDomGlobals(host.localUrl);
    Object.defineProperty(domGlobals.dom.window, 'fetch', {
      configurable: true,
      value: harnessFetch,
    });
    Object.defineProperty(domGlobals.dom.window, 'WebSocket', {
      configurable: true,
      value: harnessWebSocket,
    });
    vi.stubGlobal('fetch', harnessFetch);
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      writable: true,
      value: harnessWebSocket,
    });
    vi.stubGlobal('WebSocket', harnessWebSocket);
    expect(globalThis.WebSocket).toBeDefined();
    window.location.hash = '/login';

    const response = await globalThis.fetch('/login', { method: 'POST' });
    expect(response.status).toBe(200);
    core.advance(ONE_DAY_LATER_MS);

    vi.resetModules();
    platformMock.adapter.mockClear();
    const realtime = await import('@/common/adapter/httpBridge');
    const { AuthProvider, useAuth } = await import('@/renderer/hooks/context/AuthContext');
    const { isSessionExpired } = await import('@/common/adapter/sessionRefresh');
    let realtimeReconnected = 0;
    realtime.wsEmitter('realtime.reconnected').on(() => {
      realtimeReconnected += 1;
    });
    await import('@/common/adapter/browser');

    const bridgeAdapter = platformMock.adapter.mock.calls[0]?.[0] as BridgeAdapter | undefined;
    if (!bridgeAdapter) throw new Error('browser adapter did not initialize');
    let bridgeReady = 0;
    bridgeAdapter.on({
      emit: (name) => {
        if (name === 'realtime.ready') bridgeReady += 1;
      },
    });

    let auth: AuthSnapshot | undefined;
    const Probe: React.FC = () => {
      const value = useAuth();
      auth = { login: value.login, status: value.status };
      return null;
    };

    render(React.createElement(AuthProvider, null, React.createElement(Probe)));

    // The stale session is rejected over both sockets and through the auth
    // user probe. The shared refresh call must latch once, leaving both sockets
    // parked until a fresh login clears that latch.
    await waitFor(() => expect(core.counts.refresh).toBe(1), { timeout: WAIT_TIMEOUT_MS });
    await waitFor(() => expect(isSessionExpired()).toBe(true), { timeout: WAIT_TIMEOUT_MS });
    await waitFor(() => expect(core.counts.wsUpgrade).toBe(2), { timeout: WAIT_TIMEOUT_MS });

    const parkedRefreshes = core.counts.refresh;
    const driveClient = async (windowMs: number): Promise<void> => {
      const until = Date.now() + windowMs;
      let round = 0;
      while (Date.now() < until) {
        round += 1;
        // Exercise the same entry points that previously re-dialled parked
        // sockets on every application update.
        // eslint-disable-next-line no-await-in-loop -- sequential by design
        await realtime.httpRequest('GET', '/api/teams').catch(() => undefined);
        realtime.wsSend('fs', { round });
        realtime.wsEmitter(`recovery-${round}`).on(() => {});
        bridgeAdapter.emit(`recovery-${round}`, {});
        // eslint-disable-next-line no-await-in-loop -- sequential by design
        await sleep(25);
      }
    };

    await driveClient(STORM_WINDOW_MS);
    const parkedUnauthorized = core.counts.apiUnauthorized;
    expect(core.counts.wsUpgrade).toBe(2);
    expect(core.counts.refresh).toBe(parkedRefreshes);
    expect(core.counts.refreshRejected).toBe(1);

    await waitFor(() => expect(auth?.status).toBe('unauthenticated'), { timeout: WAIT_TIMEOUT_MS });
    const result = await auth?.login({ username: 'paired', password: 'password' });
    expect(result?.success).toBe(true);
    expect(isSessionExpired()).toBe(false);

    // AuthProvider calls both recovery entry points. One new upgrade is the
    // browser bridge socket; the other is the httpBridge realtime stream.
    await waitFor(() => expect(realtimeReconnected).toBeGreaterThanOrEqual(1), {
      timeout: WAIT_TIMEOUT_MS,
    });
    await waitFor(() => expect(bridgeReady).toBeGreaterThanOrEqual(1), {
      timeout: WAIT_TIMEOUT_MS,
    });
    await waitFor(() => expect(auth?.status).toBe('authenticated'), { timeout: WAIT_TIMEOUT_MS });
    await driveClient(STORM_WINDOW_MS);
    await expect(realtime.httpRequest('GET', '/api/teams')).resolves.toEqual({ ok: true });
    expect(core.counts.apiUnauthorized).toBe(parkedUnauthorized);
    expect(core.counts.wsUpgrade).toBe(4);
    expect(core.counts.refresh).toBe(parkedRefreshes);
    expect(core.counts.refreshRejected).toBe(1);
    expect(isSessionExpired()).toBe(false);
  });
});
