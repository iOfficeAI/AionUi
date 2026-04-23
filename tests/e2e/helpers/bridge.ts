import type { Page } from '@playwright/test';

type ElectronApi = {
  emit?: (name: string, data: unknown) => Promise<unknown>;
  on?: (callback: (payload: { event: unknown; value: unknown }) => void) => () => void;
};

type HttpRoute = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  path: string | ((params: Record<string, unknown>) => string);
  mapBody?: (params: Record<string, unknown>) => unknown;
};

/**
 * Mapping from legacy dotted IPC keys to aionui-backend HTTP routes.
 * Only keys actually used by E2E tests are listed — unknown keys fall through
 * to the IPC bridge below.
 */
const HTTP_ROUTES: Record<string, HttpRoute> = {
  'team.list': {
    method: 'GET',
    path: (p) => `/api/teams?user_id=${encodeURIComponent(String(p.user_id ?? ''))}`,
  },
  'team.create': {
    method: 'POST',
    path: '/api/teams',
  },
  'team.get': {
    method: 'GET',
    path: (p) => `/api/teams/${encodeURIComponent(String(p.id))}`,
  },
  'team.remove': {
    method: 'DELETE',
    path: (p) => `/api/teams/${encodeURIComponent(String(p.id))}`,
  },
  'team.add-agent': {
    method: 'POST',
    path: (p) => `/api/teams/${encodeURIComponent(String(p.team_id))}/agents`,
    mapBody: (p) => p.agent,
  },
  'team.ensure-session': {
    method: 'POST',
    path: (p) => `/api/teams/${encodeURIComponent(String(p.team_id))}/session`,
  },
  'database.get-conversation-messages': {
    method: 'GET',
    path: (p) => {
      const qs = new URLSearchParams();
      qs.set('page', String(p.page ?? 1));
      qs.set('page_size', String(p.page_size ?? 50));
      if (p.order) qs.set('order', String(p.order));
      return `/api/conversations/${encodeURIComponent(String(p.conversation_id))}/messages?${qs.toString()}`;
    },
  },
};

/**
 * Invoke a bridge provider from renderer test context.
 *
 * Preferred path: map `key` to a backend HTTP route and issue a `fetch` from
 * the renderer against `window.__backendPort`. This matches how the running
 * app talks to aionui-backend.
 *
 * Fallback: for any key not in the route map, fall back to the legacy
 * `@office-ai/platform` IPC protocol:
 *   emit('subscribe-{key}', { id, data }) -> on('subscribe.callback-{key}{id}', result)
 */
export async function invokeBridge<T = unknown>(
  page: Page,
  key: string,
  data?: unknown,
  timeoutMs = 10_000
): Promise<T> {
  const route = HTTP_ROUTES[key];
  if (route) {
    const params = (data ?? {}) as Record<string, unknown>;
    const resolvedPath = typeof route.path === 'function' ? route.path(params) : route.path;
    const body =
      route.method === 'GET' || route.method === 'DELETE'
        ? undefined
        : route.mapBody
          ? route.mapBody(params)
          : data;

    return page.evaluate(
      async ({ method, path, requestBody, requestTimeoutMs }) => {
        const port = (window as unknown as { __backendPort?: number }).__backendPort;
        if (!port) {
          throw new Error('window.__backendPort is not available in renderer context');
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

        try {
          const headers: Record<string, string> = {};
          if (requestBody !== undefined) headers['Content-Type'] = 'application/json';

          const response = await fetch(`http://127.0.0.1:${port}${path}`, {
            method,
            headers,
            body: requestBody !== undefined ? JSON.stringify(requestBody) : undefined,
            signal: controller.signal,
          });

          if (!response.ok) {
            let errBody: unknown;
            try {
              errBody = await response.json();
            } catch {
              errBody = await response.text();
            }
            throw new Error(`Backend ${method} ${path} failed (${response.status}): ${JSON.stringify(errBody)}`);
          }

          const contentType = response.headers.get('Content-Type');
          if (!contentType?.includes('application/json')) {
            return undefined;
          }

          const json = (await response.json()) as { success?: boolean; data?: unknown };
          if (json && typeof json === 'object' && 'data' in json) {
            return json.data;
          }
          return json;
        } finally {
          clearTimeout(timer);
        }
      },
      {
        method: route.method,
        path: resolvedPath,
        requestBody: body,
        requestTimeoutMs: timeoutMs,
      }
    ) as Promise<T>;
  }

  // Fallback: legacy IPC subscribe/callback protocol.
  return page.evaluate(
    async ({ requestKey, requestData, requestTimeoutMs }) => {
      const api = (window as unknown as { electronAPI?: ElectronApi }).electronAPI;
      if (!api?.emit || !api?.on) {
        throw new Error('electronAPI bridge is unavailable in renderer context');
      }

      const id = `e2e_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
      const callbackEventName = `subscribe.callback-${requestKey}${id}`;
      const requestEventName = `subscribe-${requestKey}`;

      return new Promise<unknown>((resolve, reject) => {
        let settled = false;
        const off = api.on?.((payload) => {
          try {
            const rawValue = payload?.value;
            const parsed =
              typeof rawValue === 'string'
                ? (JSON.parse(rawValue) as { name?: string; data?: unknown })
                : (rawValue as { name?: string; data?: unknown });
            if (parsed?.name !== callbackEventName) return;
            if (settled) return;
            settled = true;
            off?.();
            clearTimeout(timer);
            resolve(parsed.data);
          } catch (error) {
            if (settled) return;
            settled = true;
            off?.();
            clearTimeout(timer);
            reject(error);
          }
        });

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          off?.();
          reject(new Error(`Bridge invoke timeout: ${requestKey}`));
        }, requestTimeoutMs);

        api.emit?.(requestEventName, { id, data: requestData }).catch((error) => {
          if (settled) return;
          settled = true;
          off?.();
          clearTimeout(timer);
          reject(error);
        });
      });
    },
    { requestKey: key, requestData: data, requestTimeoutMs: timeoutMs }
  ) as Promise<T>;
}
