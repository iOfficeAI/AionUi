/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Wire-level contract for the seven provider-management ipcBridge entries.
 * Each test invokes a `ipcBridge.mode.*` method and asserts the resulting
 * `fetch()` call matches the backend spec — right path, right HTTP method,
 * right body shape.
 *
 * Backend contract:
 *   aionui-backend/docs/backend-migration/specs/2026-04-24-model-config-backend-migration-design.md
 *
 * Frontend contract:
 *   docs/backend-migration/specs/2026-04-24-model-config-frontend-migration-design.md
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const BASE_URL = 'http://127.0.0.1:13400';

type FetchArgs = { url: string; method: string; body: unknown };

function lastFetchCall(mock: ReturnType<typeof vi.fn>): FetchArgs {
  expect(mock).toHaveBeenCalledTimes(1);
  const [url, init] = mock.mock.calls[0] as [string, RequestInit];
  return {
    url,
    method: (init?.method ?? 'GET').toUpperCase(),
    body: init?.body ? JSON.parse(init.body as string) : undefined,
  };
}

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function noContentResponse(): Response {
  // Mimics a DELETE 200 with no body — httpRequest short-circuits when
  // Content-Type is absent.
  return new Response(null, { status: 200 });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('ipcBridge.mode — wire-level contract', () => {
  it('listProviders → GET /api/providers, unwraps backend { data } envelope', async () => {
    const providers = [
      {
        id: 'p1',
        platform: 'openai',
        name: 'OpenAI',
        base_url: 'https://api.openai.com',
        api_key: 'sk-x',
        models: ['gpt-4'],
      },
    ];
    fetchMock.mockResolvedValueOnce(okResponse({ success: true, data: providers }));

    const { mode } = await import('@/common/adapter/ipcBridge');
    const result = await mode.listProviders.invoke();

    const call = lastFetchCall(fetchMock);
    expect(call.url).toBe(`${BASE_URL}/api/providers`);
    expect(call.method).toBe('GET');
    expect(call.body).toBeUndefined();
    expect(result).toEqual(providers);
  });

  it('createProvider → POST /api/providers with the full CreateProviderRequest body', async () => {
    const created = { id: 'abc12345', platform: 'openai', name: 'Test', base_url: 'x', api_key: 'k', models: [] };
    fetchMock.mockResolvedValueOnce(okResponse({ success: true, data: created }));

    const { mode } = await import('@/common/adapter/ipcBridge');
    const payload = {
      id: 'abc12345', // frontend 8-char hex — backend accepts per T1 spec
      platform: 'openai',
      name: 'Test',
      base_url: 'https://api.openai.com',
      api_key: 'sk-xxx',
      models: ['gpt-4'],
      model_enabled: { 'gpt-4': true },
    };
    await mode.createProvider.invoke(payload);

    const call = lastFetchCall(fetchMock);
    expect(call.url).toBe(`${BASE_URL}/api/providers`);
    expect(call.method).toBe('POST');
    expect(call.body).toEqual(payload);
  });

  it('updateProvider → PUT /api/providers/:id with id stripped from body', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ success: true, data: {} }));

    const { mode } = await import('@/common/adapter/ipcBridge');
    await mode.updateProvider.invoke({
      id: 'p1',
      model_enabled: { 'gpt-4': false },
    });

    const call = lastFetchCall(fetchMock);
    expect(call.url).toBe(`${BASE_URL}/api/providers/p1`);
    expect(call.method).toBe('PUT');
    // id is carried in the URL, not the body — a regression here would
    // either 404 (wrong URL) or 400 (backend rejects id in body).
    expect(call.body).toEqual({ model_enabled: { 'gpt-4': false } });
    expect(call.body).not.toHaveProperty('id');
  });

  it('updateProvider → partial model_health PATCH keeps only the changed map', async () => {
    // Mirrors ModelModalContent.performHealthCheck: a concurrent-safe
    // partial update that must *not* ship the whole IProvider.
    fetchMock.mockResolvedValueOnce(okResponse({ success: true, data: {} }));

    const { mode } = await import('@/common/adapter/ipcBridge');
    await mode.updateProvider.invoke({
      id: 'p1',
      model_health: { 'gpt-4': { status: 'healthy', last_check: 1700000000000, latency: 120 } },
    });

    const call = lastFetchCall(fetchMock);
    expect(call.body).toEqual({
      model_health: { 'gpt-4': { status: 'healthy', last_check: 1700000000000, latency: 120 } },
    });
  });

  it('deleteProvider → DELETE /api/providers/:id with no body', async () => {
    fetchMock.mockResolvedValueOnce(noContentResponse());

    const { mode } = await import('@/common/adapter/ipcBridge');
    await mode.deleteProvider.invoke({ id: 'p1' });

    const call = lastFetchCall(fetchMock);
    expect(call.url).toBe(`${BASE_URL}/api/providers/p1`);
    expect(call.method).toBe('DELETE');
    expect(call.body).toBeUndefined();
  });

  it('fetchProviderModels → POST /api/providers/:id/models with only { try_fix }', async () => {
    // By-id variant: id is in the URL; body carries only the try_fix flag
    // so a caller accidentally shipping the whole IProvider would fail.
    fetchMock.mockResolvedValueOnce(okResponse({ success: true, data: { models: ['gpt-4'] } }));

    const { mode } = await import('@/common/adapter/ipcBridge');
    await mode.fetchProviderModels.invoke({ id: 'p1', try_fix: true });

    const call = lastFetchCall(fetchMock);
    expect(call.url).toBe(`${BASE_URL}/api/providers/p1/models`);
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({ try_fix: true });
    expect(call.body).not.toHaveProperty('id');
  });

  it('fetchModelList (anonymous) → POST /api/providers/fetch-models with credentials in body', async () => {
    // Pre-create form preview (T1b). No provider row exists yet — payload
    // carries everything the backend needs to talk to the upstream API.
    fetchMock.mockResolvedValueOnce(okResponse({ success: true, data: { models: [] } }));

    const { mode } = await import('@/common/adapter/ipcBridge');
    const payload = {
      platform: 'openai',
      base_url: 'https://api.openai.com',
      api_key: 'sk-xxx',
    };
    await mode.fetchModelList.invoke(payload);

    const call = lastFetchCall(fetchMock);
    expect(call.url).toBe(`${BASE_URL}/api/providers/fetch-models`);
    expect(call.method).toBe('POST');
    expect(call.body).toEqual(payload);
  });

  it('detectProtocol → POST /api/providers/detect-protocol', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ success: true, data: { protocol: 'openai' } }));

    const { mode } = await import('@/common/adapter/ipcBridge');
    const payload = { platform: 'custom', base_url: 'https://x', api_key: 'k' };
    await mode.detectProtocol.invoke(payload as never);

    const call = lastFetchCall(fetchMock);
    expect(call.url).toBe(`${BASE_URL}/api/providers/detect-protocol`);
    expect(call.method).toBe('POST');
    expect(call.body).toEqual(payload);
  });

  it('throws with status + body on non-OK responses instead of silently resolving', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'id already taken' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { mode } = await import('@/common/adapter/ipcBridge');
    await expect(
      mode.createProvider.invoke({ id: 'dup', platform: 'x', name: 'x', base_url: 'x', api_key: 'x' })
    ).rejects.toThrow(/409/);
  });
});
