/**
 * Test setup helpers shared across the opencode-plugin test suite.
 */
import { vi } from 'vitest';
import type { HelloResponse, ResultResponse } from '../../../packages/opencode-plugin/src/types.js';

export type FetchCall = {
  url: string;
  init: RequestInit;
};

export type FetchHandler = (url: string, init: RequestInit) => Response | Promise<Response>;

/**
 * Install a `globalThis.fetch` mock that records every call and
 * dispatches to a queue of handlers (one per call). After the queue is
 * exhausted the last handler is reused so a misconfigured test
 * surfaces as a "default 200 ok" rather than a crash.
 */
export const installFetchMock = (
  handlers: Array<FetchHandler | unknown>
): { calls: FetchCall[]; mock: typeof fetch } => {
  const calls: FetchCall[] = [];
  let idx = 0;
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const reqInit = (init ?? {}) as RequestInit;
    calls.push({ url, init: reqInit });
    const raw = handlers[idx] ?? handlers[handlers.length - 1];
    idx += 1;
    // Resolve function handlers first so the return value can be a
    // plain object, a Response, or another Response-like value.
    const resolved = typeof raw === 'function' ? (raw as FetchHandler)(url, reqInit) : raw;
    // Pass through Response instances as-is
    if (resolved instanceof Response) return resolved;
    // Pass through pre-built Response-like objects (e.g. mocks with a numeric status)
    if (resolved && typeof resolved === 'object' && typeof (resolved as { status?: unknown }).status === 'number') {
      return resolved as Response;
    }
    // Otherwise wrap as JSON
    return jsonResponse(200, resolved);
  });
  vi.stubGlobal('fetch', mock);
  return { calls, mock };
};

export const jsonResponse = (status: number, body: unknown): Response => {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
};

export const okHello = (): HelloResponse => ({ ok: true, protocolVersion: 1 });

export const okResult = (): ResultResponse => ({ ok: true });

export const permissionResult = (status: 'allow' | 'deny' | 'ask'): ResultResponse => ({
  ok: true,
  status,
});

/**
 * Build a Response that yields a sequence of string chunks via its
 * ReadableStream body. Used to simulate an SSE stream.
 */
export const sseResponse = (chunks: string[]): Response => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
};

/**
 * Build an SSE response that never closes until the test aborts it.
 * The returned `close` function ends the stream.
 */
export const sseResponseLongLived = (): { response: Response; close: () => void; chunks: string[] } => {
  const encoder = new TextEncoder();
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  const chunks: string[] = [];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
  });
  const response = new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
  return {
    response,
    close: () => {
      try {
        controllerRef?.close();
      } catch {
        /* ignore */
      }
    },
    chunks,
  };
};
