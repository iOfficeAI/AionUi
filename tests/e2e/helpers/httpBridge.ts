import type { Page } from '@playwright/test';

/**
 * HTTP bridge helper for E2E tests.
 *
 * The renderer migrated from IPC `invokeBridge('subscribe-<key>')` to direct
 * HTTP calls against `aionui-backend` via `fetch('http://127.0.0.1:<port>/api/...')`.
 * The backend port is exposed on `window.__backendPort` by the preload script
 * (`src/preload/main.ts:71`).
 *
 * These helpers drive backend calls from the renderer context (via `page.evaluate`)
 * so tests execute in the same network context the app itself uses — identical
 * port, identical base URL, no host-side HTTP plumbing.
 *
 * Backend responses are wrapped as `{ success, data, ... }`. This helper unwraps
 * `data` when present, matching `httpBridge.ts:76` in the renderer adapter.
 */

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function httpInvoke<T = unknown>(
  page: Page,
  method: HttpMethod,
  path: string,
  body?: unknown
): Promise<T> {
  return page.evaluate(
    async ({ method: m, path: p, body: b }) => {
      const port = (window as unknown as { __backendPort?: number }).__backendPort ?? 13400;
      const url = `http://127.0.0.1:${port}${p}`;
      // Always set Content-Type: some backend routes (e.g. DELETE
      // /api/skills/external-paths) reject requests without it even when
      // the body is empty. Setting it unconditionally is safe.
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      const res = await fetch(url, {
        method: m,
        headers,
        body: b !== undefined ? JSON.stringify(b) : undefined,
      });

      if (!res.ok) {
        let errText: string;
        try {
          errText = JSON.stringify(await res.json());
        } catch {
          errText = await res.text();
        }
        throw new Error(`Backend ${m} ${p} failed (${res.status}): ${errText}`);
      }

      const contentType = res.headers.get('Content-Type');
      if (!contentType?.includes('application/json')) {
        return undefined;
      }

      const json = await res.json();
      if (json && typeof json === 'object' && 'data' in json) {
        return (json as { data: unknown }).data;
      }
      return json;
    },
    { method, path, body }
  ) as Promise<T>;
}

export const httpGet = <T = unknown>(page: Page, path: string) => httpInvoke<T>(page, 'GET', path);
export const httpPost = <T = unknown>(page: Page, path: string, body?: unknown) =>
  httpInvoke<T>(page, 'POST', path, body);
export const httpDelete = <T = unknown>(page: Page, path: string) => httpInvoke<T>(page, 'DELETE', path);
