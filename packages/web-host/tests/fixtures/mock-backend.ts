import http from 'node:http';
import type { AddressInfo } from 'node:net';

export type MockBackend = {
  port: number;
  received: Array<{ method: string; url: string; headers: http.IncomingHttpHeaders; body: Buffer }>;
  close: () => Promise<void>;
};

/**
 * Unified mock backend used by equivalence.test.ts to stand in for
 * aioncore. Responds with canned answers for known endpoints and
 * captures every request for post-hoc assertions.
 */
export async function startMockBackend(): Promise<MockBackend> {
  const received: MockBackend['received'] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      received.push({
        method: req.method ?? 'GET',
        url: req.url ?? '',
        headers: req.headers,
        body,
      });
      if (req.url === '/api/ping') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ pong: true }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ received: true }));
    });
  });
  // upgrade handler for /ws
  server.on('upgrade', (req, socket) => {
    if (req.url?.startsWith('/ws')) {
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          'Sec-WebSocket-Accept: test\r\n\r\n'
      );
    } else {
      socket.destroy();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    received,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
