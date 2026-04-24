/**
 * HTTP/WS bridge factory — drop-in replacement for bridge.buildProvider / bridge.buildEmitter
 * that routes calls to aionui-backend via REST API and WebSocket.
 *
 * Exported helpers produce objects with the same shape as @office-ai/platform bridge,
 * so existing renderer code works without changes.
 */

// ---------------------------------------------------------------------------
// Base URL
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    __backendPort?: number;
  }
}

/**
 * Resolve the backend port, honoring both renderer and main-process contexts.
 *
 * - Renderer: the preload bridge writes `window.__backendPort` before the
 *   first HTTP call, so reading from window is authoritative.
 * - Main process: `window` is undefined. `src/index.ts` writes the port to
 *   `globalThis.__backendPort` immediately after `backendManager.start()`
 *   resolves, so any main-process ipcBridge caller (e.g. the one-shot
 *   assistant migration hook) hits the correct port.
 * - Fallback `13400` only applies when neither is initialized — the request
 *   will still fail cleanly with ECONNREFUSED rather than masking the bug.
 */
function getBackendPort(): number {
  if (typeof window !== 'undefined' && (window as Window).__backendPort) {
    return (window as Window).__backendPort as number;
  }
  const g = globalThis as typeof globalThis & { __backendPort?: number };
  return g.__backendPort ?? 13400;
}

function getBaseUrl(): string {
  return `http://127.0.0.1:${getBackendPort()}`;
}

function getWsUrl(): string {
  return `ws://127.0.0.1:${getBackendPort()}/ws`;
}

// ---------------------------------------------------------------------------
// HTTP request helper
// ---------------------------------------------------------------------------

async function httpRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const headers: Record<string, string> = {};

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  console.debug(`[httpBridge] ${method} ${path}`, body !== undefined ? JSON.stringify(body).slice(0, 500) : '(no body)');

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }
    console.error(`[httpBridge] ${method} ${path} → ${response.status}`, errorBody);
    throw new Error(`Backend ${method} ${path} failed (${response.status}): ${JSON.stringify(errorBody)}`);
  }

  console.debug(`[httpBridge] ${method} ${path} → ${response.status} OK`);

  const contentType = response.headers.get('Content-Type');
  if (!contentType?.includes('application/json')) {
    return undefined as T;
  }

  const json = await response.json();
  // Backend wraps in { success, data, ... } — unwrap when present
  if (json && typeof json === 'object' && 'data' in json) {
    return json.data as T;
  }
  return json as T;
}

// ---------------------------------------------------------------------------
// Provider factories (same shape as bridge.buildProvider)
// ---------------------------------------------------------------------------

type ProviderLike<Data, Params> = {
  provider: (handler: (params: Params) => Promise<Data>) => void;
  invoke: Params extends undefined ? () => Promise<Data> : (params: Params) => Promise<Data>;
};

export function httpGet<Data, Params = undefined>(
  path: string | ((params: Params) => string)
): ProviderLike<Data, Params> {
  return {
    provider: () => {},
    invoke: (async (params?: Params) => {
      const resolvedPath = typeof path === 'function' ? path(params!) : path;
      return httpRequest<Data>('GET', resolvedPath);
    }) as ProviderLike<Data, Params>['invoke'],
  };
}

export function httpPost<Data, Params = undefined>(
  path: string | ((params: Params) => string),
  mapBody?: (params: Params) => unknown
): ProviderLike<Data, Params> {
  return {
    provider: () => {},
    invoke: (async (params?: Params) => {
      const resolvedPath = typeof path === 'function' ? path(params!) : path;
      const body = mapBody ? mapBody(params!) : params;
      return httpRequest<Data>('POST', resolvedPath, body);
    }) as ProviderLike<Data, Params>['invoke'],
  };
}

export function httpPut<Data, Params = undefined>(
  path: string | ((params: Params) => string),
  mapBody?: (params: Params) => unknown
): ProviderLike<Data, Params> {
  return {
    provider: () => {},
    invoke: (async (params?: Params) => {
      const resolvedPath = typeof path === 'function' ? path(params!) : path;
      const body = mapBody ? mapBody(params!) : params;
      return httpRequest<Data>('PUT', resolvedPath, body);
    }) as ProviderLike<Data, Params>['invoke'],
  };
}

export function httpPatch<Data, Params = undefined>(
  path: string | ((params: Params) => string),
  mapBody?: (params: Params) => unknown
): ProviderLike<Data, Params> {
  return {
    provider: () => {},
    invoke: (async (params?: Params) => {
      const resolvedPath = typeof path === 'function' ? path(params!) : path;
      const body = mapBody ? mapBody(params!) : params;
      return httpRequest<Data>('PATCH', resolvedPath, body);
    }) as ProviderLike<Data, Params>['invoke'],
  };
}

export function httpDelete<Data, Params = undefined>(
  path: string | ((params: Params) => string)
): ProviderLike<Data, Params> {
  return {
    provider: () => {},
    invoke: (async (params?: Params) => {
      const resolvedPath = typeof path === 'function' ? path(params!) : path;
      return httpRequest<Data>('DELETE', resolvedPath);
    }) as ProviderLike<Data, Params>['invoke'],
  };
}

/**
 * Stub provider for features not yet implemented in the backend.
 * Returns a sensible default value and logs a warning.
 */
export function stubProvider<Data, Params = undefined>(name: string, defaultValue: Data): ProviderLike<Data, Params> {
  return {
    provider: () => {},
    invoke: (async (_params?: Params) => {
      console.warn(`[httpBridge] stub: ${name} not yet implemented in backend`);
      return defaultValue;
    }) as ProviderLike<Data, Params>['invoke'],
  };
}

// ---------------------------------------------------------------------------
// WebSocket singleton
// ---------------------------------------------------------------------------

type WsCallback = (data: unknown) => void;
const wsListeners = new Map<string, Set<WsCallback>>();
let ws: WebSocket | null = null;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let wsReconnectAttempt = 0;

function ensureWs(): void {
  if (typeof window === 'undefined') {
    console.debug('[ensureWs] skipped: no window');
    return;
  }
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    console.debug('[ensureWs] skipped: already open/connecting, readyState=', ws.readyState);
    return;
  }

  const url = getWsUrl();
  console.debug('[ensureWs] connecting to', url);
  try {
    ws = new WebSocket(url);
  } catch (e) {
    console.error('[ensureWs] WebSocket constructor threw:', e);
    scheduleWsReconnect();
    return;
  }

  const current = ws;

  current.addEventListener('open', () => {
    console.debug('[ensureWs] CONNECTED');
    wsReconnectAttempt = 0;
  });

  current.addEventListener('close', (e) => {
    console.debug('[ensureWs] CLOSED code=' + e.code + ' reason=' + e.reason);
    if (ws === current) ws = null;
    scheduleWsReconnect();
  });

  current.addEventListener('error', (e) => {
    console.error('[ensureWs] ERROR', e);
    current.close();
  });

  current.addEventListener('message', (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data as string) as {
        name?: string;
        event?: string;
        data?: unknown;
        payload?: unknown;
      };
      const eventName = msg.name ?? msg.event;
      const payload = msg.data ?? msg.payload;
      console.debug('[WS:msg]', eventName, JSON.stringify(payload).slice(0, 200));
      if (eventName) {
        const handlers = wsListeners.get(eventName);
        if (handlers) {
          for (const h of handlers) {
            try {
              h(payload);
            } catch {
              /* never crash listener */
            }
          }
        }
      }
    } catch {
      // ignore non-JSON
    }
  });
}

function scheduleWsReconnect(): void {
  if (wsReconnectTimer) return;
  const delay = Math.min(1000 * Math.pow(2, wsReconnectAttempt), 30000);
  wsReconnectAttempt++;
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null;
    ensureWs();
  }, delay);
}

// ---------------------------------------------------------------------------
// Emitter factory (same shape as bridge.buildEmitter)
// ---------------------------------------------------------------------------

type EmitterLike<Params> = {
  on: (callback: Params extends undefined ? () => void : (params: Params) => void) => () => void;
  emit: Params extends undefined ? () => void : (params: Params) => void;
};

export function wsEmitter<Params = undefined>(eventName: string): EmitterLike<Params> {
  return {
    on: (callback: (params: Params) => void) => {
      ensureWs();
      if (!wsListeners.has(eventName)) {
        wsListeners.set(eventName, new Set());
      }
      const cb = callback as WsCallback;
      wsListeners.get(eventName)!.add(cb);
      return () => {
        wsListeners.get(eventName)?.delete(cb);
      };
    },
    emit: (() => {}) as EmitterLike<Params>['emit'],
  };
}

/**
 * Stub emitter for events not yet implemented in the backend.
 */
export function stubEmitter<Params = undefined>(_name: string): EmitterLike<Params> {
  return {
    on: () => () => {},
    emit: (() => {}) as EmitterLike<Params>['emit'],
  };
}
