/**
 * WebUI static server.
 *
 * Serves out/renderer/ as the SPA, proxies /api/* and /ws to the backend,
 * and handles /api/auth/login + /api/auth/logout locally via web-host auth.
 *
 * Design: Node native http + serve-handler. No Express. No business routes
 * beyond the login pair — those ALL live in aionui-backend.
 */

import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
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
import {
  SESSION_COOKIE,
  createSession,
  verifySession,
  getSessionUsername,
} from './auth/session.js';
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
  opts: { maxAge: number; sameSite: 'strict' | 'lax'; httpOnly: boolean; path: string },
): string {
  return cookie.serialize(name, value, {
    maxAge: Math.floor(opts.maxAge / 1000),
    sameSite: opts.sameSite,
    httpOnly: opts.httpOnly,
    path: opts.path,
    secure: false, // matches legacy local HTTP; M6 cookie options table is out of scope
  });
}

function forwardToBackend(
  req: IncomingMessage,
  res: ServerResponse,
  backendPort: number,
): void {
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

function forwardUpgradeToBackend(
  req: IncomingMessage,
  socket: Socket,
  head: Buffer,
  backendPort: number,
): void {
  // Tunnel the WebSocket handshake through a raw TCP socket: reassemble the
  // original request line + headers and splice the two sockets together. This
  // mirrors what http-proxy/nginx do for WebSocket upstreams and avoids the
  // quirks of Node's `http.request` 'upgrade' event (which can silently swallow
  // the 101 as a regular response under certain Agent configurations).
  socket.setNoDelay(true);
  socket.setKeepAlive(true);
  socket.setTimeout(0);
  const lines: string[] = [`${req.method ?? 'GET'} ${req.url ?? '/'} HTTP/1.1`];
  const headers: Record<string, string | string[] | undefined> = {
    ...req.headers,
    host: `127.0.0.1:${backendPort}`,
  };
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) lines.push(`${key}: ${v}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  const requestBytes = Buffer.from(lines.join('\r\n') + '\r\n\r\n', 'utf8');

  const proxySocket = net.connect({ host: '127.0.0.1', port: backendPort });
  proxySocket.setNoDelay(true);
  proxySocket.setKeepAlive(true);

  proxySocket.once('connect', () => {
    proxySocket.write(requestBytes);
    if (head.length > 0) proxySocket.write(head);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });

  const tearDown = (err?: Error): void => {
    if (err) {
      try {
        socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      } catch {
        // ignore
      }
    }
    socket.destroy();
    proxySocket.destroy();
  };
  proxySocket.on('error', tearDown);
  socket.on('error', () => proxySocket.destroy());
  socket.on('close', () => proxySocket.destroy());
}

export async function startStaticServer(opts: StaticServerOptions): Promise<StaticServerHandle> {
  const port = opts.port ?? DEFAULT_PORT;
  const allowRemote = opts.allowRemote === true;
  const host = allowRemote ? '0.0.0.0' : '127.0.0.1';
  const loginLimiter = new RateLimiter();

  const server: Server = http.createServer(async (req, res) => {
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

  server.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws' || req.url?.startsWith('/ws?')) {
      forwardUpgradeToBackend(req, socket as Socket, head, opts.backendPort);
    } else {
      socket.destroy();
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const actualPort = (server.address() as { port: number } | null)?.port ?? port;
  const lanIP = allowRemote ? getLanIP() ?? undefined : undefined;
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
        server.close(() => resolve());
      }),
  };
}

export async function stopStaticServer(handle: StaticServerHandle): Promise<void> {
  await handle.stop();
}
