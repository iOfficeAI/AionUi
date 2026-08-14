import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo, Socket } from 'node:net';
import { startStaticServer, type StaticServerHandle } from './static-server.js';

async function mkRendererFixture(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-static-'));
  await fs.writeFile(path.join(dir, 'index.html'), '<!doctype html><title>root</title>');
  await fs.mkdir(path.join(dir, 'assets'));
  await fs.writeFile(path.join(dir, 'assets', 'main.js'), 'console.log("hi")');
  return dir;
}

async function startMockBackend(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

async function exchangeRawHttp(port: number, payload: string | Buffer): Promise<Buffer> {
  const net = await import('node:net');
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: '127.0.0.1', port }, () => sock.write(payload));
    let response = Buffer.alloc(0);
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error('timeout waiting for raw HTTP response'));
    }, 3000);
    timer.unref();
    sock.on('data', (chunk) => {
      response = Buffer.concat([response, chunk]);
    });
    sock.once('end', () => {
      clearTimeout(timer);
      sock.destroy();
      resolve(response);
    });
    sock.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function resolvesWithin(promise: Promise<void>, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

describe('static-server', () => {
  let handle: StaticServerHandle | null = null;
  let stopBackend: (() => Promise<void>) | null = null;
  let staticDir = '';

  beforeEach(async () => {
    staticDir = await mkRendererFixture();
  });

  afterEach(async () => {
    if (handle) {
      await handle.stop();
      handle = null;
    }
    if (stopBackend) {
      await stopBackend();
      stopBackend = null;
    }
    await fs.rm(staticDir, { recursive: true, force: true });
  });

  it('serves static index.html at /', async () => {
    const backend = await startMockBackend((_req, res) => res.end('nope'));
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });
    const r = await fetch(`${handle.localUrl}/`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
    expect(r.headers.get('referrer-policy')).toBe('no-referrer');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('x-frame-options')).toBe('DENY');
    const text = await r.text();
    expect(text).toContain('<title>root</title>');
  });

  it('SPA fallback: /chat/123 returns index.html', async () => {
    const backend = await startMockBackend((_req, res) => res.end('nope'));
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });
    const r = await fetch(`${handle.localUrl}/chat/123`);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('<title>root</title>');
  });

  it('static asset /assets/main.js served', async () => {
    const backend = await startMockBackend((_req, res) => res.end('nope'));
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });
    const r = await fetch(`${handle.localUrl}/assets/main.js`);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('hi');
  });

  it('/api/* reverse-proxies to backend', async () => {
    const backend = await startMockBackend((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ path: req.url, method: req.method }));
    });
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });
    const r = await fetch(`${handle.localUrl}/api/anything`);
    expect(r.status).toBe(200);
    const json = (await r.json()) as { path: string };
    expect(json.path).toBe('/api/anything');
  });

  it('does not trust client-supplied forwarding headers', async () => {
    const backend = await startMockBackend((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          forwarded: req.headers.forwarded,
          xForwardedFor: req.headers['x-forwarded-for'],
          xForwardedHost: req.headers['x-forwarded-host'],
          xRealIp: req.headers['x-real-ip'],
        })
      );
    });
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });

    const response = await fetch(`${handle.localUrl}/api/anything`, {
      headers: {
        forwarded: 'for=203.0.113.10',
        'x-forwarded-for': '203.0.113.10',
        'x-forwarded-host': 'attacker.example',
        'x-real-ip': '203.0.113.10',
      },
    });

    expect(await response.json()).toEqual({ xForwardedFor: '127.0.0.1' });
  });

  it('uses one explicitly trusted reverse-proxy hop for the client address', async () => {
    const backend = await startMockBackend((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ xForwardedFor: req.headers['x-forwarded-for'], xRealIp: req.headers['x-real-ip'] }));
    });
    stopBackend = backend.close;
    handle = await startStaticServer({
      staticDir,
      backendPort: backend.port,
      port: 0,
      trustProxy: true,
    });

    const response = await fetch(`${handle.localUrl}/api/anything`, {
      headers: {
        'x-forwarded-for': '198.51.100.20, 203.0.113.11',
        'x-real-ip': '192.0.2.10',
      },
    });

    expect(await response.json()).toEqual({ xForwardedFor: '203.0.113.11' });
  });

  it.each([
    '/api/webui',
    '/api/webui/change-password',
    '/api/webui/change-username',
    '/api/webui/reset-password?source=public',
    '/api/webui/generate-qr-token',
    '/api/webui%2Freset-password',
    '/api/auth/internal',
    '/api/auth/internal/users/system',
    '/api/auth/internal/users/system/credentials?source=public',
  ])('does not expose local-control route %s', async (requestPath) => {
    let backendRequestCount = 0;
    const backend = await startMockBackend((_req, res) => {
      backendRequestCount += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ new_password: 'must-not-be-exposed' }));
    });
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });

    const r = await fetch(`${handle.localUrl}${requestPath}`, { method: 'POST' });

    expect(r.status).toBe(404);
    expect(backendRequestCount).toBe(0);
  });

  it('/login reverse-proxies to backend (no local handler)', async () => {
    const backend = await startMockBackend((req, res) => {
      if (req.url === '/login' && req.method === 'POST') {
        res.writeHead(200, {
          'content-type': 'application/json',
          'set-cookie': 'aionui-session=backend-token; Path=/; HttpOnly',
        });
        res.end(JSON.stringify({ success: true, proxied: true }));
        return;
      }
      res.writeHead(404).end();
    });
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });

    const r = await fetch(`${handle.localUrl}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'anything' }),
    });
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toMatch(/aionui-session=backend-token/);
    const json = (await r.json()) as { proxied: boolean };
    expect(json.proxied).toBe(true);
  });

  it('rejects a cross-site login before it reaches the backend', async () => {
    let backendRequestCount = 0;
    const backend = await startMockBackend((_req, res) => {
      backendRequestCount += 1;
      res.writeHead(200).end();
    });
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });

    const response = await fetch(`${handle.localUrl}/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://attacker.example',
        'sec-fetch-site': 'cross-site',
      },
      body: JSON.stringify({ username: 'admin', password: 'anything' }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'INVALID_ORIGIN' });
    expect(backendRequestCount).toBe(0);
  });

  it('allows a same-origin browser mutation', async () => {
    let backendRequestCount = 0;
    const backend = await startMockBackend((_req, res) => {
      backendRequestCount += 1;
      res.writeHead(201).end();
    });
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });

    const response = await fetch(`${handle.localUrl}/api/admin/users`, {
      method: 'POST',
      headers: { origin: handle.localUrl, 'sec-fetch-site': 'same-origin' },
    });

    expect(response.status).toBe(201);
    expect(backendRequestCount).toBe(1);
  });

  it('uses a trusted forwarded host for browser-origin validation', async () => {
    let backendRequestCount = 0;
    const backend = await startMockBackend((_req, res) => {
      backendRequestCount += 1;
      res.writeHead(201).end();
    });
    stopBackend = backend.close;
    handle = await startStaticServer({
      staticDir,
      backendPort: backend.port,
      port: 0,
      trustProxy: true,
    });

    const response = await fetch(`${handle.localUrl}/api/admin/users`, {
      method: 'POST',
      headers: {
        origin: 'https://aionui.example',
        'sec-fetch-site': 'same-origin',
        'x-forwarded-host': 'spoofed.example, aionui.example',
      },
    });

    expect(response.status).toBe(201);
    expect(backendRequestCount).toBe(1);
  });

  it('/api/auth/user reverse-proxies to backend (no local handler)', async () => {
    const backend = await startMockBackend((req, res) => {
      if (req.url === '/api/auth/user' && req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ success: true, user: { username: 'from-backend', id: 'from-backend' } }));
        return;
      }
      res.writeHead(404).end();
    });
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });

    const r = await fetch(`${handle.localUrl}/api/auth/user`);
    expect(r.status).toBe(200);
    const json = (await r.json()) as { user: { username: string } };
    expect(json.user.username).toBe('from-backend');
  });

  it('/logout reverse-proxies to backend (no local handler)', async () => {
    const backend = await startMockBackend((req, res) => {
      if (req.url === '/logout' && req.method === 'POST') {
        res.writeHead(200, {
          'content-type': 'application/json',
          'set-cookie': 'aionui-session=; Path=/; Max-Age=0',
        });
        res.end(JSON.stringify({ success: true, proxied: true }));
        return;
      }
      res.writeHead(404).end();
    });
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });

    const r = await fetch(`${handle.localUrl}/logout`, { method: 'POST' });
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toMatch(/Max-Age=0/);
  });

  it('/api proxy returns 502 when backend unreachable', async () => {
    // allocate a port then free it
    const placeholder = await startMockBackend((_req, res) => res.end());
    const freePort = placeholder.port;
    await placeholder.close();

    handle = await startStaticServer({ staticDir, backendPort: freePort, port: 0 });
    const r = await fetch(`${handle.localUrl}/api/anything`);
    expect(r.status).toBe(502);
  });

  it('rejects non-upgrade WebSocket routes before pipelined requests reach backend', async () => {
    const backendPaths: string[] = [];
    const backend = await startMockBackend((req, res) => {
      backendPaths.push(req.url ?? '');
      res.writeHead(200).end();
    });
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });

    const response = await exchangeRawHttp(
      handle.port,
      'GET /api/stt/stream HTTP/1.1\r\n' +
        `Host: 127.0.0.1:${handle.port}\r\n` +
        'Connection: keep-alive\r\n' +
        '\r\n' +
        'POST /api/webui/reset-password HTTP/1.1\r\n' +
        `Host: 127.0.0.1:${handle.port}\r\n` +
        'Content-Length: 0\r\n' +
        '\r\n'
    );

    expect(response.toString('ascii')).toMatch(/^HTTP\/1\.1 400 /);
    expect(backendPaths).toEqual([]);
  });

  it('rejects a cross-site WebSocket upgrade before it reaches the backend', async () => {
    const backendSockets = new Set<Socket>();
    let backendConnectionCount = 0;
    const net = await import('node:net');
    const backendServer = net.createServer((socket) => {
      backendConnectionCount += 1;
      backendSockets.add(socket);
      socket.once('close', () => backendSockets.delete(socket));
    });
    await new Promise<void>((resolve) => backendServer.listen(0, '127.0.0.1', () => resolve()));
    stopBackend = () => {
      for (const socket of backendSockets) socket.destroy();
      return new Promise<void>((resolve) => backendServer.close(() => resolve()));
    };
    const backendPort = (backendServer.address() as AddressInfo).port;
    handle = await startStaticServer({ staticDir, backendPort, port: 0 });

    const response = await exchangeRawHttp(
      handle.port,
      'GET /ws HTTP/1.1\r\n' +
        `Host: 127.0.0.1:${handle.port}\r\n` +
        'Origin: https://attacker.example\r\n' +
        'Sec-Fetch-Site: cross-site\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Version: 13\r\n' +
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
        '\r\n'
    );

    expect(response.toString('ascii')).toMatch(/^HTTP\/1\.1 403 /);
    expect(backendConnectionCount).toBe(0);
  });

  it('discards pipelined HTTP bytes when backend rejects a WebSocket upgrade', async () => {
    const net = await import('node:net');
    const backendSockets = new Set<Socket>();
    let backendBytes = Buffer.alloc(0);
    const backendServer = net.createServer((socket) => {
      backendSockets.add(socket);
      socket.once('close', () => backendSockets.delete(socket));
      let responded = false;
      socket.on('data', (chunk) => {
        backendBytes = Buffer.concat([backendBytes, chunk]);
        if (responded || backendBytes.indexOf('\r\n\r\n') < 0) return;
        responded = true;
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: keep-alive\r\nContent-Length: 0\r\n\r\n');
      });
    });
    await new Promise<void>((resolve) => backendServer.listen(0, '127.0.0.1', () => resolve()));
    stopBackend = () => {
      for (const socket of backendSockets) socket.destroy();
      return new Promise<void>((resolve) => backendServer.close(() => resolve()));
    };
    const backendPort = (backendServer.address() as AddressInfo).port;
    handle = await startStaticServer({ staticDir, backendPort, port: 0 });

    const response = await exchangeRawHttp(
      handle.port,
      'GET /ws HTTP/1.1\r\n' +
        `Host: 127.0.0.1:${handle.port}\r\n` +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Version: 13\r\n' +
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
        '\r\n' +
        'POST /api/auth/internal/users/system/credentials HTTP/1.1\r\n' +
        `Host: 127.0.0.1:${handle.port}\r\n` +
        'Content-Length: 0\r\n' +
        '\r\n'
    );

    expect(response.toString('ascii')).toMatch(/^HTTP\/1\.1 401 /);
    expect(backendBytes.toString('ascii')).not.toContain('/api/auth/internal');
  });

  it('holds early WebSocket data until backend accepts the upgrade', async () => {
    const net = await import('node:net');
    const earlyFrame = Buffer.from([0x81, 0x02, 0x4f, 0x4b]);
    const backendSockets = new Set<Socket>();
    let frameArrivedBeforeAcceptance = false;
    let received = Buffer.alloc(0);
    let resolveFrame: (() => void) | undefined;
    const frameReceived = new Promise<void>((resolve) => {
      resolveFrame = resolve;
    });
    const recordBytes = (chunk: Buffer): void => {
      received = Buffer.concat([received, chunk]);
      if (received.indexOf(earlyFrame) >= 0) resolveFrame?.();
    };
    const backendServer = net.createServer((socket) => {
      backendSockets.add(socket);
      socket.once('close', () => backendSockets.delete(socket));
      let requestBytes = Buffer.alloc(0);
      let accepted = false;
      socket.on('data', (chunk) => {
        if (accepted) {
          recordBytes(chunk);
          return;
        }
        requestBytes = Buffer.concat([requestBytes, chunk]);
        const headerEnd = requestBytes.indexOf('\r\n\r\n');
        if (headerEnd < 0) return;
        const pendingBeforeAcceptance = requestBytes.subarray(headerEnd + 4);
        frameArrivedBeforeAcceptance = pendingBeforeAcceptance.indexOf(earlyFrame) >= 0;
        recordBytes(pendingBeforeAcceptance);
        accepted = true;
        socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
      });
    });
    await new Promise<void>((resolve) => backendServer.listen(0, '127.0.0.1', () => resolve()));
    stopBackend = () => {
      for (const socket of backendSockets) socket.destroy();
      return new Promise<void>((resolve) => backendServer.close(() => resolve()));
    };
    const backendPort = (backendServer.address() as AddressInfo).port;
    handle = await startStaticServer({ staticDir, backendPort, port: 0 });

    const client = net.connect({ host: '127.0.0.1', port: handle.port });
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve);
      client.once('error', reject);
    });
    client.write(
      Buffer.concat([
        Buffer.from(
          'GET /ws HTTP/1.1\r\n' +
            `Host: 127.0.0.1:${handle.port}\r\n` +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            'Sec-WebSocket-Version: 13\r\n' +
            'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
            '\r\n'
        ),
        earlyFrame,
      ])
    );

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout waiting for buffered WebSocket frame')), 3000);
        frameReceived.then(() => {
          clearTimeout(timer);
          resolve();
        }, reject);
      });
    } finally {
      client.destroy();
      for (const socket of backendSockets) socket.destroy();
    }

    expect(frameArrivedBeforeAcceptance).toBe(false);
    expect(received.indexOf(earlyFrame)).toBeGreaterThanOrEqual(0);
  });

  it('relays an accepted WebSocket handshake from a raw TCP backend', async () => {
    const net = await import('node:net');
    const backendSockets = new Set<Socket>();
    let backendRequest = Buffer.alloc(0);
    const backendServer = net.createServer((socket) => {
      backendSockets.add(socket);
      socket.once('close', () => backendSockets.delete(socket));
      let responded = false;
      socket.on('data', (chunk) => {
        backendRequest = Buffer.concat([backendRequest, chunk]);
        if (responded || backendRequest.indexOf('\r\n\r\n') < 0) return;
        responded = true;
        socket.write(
          Buffer.concat([
            Buffer.from('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'),
            Buffer.from([0x81, 0x00]),
          ])
        );
        setTimeout(() => socket.end(), 50).unref();
      });
    });
    await new Promise<void>((resolve) => backendServer.listen(0, '127.0.0.1', () => resolve()));
    stopBackend = () => {
      for (const socket of backendSockets) socket.destroy();
      return new Promise<void>((resolve) => backendServer.close(() => resolve()));
    };
    const backendPort = (backendServer.address() as AddressInfo).port;
    handle = await startStaticServer({ staticDir, backendPort, port: 0 });

    const response = await exchangeRawHttp(
      handle.port,
      'GET /ws HTTP/1.1\r\n' +
        `Host: 127.0.0.1:${handle.port}\r\n` +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Version: 13\r\n' +
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
        'Forwarded: for=203.0.113.10\r\n' +
        'X-Forwarded-For: 203.0.113.10\r\n' +
        'X-Real-IP: 203.0.113.10\r\n' +
        '\r\n'
    );

    expect(response.toString('ascii')).toMatch(/^HTTP\/1\.1 101 /);
    expect(backendRequest.toString('ascii')).toMatch(/^GET \/ws HTTP\/1\.1\r\n/);
    expect(backendRequest.toString('ascii')).not.toMatch(/\r\nforwarded:/i);
    expect(backendRequest.toString('ascii')).toMatch(/\r\nx-forwarded-for: 127\.0\.0\.1\r\n/i);
    expect(backendRequest.toString('ascii').match(/\r\nx-forwarded-for:/gi)).toHaveLength(1);
    expect(backendRequest.toString('ascii')).not.toMatch(/\r\nx-real-ip:/i);
  });

  it('/ws WebSocket upgrade is spliced to backend and 101 is relayed', async () => {
    // Mock backend that accepts any WebSocket upgrade and replies with 101.
    // We don't run a real ws protocol — just verify the upgrade response makes
    // it back through the TCP-splice proxy. This is the exact regression path
    // that bun 1.3's http-compat upgrade handler broke.
    const { createHash } = await import('node:crypto');
    const net = await import('node:net');
    const httpMod = await import('node:http');
    const backendServer = httpMod.createServer();
    backendServer.on('upgrade', (req, socket) => {
      const wsKey = (req.headers['sec-websocket-key'] as string) || '';
      const accept = createHash('sha1')
        .update(wsKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');
      socket.write('HTTP/1.1 101 Switching Protocols\r\n');
      socket.write('Upgrade: websocket\r\n');
      socket.write('Connection: Upgrade\r\n');
      socket.write(`Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
      // Send a single 0-length WS text frame as a liveness marker then close.
      socket.write(Buffer.from([0x81, 0x00]));
      socket.end();
    });
    await new Promise<void>((r) => backendServer.listen(0, '127.0.0.1', () => r()));
    stopBackend = () => new Promise<void>((r) => backendServer.close(() => r()));
    const backendPort = (backendServer.address() as { port: number }).port;

    handle = await startStaticServer({ staticDir, backendPort, port: 0 });

    // Speak raw HTTP/1.1 upgrade over a TCP socket against the public listener.
    const { port: publicPort } = handle;
    const status: string = await new Promise((resolve, reject) => {
      const sock = net.connect({ host: '127.0.0.1', port: publicPort }, () => {
        sock.write(
          'GET /ws HTTP/1.1\r\n' +
            `Host: 127.0.0.1:${publicPort}\r\n` +
            `Origin: http://127.0.0.1:${publicPort}\r\n` +
            'Sec-Fetch-Site: same-origin\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            'Sec-WebSocket-Version: 13\r\n' +
            'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
            '\r\n'
        );
      });
      let buf = Buffer.alloc(0);
      sock.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        const headEnd = buf.indexOf('\r\n\r\n');
        if (headEnd >= 0) {
          const firstLine = buf.slice(0, buf.indexOf(0x0a)).toString('ascii');
          sock.destroy();
          resolve(firstLine.trim());
        }
      });
      sock.on('error', reject);
      setTimeout(() => {
        sock.destroy();
        reject(new Error('timeout waiting for 101'));
      }, 3000).unref();
    });
    expect(status).toMatch(/HTTP\/1\.1 101/i);
  });

  it('/api/stt/stream WebSocket upgrade is spliced to backend and 101 is relayed', async () => {
    // Same as /ws test but for STT streaming endpoint.
    const { createHash } = await import('node:crypto');
    const net = await import('node:net');
    const httpMod = await import('node:http');
    const backendServer = httpMod.createServer();
    backendServer.on('upgrade', (req, socket) => {
      const wsKey = (req.headers['sec-websocket-key'] as string) || '';
      const accept = createHash('sha1')
        .update(wsKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');
      socket.write('HTTP/1.1 101 Switching Protocols\r\n');
      socket.write('Upgrade: websocket\r\n');
      socket.write('Connection: Upgrade\r\n');
      socket.write(`Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
      socket.write(Buffer.from([0x81, 0x00]));
      socket.end();
    });
    await new Promise<void>((r) => backendServer.listen(0, '127.0.0.1', () => r()));
    stopBackend = () => new Promise<void>((r) => backendServer.close(() => r()));
    const backendPort = (backendServer.address() as { port: number }).port;

    handle = await startStaticServer({ staticDir, backendPort, port: 0 });

    const { port: publicPort } = handle;
    const status: string = await new Promise((resolve, reject) => {
      const sock = net.connect({ host: '127.0.0.1', port: publicPort }, () => {
        sock.write(
          'GET /api/stt/stream HTTP/1.1\r\n' +
            `Host: 127.0.0.1:${publicPort}\r\n` +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            'Sec-WebSocket-Version: 13\r\n' +
            'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
            '\r\n'
        );
      });
      let buf = Buffer.alloc(0);
      sock.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        const headEnd = buf.indexOf('\r\n\r\n');
        if (headEnd >= 0) {
          const firstLine = buf.slice(0, buf.indexOf(0x0a)).toString('ascii');
          sock.destroy();
          resolve(firstLine.trim());
        }
      });
      sock.on('error', reject);
      setTimeout(() => {
        sock.destroy();
        reject(new Error('timeout waiting for 101'));
      }, 3000).unref();
    });
    expect(status).toMatch(/HTTP\/1\.1 101/i);
  });

  it('/api/stt/stream with query params is spliced to backend', async () => {
    const { createHash } = await import('node:crypto');
    const net = await import('node:net');
    const httpMod = await import('node:http');
    const backendServer = httpMod.createServer();
    backendServer.on('upgrade', (req, socket) => {
      const wsKey = (req.headers['sec-websocket-key'] as string) || '';
      const accept = createHash('sha1')
        .update(wsKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');
      socket.write('HTTP/1.1 101 Switching Protocols\r\n');
      socket.write('Upgrade: websocket\r\n');
      socket.write('Connection: Upgrade\r\n');
      socket.write(`Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
      socket.write(Buffer.from([0x81, 0x00]));
      socket.end();
    });
    await new Promise<void>((r) => backendServer.listen(0, '127.0.0.1', () => r()));
    stopBackend = () => new Promise<void>((r) => backendServer.close(() => r()));
    const backendPort = (backendServer.address() as { port: number }).port;

    handle = await startStaticServer({ staticDir, backendPort, port: 0 });

    const { port: publicPort } = handle;
    const status: string = await new Promise((resolve, reject) => {
      const sock = net.connect({ host: '127.0.0.1', port: publicPort }, () => {
        sock.write(
          'GET /api/stt/stream?lang=en&model=default HTTP/1.1\r\n' +
            `Host: 127.0.0.1:${publicPort}\r\n` +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            'Sec-WebSocket-Version: 13\r\n' +
            'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
            '\r\n'
        );
      });
      let buf = Buffer.alloc(0);
      sock.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        const headEnd = buf.indexOf('\r\n\r\n');
        if (headEnd >= 0) {
          const firstLine = buf.slice(0, buf.indexOf(0x0a)).toString('ascii');
          sock.destroy();
          resolve(firstLine.trim());
        }
      });
      sock.on('error', reject);
      setTimeout(() => {
        sock.destroy();
        reject(new Error('timeout waiting for 101'));
      }, 3000).unref();
    });
    expect(status).toMatch(/HTTP\/1\.1 101/i);
  });

  it('times out an incomplete first request header block', async () => {
    let backendRequestCount = 0;
    const backend = await startMockBackend((_req, res) => {
      backendRequestCount += 1;
      res.end('unexpected');
    });
    stopBackend = backend.close;
    handle = await startStaticServer({
      staticDir,
      backendPort: backend.port,
      port: 0,
      requestHeaderTimeoutMs: 50,
    });

    const response = await exchangeRawHttp(
      handle.port,
      'GET /ws HTTP/1.1\r\n' +
        `Host: 127.0.0.1:${handle.port}\r\n` +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n'
    );

    expect(response.toString('ascii')).toMatch(/^HTTP\/1\.1 408 /);
    expect(backendRequestCount).toBe(0);
  });

  it('stops promptly with an active HTTP keep-alive connection', async () => {
    const net = await import('node:net');
    const backend = await startMockBackend((_req, res) => {
      res.writeHead(200, { connection: 'keep-alive', 'content-type': 'text/plain' });
      res.end('ok');
    });
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });

    const client = net.connect({ host: '127.0.0.1', port: handle.port });
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve);
      client.once('error', reject);
    });
    client.write(`GET /api/anything HTTP/1.1\r\nHost: 127.0.0.1:${handle.port}\r\nConnection: keep-alive\r\n\r\n`);
    await new Promise<void>((resolve, reject) => {
      client.once('data', () => resolve());
      client.once('error', reject);
    });
    const clientClosed = new Promise<void>((resolve) => client.once('close', () => resolve()));

    expect(await resolvesWithin(handle.stop(), 1000)).toBe(true);
    await clientClosed;
  });

  it('stops promptly with an active WebSocket tunnel', async () => {
    const net = await import('node:net');
    const backendSockets = new Set<Socket>();
    const backendServer = net.createServer((socket) => {
      backendSockets.add(socket);
      socket.once('close', () => backendSockets.delete(socket));
      let request = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        request = Buffer.concat([request, chunk]);
        if (request.indexOf('\r\n\r\n') < 0) return;
        socket.removeAllListeners('data');
        socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
      });
    });
    await new Promise<void>((resolve) => backendServer.listen(0, '127.0.0.1', () => resolve()));
    stopBackend = () => {
      for (const socket of backendSockets) socket.destroy();
      return new Promise<void>((resolve) => backendServer.close(() => resolve()));
    };
    const backendPort = (backendServer.address() as AddressInfo).port;
    handle = await startStaticServer({ staticDir, backendPort, port: 0 });

    const client = net.connect({ host: '127.0.0.1', port: handle.port });
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve);
      client.once('error', reject);
    });
    const upgraded = new Promise<void>((resolve, reject) => {
      let response = Buffer.alloc(0);
      client.on('data', (chunk) => {
        response = Buffer.concat([response, chunk]);
        if (response.indexOf('\r\n\r\n') >= 0) resolve();
      });
      client.once('error', reject);
    });
    client.write(
      'GET /ws HTTP/1.1\r\n' +
        `Host: 127.0.0.1:${handle.port}\r\n` +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Version: 13\r\n' +
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
        '\r\n'
    );
    await upgraded;
    const clientClosed = new Promise<void>((resolve) => client.once('close', () => resolve()));

    expect(await resolvesWithin(handle.stop(), 1000)).toBe(true);
    await clientClosed;
  });

  it('network URL populated only when allowRemote=true', async () => {
    const backend = await startMockBackend((_req, res) => res.end('nope'));
    stopBackend = backend.close;
    const h1 = await startStaticServer({
      staticDir,
      backendPort: backend.port,
      port: 0,
      allowRemote: false,
    });
    expect(h1.networkUrl).toBeUndefined();
    await h1.stop();

    const h2 = await startStaticServer({
      staticDir,
      backendPort: backend.port,
      port: 0,
      allowRemote: true,
    });
    // may still be undefined on CI machines without a LAN interface
    expect(typeof h2.networkUrl === 'string' || h2.networkUrl === undefined).toBe(true);
    await h2.stop();
  });
});
