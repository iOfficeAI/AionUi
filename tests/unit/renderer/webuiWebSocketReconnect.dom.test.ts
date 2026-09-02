/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression tests for the WebUI browser bridge socket.
 *
 * The browser adapter re-dials on demand so a login can immediately get a
 * cookie-bearing connection. That on-demand path used to ignore both the
 * pending backoff timer and the terminal-auth stop flag, so a WebUI whose
 * connection kept failing reconnected once per bridge emit instead of on the
 * backoff schedule.
 */

const CLOSED = 3;

type SocketListener = (event: unknown) => void;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
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
    if (this.readyState === FakeWebSocket.CLOSED) {
      return;
    }
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatch('close', { code });
  }

  /** Server accepts the upgrade. */
  acceptUpgrade(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatch('open', {});
  }

  /** Server pushes a bridge payload. */
  deliver(payload: unknown): void {
    this.dispatch('message', { data: JSON.stringify(payload) });
  }

  private dispatch(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

const loadBrowserAdapter = async () => {
  FakeWebSocket.instances = [];
  vi.resetModules();

  const win = window as unknown as Record<string, unknown>;
  delete win.electronAPI;
  delete win.__bridgeEmitter;
  delete win.__websocketReconnect;

  vi.stubGlobal('WebSocket', FakeWebSocket);

  const { bridge } = await import('@/common/platform/bridge');
  await import('@/common/adapter/browser');

  return { bridge };
};

/** Refresh endpoint answers `status`; nothing else is fetched by this adapter. */
const stubRefresh = (status: number) => {
  const fetchMock = vi.fn(async () => ({ ok: status >= 200 && status < 300, status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const latestSocket = (): FakeWebSocket => {
  const socket = FakeWebSocket.instances.at(-1);
  if (!socket) {
    throw new Error('no socket was created');
  }
  return socket;
};

/** Drop the live socket, then assert the next dial lands exactly on `delay`. */
const expectReconnectAt = async (delay: number, socketsSoFar: number): Promise<void> => {
  latestSocket().acceptUpgrade();
  latestSocket().close();

  await vi.advanceTimersByTimeAsync(delay - 1);
  expect(FakeWebSocket.instances).toHaveLength(socketsSoFar);

  await vi.advanceTimersByTimeAsync(1);
  expect(FakeWebSocket.instances).toHaveLength(socketsSoFar + 1);
};

describe('WebUI browser bridge socket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('connects once on load', async () => {
    await loadBrowserAdapter();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(latestSocket().url).toMatch(/\/ws$/);
  });

  it('does not re-dial on every emit while a backoff reconnect is pending', async () => {
    const { bridge } = await loadBrowserAdapter();

    latestSocket().acceptUpgrade();
    latestSocket().close();
    expect(FakeWebSocket.instances).toHaveLength(1);

    // The app keeps talking to a dead socket. Each emit used to call connect()
    // directly, so the reconnect rate tracked the emit rate, not the backoff.
    for (let i = 0; i < 25; i += 1) {
      bridge.emit(`probe-${i}`, {});
    }

    expect(FakeWebSocket.instances).toHaveLength(1);

    // Only the scheduled retry opens the next socket.
    await vi.advanceTimersByTimeAsync(500);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('queues messages emitted while disconnected and flushes them on reconnect', async () => {
    const { bridge } = await loadBrowserAdapter();

    latestSocket().acceptUpgrade();
    latestSocket().close();

    bridge.emit('queued-event', { value: 7 });
    expect(FakeWebSocket.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(500);
    const reconnected = latestSocket();
    reconnected.acceptUpgrade();

    expect(reconnected.sent).toHaveLength(1);
    expect(JSON.parse(reconnected.sent[0])).toEqual({ name: 'queued-event', data: { value: 7 } });
  });

  it('backs off when the server accepts the upgrade and drops it immediately', async () => {
    await loadBrowserAdapter();

    // A backend that rejects auth still completes the WebSocket handshake, so
    // `open` fires on every attempt. The delay must keep growing regardless.
    await expectReconnectAt(500, 1);
    await expectReconnectAt(1000, 2);
    await expectReconnectAt(2000, 3);
    await expectReconnectAt(4000, 4);
  });

  it('resets the backoff once a connection has held', async () => {
    await loadBrowserAdapter();

    latestSocket().acceptUpgrade();
    latestSocket().close();
    await vi.advanceTimersByTimeAsync(500);

    // Second attempt stays up long enough to count as recovered.
    latestSocket().acceptUpgrade();
    await vi.advanceTimersByTimeAsync(5000);
    latestSocket().close();

    const before = FakeWebSocket.instances.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(FakeWebSocket.instances).toHaveLength(before + 1);
  });

  it('stops reconnecting after a terminal auth error, including on later emits', async () => {
    const { bridge } = await loadBrowserAdapter();

    latestSocket().acceptUpgrade();
    latestSocket().deliver({ name: 'realtime.error', data: { code: 'REALTIME_AUTH_EXPIRED' } });

    expect(latestSocket().readyState).toBe(CLOSED);
    const afterAuthFailure = FakeWebSocket.instances.length;

    // Emitting must not quietly resurrect the connection the auth handler just
    // shut down, otherwise "stopping reconnection" never actually stops.
    for (let i = 0; i < 10; i += 1) {
      bridge.emit(`probe-${i}`, {});
    }
    await vi.advanceTimersByTimeAsync(30000);

    expect(FakeWebSocket.instances).toHaveLength(afterAuthFailure);
  });

  it('reconnects on the backoff after a successful silent refresh', async () => {
    const fetchMock = stubRefresh(200);
    await loadBrowserAdapter();

    latestSocket().acceptUpgrade();
    latestSocket().deliver({ name: 'realtime.error', data: { code: 'REALTIME_AUTH_EXPIRED' } });
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/refresh', expect.objectContaining({ method: 'POST' }));
    // Not an immediate re-dial: a backend that refuses even the refreshed session
    // would otherwise loop refresh -> dial -> close -> refresh unthrottled.
    expect(FakeWebSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('does not sign the user out when the refresh endpoint is only transiently down', async () => {
    const fetchMock = stubRefresh(503);
    await loadBrowserAdapter();
    window.location.hash = '';

    latestSocket().acceptUpgrade();
    latestSocket().deliver({ name: 'realtime.error', data: { code: 'REALTIME_AUTH_EXPIRED' } });
    await vi.advanceTimersByTimeAsync(0);

    const afterAuthFailure = FakeWebSocket.instances.length;
    await vi.advanceTimersByTimeAsync(30000);

    // A 503 says nothing about the session: no /login kick, and no reconnect with
    // the cookie the backend just rejected. Only the refresh is retried.
    expect(window.location.hash).not.toContain('/login');
    expect(FakeWebSocket.instances).toHaveLength(afterAuthFailure);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it('redirects to /login only once the refresh credential is dead too', async () => {
    stubRefresh(401);
    await loadBrowserAdapter();
    window.location.hash = '';

    latestSocket().acceptUpgrade();
    latestSocket().deliver({ name: 'realtime.error', data: { code: 'REALTIME_AUTH_EXPIRED' } });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);

    expect(window.location.hash).toContain('/login');
  });

  it('reconnects immediately when the login flow asks it to', async () => {
    await loadBrowserAdapter();

    latestSocket().acceptUpgrade();
    latestSocket().deliver({ name: 'realtime.error', data: { code: 'REALTIME_AUTH_EXPIRED' } });
    const afterAuthFailure = FakeWebSocket.instances.length;

    const reconnect = (window as unknown as { __websocketReconnect?: () => void }).__websocketReconnect;
    expect(reconnect).toBeTypeOf('function');
    reconnect?.();

    expect(FakeWebSocket.instances).toHaveLength(afterAuthFailure + 1);
  });

  it('retries auth recovery after a transient refresh outage without opening a socket', async () => {
    const fetchMock = stubRefresh(503);
    await loadBrowserAdapter();

    latestSocket().acceptUpgrade();
    latestSocket().deliver({ name: 'realtime.error', data: { code: 'REALTIME_AUTH_EXPIRED' } });
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1500);
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('cancels a pending auth-recovery retry when the login flow reconnects', async () => {
    const fetchMock = stubRefresh(503);
    await loadBrowserAdapter();

    latestSocket().acceptUpgrade();
    latestSocket().deliver({ name: 'realtime.error', data: { code: 'REALTIME_AUTH_EXPIRED' } });
    await vi.advanceTimersByTimeAsync(0);

    // The inconclusive refresh schedules its own retry, separate from the
    // socket backoff. A successful login must cancel that retry as it wakes the
    // socket immediately.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const beforeLogin = FakeWebSocket.instances.length;
    (window as unknown as { __websocketReconnect?: () => void }).__websocketReconnect?.();

    expect(FakeWebSocket.instances).toHaveLength(beforeLogin + 1);
    await vi.advanceTimersByTimeAsync(8000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(beforeLogin + 1);
  });

  it('cancels a pending backoff retry when the login flow reconnects', async () => {
    await loadBrowserAdapter();

    // Burn one retry so the next one is queued a full second out, then leave a
    // retry pending — this is the state a user is in when they sign in while
    // the socket is still failing.
    await expectReconnectAt(500, 1);
    latestSocket().acceptUpgrade();
    latestSocket().close();

    const beforeLogin = FakeWebSocket.instances.length;
    (window as unknown as { __websocketReconnect?: () => void }).__websocketReconnect?.();

    // Login dials straight away instead of waiting out the backoff.
    expect(FakeWebSocket.instances).toHaveLength(beforeLogin + 1);

    // The superseded timer must not fire a second, duplicate dial afterwards.
    await vi.advanceTimersByTimeAsync(8000);
    expect(FakeWebSocket.instances).toHaveLength(beforeLogin + 1);
  });
});
