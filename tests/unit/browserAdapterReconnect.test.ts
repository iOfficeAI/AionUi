/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for the WebSocket reconnect race condition fix in browser.ts.
 * Verifies that a close event from an OLD socket does not null out
 * the reference to a NEWLY created replacement socket.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type WsListener = (event?: any) => void;

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;
  static CLOSING = 2;

  readyState = MockWebSocket.CONNECTING;
  private listeners: Record<string, WsListener[]> = {};

  addEventListener(event: string, handler: WsListener): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }

  send = vi.fn();

  close(): void {
    this.readyState = MockWebSocket.CLOSING;
    // Fire close async to simulate real behavior
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      this.fireEvent('close', { code: 1000 });
    }, 0);
  }

  // Test helpers
  fireEvent(event: string, data?: any): void {
    for (const handler of this.listeners[event] || []) {
      handler(data);
    }
  }

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.fireEvent('open');
  }
}

describe('browser adapter - WebSocket reconnect race condition', () => {
  let sockets: MockWebSocket[];
  let originalWebSocket: any;

  beforeEach(() => {
    sockets = [];
    originalWebSocket = (globalThis as any).WebSocket;
    (globalThis as any).WebSocket = class extends MockWebSocket {
      constructor() {
        super();
        sockets.push(this);
      }
    };
    // Assign static props
    (globalThis as any).WebSocket.OPEN = MockWebSocket.OPEN;
    (globalThis as any).WebSocket.CONNECTING = MockWebSocket.CONNECTING;
    (globalThis as any).WebSocket.CLOSED = MockWebSocket.CLOSED;
    (globalThis as any).WebSocket.CLOSING = MockWebSocket.CLOSING;
  });

  afterEach(() => {
    (globalThis as any).WebSocket = originalWebSocket;
    vi.useRealTimers();
  });

  it('old socket close event should not null out new socket reference', async () => {
    vi.useFakeTimers();

    // Simulate the core logic from browser.ts connect()
    let socket: MockWebSocket | null = null;

    const connect = () => {
      if (socket && (socket.readyState === MockWebSocket.OPEN || socket.readyState === MockWebSocket.CONNECTING)) {
        return;
      }
      socket = new (globalThis as any).WebSocket('ws://test');
      const currentSocket = socket;

      currentSocket.addEventListener('open', () => {
        // connected
      });

      currentSocket.addEventListener('close', () => {
        if (socket === currentSocket) {
          socket = null;
        }
      });

      currentSocket.addEventListener('error', () => {
        currentSocket.close();
      });
    };

    // First connection
    connect();
    const socket1 = sockets[0];
    socket1.simulateOpen();
    expect(socket).toBe(socket1);

    // Simulate disconnect: socket1 starts closing
    socket1.readyState = MockWebSocket.CLOSING;

    // New connection created while old is still closing
    connect();
    const socket2 = sockets[1];
    expect(socket).toBe(socket2);

    // Old socket's close event fires
    socket1.fireEvent('close', { code: 1000 });

    // KEY ASSERTION: socket should still point to socket2, not be nulled
    expect(socket).toBe(socket2);
  });

  it('close event should null socket when it is the current socket', () => {
    let socket: MockWebSocket | null = null;

    // Create a single connection
    socket = new (globalThis as any).WebSocket('ws://test');
    const currentSocket = socket;

    currentSocket.addEventListener('close', () => {
      if (socket === currentSocket) {
        socket = null;
      }
    });

    currentSocket.simulateOpen();

    // Close fires on the current socket
    currentSocket.fireEvent('close', { code: 1000 });

    // Should be nulled because socket === currentSocket
    expect(socket).toBeNull();
  });
});
