/**
 * WebUI static server.
 *
 * Serves out/renderer/ as the SPA and reverse-proxies public /api/*, /ws,
 * /api/stt/stream, /login and /logout routes to aioncore. Local-control API
 * namespaces are never exposed through this public listener. All auth goes to
 * backend's aionui-auth crate; /login and /logout are aionui-auth's top-level
 * paths, while the public auth routes live under /api/auth/*. /ws and
 * /api/stt/stream are WebSocket/stream upgrades spliced at TCP level;
 * /api/stt/stream is the STT streaming endpoint.
 *
 * Design: Node native http + serve-handler. No Express. No business routes.
 */

import http, {
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http';
import { networkInterfaces } from 'node:os';
import net, { type Socket } from 'node:net';
import serveHandler from 'serve-handler';

export type StaticServerOptions = {
  staticDir: string;
  backendPort: number;
  port?: number;
  allowRemote?: boolean;
  /** Trust one reverse-proxy hop for the right-most client IP and public host. */
  trustProxy?: boolean;
  /** Maximum total time allowed to receive the first complete HTTP header block. */
  requestHeaderTimeoutMs?: number;
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
const LOCAL_ONLY_API_PREFIXES = ['/api/webui', '/api/auth/internal'] as const;
const UNTRUSTED_FORWARDING_HEADERS = new Set(['forwarded', 'x-real-ip']);
const ORIGIN_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function getDecodedPathname(requestUrl: string): string {
  try {
    const pathname = new URL(requestUrl, 'http://127.0.0.1').pathname;
    try {
      return decodeURIComponent(pathname);
    } catch {
      return pathname;
    }
  } catch {
    return requestUrl.split(/[?#]/, 1)[0];
  }
}

function isLocalOnlyApiRequest(requestUrl: string): boolean {
  const pathname = getDecodedPathname(requestUrl);
  return LOCAL_ONLY_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function getLanIP(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

function isUntrustedForwardingHeader(headerName: string): boolean {
  const normalized = headerName.toLowerCase();
  return UNTRUSTED_FORWARDING_HEADERS.has(normalized) || normalized.startsWith('x-forwarded-');
}

function normalizeClientAddress(address: string | undefined): string | undefined {
  if (!address) return undefined;
  const normalized = address.startsWith('::ffff:') ? address.slice(7) : address;
  return net.isIP(normalized) ? normalized : undefined;
}

function getHeaderText(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(',') : value;
}

function getRightMostHeaderValue(value: string | undefined): string | undefined {
  return value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .at(-1);
}

function normalizeHttpHost(value: string | undefined): string | undefined {
  if (!value || value.includes(',')) return undefined;
  try {
    const url = new URL(`http://${value.trim()}`);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return undefined;
    return url.host.toLowerCase();
  } catch {
    return undefined;
  }
}

type BrowserOriginHeaders = {
  host?: string;
  origin?: string;
  secFetchSite?: string;
  xForwardedHost?: string;
};

function isAllowedBrowserOrigin(headers: BrowserOriginHeaders, trustProxy: boolean): boolean {
  if (headers.secFetchSite?.split(',').some((value) => value.trim().toLowerCase() === 'cross-site')) return false;

  // Native clients and health checks do not send Origin. Browser mutations do,
  // and modern browsers additionally send Sec-Fetch-Site. Keep the non-browser
  // API usable while rejecting browser-controlled cross-site requests.
  if (!headers.origin) return true;
  if (headers.origin === 'null' || headers.origin.includes(',')) return false;

  const publicHost = normalizeHttpHost(
    trustProxy ? (getRightMostHeaderValue(headers.xForwardedHost) ?? headers.host) : headers.host
  );
  if (!publicHost) return false;

  try {
    const origin = new URL(headers.origin);
    if (
      (origin.protocol !== 'http:' && origin.protocol !== 'https:') ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash
    ) {
      return false;
    }
    return origin.host.toLowerCase() === publicHost;
  } catch {
    return false;
  }
}

function getBrowserOriginHeaders(headers: IncomingHttpHeaders): BrowserOriginHeaders {
  return {
    host: getHeaderText(headers.host),
    origin: getHeaderText(headers.origin),
    secFetchSite: getHeaderText(headers['sec-fetch-site']),
    xForwardedHost: getHeaderText(headers['x-forwarded-host']),
  };
}

function getBrowserOriginHeadersFromBlock(headerBlock: Buffer): BrowserOriginHeaders {
  const values = new Map<string, string[]>();
  for (const line of headerBlock.toString('latin1').split('\r\n').slice(1)) {
    if (!line) break;
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    if (!['host', 'origin', 'sec-fetch-site', 'x-forwarded-host'].includes(name)) continue;
    const current = values.get(name) ?? [];
    current.push(line.slice(separator + 1).trim());
    values.set(name, current);
  }
  const joined = (name: string): string | undefined => values.get(name)?.join(',');
  return {
    host: joined('host'),
    origin: joined('origin'),
    secFetchSite: joined('sec-fetch-site'),
    xForwardedHost: joined('x-forwarded-host'),
  };
}

function resolveClientAddress(
  headers: IncomingHttpHeaders,
  peerAddress: string | undefined,
  trustProxy: boolean
): string | undefined {
  const peer = normalizeClientAddress(peerAddress);
  if (!trustProxy) return peer;

  const forwardedFor = getHeaderText(headers['x-forwarded-for']);
  if (forwardedFor) {
    const forwarded = forwardedFor
      .split(',')
      .toReversed()
      .map((entry) => normalizeClientAddress(entry.trim()))
      .find((entry) => entry !== undefined);
    if (forwarded) return forwarded;
  }

  return normalizeClientAddress(getHeaderText(headers['x-real-ip'])?.trim()) ?? peer;
}

function buildBackendHeaders(
  headers: IncomingHttpHeaders,
  backendPort: number,
  peerAddress: string | undefined,
  trustProxy: boolean
): OutgoingHttpHeaders {
  const sanitized: OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!isUntrustedForwardingHeader(name)) sanitized[name] = value;
  }
  const clientAddress = resolveClientAddress(headers, peerAddress, trustProxy);
  if (clientAddress) sanitized['x-forwarded-for'] = clientAddress;
  sanitized.host = `127.0.0.1:${backendPort}`;
  return sanitized;
}

function sanitizeWebSocketRequestHeaders(
  headerBlock: Buffer,
  peerAddress: string | undefined,
  trustProxy: boolean
): Buffer {
  const lines = headerBlock.toString('latin1').split('\r\n');
  const forwardingHeaders: IncomingHttpHeaders = {};
  for (const line of lines.slice(1)) {
    if (!line) break;
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const name = line.slice(0, separator).toLowerCase();
    if (name === 'x-forwarded-for' || name === 'x-real-ip') {
      forwardingHeaders[name] = line.slice(separator + 1).trim();
    }
  }

  const sanitized = [lines[0]];
  for (const line of lines.slice(1)) {
    if (!line) break;
    const separator = line.indexOf(':');
    if (separator <= 0 || !isUntrustedForwardingHeader(line.slice(0, separator))) sanitized.push(line);
  }
  const clientAddress = resolveClientAddress(forwardingHeaders, peerAddress, trustProxy);
  if (clientAddress) sanitized.push(`X-Forwarded-For: ${clientAddress}`);
  return Buffer.from(`${sanitized.join('\r\n')}\r\n\r\n`, 'latin1');
}

function forwardToBackend(
  req: IncomingMessage,
  res: ServerResponse,
  backendPort: number,
  peerAddress: string | undefined,
  trustProxy: boolean
): void {
  const options: http.RequestOptions = {
    hostname: '127.0.0.1',
    port: backendPort,
    path: req.url,
    method: req.method,
    headers: buildBackendHeaders(req.headers, backendPort, peerAddress, trustProxy),
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

// Bounds for deciding whether the outer TCP listener may open a direct backend
// tunnel. Every connection must provide one complete, bounded HTTP header block
// before it is routed. This keeps the raw TCP listener from becoming an
// unbounded slow-header holding area in front of Node's HTTP parser.
const WEBSOCKET_HEADER_LIMIT_BYTES = 16 * 1024;
const WEBSOCKET_PENDING_DATA_LIMIT_BYTES = 1024 * 1024;
const DEFAULT_REQUEST_HEADER_TIMEOUT_MS = 10_000;
const WEBSOCKET_HANDSHAKE_TIMEOUT_MS = 10_000;
const HTTP_HEADER_TERMINATOR = Buffer.from('\r\n\r\n');

function buildClosingHttpResponse(statusCode: number): Buffer {
  const reason = http.STATUS_CODES[statusCode] ?? 'Error';
  return Buffer.from(`HTTP/1.1 ${statusCode} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`, 'ascii');
}

function closeClientWithStatus(client: Socket, statusCode: number): void {
  if (!client.destroyed) client.end(buildClosingHttpResponse(statusCode), () => client.destroy());
}

function headerContainsToken(headerBlock: Buffer, headerName: string, expectedToken: string): boolean {
  const expectedName = headerName.toLowerCase();
  const expected = expectedToken.toLowerCase();
  const lines = headerBlock.toString('latin1').split('\r\n');

  for (const line of lines.slice(1)) {
    if (!line) break;
    const separator = line.indexOf(':');
    if (separator <= 0 || line.slice(0, separator).toLowerCase() !== expectedName) continue;
    if (
      line
        .slice(separator + 1)
        .split(',')
        .some((token) => token.trim().toLowerCase() === expected)
    ) {
      return true;
    }
  }
  return false;
}

function hasWebSocketUpgradeHeaders(headerBlock: Buffer): boolean {
  return (
    headerContainsToken(headerBlock, 'connection', 'upgrade') &&
    headerContainsToken(headerBlock, 'upgrade', 'websocket')
  );
}

function getResponseStatusCode(headerBlock: Buffer): number | undefined {
  const newlineIdx = headerBlock.indexOf(0x0a);
  if (newlineIdx < 0) return undefined;
  const firstLine = headerBlock.slice(0, newlineIdx).toString('ascii').trimEnd();
  const match = /^HTTP\/1\.[01]\s+(\d{3})(?:\s|$)/.exec(firstLine);
  return match ? Number(match[1]) : undefined;
}

/**
 * Splice `client` to a TCP endpoint on `targetPort`. Any bytes already read
 * from `client` during peek are replayed to the upstream as the first write,
 * so the endpoint sees the full HTTP request as-sent.
 */
function spliceToTcpEndpoint(
  client: Socket,
  targetPort: number,
  initialBytes: Buffer,
  clientAddresses?: Map<number, string>,
  clientAddress?: string
): void {
  client.setNoDelay(true);
  client.setKeepAlive(true);
  client.setTimeout(0);
  const upstream = net.connect({ host: '127.0.0.1', port: targetPort });
  let registeredPort: number | undefined;
  upstream.setNoDelay(true);
  upstream.setKeepAlive(true);
  upstream.once('connect', () => {
    const normalizedAddress = normalizeClientAddress(clientAddress);
    if (clientAddresses && normalizedAddress && upstream.localPort) {
      registeredPort = upstream.localPort;
      clientAddresses.set(registeredPort, normalizedAddress);
    }
    if (initialBytes.length > 0) upstream.write(initialBytes);
    upstream.pipe(client);
    client.pipe(upstream);
  });
  const tearDown = (): void => {
    if (registeredPort) clientAddresses?.delete(registeredPort);
    client.destroy();
    upstream.destroy();
  };
  upstream.on('error', tearDown);
  client.on('error', tearDown);
  upstream.on('close', tearDown);
  client.on('close', tearDown);
}

/**
 * Complete a WebSocket handshake before turning the client connection into a
 * raw backend tunnel. Bytes after the first request's headers are held until
 * aioncore confirms the protocol switch with 101. A rejected handshake is
 * closed instead of leaving an unrestricted HTTP keep-alive connection to the
 * loopback-only backend.
 */
function spliceWebSocketUpgrade(
  client: Socket,
  targetPort: number,
  requestHeaders: Buffer,
  pendingClientBytes: Buffer
): void {
  client.pause();
  client.setNoDelay(true);
  client.setKeepAlive(true);

  const upstream = net.connect({ host: '127.0.0.1', port: targetPort });
  upstream.setNoDelay(true);
  upstream.setKeepAlive(true);

  let phase: 'handshake' | 'tunnel' | 'closed' = 'handshake';
  let responseBytes = Buffer.alloc(0);

  const handshakeTimer = setTimeout(() => {
    rejectHandshake(504);
  }, WEBSOCKET_HANDSHAKE_TIMEOUT_MS);
  handshakeTimer.unref();

  const cleanupHandshake = (): void => {
    clearTimeout(handshakeTimer);
    upstream.removeListener('data', onUpstreamData);
  };

  const closeTunnel = (): void => {
    if (phase === 'closed') return;
    phase = 'closed';
    cleanupHandshake();
    client.destroy();
    upstream.destroy();
  };

  const rejectHandshake = (statusCode: number): void => {
    if (phase !== 'handshake') return;
    phase = 'closed';
    cleanupHandshake();
    upstream.destroy();
    closeClientWithStatus(client, statusCode);
  };

  const onUpstreamData = (chunk: Buffer): void => {
    if (phase !== 'handshake') return;
    responseBytes = Buffer.concat([responseBytes, chunk]);
    const headerEnd = responseBytes.indexOf(HTTP_HEADER_TERMINATOR);
    if (headerEnd < 0) {
      if (responseBytes.length > WEBSOCKET_HEADER_LIMIT_BYTES) rejectHandshake(502);
      return;
    }

    const responseHeaderEnd = headerEnd + HTTP_HEADER_TERMINATOR.length;
    if (responseHeaderEnd > WEBSOCKET_HEADER_LIMIT_BYTES) {
      rejectHandshake(502);
      return;
    }

    const responseHeaders = responseBytes.subarray(0, responseHeaderEnd);
    const statusCode = getResponseStatusCode(responseHeaders);
    if (statusCode !== 101 || !hasWebSocketUpgradeHeaders(responseHeaders)) {
      rejectHandshake(statusCode && statusCode !== 101 ? statusCode : 502);
      return;
    }

    phase = 'tunnel';
    cleanupHandshake();
    client.setTimeout(0);
    client.write(responseBytes);
    if (pendingClientBytes.length > 0) upstream.write(pendingClientBytes);
    upstream.pipe(client);
    client.pipe(upstream);
    client.resume();
  };

  client.on('error', closeTunnel);
  client.on('close', closeTunnel);
  upstream.on('error', () => {
    if (phase === 'handshake') rejectHandshake(502);
    else closeTunnel();
  });
  upstream.on('close', () => {
    if (phase === 'handshake') rejectHandshake(502);
    else if (phase === 'tunnel') closeTunnel();
  });
  upstream.on('data', onUpstreamData);
  upstream.once('connect', () => {
    if (phase === 'handshake') upstream.write(requestHeaders);
  });
}

/**
 * Decide routing from the first line of an incoming HTTP connection:
 *  - `true`  → possible `GET /ws[...] HTTP/1.1` or `GET /api/stt/stream[...] HTTP/1.1` upgrade; inspect full headers
 *  - `false` → any other HTTP method / path, hand to internal HTTP server
 *  - `null`  → need more bytes (no CRLF yet)
 */
function peekWsRoute(buf: Buffer): boolean | null {
  const newlineIdx = buf.indexOf(0x0a); // \n
  if (newlineIdx < 0) return null;
  const firstLine = buf.slice(0, newlineIdx).toString('ascii');
  return /^GET\s+\/(?:ws|api\/stt\/stream)(?:\?[^\s]*)?\s+HTTP\/1\.1\r$/.test(firstLine);
}

export async function startStaticServer(opts: StaticServerOptions): Promise<StaticServerHandle> {
  const port = opts.port ?? DEFAULT_PORT;
  const allowRemote = opts.allowRemote === true;
  const trustProxy = opts.trustProxy === true;
  const requestHeaderTimeoutMs = opts.requestHeaderTimeoutMs ?? DEFAULT_REQUEST_HEADER_TIMEOUT_MS;
  if (!Number.isFinite(requestHeaderTimeoutMs) || requestHeaderTimeoutMs <= 0) {
    throw new RangeError('requestHeaderTimeoutMs must be a positive finite number');
  }
  const host = allowRemote ? '0.0.0.0' : '127.0.0.1';

  // The HTTP server listens only on loopback — user traffic hits the outer
  // net.Server first. We route to this server for everything except WS
  // upgrades and STT stream upgrades, which go straight to the backend via a raw TCP splice.
  //
  // Why two listeners instead of using `http.Server`'s native `upgrade` event:
  // bun 1.3's http-compat layer does not faithfully forward writes on the
  // socket delivered to the `upgrade` handler, so the backend's 101 response
  // never reaches the browser (see #2824). Making the outer listener pure
  // TCP avoids touching that code path on both bun and node.
  const internalClientAddresses = new Map<number, string>();
  const http_server: Server = http.createServer(async (req, res) => {
    try {
      if (!req.url || !req.method) {
        res.writeHead(400).end();
        return;
      }

      // These routes trust the backend loopback boundary and intentionally do
      // not require a browser session. Desktop/bootstrap/CLI callers reach the
      // backendPort directly; exposing them here would let remote clients
      // replace credentials or invoke other local-only controls.
      if (isLocalOnlyApiRequest(req.url)) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'NOT_FOUND' }));
        return;
      }

      if (
        !ORIGIN_SAFE_METHODS.has(req.method.toUpperCase()) &&
        !isAllowedBrowserOrigin(getBrowserOriginHeaders(req.headers), trustProxy)
      ) {
        res.writeHead(403, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'INVALID_ORIGIN' }));
        return;
      }

      // Public /api/* — reverse proxy to backend (includes public /api/auth/*).
      // /login and /logout are aionui-auth's top-level auth endpoints: proxy them too
      // so WebUI browser clients reach the backend without a path-rewrite.
      if (req.url.startsWith('/api/') || req.url.startsWith('/api?') || req.url === '/login' || req.url === '/logout') {
        const peerAddress =
          (req.socket.remotePort ? internalClientAddresses.get(req.socket.remotePort) : undefined) ??
          req.socket.remoteAddress;
        forwardToBackend(req, res, opts.backendPort, peerAddress, trustProxy);
        return;
      }

      // Browser shell responses are public deployment surfaces too. Keep the
      // SPA out of third-party frames and disable MIME sniffing without imposing
      // a script/style CSP that would conflict with the generated renderer.
      res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');

      // static files + SPA fallback
      await serveHandler(req, res, {
        public: opts.staticDir,
        rewrites: [{ source: '**', destination: '/index.html' }],
      });
    } catch {
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

  // User-facing listener: inspect one complete, bounded header block from every
  // TCP connection, then route to either the backend (for /ws and
  // /api/stt/stream upgrades) or the internal HTTP server (everything else).
  // Both routes use raw TCP splice — no reliance on http.Server's upgrade event.
  const outerSockets = new Set<Socket>();
  const tcp_server = net.createServer((client: Socket) => {
    outerSockets.add(client);

    let peeked = Buffer.alloc(0);
    let settled = false;
    const requestHeaderTimer = setTimeout(() => {
      cleanup();
      closeClientWithStatus(client, 408);
    }, requestHeaderTimeoutMs);
    requestHeaderTimer.unref();
    const cleanup = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(requestHeaderTimer);
      client.removeListener('data', onData);
      client.removeListener('error', onEarlyError);
      client.removeListener('end', onEarlyEnd);
    };
    const onData = (chunk: Buffer): void => {
      peeked = Buffer.concat([peeked, chunk]);
      const headerEnd = peeked.indexOf(HTTP_HEADER_TERMINATOR);
      if (headerEnd < 0) {
        if (peeked.length < WEBSOCKET_HEADER_LIMIT_BYTES) return;
        cleanup();
        closeClientWithStatus(client, 431);
        return;
      }

      const requestHeaderEnd = headerEnd + HTTP_HEADER_TERMINATOR.length;
      const requestHeaders = peeked.subarray(0, requestHeaderEnd);
      const pendingClientBytes = peeked.subarray(requestHeaderEnd);
      cleanup();

      if (requestHeaderEnd > WEBSOCKET_HEADER_LIMIT_BYTES) {
        closeClientWithStatus(client, 431);
        return;
      }

      const decision = peekWsRoute(requestHeaders);
      if (decision !== true) {
        spliceToTcpEndpoint(client, internalPort, peeked, internalClientAddresses, client.remoteAddress);
        return;
      }

      if (!hasWebSocketUpgradeHeaders(requestHeaders)) {
        closeClientWithStatus(client, 400);
        return;
      }
      if (!isAllowedBrowserOrigin(getBrowserOriginHeadersFromBlock(requestHeaders), trustProxy)) {
        closeClientWithStatus(client, 403);
        return;
      }
      if (pendingClientBytes.length > WEBSOCKET_PENDING_DATA_LIMIT_BYTES) {
        closeClientWithStatus(client, 413);
        return;
      }

      spliceWebSocketUpgrade(
        client,
        opts.backendPort,
        sanitizeWebSocketRequestHeaders(requestHeaders, client.remoteAddress, trustProxy),
        pendingClientBytes
      );
    };
    const onEarlyError = (): void => {
      cleanup();
      client.destroy();
    };
    const onEarlyEnd = (): void => {
      // Client closed before we saw a complete header block — nothing to route.
      cleanup();
      client.destroy();
    };
    client.once('close', () => {
      outerSockets.delete(client);
      cleanup();
    });
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
  let stopPromise: Promise<void> | null = null;

  const stop = (): Promise<void> => {
    if (stopPromise) return stopPromise;

    stopPromise = new Promise<void>((resolve) => {
      tcp_server.close(() => {
        http_server.close(() => resolve());
      });

      // `net.Server.close()` only stops accepting new clients. Existing browser
      // keep-alive and WebSocket tunnels otherwise keep the callback pending
      // forever, which prevents WebHost from stopping aioncore on SIGTERM.
      for (const socket of outerSockets) socket.destroy();
    });
    return stopPromise;
  };

  return {
    port: actualPort,
    url: networkUrl ?? localUrl,
    localUrl,
    networkUrl,
    lanIP,
    stop,
  };
}

export async function stopStaticServer(handle: StaticServerHandle): Promise<void> {
  await handle.stop();
}
