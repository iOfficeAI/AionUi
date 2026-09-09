/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A stub aioncore for the WebUI session-lifetime integration test.
 *
 * It exists to make #4155's "roughly 24 hours after pairing" reproducible in
 * milliseconds. The trick is a **virtual clock**: cookies carry the real
 * production lifetimes (24 h access, 30 d refresh/pairing) and validity is
 * decided against `clock.now()`, which the test advances by hand. So
 * `core.advance(HOURS_24)` is literally "a day later" as far as every token in
 * the system is concerned, and costs no wall-clock time.
 *
 * Only the parts of Core the WebUI session path touches are implemented:
 * login, the authenticated `/api/*` surface, `/api/auth/refresh`, and the `/ws`
 * realtime stream. Tokens are `<id>.<expiryInVirtualMs>` rather than real JWTs —
 * the only field this scenario turns on is `exp`.
 */

import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { WebSocketServer, type WebSocket as WsSocket } from 'ws';

/** Production lifetimes, from the #4155 investigation. */
export const HOUR_MS = 60 * 60 * 1000;
export const ACCESS_TTL_MS = 24 * HOUR_MS;
export const REFRESH_TTL_MS = 30 * 24 * HOUR_MS;

/** Core's access cookie. Name as observed on the shipped build. */
export const ACCESS_COOKIE = 'aionui-session';
/**
 * Core's refresh cookie. `Path=/api/auth/refresh` so it is *not* attached to
 * ordinary `/api/*` calls — that scoping is load-bearing for this scenario, and
 * the client's cookie jar honours it.
 */
export const REFRESH_COOKIE = 'aionui-refresh';

/**
 * How a session is minted at login.
 *
 * - `renewable` — access + refresh, the dual-token model added in
 *   iOfficeAI/AionCore#926 and consumed by #4175.
 * - `paired`    — access only. This is the #4155 shape: `createPairedSessionCookies()`
 *   hands the browser a Core session JWT and nothing to renew it with, so the
 *   refresh endpoint has no credential to accept.
 */
export type SessionMode = 'renewable' | 'paired';

/** What the realtime stream does when it sees an expired access token. */
export type RealtimeRejection =
  /** Send a `realtime.error` frame, then close 1008. What the shipped backend does. */
  | 'frame-then-close'
  /** Close 1008 with no frame — the bare policy-violation case. */
  | 'close-only';

export type CoreStub = {
  port: number;
  /** Virtual clock. Every expiry check reads `now()`. */
  now: () => number;
  advance: (ms: number) => void;
  /** Server-side request counters — the storm is measured here, not in the client. */
  counts: {
    api: number;
    apiUnauthorized: number;
    refresh: number;
    refreshRejected: number;
    wsUpgrade: number;
  };
  /** Cookie header of every `/api/*` request, so the test can prove what the proxy forwarded. */
  apiCookieHeaders: string[];
  setSessionMode: (mode: SessionMode) => void;
  /** Force a status on `/api/auth/refresh` (e.g. 503) instead of evaluating the cookie. */
  setRefreshStatus: (status: number | null) => void;
  setRealtimeRejection: (mode: RealtimeRejection) => void;
  /** Mint a session as if the browser had just logged in / been paired. */
  issueSessionCookies: () => string[];
  /** Hang up every live realtime client, so the proxy's splice tears down too. */
  dropRealtimeClients: () => void;
  close: () => Promise<void>;
};

function sendJson(res: ServerResponse, status: number, body: unknown, cookies?: string[]): void {
  const headers: Record<string, string | string[]> = { 'content-type': 'application/json' };
  if (cookies?.length) headers['set-cookie'] = cookies;
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

export async function startCoreStub(): Promise<CoreStub> {
  let virtualNow = Date.now();
  let sessionMode: SessionMode = 'renewable';
  let forcedRefreshStatus: number | null = null;
  let realtimeRejection: RealtimeRejection = 'frame-then-close';
  let tokenSeq = 0;

  const counts: CoreStub['counts'] = {
    api: 0,
    apiUnauthorized: 0,
    refresh: 0,
    refreshRejected: 0,
    wsUpgrade: 0,
  };
  const apiCookieHeaders: string[] = [];

  const now = (): number => virtualNow;
  const mintToken = (ttlMs: number): string => `t${++tokenSeq}.${now() + ttlMs}`;
  const tokenIsValid = (token: string | undefined): boolean => {
    if (!token) return false;
    const expiresAt = Number(token.split('.')[1]);
    return Number.isFinite(expiresAt) && expiresAt > now();
  };

  /**
   * `Max-Age` deliberately outlives the token inside the cookie: a paired
   * browser keeps *holding* its session cookie for 30 days while the JWT within
   * it dies after 24 hours. That mismatch is the whole of #4155, so the harness
   * has to reproduce it rather than let the browser drop the cookie.
   */
  const issueSessionCookies = (): string[] => {
    const cookies = [
      `${ACCESS_COOKIE}=${mintToken(ACCESS_TTL_MS)}; Path=/; HttpOnly; Max-Age=${REFRESH_TTL_MS / 1000}`,
    ];
    if (sessionMode === 'renewable') {
      cookies.push(
        `${REFRESH_COOKIE}=${mintToken(REFRESH_TTL_MS)}; Path=/api/auth/refresh; HttpOnly; Max-Age=${REFRESH_TTL_MS / 1000}`
      );
    }
    return cookies;
  };

  const unauthorized = (res: ServerResponse): void => {
    // Same envelope the real backend returns, including the message #4155
    // singled out: a *present but expired* token, not a missing one.
    sendJson(res, 401, { success: false, code: 'UNAUTHORIZED', error: 'Invalid or expired token' });
  };

  const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/';
    const cookies = parseCookies(req.headers.cookie);
    const path = url.split('?')[0];

    if (path === '/login' && req.method === 'POST') {
      sendJson(res, 200, { success: true, user: { id: 'u1', username: 'paired' } }, issueSessionCookies());
      return;
    }

    if (path === '/api/auth/refresh') {
      counts.refresh += 1;
      if (forcedRefreshStatus !== null) {
        counts.refreshRejected += 1;
        sendJson(res, forcedRefreshStatus, { success: false, error: 'refresh unavailable' });
        return;
      }
      if (!tokenIsValid(cookies[REFRESH_COOKIE])) {
        // No refresh credential (paired browser) or it has expired too.
        counts.refreshRejected += 1;
        unauthorized(res);
        return;
      }
      sendJson(res, 200, { success: true }, issueSessionCookies());
      return;
    }

    if (path.startsWith('/api/')) {
      counts.api += 1;
      apiCookieHeaders.push(req.headers.cookie ?? '');
      if (!tokenIsValid(cookies[ACCESS_COOKIE])) {
        counts.apiUnauthorized += 1;
        unauthorized(res);
        return;
      }
      if (path === '/api/auth/user') {
        sendJson(res, 200, { success: true, user: { id: 'u1', username: 'paired' } });
        return;
      }
      sendJson(res, 200, { success: true, data: { ok: true } });
      return;
    }

    sendJson(res, 404, { success: false, error: 'not found' });
  });

  // `/ws` reaches the stub as a raw TCP splice from the web host, so this is a
  // genuine upgrade over the proxy rather than an in-process shortcut.
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    if (!req.url?.startsWith('/ws')) {
      socket.destroy();
      return;
    }
    counts.wsUpgrade += 1;
    const cookies = parseCookies(req.headers.cookie);
    const authed = tokenIsValid(cookies[ACCESS_COOKIE]);
    wss.handleUpgrade(req, socket, head, (ws: WsSocket) => {
      if (authed) {
        ws.send(JSON.stringify({ name: 'realtime.ready', data: { ok: true } }));
        return;
      }
      // Accepted the upgrade, then refuses the stream — the `status=101` once a
      // second that #4155's backend log shows.
      if (realtimeRejection === 'frame-then-close') {
        ws.send(
          JSON.stringify({
            name: 'realtime.error',
            data: { code: 'REALTIME_AUTH_EXPIRED', message: 'Invalid or expired token', recoverable: false },
          })
        );
      }
      ws.close(1008, 'REALTIME_AUTH_EXPIRED');
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

  return {
    port: (server.address() as AddressInfo).port,
    now,
    advance: (ms: number) => {
      virtualNow += ms;
    },
    counts,
    apiCookieHeaders,
    setSessionMode: (mode: SessionMode) => {
      sessionMode = mode;
    },
    setRefreshStatus: (status: number | null) => {
      forcedRefreshStatus = status;
    },
    setRealtimeRejection: (mode: RealtimeRejection) => {
      realtimeRejection = mode;
    },
    issueSessionCookies,
    dropRealtimeClients: () => {
      for (const client of wss.clients) {
        client.terminate();
      }
    },
    close: () =>
      new Promise<void>((resolve) => {
        wss.close();
        server.close(() => resolve());
      }),
  };
}
