/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type BridgeEmitter = {
  emit: (name: string, data: unknown) => void;
};

type BridgeAdapter = {
  emit: (name: string, data: unknown) => void;
  on: (emitter: BridgeEmitter) => void;
};

type BrowserLocation = {
  protocol: string;
  hostname: string;
  host: string;
  pathname: string;
  hash: string;
};

type FakeSocketEventMap = {
  open: () => void;
  message: (event: MessageEvent<string>) => void;
  close: (event: CloseEvent) => void;
  error: () => void;
};

type FakeSocketEventName = keyof FakeSocketEventMap;

const platformMock = vi.hoisted(() => ({
  adapter: vi.fn(),
  provider: vi.fn(),
}));

vi.mock('@office-ai/platform', () => ({
  bridge: {
    adapter: platformMock.adapter,
  },
  logger: {
    provider: platformMock.provider,
  },
}));

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.OPEN;
  readonly sentMessages: string[] = [];
  readonly close = vi.fn(() => {
    this.readyState = FakeWebSocket.CLOSED;
  });

  private readonly listeners: { [K in FakeSocketEventName]: FakeSocketEventMap[K][] } = {
    open: [],
    message: [],
    close: [],
    error: [],
  };

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener<K extends FakeSocketEventName>(type: K, listener: FakeSocketEventMap[K]) {
    this.listeners[type].push(listener);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  dispatchMessage(payload: unknown) {
    const event = { data: JSON.stringify(payload) } as MessageEvent<string>;
    for (const listener of this.listeners.message) {
      listener(event);
    }
  }

  dispatchClose(code: number) {
    this.readyState = FakeWebSocket.CLOSED;
    const event = { code } as CloseEvent;
    for (const listener of this.listeners.close) {
      listener(event);
    }
  }
}

function setupBrowserGlobals() {
  const location: BrowserLocation = {
    protocol: 'http:',
    hostname: '127.0.0.1',
    host: '127.0.0.1:13400',
    pathname: '/',
    hash: '',
  };

  vi.stubGlobal('window', {
    location,
    setTimeout: setTimeout as unknown as Window['setTimeout'],
    clearTimeout: clearTimeout as unknown as Window['clearTimeout'],
  });
  vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);

  return location;
}

async function loadBrowserAdapter() {
  vi.resetModules();
  FakeWebSocket.instances = [];
  platformMock.adapter.mockClear();
  platformMock.provider.mockClear();

  const location = setupBrowserGlobals();

  await import('@/common/adapter/browser');

  const adapter = platformMock.adapter.mock.calls[0]?.[0] as BridgeAdapter | undefined;
  const socket = FakeWebSocket.instances[0];

  if (!adapter || !socket) {
    throw new Error('browser adapter did not initialize');
  }

  return { adapter, location, socket };
}

describe('browser WebSocket realtime error handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    { name: 'realtime.error', data: { code: 'REALTIME_AUTH_MISSING', message: 'Missing auth', recoverable: false } },
    { name: 'realtime.error', data: { code: 'REALTIME_AUTH_EXPIRED', message: 'Expired auth', recoverable: false } },
  ])('treats $name auth payload as terminal and redirects to login', async (payload) => {
    const { adapter, location, socket } = await loadBrowserAdapter();
    const emit = vi.fn();
    adapter.on({ emit });

    socket.dispatchMessage(payload);

    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(emit).not.toHaveBeenCalled();

    socket.dispatchClose(1006);
    const socketCountAfterClose = FakeWebSocket.instances.length;
    vi.advanceTimersByTime(8000);

    expect(FakeWebSocket.instances).toHaveLength(socketCountAfterClose);

    vi.advanceTimersByTime(1000);
    expect(location.hash).toBe('/login');
  });

  it('emits non-auth realtime errors without closing or redirecting', async () => {
    const { adapter, location, socket } = await loadBrowserAdapter();
    const emit = vi.fn();
    adapter.on({ emit });
    const payload = {
      name: 'realtime.error',
      data: { code: 'REALTIME_INVALID_MESSAGE', message: 'Invalid message', recoverable: true },
    };

    socket.dispatchMessage(payload);

    expect(socket.close).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(payload.name, payload.data);
    expect(location.hash).toBe('');
  });

  it('reconnects after unrecoverable non-auth realtime errors without redirecting', async () => {
    const { adapter, location, socket } = await loadBrowserAdapter();
    const emit = vi.fn();
    adapter.on({ emit });
    const payload = {
      name: 'realtime.error',
      data: {
        code: 'REALTIME_HEARTBEAT_TIMEOUT',
        message: 'Heartbeat timed out',
        recoverable: false,
        details: { connection_id: 7 },
      },
    };

    socket.dispatchMessage(payload);

    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(payload.name, payload.data);

    socket.dispatchClose(1006);

    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(500);

    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(location.hash).toBe('');
  });

  it('does not treat legacy auth-expired events as terminal auth errors', async () => {
    const { adapter, location, socket } = await loadBrowserAdapter();
    const emit = vi.fn();
    adapter.on({ emit });
    const payload = { name: 'auth-expired', data: { reason: 'legacy' } };

    socket.dispatchMessage(payload);

    expect(socket.close).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(payload.name, payload.data);
    expect(location.hash).toBe('');
  });

  it('does not redirect to login from close code 1008 without an auth error event', async () => {
    const { location, socket } = await loadBrowserAdapter();

    socket.dispatchClose(1008);
    vi.advanceTimersByTime(500);

    expect(location.hash).toBe('');
    expect(FakeWebSocket.instances).toHaveLength(2);
  });
});
