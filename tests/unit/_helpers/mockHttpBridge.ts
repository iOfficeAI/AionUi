/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * AionUi N3 mock HTTP/WS bridge helper.
 *
 * Public API frozen in docs/backend-migration/plans/2026-05-08-n3-test-rewrite-adapter-common.md §2.1.
 * N4 teammates: do NOT change the exported signatures. If a new capability is
 * needed, escalate to the team-lead instead of patching this file.
 */

import { vi } from 'vitest';
import { BackendHttpError, isBackendHttpError } from '@/common/adapter/httpBridge';

// Re-export error classes from source to preserve instanceof checks
export { BackendHttpError, isBackendHttpError };

/**
 * ProviderLike / EmitterLike types match httpBridge source.
 */
export type ProviderLike<Data, Params = undefined> = {
  provider: (handler: (params: Params) => Promise<Data>) => void;
  invoke: Params extends undefined ? () => Promise<Data> : (params: Params) => Promise<Data>;
};

export type EmitterLike<Params = undefined> = {
  on: (callback: Params extends undefined ? () => void : (params: Params) => void) => () => void;
  emit: Params extends undefined ? () => void : (params: Params) => void;
};

/**
 * HTTP method literals accepted by route stubs.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Handler registered for a single (method, pathPattern) pair.
 */
export type MockHttpHandler<TBody = unknown, TData = unknown> = (ctx: {
  method: HttpMethod;
  path: string;
  pathPattern: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: TBody | undefined;
}) => TData | Promise<TData>;

export type MockHttpBridgeOptions = {
  /**
   * Unmatched route behavior, default 'throw' (throw "unexpected call" Error).
   * Set to 'warn': console.warn once then return undefined.
   */
  unmatched?: 'throw' | 'warn';
};

export interface MockHttpBridge {
  // Route registration (return `this` for chaining)
  onGet<TData = unknown>(pathPattern: string, handler: MockHttpHandler<undefined, TData>): this;
  onPost<TBody = unknown, TData = unknown>(pathPattern: string, handler: MockHttpHandler<TBody, TData>): this;
  onPut<TBody = unknown, TData = unknown>(pathPattern: string, handler: MockHttpHandler<TBody, TData>): this;
  onPatch<TBody = unknown, TData = unknown>(pathPattern: string, handler: MockHttpHandler<TBody, TData>): this;
  onDelete<TData = unknown>(pathPattern: string, handler: MockHttpHandler<undefined, TData>): this;

  // WS event emission
  /**
   * Dispatch payload to all listeners subscribed via wsEmitter(eventName).on(cb).
   * Synchronous dispatch: all listeners receive event before call stack unwinds.
   */
  emit(eventName: string, payload: unknown): void;

  // Inspection helpers
  /** Recorded call log, chronological (excludes pre-reset history). */
  calls: ReadonlyArray<{
    method: HttpMethod;
    path: string;
    pathPattern: string;
    params: Record<string, string>;
    query: Record<string, string>;
    body: unknown;
  }>;
  /** Registered (method, pathPattern) pair count. */
  readonly routeCount: number;
  /** Total WS listener count (across all events). */
  readonly wsListenerCount: number;

  // Lifecycle
  /**
   * Clear routes, WS listeners, and calls history.
   * Recommended in beforeEach; only affects this instance.
   */
  reset(): void;

  /**
   * Return an object suitable for vi.mock('@/common/adapter/httpBridge', () => ...).
   * Keys match all named exports from httpBridge.ts to avoid TS missing-export errors.
   */
  asModule(): {
    httpGet: typeof import('@/common/adapter/httpBridge').httpGet;
    httpPost: typeof import('@/common/adapter/httpBridge').httpPost;
    httpPut: typeof import('@/common/adapter/httpBridge').httpPut;
    httpPatch: typeof import('@/common/adapter/httpBridge').httpPatch;
    httpDelete: typeof import('@/common/adapter/httpBridge').httpDelete;
    stubProvider: typeof import('@/common/adapter/httpBridge').stubProvider;
    withResponseMap: typeof import('@/common/adapter/httpBridge').withResponseMap;
    wsEmitter: typeof import('@/common/adapter/httpBridge').wsEmitter;
    wsMappedEmitter: typeof import('@/common/adapter/httpBridge').wsMappedEmitter;
    stubEmitter: typeof import('@/common/adapter/httpBridge').stubEmitter;
    httpRequest: typeof import('@/common/adapter/httpBridge').httpRequest;
    getBaseUrl: typeof import('@/common/adapter/httpBridge').getBaseUrl;
    BackendHttpError: typeof import('@/common/adapter/httpBridge').BackendHttpError;
    isBackendHttpError: typeof import('@/common/adapter/httpBridge').isBackendHttpError;
  };
}

/**
 * Internal route entry.
 */
type RouteEntry = {
  method: HttpMethod;
  pathPattern: string;
  regex: RegExp;
  paramNames: string[];
  handler: MockHttpHandler;
};

/**
 * Implementation of MockHttpBridge interface.
 */
class MockHttpBridgeImpl implements MockHttpBridge {
  private routes: RouteEntry[] = [];
  private wsListeners: Map<string, Set<(payload: unknown) => void>> = new Map();
  private callHistory: Array<{
    method: HttpMethod;
    path: string;
    pathPattern: string;
    params: Record<string, string>;
    query: Record<string, string>;
    body: unknown;
  }> = [];
  private options: Required<MockHttpBridgeOptions>;

  constructor(options: MockHttpBridgeOptions = {}) {
    this.options = {
      unmatched: options.unmatched ?? 'throw',
    };
  }

  onGet<TData = unknown>(pathPattern: string, handler: MockHttpHandler<undefined, TData>): this {
    this.registerRoute('GET', pathPattern, handler);
    return this;
  }

  onPost<TBody = unknown, TData = unknown>(pathPattern: string, handler: MockHttpHandler<TBody, TData>): this {
    this.registerRoute('POST', pathPattern, handler);
    return this;
  }

  onPut<TBody = unknown, TData = unknown>(pathPattern: string, handler: MockHttpHandler<TBody, TData>): this {
    this.registerRoute('PUT', pathPattern, handler);
    return this;
  }

  onPatch<TBody = unknown, TData = unknown>(pathPattern: string, handler: MockHttpHandler<TBody, TData>): this {
    this.registerRoute('PATCH', pathPattern, handler);
    return this;
  }

  onDelete<TData = unknown>(pathPattern: string, handler: MockHttpHandler<undefined, TData>): this {
    this.registerRoute('DELETE', pathPattern, handler);
    return this;
  }

  private registerRoute(method: HttpMethod, pathPattern: string, handler: MockHttpHandler): void {
    // Convert :param placeholders to regex capturing groups
    const paramNames: string[] = [];
    const regexStr = pathPattern.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    const regex = new RegExp(`^${regexStr}$`);

    this.routes.push({
      method,
      pathPattern,
      regex,
      paramNames,
      handler,
    });
  }

  emit(eventName: string, payload: unknown): void {
    const listeners = this.wsListeners.get(eventName);
    if (!listeners) return;

    // Synchronous dispatch to all listeners
    for (const cb of listeners) {
      try {
        cb(payload);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[mockHttpBridge] WS listener for '${eventName}' threw:`, err);
      }
    }
  }

  get calls(): ReadonlyArray<{
    method: HttpMethod;
    path: string;
    pathPattern: string;
    params: Record<string, string>;
    query: Record<string, string>;
    body: unknown;
  }> {
    return this.callHistory;
  }

  get routeCount(): number {
    return this.routes.length;
  }

  get wsListenerCount(): number {
    let total = 0;
    for (const set of this.wsListeners.values()) {
      total += set.size;
    }
    return total;
  }

  reset(): void {
    this.routes = [];
    this.wsListeners.clear();
    this.callHistory = [];
  }

  asModule(): {
    httpGet: typeof import('@/common/adapter/httpBridge').httpGet;
    httpPost: typeof import('@/common/adapter/httpBridge').httpPost;
    httpPut: typeof import('@/common/adapter/httpBridge').httpPut;
    httpPatch: typeof import('@/common/adapter/httpBridge').httpPatch;
    httpDelete: typeof import('@/common/adapter/httpBridge').httpDelete;
    stubProvider: typeof import('@/common/adapter/httpBridge').stubProvider;
    withResponseMap: typeof import('@/common/adapter/httpBridge').withResponseMap;
    wsEmitter: typeof import('@/common/adapter/httpBridge').wsEmitter;
    wsMappedEmitter: typeof import('@/common/adapter/httpBridge').wsMappedEmitter;
    stubEmitter: typeof import('@/common/adapter/httpBridge').stubEmitter;
    httpRequest: typeof import('@/common/adapter/httpBridge').httpRequest;
    getBaseUrl: typeof import('@/common/adapter/httpBridge').getBaseUrl;
    BackendHttpError: typeof import('@/common/adapter/httpBridge').BackendHttpError;
    isBackendHttpError: typeof import('@/common/adapter/httpBridge').isBackendHttpError;
  } {
    // Strip query string from path for matching
    const stripQuery = (path: string): { cleanPath: string; query: Record<string, string> } => {
      const idx = path.indexOf('?');
      if (idx === -1) return { cleanPath: path, query: {} };
      const cleanPath = path.slice(0, idx);
      const queryStr = path.slice(idx + 1);
      const query: Record<string, string> = {};
      for (const pair of queryStr.split('&')) {
        const [key, val] = pair.split('=');
        if (key) query[decodeURIComponent(key)] = val ? decodeURIComponent(val) : '';
      }
      return { cleanPath, query };
    };

    const executeRoute = async (method: HttpMethod, path: string, body?: unknown): Promise<unknown> => {
      const { cleanPath, query } = stripQuery(path);

      // Find matching route
      for (const route of this.routes) {
        if (route.method !== method) continue;
        const match = route.regex.exec(cleanPath);
        if (!match) continue;

        // Extract params from regex groups
        const params: Record<string, string> = {};
        for (let i = 0; i < route.paramNames.length; i++) {
          params[route.paramNames[i]] = decodeURIComponent(match[i + 1]);
        }

        // Record the call
        this.callHistory.push({
          method,
          path,
          pathPattern: route.pathPattern,
          params,
          query,
          body,
        });

        // Execute handler
        const result = await route.handler({
          method,
          path,
          pathPattern: route.pathPattern,
          params,
          query,
          body,
        });
        return result;
      }

      // No match: throw or warn
      if (this.options.unmatched === 'throw') {
        throw new Error(
          `mockHttpBridge: unexpected call ${method} ${path}. ` +
            `Registered routes: ${this.routes.map((r) => `${r.method} ${r.pathPattern}`).join(', ')}`
        );
      } else {
        // eslint-disable-next-line no-console
        console.warn(`mockHttpBridge: unmatched route ${method} ${path}, returning undefined`);
        return undefined;
      }
    };

    const createFactory =
      <Data, Params = undefined>(method: HttpMethod) =>
      (
        pathOrFn: string | ((params: Params) => string),
        mapBody?: (params: Params) => unknown
      ): ProviderLike<Data, Params> => {
        return {
          provider: () => {},
          invoke: (async (params?: Params) => {
            const resolvedPath = typeof pathOrFn === 'function' ? pathOrFn(params as Params) : pathOrFn;
            const requestBody =
              mapBody && params !== undefined
                ? mapBody(params as Params)
                : method === 'GET' || method === 'DELETE'
                  ? undefined
                  : params;
            const result = await executeRoute(method, resolvedPath, requestBody);
            return result as Data;
          }) as Params extends undefined ? () => Promise<Data> : (params: Params) => Promise<Data>,
        };
      };

    return {
      httpGet: createFactory('GET'),
      httpPost: createFactory('POST'),
      httpPut: createFactory('PUT'),
      httpPatch: createFactory('PATCH'),
      httpDelete: createFactory('DELETE'),

      stubProvider: vi.fn((name: string, defaultValue: unknown) => {
        // eslint-disable-next-line no-console
        console.warn(`stubProvider('${name}') called with default:`, defaultValue);
        return {
          provider: () => {},
          invoke: async () => defaultValue,
        };
      }) as typeof import('@/common/adapter/httpBridge').stubProvider,

      withResponseMap: <Raw, Mapped, Params>(
        inner: ProviderLike<Raw, Params>,
        map: (data: Raw) => Mapped
      ): ProviderLike<Mapped, Params> => {
        return {
          provider: () => {},
          invoke: (async (params?: Params) => {
            const raw = await (inner.invoke as (p?: Params) => Promise<Raw>)(params);
            return map(raw);
          }) as Params extends undefined ? () => Promise<Mapped> : (params: Params) => Promise<Mapped>,
        };
      },

      wsEmitter: <Params = undefined>(eventName: string): EmitterLike<Params> => {
        return {
          on: (callback: (params: Params) => void) => {
            if (!this.wsListeners.has(eventName)) {
              this.wsListeners.set(eventName, new Set());
            }
            const cb = callback as (payload: unknown) => void;
            this.wsListeners.get(eventName)!.add(cb);

            // Return unsubscribe function
            return () => {
              const listeners = this.wsListeners.get(eventName);
              if (listeners) {
                listeners.delete(cb);
              }
            };
          },
          emit: (() => {}) as Params extends undefined ? () => void : (params: Params) => void,
        };
      },

      wsMappedEmitter: <Params = undefined>(
        eventName: string,
        transform: (raw: unknown) => Params
      ): EmitterLike<Params> => {
        const inner = this.asModule().wsEmitter(eventName);
        return {
          on: (callback: (params: Params) => void) => {
            return inner.on((raw: unknown) => {
              const mapped = transform(raw);
              callback(mapped);
            });
          },
          emit: (() => {}) as Params extends undefined ? () => void : (params: Params) => void,
        };
      },

      stubEmitter: <Params = undefined>(_name: string): EmitterLike<Params> => {
        return {
          on: () => () => {},
          emit: (() => {}) as Params extends undefined ? () => void : (params: Params) => void,
        };
      },

      httpRequest: vi.fn(() => {
        throw new Error(
          'mockHttpBridge: direct httpRequest calls not allowed under mock; use httpGet/httpPost/... factories'
        );
      }) as typeof import('@/common/adapter/httpBridge').httpRequest,

      getBaseUrl: vi.fn(() => '') as typeof import('@/common/adapter/httpBridge').getBaseUrl,

      // Re-export actual classes to preserve instanceof
      BackendHttpError,
      isBackendHttpError,
    };
  }
}

/**
 * Create a new mock instance.
 */
export function createMockHttpBridge(options?: MockHttpBridgeOptions): MockHttpBridge {
  return new MockHttpBridgeImpl(options);
}

/**
 * Convenience function: call .reset() on the provided mock.
 * Semantic sugar for beforeEach(() => resetMockHttpBridge(mock)).
 */
export function resetMockHttpBridge(mock: MockHttpBridge): void {
  mock.reset();
}
