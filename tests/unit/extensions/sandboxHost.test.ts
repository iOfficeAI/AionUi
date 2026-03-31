/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { SandboxHost } from '../../../src/process/extensions/sandbox/sandbox';
import type { SandboxMessage } from '../../../src/process/extensions/sandbox/sandbox';
import { extensionEventBus } from '../../../src/process/extensions/lifecycle/ExtensionEventBus';

// Minimal mock worker that captures postMessage calls
function createMockWorker() {
  const emitter = new EventEmitter();
  const posted: SandboxMessage[] = [];

  return {
    emitter,
    posted,
    instance: {
      postMessage(msg: SandboxMessage) {
        posted.push(msg);
      },
      on: emitter.on.bind(emitter),
      terminate: vi.fn().mockResolvedValue(0),
    },
  };
}

function createHost(overrides: Partial<ConstructorParameters<typeof SandboxHost>[0]> = {}) {
  return new SandboxHost({
    extensionName: 'test-ext',
    extensionDir: '/tmp/test-ext',
    entryPoint: 'main.js',
    permissions: undefined,
    ...overrides,
  });
}

describe('extensions/SandboxHost — handleMessage', () => {
  describe('api-call routing (Bug #4 fix)', () => {
    it('should route Worker api-call to registered apiHandler and respond with result', () => {
      const handler = vi.fn().mockReturnValue('hello');
      const host = createHost({ apiHandlers: { 'storage.get': handler } });
      const mock = createMockWorker();

      // Inject mock worker
      (host as unknown as { worker: unknown }).worker = mock.instance;
      (host as unknown as { _running: boolean })._running = true;

      // Simulate Worker sending an api-call
      const msg: SandboxMessage = { type: 'api-call', id: 'w-1', method: 'storage.get', args: ['myKey'] };
      (host as unknown as { handleMessage: (m: SandboxMessage) => void }).handleMessage(msg);

      expect(handler).toHaveBeenCalledWith('myKey');
      expect(mock.posted).toHaveLength(1);
      expect(mock.posted[0]).toEqual({ type: 'api-response', id: 'w-1', result: 'hello' });
    });

    it('should handle async apiHandler and respond with resolved value', async () => {
      const handler = vi.fn().mockResolvedValue({ items: [1, 2] });
      const host = createHost({ apiHandlers: { 'storage.get': handler } });
      const mock = createMockWorker();
      (host as unknown as { worker: unknown }).worker = mock.instance;
      (host as unknown as { _running: boolean })._running = true;

      const msg: SandboxMessage = { type: 'api-call', id: 'w-2', method: 'storage.get', args: ['data'] };
      (host as unknown as { handleMessage: (m: SandboxMessage) => void }).handleMessage(msg);

      // Async handler — wait for microtask
      await vi.waitFor(() => {
        expect(mock.posted).toHaveLength(1);
      });
      expect(mock.posted[0]).toEqual({ type: 'api-response', id: 'w-2', result: { items: [1, 2] } });
    });

    it('should respond with error when apiHandler throws', () => {
      const handler = vi.fn().mockImplementation(() => {
        throw new Error('boom');
      });
      const host = createHost({ apiHandlers: { 'storage.set': handler } });
      const mock = createMockWorker();
      (host as unknown as { worker: unknown }).worker = mock.instance;
      (host as unknown as { _running: boolean })._running = true;

      const msg: SandboxMessage = { type: 'api-call', id: 'w-3', method: 'storage.set', args: ['k', 'v'] };
      (host as unknown as { handleMessage: (m: SandboxMessage) => void }).handleMessage(msg);

      expect(mock.posted).toHaveLength(1);
      expect(mock.posted[0]).toMatchObject({ type: 'api-response', id: 'w-3', error: 'Error: boom' });
    });

    it('should respond with error when async apiHandler rejects', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('async boom'));
      const host = createHost({ apiHandlers: { 'storage.delete': handler } });
      const mock = createMockWorker();
      (host as unknown as { worker: unknown }).worker = mock.instance;
      (host as unknown as { _running: boolean })._running = true;

      const msg: SandboxMessage = { type: 'api-call', id: 'w-4', method: 'storage.delete', args: ['k'] };
      (host as unknown as { handleMessage: (m: SandboxMessage) => void }).handleMessage(msg);

      await vi.waitFor(() => {
        expect(mock.posted).toHaveLength(1);
      });
      expect(mock.posted[0]).toMatchObject({ type: 'api-response', id: 'w-4', error: 'Error: async boom' });
    });

    it('should respond with error when no handler is registered for the method', () => {
      const host = createHost({ apiHandlers: {} });
      const mock = createMockWorker();
      (host as unknown as { worker: unknown }).worker = mock.instance;
      (host as unknown as { _running: boolean })._running = true;

      const msg: SandboxMessage = { type: 'api-call', id: 'w-5', method: 'unknown.method', args: [] };
      (host as unknown as { handleMessage: (m: SandboxMessage) => void }).handleMessage(msg);

      expect(mock.posted).toHaveLength(1);
      expect(mock.posted[0]).toMatchObject({
        type: 'api-response',
        id: 'w-5',
        error: 'No handler registered for "unknown.method"',
      });
    });

    it('should respond with error when apiHandlers option is not provided', () => {
      const host = createHost(); // no apiHandlers
      const mock = createMockWorker();
      (host as unknown as { worker: unknown }).worker = mock.instance;
      (host as unknown as { _running: boolean })._running = true;

      const msg: SandboxMessage = { type: 'api-call', id: 'w-6', method: 'storage.get', args: ['k'] };
      (host as unknown as { handleMessage: (m: SandboxMessage) => void }).handleMessage(msg);

      expect(mock.posted).toHaveLength(1);
      expect(mock.posted[0]).toMatchObject({ type: 'api-response', id: 'w-6' });
      expect((mock.posted[0] as { error?: string }).error).toContain('No handler registered');
    });
  });

  describe('event routing (Bug #5 fix)', () => {
    let eventSpy: (payload: unknown) => void;
    let unsub: () => void;

    beforeEach(() => {
      eventSpy = vi.fn();
    });

    afterEach(() => {
      unsub?.();
    });

    it('should forward ext: events to extensionEventBus', () => {
      unsub = extensionEventBus.onExtensionEvent('test-ext', 'data-ready', eventSpy);

      const host = createHost();
      const mock = createMockWorker();
      (host as unknown as { worker: unknown }).worker = mock.instance;
      (host as unknown as { _running: boolean })._running = true;

      const msg: SandboxMessage = { type: 'event', name: 'ext:data-ready', payload: { count: 5 } };
      (host as unknown as { handleMessage: (m: SandboxMessage) => void }).handleMessage(msg);

      expect(eventSpy).toHaveBeenCalledWith({ count: 5 });
    });

    it('should forward ui-message events to onUIMessage callback', () => {
      const uiSpy = vi.fn();
      const host = createHost({ onUIMessage: uiSpy });
      const mock = createMockWorker();
      (host as unknown as { worker: unknown }).worker = mock.instance;
      (host as unknown as { _running: boolean })._running = true;

      const msg: SandboxMessage = { type: 'event', name: 'ui-message', payload: { text: 'hello UI' } };
      (host as unknown as { handleMessage: (m: SandboxMessage) => void }).handleMessage(msg);

      expect(uiSpy).toHaveBeenCalledWith('test-ext', { text: 'hello UI' });
    });

    it('should not throw when onUIMessage is not provided', () => {
      const host = createHost(); // no onUIMessage
      const mock = createMockWorker();
      (host as unknown as { worker: unknown }).worker = mock.instance;
      (host as unknown as { _running: boolean })._running = true;

      const msg: SandboxMessage = { type: 'event', name: 'ui-message', payload: 'data' };
      expect(() => {
        (host as unknown as { handleMessage: (m: SandboxMessage) => void }).handleMessage(msg);
      }).not.toThrow();
    });

    it('should ignore events without ext: prefix or ui-message name', () => {
      unsub = extensionEventBus.onExtensionEvent('test-ext', 'something', eventSpy);
      const uiSpy = vi.fn();
      const host = createHost({ onUIMessage: uiSpy });
      const mock = createMockWorker();
      (host as unknown as { worker: unknown }).worker = mock.instance;
      (host as unknown as { _running: boolean })._running = true;

      const msg: SandboxMessage = { type: 'event', name: 'random-name', payload: null };
      (host as unknown as { handleMessage: (m: SandboxMessage) => void }).handleMessage(msg);

      expect(eventSpy).not.toHaveBeenCalled();
      expect(uiSpy).not.toHaveBeenCalled();
    });
  });

  describe('api-response routing (existing, should still work)', () => {
    it('should resolve pending call when api-response arrives', async () => {
      const host = createHost();
      const mock = createMockWorker();
      (host as unknown as { worker: unknown }).worker = mock.instance;
      (host as unknown as { _running: boolean })._running = true;

      // Manually create a pending call like call() would
      const pendingCalls = (host as unknown as { pendingCalls: Map<string, unknown> }).pendingCalls;
      const resultPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), 5000);
        pendingCalls.set('call-1', { resolve, reject, timer });
      });

      const msg: SandboxMessage = { type: 'api-response', id: 'call-1', result: 'ok' };
      (host as unknown as { handleMessage: (m: SandboxMessage) => void }).handleMessage(msg);

      await expect(resultPromise).resolves.toBe('ok');
    });

    it('should reject pending call when api-response has error', async () => {
      const host = createHost();
      const mock = createMockWorker();
      (host as unknown as { worker: unknown }).worker = mock.instance;
      (host as unknown as { _running: boolean })._running = true;

      const pendingCalls = (host as unknown as { pendingCalls: Map<string, unknown> }).pendingCalls;
      const resultPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), 5000);
        pendingCalls.set('call-2', { resolve, reject, timer });
      });

      const msg: SandboxMessage = { type: 'api-response', id: 'call-2', error: 'not found' };
      (host as unknown as { handleMessage: (m: SandboxMessage) => void }).handleMessage(msg);

      await expect(resultPromise).rejects.toThrow('not found');
    });
  });
});
