import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocket } from 'ws';

// Mock TokenMiddleware before importing WebSocketManager
vi.mock('@process/webserver/auth/middleware/TokenMiddleware', () => ({
  TokenMiddleware: {
    extractWebSocketToken: vi.fn(),
    validateWebSocketToken: vi.fn(),
  },
}));

// Mock SHOW_OPEN_REQUEST_EVENT
vi.mock('@/common/adapter/constant', () => ({
  SHOW_OPEN_REQUEST_EVENT: 'show-open-request',
}));

import { WebSocketManager } from '@process/webserver/websocket/WebSocketManager';

function createMockWss() {
  return {
    on: vi.fn(),
  } as any;
}

function createMockWs(readyState = WebSocket.OPEN) {
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
    terminate: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  } as any;
}

describe('WebSocketManager', () => {
  let manager: WebSocketManager;
  let mockWss: any;

  beforeEach(() => {
    vi.useFakeTimers();
    mockWss = createMockWss();
    manager = new WebSocketManager(mockWss);
  });

  describe('checkClients - EPIPE resilience', () => {
    it('should catch EPIPE when sending auth-expired to a broken socket', async () => {
      const { TokenMiddleware } = await import('@process/webserver/auth/middleware/TokenMiddleware');

      // Initialize to start heartbeat
      manager.initialize();

      // Manually add a client via the internal clients map
      const ws = createMockWs(WebSocket.OPEN);
      const clients = (manager as any).clients as Map<any, any>;
      clients.set(ws, { token: 'expired-token', lastPing: Date.now() });

      // Token validation fails → triggers auth-expired send
      vi.mocked(TokenMiddleware.validateWebSocketToken).mockResolvedValue(false as any);

      // ws.send throws EPIPE
      ws.send.mockImplementation(() => {
        throw new Error('write EPIPE');
      });

      // Trigger heartbeat check
      await (manager as any).checkClients();

      // Should have attempted to send auth-expired
      expect(ws.send).toHaveBeenCalled();
      // Should fall back to terminate after EPIPE
      expect(ws.terminate).toHaveBeenCalled();
      // Client should be removed
      expect(clients.has(ws)).toBe(false);
    });

    it('should catch EPIPE when closing a timed-out socket', async () => {
      manager.initialize();

      const ws = createMockWs(WebSocket.OPEN);
      const clients = (manager as any).clients as Map<any, any>;
      // Set lastPing far in the past to trigger timeout
      clients.set(ws, { token: 'some-token', lastPing: 0 });

      // ws.close throws EPIPE
      ws.close.mockImplementation(() => {
        throw new Error('write EPIPE');
      });

      await (manager as any).checkClients();

      // Should fall back to terminate
      expect(ws.terminate).toHaveBeenCalled();
      expect(clients.has(ws)).toBe(false);
    });

    it('should skip send when readyState is not OPEN for expired token', async () => {
      const { TokenMiddleware } = await import('@process/webserver/auth/middleware/TokenMiddleware');

      manager.initialize();

      const ws = createMockWs(WebSocket.CLOSING);
      const clients = (manager as any).clients as Map<any, any>;
      clients.set(ws, { token: 'expired-token', lastPing: Date.now() });

      vi.mocked(TokenMiddleware.validateWebSocketToken).mockResolvedValue(false as any);

      await (manager as any).checkClients();

      // Should NOT attempt to send when socket is not OPEN
      expect(ws.send).not.toHaveBeenCalled();
      // Should still attempt close
      expect(ws.close).toHaveBeenCalled();
      expect(clients.has(ws)).toBe(false);
    });
  });
});
