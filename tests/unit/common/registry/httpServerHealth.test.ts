/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for HTTP server health checking (t2-registry-02).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HTTP_SERVER_HEALTH_CACHE_MS,
  HTTP_SERVER_HEALTH_RETRY_COUNT,
  checkHttpServerHealth,
  checkHttpServerHealthCached,
  clearHttpServerHealthCache,
  fetchHttpServerHealth,
  globalHealthUrl,
  httpServerAuthHeaders,
  mapHealthResponse,
} from '@/common/registry';

function mockFetch(status: number, body: unknown, opts?: { reject?: boolean; delayMs?: number }) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    if (opts?.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (opts?.reject) throw new TypeError('fetch failed');
    return {
      status,
      json: async () => body,
    } as Response;
  });
}

describe('globalHealthUrl', () => {
  it('appends /global/health to the base URL', () => {
    expect(globalHealthUrl('http://example.com')).toBe('http://example.com/global/health');
    expect(globalHealthUrl('http://example.com/')).toBe('http://example.com/global/health');
  });
});

describe('mapHealthResponse', () => {
  it('maps 200 with healthy:true to healthy', () => {
    expect(mapHealthResponse(200, { healthy: true, version: '1.15.13' })).toEqual({
      status: 'healthy',
      healthy: true,
      version: '1.15.13',
    });
  });

  it('maps 200 with healthy:false to unhealthy', () => {
    expect(mapHealthResponse(200, { healthy: false })).toEqual({
      status: 'unhealthy',
      healthy: false,
    });
  });

  it('maps 401 to auth_failed', () => {
    expect(mapHealthResponse(401, {})).toEqual({
      status: 'auth_failed',
      healthy: false,
      error: 'unauthorized',
    });
  });
});

describe('fetchHttpServerHealth auth headers', () => {
  it('does not send Authorization when password is absent', async () => {
    const fetchFn = mockFetch(200, { healthy: true, version: '1.0.0' });
    await fetchHttpServerHealth({ url: 'http://example.com' }, fetchFn);
    const init = fetchFn.mock.calls[0][1] as RequestInit;
    expect(init.headers).toBeUndefined();
  });

  it('sends Basic auth when password is present', async () => {
    const fetchFn = mockFetch(200, { healthy: true, version: '1.0.0' });
    await fetchHttpServerHealth({ url: 'http://example.com', password: 'secret' }, fetchFn);
    const init = fetchFn.mock.calls[0][1] as RequestInit;
    expect(init.headers).toEqual(httpServerAuthHeaders({ password: 'secret' }));
  });
});

describe('checkHttpServerHealth retry behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries network failures up to retryCount then returns error', async () => {
    const fetchFn = mockFetch(0, null, { reject: true });
    const promise = checkHttpServerHealth(
      { url: 'http://example.com' },
      { fetch: fetchFn, retryCount: HTTP_SERVER_HEALTH_RETRY_COUNT, retryDelayMs: 100 },
    );

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchFn).toHaveBeenCalledTimes(HTTP_SERVER_HEALTH_RETRY_COUNT + 1);
    expect(result.status).toBe('error');
    expect(result.healthy).toBe(false);
  });

  it('does not retry 401 auth failures', async () => {
    const fetchFn = mockFetch(401, {});
    const result = await checkHttpServerHealth({ url: 'http://example.com', password: 'bad' }, { fetch: fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('auth_failed');
  });

  it('returns healthy on 200 without retries', async () => {
    const fetchFn = mockFetch(200, { healthy: true, version: '1.15.13' });
    const result = await checkHttpServerHealth({ url: 'http://example.com' }, { fetch: fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: 'healthy', healthy: true, version: '1.15.13' });
  });
});

describe('checkHttpServerHealthCached', () => {
  beforeEach(() => {
    clearHttpServerHealthCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    clearHttpServerHealthCache();
    vi.useRealTimers();
  });

  it('returns cached promise within TTL after completion', async () => {
    const fetchFn = mockFetch(200, { healthy: true, version: '1.0.0' });
    const http = { url: 'http://example.com' };

    const first = checkHttpServerHealthCached(http, { fetch: fetchFn });
    await first;
    expect(fetchFn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(HTTP_SERVER_HEALTH_CACHE_MS - 1);
    const second = checkHttpServerHealthCached(http, { fetch: fetchFn });
    await second;
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('refetches after cache TTL expires', async () => {
    const fetchFn = mockFetch(200, { healthy: true, version: '1.0.0' });
    const http = { url: 'http://example.com' };

    await checkHttpServerHealthCached(http, { fetch: fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(HTTP_SERVER_HEALTH_CACHE_MS + 1);
    await checkHttpServerHealthCached(http, { fetch: fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
