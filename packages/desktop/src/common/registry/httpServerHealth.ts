/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { httpServerAuthHeaders } from './httpServerAuth';
import type { HttpServerHttpBase } from './httpServerConnection';

export type HttpServerHealthStatus = 'unknown' | 'checking' | 'healthy' | 'unhealthy' | 'auth_failed' | 'error';

export type HttpServerHealthResult = {
  status: HttpServerHealthStatus;
  healthy: boolean;
  version?: string;
  error?: string;
};

export type CheckHttpServerHealthOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
  retryCount?: number;
  retryDelayMs?: number;
  fetch?: typeof globalThis.fetch;
};

export const HTTP_SERVER_HEALTH_TIMEOUT_MS = 3000;
export const HTTP_SERVER_HEALTH_RETRY_COUNT = 2;
export const HTTP_SERVER_HEALTH_RETRY_DELAY_MS = 100;
export const HTTP_SERVER_HEALTH_CACHE_MS = 750;
export const HTTP_SERVER_HEALTH_POLL_MS = 10_000;

const healthCache = new Map<
  string,
  { at: number; done: boolean; fetch: typeof globalThis.fetch; promise: Promise<HttpServerHealthResult> }
>();

export function httpServerHealthCacheKey(http: Pick<HttpServerHttpBase, 'url' | 'username' | 'password'>): string {
  return `${http.url}\n${http.username ?? ''}\n${http.password ?? ''}`;
}

export function globalHealthUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return `${trimmed}/global/health`;
}

function timeoutSignal(timeoutMs: number) {
  const timeout = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout;
  if (timeout) {
    try {
      return {
        signal: timeout.call(AbortSignal, timeoutMs),
        clear: undefined as (() => void) | undefined,
      };
    } catch {
      /* fall through */
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function retryable(error: unknown, signal?: AbortSignal) {
  if (signal?.aborted) return false;
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return false;
  if (error instanceof TypeError) return true;
  return /network|fetch|econnreset|econnrefused|enotfound|timedout/i.test(error.message);
}

export function mapHealthResponse(status: number, body: unknown): HttpServerHealthResult {
  if (status === 401) {
    return { status: 'auth_failed', healthy: false, error: 'unauthorized' };
  }
  if (status >= 200 && status < 300) {
    const data = body as { healthy?: unknown; version?: unknown } | null;
    const healthy = data?.healthy === true;
    const version = typeof data?.version === 'string' ? data.version : undefined;
    return healthy ? { status: 'healthy', healthy: true, version } : { status: 'unhealthy', healthy: false, version };
  }
  return { status: 'unhealthy', healthy: false, error: `http_${status}` };
}

export async function fetchHttpServerHealth(
  http: HttpServerHttpBase,
  fetchFn: typeof globalThis.fetch,
  signal?: AbortSignal
): Promise<HttpServerHealthResult> {
  const headers = httpServerAuthHeaders(http);
  const init: RequestInit = { method: 'GET', signal };
  if (headers) init.headers = headers;

  try {
    const response = await fetchFn(globalHealthUrl(http.url), init);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    return mapHealthResponse(response.status, body);
  } catch (error) {
    if (signal?.aborted) {
      return { status: 'error', healthy: false, error: 'aborted' };
    }
    const message = error instanceof Error ? error.message : 'network_error';
    return { status: 'error', healthy: false, error: message };
  }
}

export async function checkHttpServerHealth(
  http: HttpServerHttpBase,
  opts?: CheckHttpServerHealthOptions
): Promise<HttpServerHealthResult> {
  const fetchFn = opts?.fetch ?? globalThis.fetch;
  const timeout = opts?.signal ? undefined : timeoutSignal(opts?.timeoutMs ?? HTTP_SERVER_HEALTH_TIMEOUT_MS);
  const signal = opts?.signal ?? timeout?.signal;
  const retryCount = opts?.retryCount ?? HTTP_SERVER_HEALTH_RETRY_COUNT;
  const retryDelayMs = opts?.retryDelayMs ?? HTTP_SERVER_HEALTH_RETRY_DELAY_MS;

  const next = async (count: number, result: HttpServerHealthResult): Promise<HttpServerHealthResult> => {
    if (result.status === 'healthy' || result.status === 'auth_failed') return result;
    if (count >= retryCount) return result.status === 'error' ? result : { ...result, status: 'unhealthy' };
    return wait(retryDelayMs * (count + 1), signal)
      .then(() => attempt(count + 1))
      .catch(() => ({ status: 'error' as const, healthy: false, error: 'aborted' }));
  };

  const attempt = async (count: number): Promise<HttpServerHealthResult> => {
    try {
      const result = await fetchHttpServerHealth(http, fetchFn, signal);
      if (result.status === 'healthy' || result.status === 'auth_failed') return result;
      if (result.status === 'error') {
        const err = new TypeError(result.error ?? 'network_error');
        if (!retryable(err, signal)) return result;
        return next(count, result);
      }
      return next(count, result);
    } catch (error) {
      if (!retryable(error, signal)) {
        return { status: 'error', healthy: false, error: error instanceof Error ? error.message : 'network_error' };
      }
      return next(count, {
        status: 'error',
        healthy: false,
        error: error instanceof Error ? error.message : 'network_error',
      });
    }
  };

  return attempt(0).finally(() => timeout?.clear?.());
}

export function checkHttpServerHealthCached(
  http: HttpServerHttpBase,
  opts?: CheckHttpServerHealthOptions
): Promise<HttpServerHealthResult> {
  const fetchFn = opts?.fetch ?? globalThis.fetch;
  const key = httpServerHealthCacheKey(http);
  const hit = healthCache.get(key);
  const now = Date.now();
  if (hit && hit.fetch === fetchFn && (!hit.done || now - hit.at < HTTP_SERVER_HEALTH_CACHE_MS)) {
    return hit.promise;
  }
  const promise = checkHttpServerHealth(http, opts).finally(() => {
    const next = healthCache.get(key);
    if (!next || next.promise !== promise) return;
    next.done = true;
    next.at = Date.now();
  });
  healthCache.set(key, { at: now, done: false, fetch: fetchFn, promise });
  return promise;
}

export function clearHttpServerHealthCache(): void {
  healthCache.clear();
}
