/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regression tests for the WebUI *realtime* socket in `httpBridge.ts`.
 *
 * #4156 fixed reconnect scheduling on the *bridge* socket (`browser.ts`). The
 * realtime socket is a second, independent WebSocket with its own scheduler, and
 * it still had the same three defects — plus an unlatched refresh loop once the
 * session is genuinely dead. These tests pin all four.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type SocketListener = (event: unknown) => void;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: FakeWebSocket[] = [];

  readyState: number = FakeWebSocket.CONNECTING;
  sent: string[] = [];

  private readonly listeners = new Map<string, SocketListener[]>();

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: SocketListener): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(code = 1006): void {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatch('close', { code, reason: '' });
  }

  /** Server completes the upgrade handshake. */
  acceptUpgrade(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatch('open', {});
  }

  private dispatch(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

const latest = (): FakeWebSocket => {
  const socket = FakeWebSocket.instances.at(-1);
  if (!socket) throw new Error('no socket was created');
  return socket;
};

/** Count of POSTs the refresh primitive made to the refresh endpoint. */
const refreshCalls = (fetchMock: { mock: { calls: unknown[][] } }): number =>
  fetchMock.mock.calls.filter((call) => call[0] === '/api/auth/refresh').length;

type Bridge = typeof import('@/common/adapter/httpBridge');

const loadBridge = async (fetchImpl: unknown): Promise<Bridge> => {
  FakeWebSocket.instances = [];
  vi.resetModules();
  delete (window as { __backendPort?: number }).__backendPort;
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.stubGlobal('fetch', fetchImpl);
  return import('@/common/adapter/httpBridge');
};

/** Refresh endpoint answers `status`; every other call 200s. */
const refreshResponder = (status: number) =>
  vi.fn(async (url: string) => {
    if (url === '/api/auth/refresh') return { ok: status >= 200 && status < 300, status };
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => '' };
  });

describe('WebUI realtime socket (httpBridge)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('dials once when the first subscriber attaches', async () => {
    const bridge = await loadBridge(refreshResponder(200));
    bridge.wsEmitter('fs').on(() => {});
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(latest().url).toMatch(/\/ws$/);
  });

  it('does not re-dial on every send while a backoff reconnect is pending', async () => {
    const bridge = await loadBridge(refreshResponder(200));
    bridge.wsEmitter('fs').on(() => {});
    expect(FakeWebSocket.instances).toHaveLength(1);

    // Connection fails outright (no upgrade) — a reconnect is now queued.
    latest().close();
    expect(FakeWebSocket.instances).toHaveLength(1);

    // The app keeps pushing frames and re-subscribing while the socket is down.
    for (let i = 0; i < 10; i++) {
      bridge.wsSend('fs', { seq: i });
      bridge.wsEmitter('scm').on(() => {});
    }

    // The queued backoff owns the reconnect rate — not how often the app sends.
    expect(FakeWebSocket.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('backs off when the server accepts the upgrade and drops it immediately', async () => {
    const bridge = await loadBridge(refreshResponder(200));
    bridge.wsEmitter('fs').on(() => {});

    // 1st: accept-then-drop. Reconnect is due at 1s.
    latest().acceptUpgrade();
    latest().close();
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);

    // 2nd: same. A handshake that never held must not credit the backoff, so
    // the next attempt is due at 2s, not 1s again.
    latest().acceptUpgrade();
    latest().close();
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWebSocket.instances).toHaveLength(3);
  });

  it('resets the backoff only after a connection has held', async () => {
    const bridge = await loadBridge(refreshResponder(200));
    bridge.wsEmitter('fs').on(() => {});

    // Two accept-then-drop cycles grow the delay to 4s.
    latest().acceptUpgrade();
    latest().close();
    await vi.advanceTimersByTimeAsync(1000);
    latest().acceptUpgrade();
    latest().close();
    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeWebSocket.instances).toHaveLength(3);

    // This one holds past the stability window, so the delay is credited back to
    // the 1s floor instead of continuing from 4s.
    latest().acceptUpgrade();
    await vi.advanceTimersByTimeAsync(5000);
    latest().close();

    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWebSocket.instances).toHaveLength(4);
  });

  it('stops dialling and stops refreshing once the session is truly dead (1008 + 401 refresh)', async () => {
    const fetchMock = refreshResponder(401);
    const bridge = await loadBridge(fetchMock);
    bridge.wsEmitter('fs').on(() => {});

    // Backend accepts the upgrade, then closes it for auth policy violation.
    latest().acceptUpgrade();
    latest().close(1008);
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshCalls(fetchMock)).toBe(1);
    expect(FakeWebSocket.instances).toHaveLength(1);

    // The app keeps sending and re-subscribing. Neither may resurrect the socket
    // or fire another refresh POST — that pair is the #4155 storm.
    for (let i = 0; i < 10; i++) {
      bridge.wsSend('fs', { seq: i });
      bridge.wsEmitter('scm').on(() => {});
    }
    await vi.advanceTimersByTimeAsync(60_000);

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(refreshCalls(fetchMock)).toBe(1);
  });

  it('reconnects after a successful silent refresh (1008 + 200 refresh)', async () => {
    const fetchMock = refreshResponder(200);
    const bridge = await loadBridge(fetchMock);
    bridge.wsEmitter('fs').on(() => {});

    latest().acceptUpgrade();
    latest().close(1008);
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshCalls(fetchMock)).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('still backs off when the backend refuses even a freshly refreshed session', async () => {
    const fetchMock = refreshResponder(200);
    const bridge = await loadBridge(fetchMock);
    bridge.wsEmitter('fs').on(() => {});

    // The refresh keeps succeeding but the backend keeps closing 1008. Without a
    // backoff on this path that is refresh -> dial -> 1008 -> refresh at full
    // speed — the same storm, just with a working refresh endpoint.
    latest().acceptUpgrade();
    latest().close(1008);
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);

    latest().acceptUpgrade();
    latest().close(1008);
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWebSocket.instances).toHaveLength(3);
  });

  it('keeps retrying on the backoff when the refresh endpoint is only transiently down (1008 + 503)', async () => {
    const fetchMock = refreshResponder(503);
    const bridge = await loadBridge(fetchMock);
    bridge.wsEmitter('fs').on(() => {});

    latest().acceptUpgrade();
    latest().close(1008);
    await vi.advanceTimersByTimeAsync(0);

    // A 503 says nothing about the session, so the stream must not be stranded:
    // it retries on the normal backoff without any send to prod it awake.
    expect(FakeWebSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });
});
