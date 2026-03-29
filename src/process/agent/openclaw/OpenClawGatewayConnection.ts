/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import type {
  ChatAbortParams,
  ChatSendParams,
  ConnectParams,
  EventFrame,
  HelloOk,
  OpenClawGatewayClientOptions,
  RequestFrame,
  ResponseFrame,
  SessionsResetParams,
  SessionsResolveParams,
} from './types';
import { GATEWAY_CLIENT_IDS, GATEWAY_CLIENT_MODES, GATEWAY_CLOSE_CODE_HINTS, OPENCLAW_PROTOCOL_VERSION } from './types';
import {
  buildDeviceAuthPayload,
  type DeviceIdentity,
  loadOrCreateDeviceIdentity,
  publicKeyRawBase64UrlFromPem,
  signDevicePayload,
} from './deviceIdentity';
import { clearDeviceAuthToken, loadDeviceAuthToken, storeDeviceAuthToken } from './deviceAuthStore';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  expectFinal: boolean;
}

/**
 * OpenClaw Gateway WebSocket Connection
 *
 * Handles WebSocket communication with OpenClaw Gateway server.
 * Based on OpenClaw's GatewayClient implementation.
 *
 * Protocol:
 * - REQUEST:  {type:"req", id, method, params}
 * - RESPONSE: {type:"res", id, ok, payload|error}
 * - EVENT:    {type:"event", event, payload, seq?, stateVersion?}
 *
 * Handshake:
 * 1. Gateway sends: EVENT connect.challenge {nonce, ts}
 * 2. Client sends:  REQ connect {nonce, token, client...}
 * 3. Gateway sends: RES {ok: true, payload: HelloOk}
 */
export class OpenClawGatewayConnection {
  private ws: WebSocket | null = null;
  private opts: OpenClawGatewayClientOptions;
  private pending = new Map<string, PendingRequest>();
  private backoffMs = 1000;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private lastSeq: number | null = null;
  private connectNonce: string | null = null;
  private connectSent = false;
  private connectTimer: NodeJS.Timeout | null = null;
  private lastTick: number | null = null;
  private tickIntervalMs = 30_000;
  private tickTimer: NodeJS.Timeout | null = null;

  // Connection state
  private _isConnected = false;
  private _helloOk: HelloOk | null = null;

  // Current session
  private _sessionKey: string | null = null;

  // Device identity for authentication
  private deviceIdentity: DeviceIdentity;

  constructor(opts: OpenClawGatewayClientOptions) {
    // Use injected device identity (remote agent) or load from file (local gateway)
    this.deviceIdentity = opts.deviceIdentity ?? loadOrCreateDeviceIdentity();

    this.opts = {
      minProtocol: OPENCLAW_PROTOCOL_VERSION,
      maxProtocol: OPENCLAW_PROTOCOL_VERSION,
      clientName: GATEWAY_CLIENT_IDS.GATEWAY_CLIENT,
      clientVersion: '1.0.0',
      platform: process.platform,
      mode: GATEWAY_CLIENT_MODES.BACKEND,
      role: 'operator',
      scopes: ['operator.admin'],
      ...opts,
    };
  }

  /**
   * Start connection to Gateway
   */
  start(): void {
    if (this.closed) {
      return;
    }

    const url = normalizeWsUrl(this.opts.url ?? 'ws://127.0.0.1:18789');
    this.ws = new WebSocket(url, {
      maxPayload: 25 * 1024 * 1024, // Allow large responses
      rejectUnauthorized: this.opts.rejectUnauthorized ?? true,
    });

    this.ws.on('open', () => {
      this.queueConnect();
    });

    this.ws.on('message', (data) => this.handleMessage(this.rawDataToString(data)));

    this.ws.on('close', (code, reason) => {
      const reasonText = this.rawDataToString(reason);
      this.ws = null;
      this._isConnected = false;
      this.flushPendingErrors(new Error(`Gateway closed (${code}): ${reasonText}`));
      this.scheduleReconnect();
      this.opts.onClose?.(code, reasonText);
    });

    this.ws.on('error', (err) => {
      console.error('[OpenClawGateway] WebSocket error:', err);
      if (!this.connectSent) {
        this.opts.onConnectError?.(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /**
   * Stop connection
   */
  stop(): void {
    this.closed = true;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this._isConnected = false;
    this._sessionKey = null;
    this.flushPendingErrors(new Error('Gateway client stopped'));
  }

  /**
   * Send request to Gateway and wait for response
   */
  async request<T = unknown>(method: string, params?: unknown, opts?: { expectFinal?: boolean }): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Gateway not connected');
    }

    const id = randomUUID();
    const frame: RequestFrame = { type: 'req', id, method, params };
    const expectFinal = opts?.expectFinal === true;

    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        expectFinal,
      });
    });

    this.ws.send(JSON.stringify(frame));
    return promise;
  }

  // ========== Chat Methods ==========

  /**
   * Send a chat message
   */
  async chatSend(params: Omit<ChatSendParams, 'idempotencyKey'>): Promise<unknown> {
    const fullParams: ChatSendParams = {
      ...params,
      idempotencyKey: randomUUID(),
    };
    return this.request('chat.send', fullParams);
  }

  /**
   * Abort current chat
   */
  async chatAbort(params: ChatAbortParams): Promise<unknown> {
    return this.request('chat.abort', params);
  }

  /**
   * Get chat history
   */
  async chatHistory(sessionKey: string, limit?: number): Promise<unknown> {
    return this.request('chat.history', { sessionKey, limit });
  }

  // ========== Session Methods ==========

  /**
   * Resolve or create a session
   */
  async sessionsResolve(params: SessionsResolveParams): Promise<{ key: string; sessionId: string }> {
    const result = await this.request<{ key: string; sessionId: string }>('sessions.resolve', params);
    this._sessionKey = result.key;
    return result;
  }

  /**
   * Reset or create a session, returns the canonical session key
   */
  async sessionsReset(params: SessionsResetParams): Promise<{ key: string; sessionId: string }> {
    const result = await this.request<{ key: string; sessionId: string }>('sessions.reset', params);
    this._sessionKey = result.key;
    return result;
  }

  /**
   * List sessions
   */
  async sessionsList(params?: { limit?: number; activeMinutes?: number }): Promise<unknown> {
    return this.request('sessions.list', params);
  }

  // ========== Private Methods ==========

  private sendConnect(): void {
    if (this.connectSent) {
      return;
    }
    this.connectSent = true;

    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }

    const role = this.opts.role ?? 'operator';
    const scopes = this.opts.scopes ?? ['operator.admin'];
    const signedAtMs = Date.now();
    const nonce = this.connectNonce ?? undefined;

    // Load stored device token first, fall back to opts.token
    // Remote scenario: use opts.deviceToken (from DB); Local scenario: use file-based store
    const isExternalIdentity = Boolean(this.opts.deviceIdentity);
    const storedToken = isExternalIdentity
      ? (this.opts.deviceToken ?? undefined)
      : loadDeviceAuthToken({ deviceId: this.deviceIdentity.deviceId, role })?.token;
    const authToken = storedToken ?? this.opts.token ?? undefined;
    const canFallbackToShared = Boolean(storedToken && this.opts.token);

    const hasAuth = authToken || this.opts.password;
    const auth = hasAuth ? { token: authToken, password: this.opts.password } : undefined;

    // Build device identity for authentication
    const device = (() => {
      const payload = buildDeviceAuthPayload({
        deviceId: this.deviceIdentity.deviceId,
        clientId: this.opts.clientName ?? GATEWAY_CLIENT_IDS.GATEWAY_CLIENT,
        clientMode: this.opts.mode ?? GATEWAY_CLIENT_MODES.BACKEND,
        role,
        scopes,
        signedAtMs,
        token: authToken ?? null,
        nonce,
      });
      const signature = signDevicePayload(this.deviceIdentity.privateKeyPem, payload);
      return {
        id: this.deviceIdentity.deviceId,
        publicKey: publicKeyRawBase64UrlFromPem(this.deviceIdentity.publicKeyPem),
        signature,
        signedAt: signedAtMs,
        nonce,
      };
    })();

    const params: ConnectParams = {
      minProtocol: this.opts.minProtocol ?? OPENCLAW_PROTOCOL_VERSION,
      maxProtocol: this.opts.maxProtocol ?? OPENCLAW_PROTOCOL_VERSION,
      client: {
        id: this.opts.clientName ?? GATEWAY_CLIENT_IDS.GATEWAY_CLIENT,
        displayName: this.opts.clientDisplayName ?? 'AionUI',
        version: this.opts.clientVersion ?? '1.0.0',
        platform: this.opts.platform ?? process.platform,
        mode: this.opts.mode ?? GATEWAY_CLIENT_MODES.BACKEND,
        instanceId: this.opts.instanceId,
      },
      // Declare capability to receive tool call related events (agent stream: tool, assistant text, chat:delta).
      // Without this, the Gateway will not broadcast these events to this client,
      // causing the final chat response to arrive with no content.
      caps: ['tool-events'],
      role,
      scopes,
      auth,
      device,
    };

    this.request<HelloOk>('connect', params)
      .then((helloOk) => {
        // Store device token if returned
        const authInfo = helloOk?.auth;
        if (authInfo?.deviceToken) {
          if (this.opts.onDeviceTokenIssued) {
            // Remote scenario: notify caller to persist token (e.g., write to DB)
            this.opts.onDeviceTokenIssued(authInfo.deviceToken);
          } else {
            // Local scenario: write to file (~/.openclaw/identity/device-auth.json)
            storeDeviceAuthToken({
              deviceId: this.deviceIdentity.deviceId,
              role: authInfo.role ?? role,
              token: authInfo.deviceToken,
              scopes: authInfo.scopes ?? [],
            });
          }
        }

        this._isConnected = true;
        this._helloOk = helloOk;
        this.backoffMs = 1000;
        this.reconnectAttempts = 0;
        this.tickIntervalMs =
          typeof helloOk.policy?.tickIntervalMs === 'number' ? helloOk.policy.tickIntervalMs : 30_000;
        this.lastTick = Date.now();
        this.startTickWatch();
        this.opts.onHelloOk?.(helloOk);
      })
      .catch((err) => {
        const details = (err as Error & { details?: { code?: string } }).details;
        const isPairing = details?.code === 'PAIRING_REQUIRED' || /pairing.required/i.test(err?.message ?? '');
        if (isPairing) {
          console.log('[OpenClawGateway] Pairing required, awaiting approval');
        } else {
          console.error('[OpenClawGateway] Connect failed:', err);
        }

        // Clear stored token if it was invalid and we can fall back to shared token
        // Only for local scenario (file-based token store)
        if (canFallbackToShared && !isExternalIdentity) {
          clearDeviceAuthToken({
            deviceId: this.deviceIdentity.deviceId,
            role,
          });
        }

        this.opts.onConnectError?.(err instanceof Error ? err : new Error(String(err)));
        this.ws?.close(1008, 'connect failed');
      });
  }

  private handleMessage(raw: string): void {
    try {
      const parsed = JSON.parse(raw);

      switch (parsed.type) {
        case 'event': {
          const evt = parsed as EventFrame;

          // Handle connect challenge
          if (evt.event === 'connect.challenge') {
            const payload = evt.payload as { nonce?: string } | undefined;
            const nonce = payload?.nonce;
            if (nonce) {
              this.connectNonce = nonce;
              this.sendConnect();
            }
            return;
          }

          // Track sequence for gap detection
          const seq = typeof evt.seq === 'number' ? evt.seq : null;
          if (seq !== null) {
            if (this.lastSeq !== null && seq > this.lastSeq + 1) {
              console.warn(`[OpenClawGateway] Event gap: expected ${this.lastSeq + 1}, got ${seq}`);
            }
            this.lastSeq = seq;
          }

          // Handle tick event
          if (evt.event === 'tick') {
            this.lastTick = Date.now();
          }

          // Forward to handler
          this.opts.onEvent?.(evt);
          break;
        }

        case 'res': {
          const res = parsed as ResponseFrame;
          const pending = this.pending.get(res.id);
          const payload = res.payload as { status?: string } | undefined;
          if (!pending) {
            break;
          }

          // If expecting final and got ack, keep waiting
          if (pending.expectFinal && payload?.status === 'accepted') {
            break;
          }

          this.pending.delete(res.id);
          if (res.ok) {
            pending.resolve(res.payload);
          } else {
            const err = new Error(res.error?.message ?? 'Unknown error');
            // Attach structured error details for callers to inspect (e.g., recommendedNextStep)
            (err as Error & { details?: unknown }).details = res.error?.details;
            pending.reject(err);
          }
          break;
        }

        default:
          console.warn('[OpenClawGateway] Unhandled message type:', parsed.type, raw);
      }
    } catch (err) {
      console.error('[OpenClawGateway] Parse error:', err);
    }
  }

  private queueConnect(): void {
    this.connectNonce = null;
    this.connectSent = false;
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
    }
    // Wait a bit for challenge event, then force connect
    this.connectTimer = setTimeout(() => {
      this.sendConnect();
    }, 750);
  }

  private scheduleReconnect(): void {
    if (this.closed) {
      return;
    }
    this.reconnectAttempts++;
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      console.error(`[OpenClawGateway] Max reconnect attempts (${this.maxReconnectAttempts}) reached, giving up`);
      this.opts.onConnectError?.(new Error(`Max reconnect attempts (${this.maxReconnectAttempts}) reached`));
      return;
    }
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, 30_000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.lastSeq = null; // reset seq tracking so gap detection starts fresh on new connection
      this.start();
    }, delay);
  }

  private flushPendingErrors(err: Error): void {
    for (const [, p] of this.pending) {
      p.reject(err);
    }
    this.pending.clear();
  }

  private startTickWatch(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
    }
    const interval = Math.max(this.tickIntervalMs, 1000);
    this.tickTimer = setInterval(() => {
      if (this.closed) {
        return;
      }
      if (!this.lastTick) {
        return;
      }
      const gap = Date.now() - this.lastTick;
      if (gap > this.tickIntervalMs * 2) {
        console.warn('[OpenClawGateway] Tick timeout, closing connection');
        this.ws?.close(4000, 'tick timeout');
      }
    }, interval);
  }

  private rawDataToString(data: unknown): string {
    if (typeof data === 'string') {
      return data;
    }
    if (Buffer.isBuffer(data)) {
      return data.toString('utf-8');
    }
    if (data instanceof ArrayBuffer) {
      return Buffer.from(data).toString('utf-8');
    }
    if (Array.isArray(data)) {
      return Buffer.concat(data.map((b) => Buffer.from(b))).toString('utf-8');
    }
    return String(data);
  }

  // ========== Getters ==========

  get isConnected(): boolean {
    return this._isConnected;
  }

  get helloOk(): HelloOk | null {
    return this._helloOk;
  }

  get sessionKey(): string | null {
    return this._sessionKey;
  }

  set sessionKey(key: string | null) {
    this._sessionKey = key;
  }
}

/**
 * Prepend ws:// if the URL has no WebSocket protocol (e.g. "127.0.0.1:42617")
 */
export function normalizeWsUrl(raw: string): string {
  return /^wss?:\/\//i.test(raw) ? raw : `ws://${raw}`;
}

/**
 * Describe a Gateway close code
 */
export function describeGatewayCloseCode(code: number): string | undefined {
  return GATEWAY_CLOSE_CODE_HINTS[code];
}
