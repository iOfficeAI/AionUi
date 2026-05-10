/**
 * WebUI static server.
 *
 * Serves out/renderer/ as the SPA, proxies /api/* and /ws to the backend,
 * and handles /api/auth/login + /api/auth/logout locally via web-host auth.
 *
 * Design: Node native http + serve-handler. No Express. No business routes
 * beyond the login pair — those ALL live in aionui-backend.
 */

import http, { type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import net, { type Socket } from 'node:net';
import serveHandler from 'serve-handler';
import * as cookieRaw from 'cookie';
import type { AppMetadata } from './types.js';

// Type workaround: cookie@0.7 with @types/cookie@0.6 has resolution issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cookie = cookieRaw as any as {
  serialize: (name: string, val: string, options?: Record<string, unknown>) => string;
  parse: (str: string) => Record<string, string | undefined>;
};
import { verifyPassword, loadConfig } from './auth/index.js';
import { SESSION_COOKIE, createSession, verifySession, getSessionUsername } from './auth/session.js';
import { RateLimiter } from './auth/rateLimiter.js';

export type StaticServerOptions = {
  staticDir: string;
  backendPort: number;
  port?: number;
  allowRemote?: boolean;
  app: AppMetadata;
};

export type StaticServerHandle = {
  port: number;
  url: string;
  localUrl: string;
  networkUrl?: string;
  lanIP?: string;
  stop: () => Promise<void>;
};

const DEFAULT_PORT = 25808;

function getLanIP(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

async function readBody(req: IncomingMessage, limitBytes = 1_000_000): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of req) {
    received += chunk.length;
    if (received > limitBytes) throw new Error('BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function buildCookieString(
  name: string,
  value: string,
  opts: { maxAge: number; sameSite: 'strict' | 'lax'; httpOnly: boolean; path: string }
): string {
  return cookie.serialize(name, value, {
    maxAge: Math.floor(opts.maxAge / 1000),
    sameSite: opts.sameSite,
    httpOnly: opts.httpOnly,
    path: opts.path,
    secure: false, // matches legacy local HTTP; M6 cookie options table is out of scope
  });
}

function forwardToBackend(req: IncomingMessage, res: ServerResponse, backendPort: number): void {
  const options: http.RequestOptions = {
    hostname: '127.0.0.1',
    port: backendPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${backendPort}` },
  };
  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxy.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'BACKEND_UNREACHABLE' }));
    } else {
      res.destroy();
    }
  });
  req.pipe(proxy);
}

// Max bytes we peek before forcing a routing decision. An HTTP request-line
// on its own is typically < 100 bytes; a full header block is < 2 KB. If we
// haven't seen a newline after 4 KB the client is sending something weird —
// hand it to the internal HTTP server and let it return 400.
const PEEK_LIMIT_BYTES = 4096;

/**
 * Splice `client` to a TCP endpoint on `targetPort`. Any bytes already read
 * from `client` during peek are replayed to the upstream as the first write,
 * so the endpoint sees the full HTTP request as-sent.
 */
function spliceToTcpEndpoint(client: Socket, targetPort: number, initialBytes: Buffer): void {
  client.setNoDelay(true);
  client.setKeepAlive(true);
  client.setTimeout(0);
  const upstream = net.connect({ host: '127.0.0.1', port: targetPort });
  upstream.setNoDelay(true);
  upstream.setKeepAlive(true);
  upstream.once('connect', () => {
    if (initialBytes.length > 0) upstream.write(initialBytes);
    upstream.pipe(client);
    client.pipe(upstream);
  });
  const tearDown = (): void => {
    client.destroy();
    upstream.destroy();
  };
  upstream.on('error', tearDown);
  client.on('error', tearDown);
  upstream.on('close', tearDown);
  client.on('close', tearDown);
}

/**
 * Decide routing from the first chunk of an incoming HTTP connection:
 *  - `true`  → `GET /ws[...] HTTP/1.x` (WebSocket upgrade), splice to backend
 *  - `false` → any other HTTP method / path, hand to internal HTTP server
 *  - `null`  → need more bytes (no CRLF yet)
 *
 * We only check the request-line; `Upgrade: websocket` is not strictly
 * required — the backend will reject a non-upgrade `GET /ws` on its own.
 * Keeping the rule simple means we can decide after the first ~50 bytes
 * instead of waiting for the full header block.
 */
function peekWsRoute(buf: Buffer): boolean | null {
  const newlineIdx = buf.indexOf(0x0a); // \n
  if (newlineIdx < 0) return null;
  const firstLine = buf.slice(0, newlineIdx).toString('ascii');
  return /^GET\s+\/ws(?:\?[^\s]*)?\s+HTTP\/1\.[01]\r?$/.test(firstLine);
}

export async function startStaticServer(opts: StaticServerOptions): Promise<StaticServerHandle> {
  const port = opts.port ?? DEFAULT_PORT;
  const allowRemote = opts.allowRemote === true;
  const host = allowRemote ? '0.0.0.0' : '127.0.0.1';
  const loginLimiter = new RateLimiter();

  // The HTTP server listens only on loopback — user traffic hits the outer
  // net.Server first. We route to this server for everything except WS
  // upgrades, which go straight to the backend via a raw TCP splice.
  //
  // Why two listeners instead of using `http.Server`'s native `upgrade` event:
  // bun 1.3's http-compat layer does not faithfully forward writes on the
  // socket delivered to the `upgrade` handler, so the backend's 101 response
  // never reaches the browser (see #2824). Making the outer listener pure
  // TCP avoids touching that code path on both bun and node.
  const http_server: Server = http.createServer(async (req, res) => {
    try {
      if (!req.url || !req.method) {
        res.writeHead(400).end();
        return;
      }

      // 1. /api/auth/login — local
      if (req.method === 'POST' && req.url === '/api/auth/login') {
        const ip = req.socket.remoteAddress || 'unknown';
        const limit = loginLimiter.attempt(ip);
        if (!limit.allowed) {
          res.writeHead(429, {
            'content-type': 'application/json',
            'retry-after': Math.ceil(limit.retryAfterMs / 1000).toString(),
          });
          res.end(JSON.stringify({ error: 'RATE_LIMITED' }));
          return;
        }
        let body: { username?: string; password?: string };
        try {
          body = JSON.parse((await readBody(req)).toString('utf-8') || '{}');
        } catch {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'BAD_REQUEST' }));
          return;
        }
        const ok = await verifyPassword({ app: opts.app, password: body.password ?? '' });
        if (!ok) {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'INVALID_CREDENTIALS' }));
          return;
        }
        loginLimiter.reset(ip);
        const cfg = await loadConfig(opts.app);
        const username = body.username || cfg.adminUsername || 'admin';
        const session = createSession({ username });
        res.writeHead(200, {
          'content-type': 'application/json',
          'set-cookie': buildCookieString(SESSION_COOKIE.NAME, session.token, {
            maxAge: SESSION_COOKIE.MAX_AGE_MS,
            sameSite: allowRemote ? SESSION_COOKIE.SAME_SITE_REMOTE : SESSION_COOKIE.SAME_SITE_LOCAL,
            httpOnly: SESSION_COOKIE.HTTP_ONLY,
            path: SESSION_COOKIE.PATH,
          }),
        });
        res.end(
          JSON.stringify({
            success: true,
            user: { username, id: username },
          })
        );
        return;
      }

      // 2a. /api/auth/user — answer from session cookie, don't hit backend.
      // Backend's /api/auth/user requires a JWT we don't mint. Legacy webserver
      // had middleware that translated session-cookie → user; web-host replicates
      // that locally so the WebUI AuthProvider's refresh() works.
      if (req.method === 'GET' && (req.url === '/api/auth/user' || req.url?.startsWith('/api/auth/user?'))) {
        const parsed = cookie.parse(req.headers.cookie || '');
        const token = parsed[SESSION_COOKIE.NAME];
        const username = token ? getSessionUsername(token) : null;
        if (!username) {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHENTICATED' }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ success: true, user: { username, id: username } }));
        return;
      }

      // 2. /api/auth/logout — local
      if (req.method === 'POST' && req.url === '/api/auth/logout') {
        const parsed = cookie.parse(req.headers.cookie || '');
        const token = parsed[SESSION_COOKIE.NAME];
        if (token) verifySession(token); // no-op if invalid
        res.writeHead(200, {
          'content-type': 'application/json',
          'set-cookie': buildCookieString(SESSION_COOKIE.NAME, '', {
            maxAge: 0,
            sameSite: allowRemote ? SESSION_COOKIE.SAME_SITE_REMOTE : SESSION_COOKIE.SAME_SITE_LOCAL,
            httpOnly: SESSION_COOKIE.HTTP_ONLY,
            path: SESSION_COOKIE.PATH,
          }),
        });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // 3. /api/* — reverse proxy to backend
      if (req.url.startsWith('/api/') || req.url.startsWith('/api?')) {
        forwardToBackend(req, res, opts.backendPort);
        return;
      }

      // 4. static files + SPA fallback
      await serveHandler(req, res, {
        public: opts.staticDir,
        rewrites: [{ source: '**', destination: '/index.html' }],
      });
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'INTERNAL_ERROR' }));
      } else {
        res.destroy();
      }
    }
  });

  // Internal HTTP server — 127.0.0.1 ephemeral port, never visible to the user.
  await new Promise<void>((resolve, reject) => {
    http_server.once('error', reject);
    http_server.listen(0, '127.0.0.1', () => {
      http_server.off('error', reject);
      resolve();
    });
  });
  const internalPort = (http_server.address() as { port: number } | null)?.port;
  if (!internalPort) {
    throw new Error('internal HTTP server failed to bind to a port');
  }

  // User-facing listener: inspect the first line of every TCP connection and
  // route to either the backend (for /ws upgrades) or the internal HTTP
  // server (everything else). Both routes use raw TCP splice — no reliance
  // on http.Server's upgrade event.
  const tcp_server = net.createServer((client: Socket) => {
    let peeked = Buffer.alloc(0);
    let settled = false;
    const cleanup = (): void => {
      if (settled) return;
      settled = true;
      client.removeListener('data', onData);
      client.removeListener('error', onEarlyError);
      client.removeListener('end', onEarlyEnd);
    };
    const onData = (chunk: Buffer): void => {
      peeked = Buffer.concat([peeked, chunk]);
      const decision = peekWsRoute(peeked);
      if (decision === null && peeked.length < PEEK_LIMIT_BYTES) return;
      cleanup();
      const target = decision === true ? opts.backendPort : internalPort;
      spliceToTcpEndpoint(client, target, peeked);
    };
    const onEarlyError = (): void => {
      cleanup();
      client.destroy();
    };
    const onEarlyEnd = (): void => {
      // Client closed before we saw a request line — nothing to route.
      cleanup();
      client.destroy();
    };
    client.on('data', onData);
    client.on('error', onEarlyError);
    client.on('end', onEarlyEnd);
  });

  await new Promise<void>((resolve, reject) => {
    tcp_server.once('error', reject);
    tcp_server.listen(port, host, () => {
      tcp_server.off('error', reject);
      resolve();
    });
  });

  const actualPort = (tcp_server.address() as { port: number } | null)?.port ?? port;
  const lanIP = allowRemote ? (getLanIP() ?? undefined) : undefined;
  const localUrl = `http://127.0.0.1:${actualPort}`;
  const networkUrl = lanIP ? `http://${lanIP}:${actualPort}` : undefined;

  return {
    port: actualPort,
    url: networkUrl ?? localUrl,
    localUrl,
    networkUrl,
    lanIP,
    stop: () =>
      new Promise<void>((resolve) => {
        tcp_server.close(() => {
          http_server.close(() => resolve());
        });
      }),
  };
}

export async function stopStaticServer(handle: StaticServerHandle): Promise<void> {
  await handle.stop();
}
