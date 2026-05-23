import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, type ApiError } from '@/renderer/api/client';

describe('renderer api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses json error bodies without reading the response twice', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'bad login' }), {
          status: 401,
          statusText: 'Unauthorized',
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const api = createApiClient('http://127.0.0.1:3000');

    await expect(api.post('/login', { a: 1 })).rejects.toMatchObject<ApiError>({
      status: 401,
      statusText: 'Unauthorized',
      body: { error: 'bad login' },
    });
  });

  it('returns text error bodies for non-json responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('gateway exploded', {
          status: 502,
          statusText: 'Bad Gateway',
          headers: { 'Content-Type': 'text/plain' },
        })
      )
    );

    const api = createApiClient('http://127.0.0.1:3000');

    await expect(api.get('/health')).rejects.toMatchObject<ApiError>({
      status: 502,
      statusText: 'Bad Gateway',
      body: 'gateway exploded',
    });
  });

  it('returns parsed json data on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const api = createApiClient('http://127.0.0.1:3000');

    await expect(api.get<{ ok: boolean }>('/health')).resolves.toEqual({ ok: true });
  });
});
