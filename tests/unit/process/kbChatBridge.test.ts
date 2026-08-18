/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import { sendKbChat, abortKbChat, _resetForTest } from '@/process/bridge/kbChatBridge';

let emitted: Array<{ name: string; payload: unknown }> = [];

vi.mock('@/common', () => ({
  ipcBridge: {
    kbChat: {
      streamChunk: { emit: (p: unknown) => emitted.push({ name: 'streamChunk', payload: p }) },
      streamEnd: { emit: (p: unknown) => emitted.push({ name: 'streamEnd', payload: p }) },
      streamError: { emit: (p: unknown) => emitted.push({ name: 'streamError', payload: p }) },
      send: { provider: (handler: unknown) => handler },
      abort: { provider: (handler: unknown) => handler },
    },
  },
}));

const startMockServer = (handler: http.RequestListener): Promise<{ url: string; close: () => Promise<void> }> =>
  new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${port}/`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });

let originalUrl: string | undefined;

beforeEach(() => {
  emitted.length = 0;
  originalUrl = process.env.KB_CHAT_SSE_URL;
});

afterEach(() => {
  _resetForTest();
  if (originalUrl === undefined) delete process.env.KB_CHAT_SSE_URL;
  else process.env.KB_CHAT_SSE_URL = originalUrl;
});

describe('sendKbChat', () => {
  it('forwards delta events from the upstream SSE stream', async () => {
    const server = await startMockServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"type":"delta","content":"hello"}\n\n');
      res.write('data: {"type":"delta","content":" world"}\n\n');
      res.write('data: {"type":"done"}\n\n');
      res.end();
    });
    process.env.KB_CHAT_SSE_URL = server.url;

    const sendResult = await sendKbChat({ requestId: 'r1', kbId: 'k1', question: 'q', token: 't' });
    expect(sendResult).toEqual({ requestId: 'r1', ok: true });

    await new Promise((r) => setTimeout(r, 50));

    expect(emitted.map((e) => e.name)).toEqual(['streamChunk', 'streamChunk', 'streamEnd']);
    expect(emitted[0].payload).toEqual({ requestId: 'r1', content: 'hello' });
    expect(emitted[1].payload).toEqual({ requestId: 'r1', content: ' world' });
    expect(emitted[2].payload).toEqual({ requestId: 'r1', reason: 'done' });

    await server.close();
  });

  it('emits streamError on HTTP non-2xx', async () => {
    const server = await startMockServer((_req, res) => {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('upstream down');
    });
    process.env.KB_CHAT_SSE_URL = server.url;

    const result = await sendKbChat({ requestId: 'r2', kbId: 'k1', question: 'q', token: 't' });
    expect(result).toEqual({ requestId: 'r2', ok: true });

    await new Promise((r) => setTimeout(r, 50));

    expect(emitted.some((e) => e.name === 'streamError' && (e.payload as { code: string }).code === 'http')).toBe(true);
    expect(emitted.some((e) => e.name === 'streamEnd')).toBe(true);

    await server.close();
  });

  it('emits parse error and continues on malformed JSON', async () => {
    const server = await startMockServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {not json}\n\n');
      res.write('data: {"type":"delta","content":"ok"}\n\n');
      res.write('data: {"type":"done"}\n\n');
      res.end();
    });
    process.env.KB_CHAT_SSE_URL = server.url;

    await sendKbChat({ requestId: 'r3', kbId: 'k1', question: 'q', token: 't' });

    await new Promise((r) => setTimeout(r, 50));

    expect(emitted.some((e) => e.name === 'streamError' && (e.payload as { code: string }).code === 'parse')).toBe(
      true
    );
    expect(emitted.some((e) => e.name === 'streamChunk' && (e.payload as { content: string }).content === 'ok')).toBe(
      true
    );
    expect(emitted.some((e) => e.name === 'streamEnd' && (e.payload as { reason: string }).reason === 'done')).toBe(
      true
    );

    await server.close();
  });

  it('emits incomplete error when stream ends without done event', async () => {
    const server = await startMockServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"type":"delta","content":"half"}\n\n');
      res.end();
    });
    process.env.KB_CHAT_SSE_URL = server.url;

    await sendKbChat({ requestId: 'r4', kbId: 'k1', question: 'q', token: 't' });

    await new Promise((r) => setTimeout(r, 50));

    expect(emitted.some((e) => e.name === 'streamError' && (e.payload as { code: string }).code === 'incomplete')).toBe(
      true
    );
    expect(emitted.some((e) => e.name === 'streamEnd' && (e.payload as { reason: string }).reason === 'error')).toBe(
      true
    );

    await server.close();
  });

  it('rejects send when required fields are missing', async () => {
    const result = await sendKbChat({ requestId: '', kbId: 'k1', question: 'q', token: 't' });
    expect(result.ok).toBe(false);
    expect(emitted).toHaveLength(0);
  });
});

describe('abortKbChat', () => {
  it('destroys the upstream request and emits aborted', async () => {
    let aborted = false;
    const server = await startMockServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      req.on('close', () => {
        aborted = true;
      });
      // never end the stream
    });
    process.env.KB_CHAT_SSE_URL = server.url;

    await sendKbChat({ requestId: 'r5', kbId: 'k1', question: 'q', token: 't' });
    await new Promise((r) => setTimeout(r, 30));

    await abortKbChat({ requestId: 'r5' });
    await new Promise((r) => setTimeout(r, 30));

    expect(aborted).toBe(true);
    expect(emitted.some((e) => e.name === 'streamEnd' && (e.payload as { reason: string }).reason === 'aborted')).toBe(
      true
    );

    await server.close();
  });

  it('no-ops when requestId is unknown', async () => {
    const result = await abortKbChat({ requestId: 'nonexistent' });
    expect(result).toEqual({ ok: true });
  });
});
