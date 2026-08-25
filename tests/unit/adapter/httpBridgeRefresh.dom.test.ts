/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { httpRequest } from '@/common/adapter/httpBridge';

type WindowWithPort = { __backendPort?: number };

/** Minimal `Response`-like stub covering the fields `httpRequest` reads. */
function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function errorResponse(status: number, body: unknown) {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  };
}

describe('httpRequest 401 → refresh → replay (WebUI #4124 fix)', () => {
  beforeEach(() => {
    // Browser mode so getBaseUrl() === '' and refresh is active.
    delete (window as WindowWithPort).__backendPort;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as WindowWithPort).__backendPort;
  });

  it('refreshes once and replays the original request on 401, returning unwrapped data', async () => {
    let dataCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/auth/refresh') return { ok: true };
      dataCalls += 1;
      if (dataCalls === 1) return errorResponse(401, { code: 'UNAUTHORIZED', error: 'expired' });
      return jsonResponse(200, { data: { value: 42 } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(httpRequest('GET', '/api/data')).resolves.toEqual({ value: 42 });

    // original 401 + refresh + replay = 3 calls
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/api/data', '/api/auth/refresh', '/api/data']);
  });

  it('throws the original 401 when the refresh also fails (no infinite retry)', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/auth/refresh') return { ok: false, status: 401 };
      return errorResponse(401, { code: 'UNAUTHORIZED', error: 'expired' });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(httpRequest('GET', '/api/data')).rejects.toMatchObject({
      name: 'BackendHttpError',
      status: 401,
      code: 'UNAUTHORIZED',
    });

    // original 401 + one refresh attempt, then give up (no replay)
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not refresh when the first response succeeds', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { data: { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(httpRequest('GET', '/api/data')).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/refresh', expect.anything());
  });

  it('does not recurse when the refresh endpoint itself returns 401', async () => {
    const fetchMock = vi.fn(async () => errorResponse(401, { code: 'UNAUTHORIZED', error: 'expired' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(httpRequest('POST', '/api/auth/refresh')).rejects.toMatchObject({
      name: 'BackendHttpError',
      status: 401,
    });

    // Called exactly once — the auth endpoint is exempt from refresh-replay.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
