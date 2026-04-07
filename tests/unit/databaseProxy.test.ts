/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for DatabaseProxy — the async proxy that delegates AionUIDatabase
 * method calls to a worker thread.  Verifies:
 *   - JS Proxy auto-delegation for unknown method names
 *   - The `then` trap that prevents the Proxy from being treated as thenable
 *   - rawSql() helper for raw SQL execution
 *   - close() / closeSync()
 *   - Error propagation from the worker
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ---------------------------------------------------------------------------
// Mock Worker so we don't actually spawn a worker thread
// ---------------------------------------------------------------------------

type WorkerMessage = { id: string; type: string; data?: unknown; method?: string; args?: unknown[] };

class MockWorker extends EventEmitter {
  postMessage = vi.fn((msg: WorkerMessage) => {
    // Auto-respond on next tick to simulate the real worker.
    setTimeout(() => {
      if (msg.type === 'close') {
        this.emit('message', { id: msg.id, type: 'result', data: null });
        return;
      }
      if (msg.type === 'rawSql') {
        this.emit('message', { id: msg.id, type: 'result', data: { changes: 1 } });
        return;
      }
      if (msg.type === 'call') {
        // Echo back the method name + args so tests can assert what was sent
        this.emit('message', {
          id: msg.id,
          type: 'result',
          data: { method: msg.method, args: msg.args },
        });
      }
    }, 0);
  });

  terminate = vi.fn(() => Promise.resolve(0));
  off = (event: string, listener: (...args: unknown[]) => void) => {
    this.removeListener(event, listener);
    return this;
  };
}

let mockWorker: MockWorker;

vi.mock('node:worker_threads', () => {
  // Use a class-based mock so `new Worker(...)` works as a constructor
  class WorkerMock {
    constructor() {
      mockWorker = new MockWorker();
      // Send 'ready' on next tick so create() resolves
      setTimeout(() => mockWorker.emit('message', { type: 'ready' }), 0);
      // Forward all instance methods/properties to the real mock
      return mockWorker as unknown as WorkerMock;
    }
  }
  return { Worker: WorkerMock };
});

import { DatabaseProxy, createDatabaseProxy } from '../../src/process/services/database/worker/DatabaseProxy';

describe('DatabaseProxy', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('create() resolves after the worker emits ready', async () => {
    const proxy = await DatabaseProxy.create('/tmp/test.db');
    expect(proxy).toBeInstanceOf(DatabaseProxy);
  });

  it('call() sends a "call" message and resolves with the result', async () => {
    const proxy = await DatabaseProxy.create('/tmp/test.db');
    const result = (await proxy.call('getConversation', 'conv-1')) as { method: string; args: unknown[] };
    expect(result.method).toBe('getConversation');
    expect(result.args).toEqual(['conv-1']);
  });

  it('rawSql() sends a "rawSql" message', async () => {
    const proxy = await DatabaseProxy.create('/tmp/test.db');
    const result = await proxy.rawSql('UPDATE x SET y = ?', 'run', [42]);
    expect(result).toEqual({ changes: 1 });
    // Verify the postMessage was called with rawSql type
    const lastCall = mockWorker.postMessage.mock.calls[mockWorker.postMessage.mock.calls.length - 1][0];
    expect(lastCall.type).toBe('rawSql');
  });

  it('createDatabaseProxy auto-forwards unknown method calls to the worker', async () => {
    const inner = await DatabaseProxy.create('/tmp/test.db');
    const proxy = createDatabaseProxy(inner);

    // Call a method that does not exist on DatabaseProxy itself —
    // the JS Proxy should forward it to call('getConversationMessages', ...).
    // Cast through unknown because TypeScript can't see methods added via JS Proxy.
    const result = await (
      proxy as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>
    ).getConversationMessages('conv-1', 0, 200, 'DESC');

    const echo = result as { method: string; args: unknown[] };
    expect(echo.method).toBe('getConversationMessages');
    expect(echo.args).toEqual(['conv-1', 0, 200, 'DESC']);
  });

  it('createDatabaseProxy returns undefined for the `then` property to prevent thenable confusion', async () => {
    const inner = await DatabaseProxy.create('/tmp/test.db');
    const proxy = createDatabaseProxy(inner);

    // The Proxy must NOT expose a `then` method, otherwise `await db.someMethod()`
    // would call `db.then()` first and forward it as an unknown method, hanging forever.
    expect((proxy as unknown as { then: unknown }).then).toBeUndefined();
  });

  it('createDatabaseProxy still exposes own methods (rawSql) directly', async () => {
    const inner = await DatabaseProxy.create('/tmp/test.db');
    const proxy = createDatabaseProxy(inner);

    // rawSql is an own method of DatabaseProxy, so it should not be forwarded
    // through call() — it should run directly.
    const result = await proxy.rawSql('SELECT 1', 'get', []);
    expect(result).toEqual({ changes: 1 });
  });

  it('closeSync() terminates the worker and marks proxy as closed', async () => {
    const inner = await DatabaseProxy.create('/tmp/test.db');
    inner.closeSync();
    expect(mockWorker.terminate).toHaveBeenCalled();

    // Subsequent calls should reject
    await expect(inner.call('anything')).rejects.toThrow('Database proxy is closed');
  });

  it('propagates worker errors to the caller via Promise rejection', async () => {
    const inner = await DatabaseProxy.create('/tmp/test.db');

    // Override postMessage to send an error response
    mockWorker.postMessage.mockImplementationOnce((msg: WorkerMessage) => {
      setTimeout(() => mockWorker.emit('message', { id: msg.id, type: 'error', message: 'simulated db failure' }), 0);
    });

    await expect(inner.call('failingMethod')).rejects.toThrow('simulated db failure');
  });
});
