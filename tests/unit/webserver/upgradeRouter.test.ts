/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WEBUI_BRIDGE_WS_PATH, WEBUI_VITE_HMR_PATH } from '../../../src/common/config/constants';

const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
}));

vi.mock('http', async () => {
  const actual = await vi.importActual<typeof import('http')>('http');
  return {
    ...actual,
    default: {
      ...actual,
      request: requestMock,
    },
    request: requestMock,
  };
});

type UpgradeHandler = (req: any, socket: any, head: Buffer) => void;

function createMockServer() {
  const handlers = new Map<string, UpgradeHandler>();
  return {
    server: {
      on: vi.fn((event: string, handler: UpgradeHandler) => {
        handlers.set(event, handler);
      }),
    } as any,
    getUpgradeHandler() {
      const handler = handlers.get('upgrade');
      if (!handler) {
        throw new Error('upgrade handler not registered');
      }
      return handler;
    },
  };
}

function createMockSocket() {
  return {
    write: vi.fn(),
    pipe: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
    destroyed: false,
  } as any;
}

describe('registerWebSocketUpgradeRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes business websocket upgrades to the authenticated bridge server', async () => {
    const { server, getUpgradeHandler } = createMockServer();
    const mockWs = { kind: 'bridge-client' };
    const businessWss = {
      handleUpgrade: vi.fn((_req, _socket, _head, callback) => callback(mockWs)),
      emit: vi.fn(),
    } as any;

    const { registerWebSocketUpgradeRouter } = await import('../../../src/process/webserver/websocket/upgradeRouter');
    registerWebSocketUpgradeRouter(server, businessWss);

    const req = { url: WEBUI_BRIDGE_WS_PATH };
    const socket = createMockSocket();
    const head = Buffer.from('client-head');

    getUpgradeHandler()(req, socket, head);

    expect(businessWss.handleUpgrade).toHaveBeenCalledWith(req, socket, head, expect.any(Function));
    expect(businessWss.emit).toHaveBeenCalledWith('connection', mockWs, req);
    expect(socket.destroy).not.toHaveBeenCalled();
  });

  it('proxies vite HMR upgrades to the dev server', async () => {
    const { server, getUpgradeHandler } = createMockServer();
    const businessWss = {
      handleUpgrade: vi.fn(),
      emit: vi.fn(),
    } as any;
    const proxySocket = {
      write: vi.fn(),
      pipe: vi.fn(),
      on: vi.fn(),
      destroy: vi.fn(),
    } as any;

    requestMock.mockImplementation((options) => {
      const handlers = new Map<string, (...args: any[]) => void>();
      const proxyReq = {
        on: vi.fn((event: string, handler: (...args: any[]) => void) => {
          handlers.set(event, handler);
          return proxyReq;
        }),
        end: vi.fn(() => {
          handlers.get('upgrade')?.(
            {
              httpVersion: '1.1',
              statusCode: 101,
              statusMessage: 'Switching Protocols',
              headers: {
                connection: 'Upgrade',
                upgrade: 'websocket',
                'sec-websocket-protocol': 'vite-hmr',
              },
            },
            proxySocket,
            Buffer.from('proxy-head')
          );
        }),
      };

      expect(options).toMatchObject({
        hostname: 'localhost',
        port: 5173,
        path: `${WEBUI_VITE_HMR_PATH}?token=abc`,
        headers: expect.objectContaining({
          host: 'localhost:5173',
          upgrade: 'websocket',
        }),
      });

      return proxyReq as any;
    });

    const { registerWebSocketUpgradeRouter } = await import('../../../src/process/webserver/websocket/upgradeRouter');
    registerWebSocketUpgradeRouter(server, businessWss);

    const req = {
      url: `${WEBUI_VITE_HMR_PATH}?token=abc`,
      method: 'GET',
      httpVersion: '1.1',
      headers: {
        upgrade: 'websocket',
        connection: 'Upgrade',
        host: 'localhost:25809',
        'sec-websocket-protocol': 'vite-hmr',
      },
    };
    const socket = createMockSocket();
    const head = Buffer.from('client-head');

    getUpgradeHandler()(req, socket, head);

    expect(requestMock).toHaveBeenCalledOnce();
    expect(socket.write).toHaveBeenNthCalledWith(1, expect.stringContaining('HTTP/1.1 101 Switching Protocols'));
    expect(socket.write).toHaveBeenNthCalledWith(2, Buffer.from('proxy-head'));
    expect(proxySocket.write).toHaveBeenCalledWith(head);
    expect(proxySocket.pipe).toHaveBeenCalledWith(socket);
    expect(socket.pipe).toHaveBeenCalledWith(proxySocket);
    expect(businessWss.handleUpgrade).not.toHaveBeenCalled();
  });

  it('returns bad gateway when the vite dev server responds without switching protocols', async () => {
    const { server, getUpgradeHandler } = createMockServer();
    const businessWss = {
      handleUpgrade: vi.fn(),
      emit: vi.fn(),
    } as const;

    requestMock.mockImplementation(() => {
      const handlers = new Map<string, (...args: unknown[]) => void>();
      const proxyReq = {
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          handlers.set(event, handler);
          return proxyReq;
        }),
        end: vi.fn(() => {
          handlers.get('response')?.({
            resume: vi.fn(),
            statusMessage: 'Forbidden',
          });
        }),
      };

      return proxyReq as never;
    });

    const { registerWebSocketUpgradeRouter } = await import('../../../src/process/webserver/websocket/upgradeRouter');
    registerWebSocketUpgradeRouter(server, businessWss as never);

    const socket = createMockSocket();
    getUpgradeHandler()({ url: WEBUI_VITE_HMR_PATH, method: 'GET', headers: {} }, socket, Buffer.alloc(0));

    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('HTTP/1.1 502 Forbidden'));
    expect(socket.destroy).toHaveBeenCalled();
    expect(businessWss.handleUpgrade).not.toHaveBeenCalled();
  });

  it('serializes array-valued response headers from the vite dev server', async () => {
    const { server, getUpgradeHandler } = createMockServer();
    const businessWss = {
      handleUpgrade: vi.fn(),
      emit: vi.fn(),
    } as any;
    const proxySocket = {
      write: vi.fn(),
      pipe: vi.fn(),
      on: vi.fn(),
      destroy: vi.fn(),
    } as any;

    requestMock.mockImplementation((options) => {
      const handlers = new Map<string, (...args: any[]) => void>();
      const proxyReq = {
        on: vi.fn((event: string, handler: (...args: any[]) => void) => {
          handlers.set(event, handler);
          return proxyReq;
        }),
        end: vi.fn(() => {
          handlers.get('upgrade')?.(
            {
              httpVersion: '1.1',
              statusCode: 101,
              statusMessage: 'Switching Protocols',
              headers: {
                connection: 'Upgrade',
                upgrade: 'websocket',
                'set-cookie': ['a=1; Path=/', 'b=2; Path=/'],
              },
            },
            proxySocket,
            Buffer.alloc(0)
          );
        }),
      };

      return proxyReq as any;
    });

    const { registerWebSocketUpgradeRouter } = await import('../../../src/process/webserver/websocket/upgradeRouter');
    registerWebSocketUpgradeRouter(server, businessWss);

    const req = { url: WEBUI_VITE_HMR_PATH, method: 'GET', headers: { upgrade: 'websocket' } };
    const socket = createMockSocket();
    getUpgradeHandler()(req, socket, Buffer.alloc(0));

    const firstWrite = (socket.write as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(firstWrite).toContain('set-cookie: a=1; Path=/');
    expect(firstWrite).toContain('set-cookie: b=2; Path=/');
  });

  it('returns bad gateway when the vite proxy request fails', async () => {
    const { server, getUpgradeHandler } = createMockServer();
    const businessWss = {
      handleUpgrade: vi.fn(),
      emit: vi.fn(),
    } as const;

    requestMock.mockImplementation(() => {
      const handlers = new Map<string, (...args: unknown[]) => void>();
      const proxyReq = {
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          handlers.set(event, handler);
          return proxyReq;
        }),
        end: vi.fn(() => {
          handlers.get('error')?.(new Error('connection refused'));
        }),
      };

      return proxyReq as never;
    });

    const { registerWebSocketUpgradeRouter } = await import('../../../src/process/webserver/websocket/upgradeRouter');
    registerWebSocketUpgradeRouter(server, businessWss as never);

    const socket = createMockSocket();
    getUpgradeHandler()({ url: WEBUI_VITE_HMR_PATH, method: 'GET', headers: {} }, socket, Buffer.alloc(0));

    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('HTTP/1.1 502 Bad Gateway'));
    expect(socket.destroy).toHaveBeenCalled();
    expect(businessWss.handleUpgrade).not.toHaveBeenCalled();
  });

  it('rejects unknown websocket upgrade paths', async () => {
    const originalBaseUrl = process.env.SERVER_BASE_URL;
    process.env.SERVER_BASE_URL = '::not-a-url';

    try {
      vi.resetModules();

      const { server, getUpgradeHandler } = createMockServer();
      const businessWss = {
        handleUpgrade: vi.fn(),
        emit: vi.fn(),
      } as any;

      const { registerWebSocketUpgradeRouter } = await import('../../../src/process/webserver/websocket/upgradeRouter');
      registerWebSocketUpgradeRouter(server, businessWss);

      const socket = createMockSocket();
      getUpgradeHandler()({ url: '/unexpected' }, socket, Buffer.alloc(0));

      expect(socket.destroy).toHaveBeenCalled();
      expect(businessWss.handleUpgrade).not.toHaveBeenCalled();
      expect(requestMock).not.toHaveBeenCalled();
    } finally {
      if (originalBaseUrl === undefined) {
        delete process.env.SERVER_BASE_URL;
      } else {
        process.env.SERVER_BASE_URL = originalBaseUrl;
      }
    }
  });
});
