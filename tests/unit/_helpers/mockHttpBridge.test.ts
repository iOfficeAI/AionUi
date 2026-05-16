/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for mockHttpBridge helper (T6 in N3 test checklist).
 * This file verifies the mock helper itself — domain tests (T1-T5) use the helper.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockHttpBridge, resetMockHttpBridge, type MockHttpBridge } from './mockHttpBridge';

describe('mockHttpBridge helper', () => {
  let mock: MockHttpBridge;

  beforeEach(() => {
    mock = createMockHttpBridge();
  });

  it('createMockHttpBridge() returns object with frozen public API', () => {
    expect(mock).toBeDefined();
    expect(typeof mock.onGet).toBe('function');
    expect(typeof mock.onPost).toBe('function');
    expect(typeof mock.onPut).toBe('function');
    expect(typeof mock.onPatch).toBe('function');
    expect(typeof mock.onDelete).toBe('function');
    expect(typeof mock.emit).toBe('function');
    expect(Array.isArray(mock.calls)).toBe(true);
    expect(typeof mock.routeCount).toBe('number');
    expect(typeof mock.wsListenerCount).toBe('number');
    expect(typeof mock.reset).toBe('function');
    expect(typeof mock.asModule).toBe('function');
  });

  it('onGet registers a handler; asModule().httpGet(path).invoke() returns handler result', async () => {
    mock.onGet('/api/foo', () => ({ ok: true }));

    const module = mock.asModule();
    const result = await module.httpGet('/api/foo').invoke();

    expect(result).toEqual({ ok: true });
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]).toMatchObject({
      method: 'GET',
      path: '/api/foo',
      pathPattern: '/api/foo',
      params: {},
      query: {},
      body: undefined,
    });
  });

  it('onPost forwards body and returns handler result', async () => {
    mock.onPost('/api/items', (ctx) => {
      expect(ctx.body).toEqual({ id: 'a' });
      return { created: ctx.body };
    });

    const module = mock.asModule();
    const result = await module.httpPost('/api/items').invoke({ id: 'a' });

    expect(result).toEqual({ created: { id: 'a' } });
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0].body).toEqual({ id: 'a' });
  });

  it(':param placeholder populates params map', async () => {
    mock.onGet('/api/providers/:id', (ctx) => {
      expect(ctx.params.id).toBe('p1');
      return { provider: ctx.params.id };
    });

    const module = mock.asModule();
    const result = await module.httpGet('/api/providers/p1').invoke();

    expect(result).toEqual({ provider: 'p1' });
    expect(mock.calls[0].params).toEqual({ id: 'p1' });
  });

  it('unmatched route throws "unexpected call" by default', async () => {
    mock.onGet('/api/foo', () => ({ ok: true }));

    const module = mock.asModule();
    await expect(module.httpGet('/api/bar').invoke()).rejects.toThrow(/unexpected call/);
  });

  it('unmatched option "warn" returns undefined and logs console.warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mock = createMockHttpBridge({ unmatched: 'warn' });
    mock.onGet('/api/foo', () => ({ ok: true }));

    const module = mock.asModule();
    const result = await module.httpGet('/api/bar').invoke();

    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unmatched route GET /api/bar'));

    warnSpy.mockRestore();
  });

  it('emit() dispatches to all wsEmitter listeners synchronously', () => {
    const module = mock.asModule();
    const events: unknown[] = [];

    const unsubscribe = module.wsEmitter('test-event').on((payload: unknown) => {
      events.push(payload);
    });

    mock.emit('test-event', { data: 'hello' });
    expect(events).toEqual([{ data: 'hello' }]);

    mock.emit('test-event', { data: 'world' });
    expect(events).toEqual([{ data: 'hello' }, { data: 'world' }]);

    expect(mock.wsListenerCount).toBe(1);

    unsubscribe();
    mock.emit('test-event', { data: 'ignored' });
    expect(events).toHaveLength(2); // No new event
    expect(mock.wsListenerCount).toBe(0);
  });

  it('reset() clears routes, listeners, and calls', async () => {
    mock.onGet('/api/test', () => ({ ok: true }));
    const module = mock.asModule();
    module.wsEmitter('event').on(() => {});

    await module.httpGet('/api/test').invoke();
    expect(mock.routeCount).toBe(1);
    expect(mock.wsListenerCount).toBe(1);
    expect(mock.calls).toHaveLength(1);

    mock.reset();
    expect(mock.routeCount).toBe(0);
    expect(mock.wsListenerCount).toBe(0);
    expect(mock.calls).toHaveLength(0);
  });

  it('resetMockHttpBridge() convenience function calls mock.reset()', () => {
    mock.onGet('/api/test', () => ({ ok: true }));
    expect(mock.routeCount).toBe(1);

    resetMockHttpBridge(mock);
    expect(mock.routeCount).toBe(0);
  });

  it('query string is parsed and stripped from path', async () => {
    mock.onGet('/api/search', (ctx) => {
      expect(ctx.query).toEqual({ q: 'test', page: '2' });
      return { results: [] };
    });

    const module = mock.asModule();
    await module.httpGet('/api/search?q=test&page=2').invoke();

    expect(mock.calls[0].query).toEqual({ q: 'test', page: '2' });
    expect(mock.calls[0].path).toBe('/api/search?q=test&page=2');
  });

  it('multiple :params are extracted correctly', async () => {
    mock.onGet('/api/users/:userId/posts/:postId', (ctx) => {
      expect(ctx.params.userId).toBe('u123');
      expect(ctx.params.postId).toBe('p456');
      return { user: ctx.params.userId, post: ctx.params.postId };
    });

    const module = mock.asModule();
    const result = await module.httpGet('/api/users/u123/posts/p456').invoke();

    expect(result).toEqual({ user: 'u123', post: 'p456' });
  });

  it('stubProvider returns default value and logs warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const module = mock.asModule();

    const provider = module.stubProvider('test-stub', 42);
    const result = await provider.invoke();

    expect(result).toBe(42);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("stubProvider('test-stub')"), 42);

    warnSpy.mockRestore();
  });

  it('withResponseMap wraps invoke and applies mapper', async () => {
    mock.onGet('/api/data', () => ({ raw: 'abc' }));

    const module = mock.asModule();
    const inner = module.httpGet<{ raw: string }>('/api/data');
    const mapped = module.withResponseMap(inner, (data) => data.raw.toUpperCase());

    const result = await mapped.invoke();
    expect(result).toBe('ABC');
  });

  it('wsMappedEmitter applies transform to payload', () => {
    const module = mock.asModule();
    const events: number[] = [];

    const emitter = module.wsMappedEmitter<number>('raw-event', (raw: unknown) => (raw as { v: number }).v * 2);

    emitter.on((value: number) => {
      events.push(value);
    });

    mock.emit('raw-event', { v: 3 });
    expect(events).toEqual([6]);

    mock.emit('raw-event', { v: 5 });
    expect(events).toEqual([6, 10]);
  });

  it('path as function is resolved with params', async () => {
    mock.onGet('/api/items/xyz', () => ({ item: 'xyz' }));

    const module = mock.asModule();
    const result = await module
      .httpGet<{ item: string }, { id: string }>((params) => `/api/items/${params.id}`)
      .invoke({
        id: 'xyz',
      });

    expect(result).toEqual({ item: 'xyz' });
    expect(mock.calls[0].path).toBe('/api/items/xyz');
  });

  it('httpRequest direct call throws error', () => {
    const module = mock.asModule();
    expect(() => module.httpRequest('GET', '/api/test')).toThrow(/direct httpRequest calls not allowed/);
  });
});
