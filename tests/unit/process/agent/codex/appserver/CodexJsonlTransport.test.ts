import { PassThrough } from 'stream';
import { describe, expect, it } from 'vitest';
import { CodexJsonlTransport } from '@/process/agent/codex/appserver/CodexJsonlTransport';

describe('CodexJsonlTransport', () => {
  it('parses split JSONL messages and writes JSONL requests', async () => {
    const stdout = new PassThrough();
    const stdin = new PassThrough();
    const writes: string[] = [];
    stdin.on('data', (chunk) => writes.push(String(chunk)));

    const transport = new CodexJsonlTransport({ stdout, stdin });
    const messages: unknown[] = [];
    transport.onMessage((message) => messages.push(message));

    stdout.write('{"jsonrpc":"2.0","method":"turn/started","params":');
    stdout.write('{"threadId":"thread-1","turnId":"turn-1"}}\n');
    transport.write({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });

    await new Promise((resolve) => setImmediate(resolve));

    expect(messages).toEqual([
      {
        jsonrpc: '2.0',
        method: 'turn/started',
        params: { threadId: 'thread-1', turnId: 'turn-1' },
      },
    ]);
    expect(writes.join('')).toBe('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n');

    transport.dispose();
  });
});
