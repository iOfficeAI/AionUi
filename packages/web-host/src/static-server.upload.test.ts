import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { startStaticServer, type StaticServerHandle } from './static-server.js';

async function mkRendererFixture(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-upload-'));
  await fs.writeFile(path.join(dir, 'index.html'), '<!doctype html><title>root</title>');
  return dir;
}

/** Backend that drains the request body and reports how many bytes it actually saw. */
async function startEchoLengthBackend(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    let received = 0;
    req.on('data', (c: Buffer) => {
      received += c.length;
    });
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ received }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  return {
    port: (server.address() as AddressInfo).port,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

/**
 * Sends an /api POST whose head and body are handed to the kernel in a single write.
 * This mirrors a fronting reverse proxy flushing a buffered upload downstream, which is
 * what makes the splice race fire in practice.
 */
function postInOneWrite(port: number, bodyBytes: number, timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    const body = Buffer.alloc(bodyBytes, 0x61);
    const head = Buffer.from(
      `POST /api/fs/upload HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/octet-stream\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`
    );
    const sock = net.connect({ host: '127.0.0.1', port });
    let out = '';
    const done = (v: string): void => {
      sock.destroy();
      resolve(v);
    };
    const timer = setTimeout(() => done('TIMEOUT'), timeoutMs);
    sock.on('connect', () => sock.write(Buffer.concat([head, body])));
    sock.on('data', (c: Buffer) => {
      out += c.toString('latin1');
      if (out.includes('\r\n\r\n')) {
        clearTimeout(timer);
        done(out);
      }
    });
    sock.on('error', () => {
      clearTimeout(timer);
      done('ERROR');
    });
  });
}

describe('static-server upload splice', () => {
  let handle: StaticServerHandle | null = null;
  let stopBackend: (() => Promise<void>) | null = null;
  let staticDir = '';

  beforeEach(async () => {
    staticDir = await mkRendererFixture();
  });

  afterEach(async () => {
    if (handle) await handle.stop();
    handle = null;
    if (stopBackend) await stopBackend();
    stopBackend = null;
    await fs.rm(staticDir, { recursive: true, force: true });
  });

  it('does not drop body bytes when head and body arrive in one burst', async () => {
    const backend = await startEchoLengthBackend();
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });

    const BODY = 512 * 1024;
    const ATTEMPTS = 15;
    const results: string[] = [];
    for (let i = 0; i < ATTEMPTS; i++) {
      results.push(await postInOneWrite(handle.port, BODY, 3000));
    }

    const hung = results.filter((r) => !r.startsWith('HTTP/1.1 200'));
    const truncated = results.filter((r) => r.startsWith('HTTP/1.1 200') && !r.includes(`"received":${BODY}`));

    expect(
      { hung: hung.length, truncated: truncated.length },
      `sample: ${results.find((r) => !r.startsWith('HTTP/1.1 200')) ?? results[0]?.slice(0, 120)}`
    ).toEqual({ hung: 0, truncated: 0 });
  }, 60000);
});
