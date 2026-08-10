/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MonitorClient — JSON-RPC request/response + notification pairing over the
 * shared WS singleton (see `formal/runtime/frontend.md` §连接层). Transport is
 * injected so the pairing/dispatch core is unit-testable without a real socket.
 *
 * Envelope: the transport wraps each frame as `{ name: "fs", data: <frame> }`
 * (stage-1 protocol.md v3). Here we deal only with the inner JSON-RPC frame.
 */

export type RpcId = number;

export type RpcErrorShape = {
  code: number;
  message: string;
  data?: unknown;
  /**
   * True when this error was produced **locally by the transport**, not received
   * from the server. Callers must branch on this flag rather than on the numeric
   * range: local pseudo-codes and protocol codes share one `code` field, and
   * guessing by sign or magnitude silently mis-classifies the moment either side
   * adds a code.
   */
  transport?: boolean;
};

/** A JSON-RPC error surfaced to a request caller. */
export class RpcError extends Error {
  readonly code: number;
  readonly data?: unknown;
  /** See {@link RpcErrorShape.transport}. False for any server-sent error. */
  readonly transport: boolean;

  constructor(shape: RpcErrorShape) {
    super(shape.message);
    this.name = 'RpcError';
    this.code = shape.code;
    this.data = shape.data;
    this.transport = shape.transport === true;
  }
}

/**
 * Local pseudo-codes for transport conditions. **Not protocol codes** — every
 * `RpcError` carrying one also sets `transport: true`.
 *
 * The distinction matters most for {@link RPC_RECONNECTED}: it means "no response
 * will ever arrive", **not** "the request did not run". The request may well have
 * reached the backend and completed. Telling the user "the operation did not
 * complete" would make them redo it — and for a discard that is a second
 * irreversible destruction. The front end must not assert something it cannot know.
 */
export const RPC_DISCONNECTED = -1;
export const RPC_RECONNECTED = -2;
/** A response frame carrying an id but neither `result` nor `error` (malformed). */
export const RPC_MALFORMED_RESPONSE = -3;
/** A streaming request abandoned by the caller (superseded — no terminal coming). */
export const RPC_ABANDONED = -4;

/**
 * The transport the client rides. `send` returns false when the socket is not
 * OPEN (frame dropped — the client re-declares on reconnect). `onFrame` delivers
 * inbound inner JSON-RPC frames; `onReconnect` fires when the WS reconnects.
 * Each `on*` returns an unsubscribe.
 */
export type MonitorTransport = {
  send: (frame: unknown) => boolean;
  onFrame: (cb: (frame: unknown) => void) => () => void;
  onReconnect: (cb: () => void) => () => void;
};

export type MonitorClientOptions = {
  transport: MonitorTransport;
  /** Called for inbound notifications (no `id`): fs/snapshot, fs/delta. */
  onNotification: (method: string, params: unknown) => void;
  /** Called after a reconnect (in-flight requests already rejected). */
  onReconnect?: () => void;
};

type Pending = {
  resolve: (result: unknown) => void;
  reject: (err: RpcError) => void;
};

type MaybeFrame = {
  id?: unknown;
  method?: unknown;
  params?: unknown;
  result?: unknown;
  error?: RpcErrorShape;
};

// ── dev debug logging (metadata only — never file contents) ─────────────────

/** `pe_id:relative_path` identity string for a resource ref, for debug logs. */
const refStr = (r: unknown): string | undefined => {
  const ref = r as { pe_id?: string; relative_path?: string } | undefined;
  return ref?.pe_id !== undefined ? `${ref.pe_id}:${ref.relative_path ?? ''}` : undefined;
};

/** Safe metadata for an outbound frame: identities + counts, no content bodies. */
function outboundMeta(method: string, params: unknown): unknown {
  const p = params as Record<string, unknown> | undefined;
  if (!p) return undefined;
  switch (method) {
    case 'fs/subscribe':
    case 'fs/unsubscribe':
      return { targets: Array.isArray(p.targets) ? p.targets.length : 0 };
    case 'fs/read':
    case 'fs/write':
      return { file: refStr(p.file) }; // NB: never log p.content
    case 'fs/mkdir':
      return { dir: refStr(p.dir) };
    case 'fs/remove':
      return { target: refStr(p.target) };
    case 'fs/rename':
      return { from: refStr(p.from), to: refStr(p.to) };
    case 'fs/search':
      return {
        roots: Array.isArray(p.roots) ? p.roots.length : 0,
        query_len: typeof p.query === 'string' ? p.query.length : 0,
        limit: p.limit,
      };
    case 'fs/searchCancel':
      return { search_id: p.search_id };
    case 'initialize':
      return { protocol_version: p.protocol_version };
    default:
      return undefined;
  }
}

/** Safe metadata for an inbound notification: target + entry/change counts. */
function notifMeta(params: unknown): unknown {
  const p = params as { target?: unknown; entries?: unknown[]; changes?: unknown[] } | undefined;
  if (!p) return undefined;
  const meta: Record<string, unknown> = { target: refStr(p.target) };
  if (Array.isArray(p.entries)) meta.entries = p.entries.length;
  if (Array.isArray(p.changes)) meta.changes = p.changes.length;
  return meta;
}

/**
 * Pairs `request` promises with their `id`-carrying responses, routes id-less
 * notifications to `onNotification`, and rejects everything in flight on
 * reconnect. One instance per connection lifetime; call `dispose` to tear down.
 */
export class MonitorClient {
  private nextId: RpcId = 1;
  private readonly pending = new Map<RpcId, Pending>();
  private readonly transport: MonitorTransport;
  private readonly onNotification: (method: string, params: unknown) => void;
  private readonly onReconnectCb?: () => void;
  private readonly disposers: Array<() => void> = [];

  constructor(options: MonitorClientOptions) {
    this.transport = options.transport;
    this.onNotification = options.onNotification;
    this.onReconnectCb = options.onReconnect;
    this.disposers.push(this.transport.onFrame((frame) => this.handleFrame(frame)));
    this.disposers.push(this.transport.onReconnect(() => this.handleReconnect()));
  }

  /**
   * Send a request and resolve with its `result` (reject with `RpcError` on an
   * error response). Rejects immediately if the socket is not OPEN — the caller
   * treats that as "will re-declare on reconnect" and moves on.
   */
  request(method: string, params?: unknown): Promise<unknown> {
    return this.requestWithId(method, params).result;
  }

  /**
   * Like {@link request}, but also surfaces the assigned request `id`
   * synchronously alongside the result promise. Streaming requests (`fs/search`)
   * receive their incremental results as id-less notifications whose `search_id`
   * equals this request id — the caller needs that id up front to correlate
   * inbound `fs/searchMatch` batches and to discard a superseded search's late
   * matches. The id is assigned even when the socket is offline (the `result`
   * promise still rejects with `RPC_DISCONNECTED`).
   */
  requestWithId(method: string, params?: unknown): { id: RpcId; result: Promise<unknown> } {
    const id = this.nextId++;
    const result = new Promise<unknown>((resolve, reject) => {
      const ok = this.transport.send({ jsonrpc: '2.0', id, method, params });
      console.debug(
        '[monitor] → request',
        method,
        `#${id}`,
        outboundMeta(method, params),
        ok ? '' : 'DROPPED(offline)'
      );
      if (!ok) {
        reject(new RpcError({ code: RPC_DISCONNECTED, message: 'monitor transport not connected', transport: true }));
        return;
      }
      this.pending.set(id, { resolve, reject });
    });
    return { id, result };
  }

  /** Send a fire-and-forget notification (no `id`, no response). Dropped if offline. */
  notify(method: string, params?: unknown): void {
    const ok = this.transport.send({ jsonrpc: '2.0', method, params });
    console.debug('[monitor] → notify', method, outboundMeta(method, params), ok ? '' : 'DROPPED(offline)');
  }

  /**
   * Abandon a pending request without waiting for a response — for streaming
   * requests (`fs/search`) that a newer request has superseded: the backend
   * auto-supersedes the old search and sends no terminal for it (protocol.md
   * §取消两路), so its pending entry would otherwise leak. Rejects the awaiter
   * with `RPC_ABANDONED`; no-op if the id is unknown or already settled.
   */
  abandon(id: RpcId): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    entry.reject(new RpcError({ code: RPC_ABANDONED, message: 'streaming request superseded', transport: true }));
  }

  /** Tear down subscriptions and reject any in-flight requests. */
  dispose(): void {
    for (const off of this.disposers.splice(0)) off();
    this.rejectAllPending(
      new RpcError({ code: RPC_DISCONNECTED, message: 'monitor client disposed', transport: true })
    );
  }

  private handleFrame(raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    const frame = raw as MaybeFrame;

    // Response: carries a numeric id + result/error → settle the pending request.
    if (typeof frame.id === 'number' && ('result' in frame || 'error' in frame)) {
      console.debug('[monitor] ← response', `#${frame.id}`, frame.error ? `error ${frame.error.code}` : 'ok');
      const entry = this.pending.get(frame.id);
      if (!entry) return; // unknown/duplicate id → ignore
      this.pending.delete(frame.id);
      if (frame.error) {
        entry.reject(new RpcError(frame.error));
      } else {
        entry.resolve(frame.result);
      }
      return;
    }

    // Notification: id-less method (fs/snapshot, fs/delta). A server frame that
    // carries both id and method is not part of this protocol; treat method as
    // the discriminator here.
    if (typeof frame.method === 'string') {
      console.debug('[monitor] ← notify', frame.method, notifMeta(frame.params));
      this.onNotification(frame.method, frame.params);
      return;
    }

    // Malformed response: a numeric id with neither result nor error and no
    // method. If it matches a pending request, settle it (reject) so the id is
    // not stranded in `pending` forever; otherwise there is nothing to do.
    if (typeof frame.id === 'number') {
      const entry = this.pending.get(frame.id);
      if (entry) {
        this.pending.delete(frame.id);
        entry.reject(
          new RpcError({
            code: RPC_MALFORMED_RESPONSE,
            message: 'malformed response: no result or error',
            transport: true,
          })
        );
      }
    }
  }

  private handleReconnect(): void {
    // The old connection's in-flight requests will never get a response.
    this.rejectAllPending(
      new RpcError({ code: RPC_RECONNECTED, message: 'monitor connection reset', transport: true })
    );
    this.onReconnectCb?.();
  }

  private rejectAllPending(err: RpcError): void {
    const entries = [...this.pending.values()];
    this.pending.clear();
    for (const entry of entries) entry.reject(err);
  }
}
