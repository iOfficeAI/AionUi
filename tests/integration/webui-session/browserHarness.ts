/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Enough browser for the real WebUI adapters to run under Node.
 *
 * `httpBridge.ts`, `browser.ts` and `sessionRefresh.ts` are loaded unmodified —
 * the point of the integration test is that the shipped client code is what gets
 * exercised. They need four things Node does not provide:
 *
 *  1. `window.location`, so same-origin relative paths and the `ws://…/ws` URL
 *     resolve against the web host under test.
 *  2. `document`, which is how `sessionRefresh.ts` recognises WebUI browser mode.
 *  3. A `fetch` that resolves relative URLs and keeps a cookie jar. Node's fetch
 *     ignores `credentials: 'include'` entirely, and cookies are the subject of
 *     this test, so the jar is not optional.
 *  4. A `WebSocket` that attaches those cookies to the upgrade request. The
 *     browser class has no header hook, so `ws` does the work.
 *
 * The jar deliberately does **not** expire anything. A paired browser holds its
 * session cookie for 30 days while the token inside it dies after 24 hours, and
 * keeps sending it — that is the bug. Validity is the server's call, decided
 * against the stub's virtual clock.
 *
 * `window` and `document` are installed once and left in place for the whole
 * file: `browser.ts` schedules reconnects on real timers and there is no way to
 * shut it down from outside, so a timer can still fire after its test has ended.
 * `dispose()` neutralises such a straggler by swapping in an inert `fetch` and
 * `WebSocket` instead of deleting the globals it would crash on.
 */

import { WebSocket as WsClient } from 'ws';

type StoredCookie = { value: string; path: string };

export class CookieJar {
  private readonly cookies = new Map<string, StoredCookie>();

  /** Absorb `Set-Cookie` headers, honouring `Path` (and `Max-Age=0` deletions). */
  absorb(setCookieHeaders: readonly string[]): void {
    for (const header of setCookieHeaders) {
      const [pair, ...attrs] = header.split(';');
      const eq = pair.indexOf('=');
      if (eq < 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      let path = '/';
      let deleted = false;
      for (const attr of attrs) {
        const [rawKey, rawValue] = attr.split('=');
        const key = rawKey.trim().toLowerCase();
        if (key === 'path' && rawValue) path = rawValue.trim();
        if (key === 'max-age' && Number(rawValue) <= 0) deleted = true;
      }
      if (deleted) {
        this.cookies.delete(name);
        continue;
      }
      this.cookies.set(name, { value, path });
    }
  }

  /**
   * `Cookie` header for `requestPath`, or '' when nothing is in scope. Path
   * scoping is load-bearing here: the refresh cookie lives at
   * `Path=/api/auth/refresh`, so it must not ride along on ordinary `/api/*` calls.
   */
  headerFor(requestPath: string): string {
    const parts: string[] = [];
    for (const [name, cookie] of this.cookies) {
      if (requestPath === cookie.path || requestPath.startsWith(cookie.path === '/' ? '/' : `${cookie.path}/`)) {
        parts.push(`${name}=${cookie.value}`);
      }
    }
    return parts.join('; ');
  }

  get(name: string): string | undefined {
    return this.cookies.get(name)?.value;
  }

  names(): string[] {
    return [...this.cookies.keys()];
  }
}

export type BrowserHarness = {
  jar: CookieJar;
  origin: string;
  /** Path of every request the client made, so client-side behaviour can be asserted too. */
  clientRequests: string[];
  /** How many WebSocket dials the client attempted. */
  socketDials: () => number;
  /** Current SPA route, i.e. `window.location.hash`. */
  hash: () => string;
  /**
   * Make any straggling timer from this test's client a no-op and hang up every
   * socket it opened. The adapters expose no shutdown, and `startStaticServer`'s
   * `stop()` waits on live connections, so the harness has to close what it opened.
   */
  dispose: () => void;
};

type MutableGlobal = typeof globalThis & Record<string, unknown>;

/** A socket that connects forever: no events, so no reconnect is ever scheduled. */
class InertWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly readyState = InertWebSocket.CONNECTING;
  addEventListener(): void {}
  removeEventListener(): void {}
  send(): void {}
  close(): void {}
}

const inertFetch = async (): Promise<Response> =>
  new Response(JSON.stringify({ success: false }), {
    status: 503,
    headers: { 'content-type': 'application/json' },
  });

/**
 * Install the browser globals for `origin`. Call before importing any adapter
 * module — `browser.ts` connects at import time.
 */
export function installBrowserGlobals(origin: string): BrowserHarness {
  const jar = new CookieJar();
  const clientRequests: string[] = [];
  const url = new URL(origin);
  const g = globalThis as MutableGlobal;
  const realFetch = (g.__harnessRealFetch as typeof fetch) ?? globalThis.fetch;
  g.__harnessRealFetch = realFetch;
  const opened: WsClient[] = [];
  let dials = 0;

  const location = {
    protocol: url.protocol,
    hostname: url.hostname,
    host: url.host,
    origin,
    pathname: '/',
    hash: '',
  };

  g.window = {
    location,
    setTimeout: setTimeout.bind(globalThis),
    clearTimeout: clearTimeout.bind(globalThis),
  };
  // Presence is all `isWebUiBrowserMode()` checks for.
  g.document = {};

  g.fetch = async (input: unknown, init?: RequestInit): Promise<Response> => {
    const target = new URL(String(input), origin);
    clientRequests.push(target.pathname);
    const headers = new Headers(init?.headers as HeadersInit | undefined);
    const cookie = jar.headerFor(target.pathname);
    if (cookie) headers.set('cookie', cookie);
    const response = await realFetch(target, { ...init, headers, redirect: 'manual' });
    jar.absorb(response.headers.getSetCookie());
    return response;
  };

  /**
   * `ws` already exposes the browser surface the adapters use — `addEventListener`,
   * `readyState`, the static ready-state constants — so the only thing to add is
   * the cookie header, which the browser API gives no way to set.
   */
  class HarnessWebSocket extends WsClient {
    constructor(target: string) {
      dials += 1;
      super(target, { headers: { cookie: jar.headerFor(new URL(target).pathname) } });
      opened.push(this);
    }
  }

  g.WebSocket = HarnessWebSocket;

  return {
    jar,
    origin,
    clientRequests,
    socketDials: () => dials,
    hash: () => location.hash,
    dispose: () => {
      g.fetch = inertFetch;
      g.WebSocket = InertWebSocket;
      for (const socket of opened.splice(0)) {
        socket.terminate();
      }
    },
  };
}

/** Undo `installBrowserGlobals` entirely. Safe only once every client is idle. */
export function removeBrowserGlobals(): void {
  const g = globalThis as MutableGlobal;
  delete g.window;
  delete g.document;
  if (g.__harnessRealFetch) {
    g.fetch = g.__harnessRealFetch as typeof fetch;
    delete g.__harnessRealFetch;
  }
  delete g.WebSocket;
}
