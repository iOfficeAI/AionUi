/**
 * AionCore HTTP + SSE client.
 *
 * The client is intentionally small: one authenticated POST helper
 * (`postJson`) and one SSE stream reader (`parseSseStream`) that
 * dispatches parsed events to a callback. The reconnect loop lives
 * outside this module (see `connectEvents`).
 *
 * All errors are swallowed at the boundary — the plugin must never
 * crash the host because AionCore is unreachable.
 */

import type {
  BgRequest,
  BgResponse,
  BgTailRequest,
  HelloResponse,
  ResultRequest,
  ResultResponse,
  RunShellStreamingRequest,
} from './types.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const PERMISSION_TIMEOUT_MS = 3_000;
export const OUTPUT_PREVIEW_MAX = 2048;

/** Public so callers can override in tests. */
export const TIMEOUTS = {
  postJson: DEFAULT_TIMEOUT_MS,
  permission: PERMISSION_TIMEOUT_MS,
} as const;

export type SseDispatchEvent =
  | { type: 'ping' }
  | { type: 'context.update'; data: unknown }
  | { type: 'voice_mode'; data: unknown }
  | { type: 'raw'; event: string; data: string };

export type SseDispatcher = (event: SseDispatchEvent) => void;

export type AionCoreClientOptions = {
  url: string;
  token: string;
  fetchImpl?: typeof fetch;
  /** Test hook: replace AbortController (some environments lack it). */
  abortControllerImpl?: typeof AbortController;
  /** Test hook: replace setTimeout. */
  setTimeoutImpl?: typeof setTimeout;
  /** Test hook: replace clearTimeout. */
  clearTimeoutImpl?: typeof clearTimeout;
};

export class AionCoreClient {
  readonly url: string;
  readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly abortControllerImpl: typeof AbortController;
  private readonly setTimeoutImpl: typeof setTimeout;
  private readonly clearTimeoutImpl: typeof clearTimeout;

  constructor(options: AionCoreClientOptions) {
    this.url = options.url;
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (!this.fetchImpl) {
      throw new Error('AionCoreClient: global fetch is not available in this runtime.');
    }
    this.abortControllerImpl = options.abortControllerImpl ?? globalThis.AbortController;
    if (!this.abortControllerImpl) {
      throw new Error('AionCoreClient: global AbortController is not available in this runtime.');
    }
    this.setTimeoutImpl = options.setTimeoutImpl ?? globalThis.setTimeout;
    this.clearTimeoutImpl = options.clearTimeoutImpl ?? globalThis.clearTimeout;
  }

  private buildHeaders(extra?: HeadersInit): Headers {
    const headers = new Headers();
    headers.set('Authorization', `Bearer ${this.token}`);
    headers.set('Accept', 'application/json');
    if (extra) {
      const extraHeaders = new Headers(extra);
      extraHeaders.forEach((value, key) => headers.set(key, value));
    }
    return headers;
  }

  /** POST a JSON body. Returns parsed JSON on 2xx, throws on transport / non-2xx. */
  async postJson<T = unknown>(
    path: string,
    body: unknown,
    opts: { timeoutMs?: number; signal?: AbortSignal } = {}
  ): Promise<T> {
    const url = `${this.url}${path}`;
    const controller = new this.abortControllerImpl();
    const timeoutMs = opts.timeoutMs ?? TIMEOUTS.postJson;
    const timer = this.setTimeoutImpl(() => controller.abort(), timeoutMs);
    const externalSignal = opts.signal;
    const onExternalAbort = (): void => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      const headers = this.buildHeaders({ 'Content-Type': 'application/json' });
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new AionCoreHttpError(response.status, await safeReadText(response));
      }
      const text = await response.text();
      if (text.length === 0) return undefined as T;
      return JSON.parse(text) as T;
    } finally {
      this.clearTimeoutImpl(timer);
      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }

  /** POST the plugin hello handshake. */
  async hello(body: import('./types.js').HelloRequest): Promise<HelloResponse> {
    return this.postJson<HelloResponse>('/plugin/hello', body);
  }

  /** Forward an audit event / tool call to AionCore. */
  async sendResult(
    body: ResultRequest,
    opts: { timeoutMs?: number; signal?: AbortSignal } = {}
  ): Promise<ResultResponse> {
    return this.postJson<ResultResponse>('/plugin/result', body, opts);
  }

  /**
   * Fetch the SSE event stream. Returns the raw Response so the caller
   * owns the body lifecycle and can abort it.
   */
  async openEventStream(signal: AbortSignal): Promise<Response> {
    const url = `${this.url}/plugin/events`;
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: this.buildHeaders({ Accept: 'text/event-stream' }),
      signal,
    });
    if (!response.ok) {
      throw new AionCoreHttpError(response.status, await safeReadText(response));
    }
    if (!response.body) {
      throw new Error('AionCoreClient: SSE response had no body.');
    }
    return response;
  }

  /**
   * Open the streaming `run_shell_streaming` POST. The caller is
   * responsible for reading the SSE body and for aborting via `signal`.
   * The raw `Response` is returned so the caller owns its lifecycle.
   */
  async openShellStream(body: RunShellStreamingRequest, signal: AbortSignal): Promise<Response> {
    const url = `${this.url}/tools/run_shell_streaming`;
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: this.buildHeaders({
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      }),
      body: JSON.stringify(body),
      signal,
    });
    return response;
  }

  /**
   * POST to /tools/bg. Convenience wrapper for the background-process
   * admin endpoint. Returns the parsed `BgResponse` envelope.
   */
  async postBg(body: BgRequest, opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<BgResponse> {
    return this.postJson<BgResponse>('/tools/bg', body, opts);
  }

  /**
   * Open the streaming /tools/bg_tail POST. The caller is responsible
   * for reading the SSE body and for aborting via `signal`. The raw
   * `Response` is returned so the caller owns its lifecycle.
   */
  async openBgTailStream(body: BgTailRequest, signal: AbortSignal): Promise<Response> {
    const url = `${this.url}/tools/bg_tail`;
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: this.buildHeaders({
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      }),
      body: JSON.stringify(body),
      signal,
    });
    return response;
  }
}

export class AionCoreHttpError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`AionCore HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = 'AionCoreHttpError';
    this.status = status;
    this.body = body;
  }
}

const safeReadText = async (response: Response): Promise<string> => {
  try {
    return await response.text();
  } catch {
    return '';
  }
};

/**
 * Parse an SSE byte stream from a fetch body ReadableStream<Uint8Array>.
 *
 * Handles lines that arrive split across chunks (e.g. `event: ping\n` is
 * delivered as two `Uint8Array` chunks). The dispatcher receives one
 * event per blank-line boundary.
 */
export const parseSseStream = async (
  body: ReadableStream<Uint8Array>,
  dispatch: SseDispatcher,
  signal: AbortSignal
): Promise<void> => {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let currentEvent: string | null = null;
  let currentData: string[] = [];

  const onAbort = (): void => {
    void reader.cancel().catch(() => {
      /* ignore cancel errors */
    });
  };
  if (signal.aborted) onAbort();
  else signal.addEventListener('abort', onAbort, { once: true });

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nlIndex = buffer.indexOf('\n');
      while (nlIndex !== -1) {
        const rawLine = buffer.slice(0, nlIndex);
        buffer = buffer.slice(nlIndex + 1);
        const line = rawLine.replace(/\r$/, '');
        if (line === '') {
          // dispatch whatever we've collected for this event
          if (currentEvent || currentData.length > 0) {
            dispatchEvent(currentEvent, currentData, dispatch);
            currentEvent = null;
            currentData = [];
          }
        } else if (line.startsWith(':')) {
          // SSE comment — ignore
        } else {
          const colon = line.indexOf(':');
          if (colon === -1) {
            currentEvent = line;
          } else {
            const field = line.slice(0, colon);
            let valuePart = line.slice(colon + 1);
            if (valuePart.startsWith(' ')) valuePart = valuePart.slice(1);
            if (field === 'event') currentEvent = valuePart;
            else if (field === 'data') currentData.push(valuePart);
            else {
              // unknown field — keep only event/data semantics
            }
          }
        }
        nlIndex = buffer.indexOf('\n');
      }
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
};

const dispatchEvent = (event: string | null, dataParts: string[], dispatch: SseDispatcher): void => {
  const data = dataParts.join('\n');
  if (event === 'ping' || data === 'ping') {
    dispatch({ type: 'ping' });
    return;
  }
  if (event === 'context.update' || event === 'voice_mode' || (!event && data.trimStart().startsWith('{'))) {
    try {
      const parsed = JSON.parse(data) as { type?: string; data?: unknown };
      if (parsed && typeof parsed === 'object') {
        const t = (parsed as { type?: string }).type;
        if (t === 'context.update') {
          dispatch({ type: 'context.update', data: (parsed as { data: unknown }).data });
          return;
        }
        if (t === 'voice_mode') {
          dispatch({ type: 'voice_mode', data: (parsed as { data: unknown }).data });
          return;
        }
      }
    } catch {
      // fall through to raw
    }
  }
  dispatch({ type: 'raw', event: event ?? 'message', data });
};

/* -------------------------------------------------------------------------- */
/* Reconnect loop with exponential backoff                                   */
/* -------------------------------------------------------------------------- */

export type BackoffOptions = {
  baseMs: number;
  capMs: number;
  jitter: boolean;
};

export const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 1_000, capMs: 30_000, jitter: true };

/** Compute the next backoff delay. Pure function, exported for tests. */
export const nextBackoff = (
  attempt: number,
  opts: BackoffOptions = DEFAULT_BACKOFF,
  random: () => number = Math.random
): number => {
  const exp = Math.min(opts.capMs, opts.baseMs * 2 ** Math.max(0, attempt));
  if (!opts.jitter) return exp;
  // full jitter: random in [0, exp]
  return Math.floor(random() * exp);
};

export type ConnectEventsOptions = {
  client: AionCoreClient;
  buildHello: () => import('./types.js').HelloRequest;
  dispatch: SseDispatcher;
  signal: AbortSignal;
  onHello?: (response: HelloResponse) => void;
  backoff?: BackoffOptions;
  random?: () => number;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
};

/**
 * Connect to the SSE stream, dispatch events, and reconnect on failure
 * with exponential backoff. The loop exits cleanly when `signal` aborts.
 */
export const connectEvents = async (opts: ConnectEventsOptions): Promise<void> => {
  const setTimeoutImpl = opts.setTimeoutImpl ?? globalThis.setTimeout;
  const clearTimeoutImpl = opts.clearTimeoutImpl ?? globalThis.clearTimeout;
  const backoff = opts.backoff ?? DEFAULT_BACKOFF;
  const random = opts.random ?? Math.random;
  const { signal } = opts;

  let attempt = 0;
  let stopped = false;
  const onAbort = (): void => {
    stopped = true;
  };
  if (signal.aborted) stopped = true;
  else signal.addEventListener('abort', onAbort, { once: true });

  try {
    while (!stopped) {
      try {
        const hello = await opts.client.hello(opts.buildHello());
        if (opts.onHello) opts.onHello(hello);
        const response = await opts.client.openEventStream(signal);
        attempt = 0; // reset on successful connect
        const body = response.body;
        if (body) {
          await parseSseStream(body, opts.dispatch, signal);
        } else {
          // Defensive: server returned a 200 with no body. Treat as a
          // transient drop so the loop reconnects.
          return;
        }
        // body ended cleanly (server closed); treat as a transient drop
        if (signal.aborted || stopped) return;
      } catch (err) {
        if (signal.aborted || stopped) return;
        // Swallow — we always retry. The error is dropped at the boundary.
        // (We do not log here; the host may have its own logger.)
        void err;
      }
      if (stopped || signal.aborted) return;
      const delay = nextBackoff(attempt, backoff, random);
      attempt += 1;
      await new Promise<void>((resolve) => {
        const timer = setTimeoutImpl(() => resolve(), delay);
        const onAbortDuringWait = (): void => {
          clearTimeoutImpl(timer);
          resolve();
        };
        if (signal.aborted) onAbortDuringWait();
        else signal.addEventListener('abort', onAbortDuringWait, { once: true });
      });
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
};

/** Cap a string to N characters, suffixing with a marker when truncated. */
export const capPreview = (value: string, max: number = OUTPUT_PREVIEW_MAX): string => {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n…[truncated ${value.length - max} chars]`;
};
