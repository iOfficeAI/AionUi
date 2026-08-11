/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import * as net from 'node:net';

import { createTcpMessageReader, sendTcpRequest } from '../../src/process/team/mcp/tcpHelpers';

function buildFrame(data: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(data), 'utf-8');
  const frame = Buffer.allocUnsafe(4 + body.length);
  frame.writeUInt32BE(body.length, 0);
  body.copy(frame, 4);
  return frame;
}

async function listen(server: net.Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected TCP server to listen on an ephemeral port');
  }

  return address.port;
}

async function closeServer(server: net.Server): Promise<void> {
  const closeAllConnections = (server as net.Server & { closeAllConnections?: () => void }).closeAllConnections;
  if (closeAllConnections) {
    closeAllConnections.call(server);
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

describe('tcpHelpers', () => {
  const servers = new Set<net.Server>();

  afterEach(async () => {
    await Promise.all(
      Array.from(servers, async (server) => {
        servers.delete(server);
        if (!server.listening) return;
        await closeServer(server);
      })
    );
  });

  it('createTcpMessageReader handles a length header split across two chunks', () => {
    const received: unknown[] = [];
    const reader = createTcpMessageReader((msg) => received.push(msg));
    const frame = buildFrame({ hello: 'world' });

    reader(frame.subarray(0, 2));
    expect(received).toHaveLength(0);

    reader(frame.subarray(2));
    expect(received).toEqual([{ hello: 'world' }]);
  });

  it('createTcpMessageReader preserves trailing bytes when a frame ends mid-chunk', () => {
    const received: unknown[] = [];
    const reader = createTcpMessageReader((msg) => received.push(msg));
    const first = buildFrame({ index: 1, payload: 'first-message' });
    const second = buildFrame({ index: 2, payload: 'second-message' });
    const splitAt = 10;

    reader(first.subarray(0, splitAt));
    expect(received).toHaveLength(0);

    reader(Buffer.concat([first.subarray(splitAt), second]));
    expect(received).toEqual([
      { index: 1, payload: 'first-message' },
      { index: 2, payload: 'second-message' },
    ]);
  });

  it('sendTcpRequest rejects when the TCP peer ends before sending a response', async () => {
    const server = net.createServer((socket) => {
      socket.once('data', () => {
        socket.end();
      });
    });
    servers.add(server);

    const port = await listen(server);

    await expect(sendTcpRequest(port, { ping: true }, { timeoutMs: 1000 })).rejects.toThrow(
      'TCP connection ended before response'
    );
  });
});
