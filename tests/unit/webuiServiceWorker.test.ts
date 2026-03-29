import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { describe, expect, it, vi } from 'vitest';

type ServiceWorkerRequest = {
  destination?: string;
  method: string;
  mode?: string;
  url: string;
};

type ServiceWorkerResponse = {
  ok: boolean;
  status: number;
  clone: () => ServiceWorkerResponse;
};

type ServiceWorkerModule = {
  shouldHandleRequest: (request: ServiceWorkerRequest) => boolean;
  networkFirst: (request: ServiceWorkerRequest) => Promise<ServiceWorkerResponse>;
  staleWhileRevalidate: (request: ServiceWorkerRequest) => Promise<ServiceWorkerResponse>;
};

function createResponse(status: number): ServiceWorkerResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    clone: () => createResponse(status),
  };
}

function loadServiceWorker(fetchImpl: (request: ServiceWorkerRequest) => Promise<ServiceWorkerResponse>) {
  const put = vi.fn();
  const match = vi.fn().mockResolvedValue(undefined);
  const cache = { match, put };
  const context = vm.createContext({
    URL,
    Response: { error: vi.fn() },
    caches: {
      delete: vi.fn(),
      keys: vi.fn().mockResolvedValue([]),
      open: vi.fn().mockResolvedValue(cache),
    },
    fetch: fetchImpl,
    self: {
      addEventListener: vi.fn(),
      clients: { claim: vi.fn() },
      location: { href: 'https://example.com/webui/' },
      skipWaiting: vi.fn(),
    },
  });

  const serviceWorkerSource =
    fs.readFileSync(path.resolve(__dirname, '../../public/sw.js'), 'utf8') +
    '\n;globalThis.__sw_exports = { shouldHandleRequest, networkFirst, staleWhileRevalidate };';

  vm.runInContext(serviceWorkerSource, context, { filename: 'public/sw.js' });

  return {
    cache,
    serviceWorker: (context as typeof context & { __sw_exports: ServiceWorkerModule }).__sw_exports,
  };
}

describe('webui service worker caching', () => {
  it('does not handle qr-login requests with one-time tokens', () => {
    const request: ServiceWorkerRequest = {
      method: 'GET',
      mode: 'navigate',
      url: 'https://example.com/qr-login?token=one-time-token',
    };
    const { serviceWorker } = loadServiceWorker(vi.fn());

    expect(serviceWorker.shouldHandleRequest(request)).toBe(false);
  });

  it('does not cache failed navigation responses in networkFirst', async () => {
    const request: ServiceWorkerRequest = {
      method: 'GET',
      mode: 'navigate',
      url: 'https://example.com/webui/index.html',
    };
    const failedResponse = createResponse(500);
    const { cache, serviceWorker } = loadServiceWorker(vi.fn().mockResolvedValue(failedResponse));

    const response = await serviceWorker.networkFirst(request);

    expect(response.status).toBe(500);
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('does not overwrite cached assets with failed responses in staleWhileRevalidate', async () => {
    const request: ServiceWorkerRequest = {
      destination: 'script',
      method: 'GET',
      url: 'https://example.com/webui/assets/app.js',
    };
    const cachedResponse = createResponse(200);
    const failedResponse = createResponse(503);
    const { cache, serviceWorker } = loadServiceWorker(vi.fn().mockResolvedValue(failedResponse));
    cache.match.mockResolvedValue(cachedResponse);

    const response = await serviceWorker.staleWhileRevalidate(request);
    await Promise.resolve();
    await Promise.resolve();

    expect(response).toBe(cachedResponse);
    expect(cache.put).not.toHaveBeenCalled();
  });
});
