import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CodexAppServerClient } from '@/process/agent/codex/appserver/CodexAppServerClient';
import type { CodexJsonRpcOutgoing } from '@/process/agent/codex/appserver/types';

type FakeChildProcess = EventEmitter & {
  stdout: PassThrough;
  stdin: PassThrough;
  stderr: PassThrough;
  killed: boolean;
  pid: number;
  kill: ReturnType<typeof vi.fn>;
};

const spawnMock = vi.hoisted(() => vi.fn());
const defaultInitializeParams = {
  clientInfo: { name: 'codex_cli_rs', title: 'AionUi', version: 'unknown' },
};

vi.mock('child_process', () => ({
  spawn: spawnMock,
}));

function createFakeChild(pid: number): FakeChildProcess {
  const child = new EventEmitter() as FakeChildProcess;
  child.stdout = new PassThrough();
  child.stdin = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.pid = pid;
  child.kill = vi.fn(() => {
    child.killed = true;
    return true;
  });
  return child;
}

function collectClientMessages(child: FakeChildProcess, order?: string[]): CodexJsonRpcOutgoing[] {
  const messages: CodexJsonRpcOutgoing[] = [];
  child.stdin.on('data', (chunk) => {
    for (const line of String(chunk).split('\n')) {
      if (!line.trim()) continue;
      const message = JSON.parse(line) as CodexJsonRpcOutgoing;
      messages.push(message);
      if ('method' in message) {
        order?.push(`${message.method}:write`);
      }
    }
  });
  return messages;
}

function sendServerMessage(child: FakeChildProcess, message: unknown): void {
  child.stdout.write(`${JSON.stringify(message)}\n`);
}

async function nextTick(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('CodexAppServerClient', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('starts the fake app-server, completes initialization handshake, sends requests, and receives notifications', async () => {
    const child = createFakeChild(1001);
    spawnMock.mockReturnValueOnce(child);
    const clientMessages = collectClientMessages(child);
    const client = new CodexAppServerClient({
      command: 'codex',
      args: ['app-server'],
      cwd: process.cwd(),
    });
    const notifications: string[] = [];
    const receivedTurnCompleted = new Promise<void>((resolve) => {
      client.onNotification((message) => {
        notifications.push(message.method);
        if (message.method === 'turn/completed') {
          resolve();
        }
      });
    });

    try {
      const startPromise = client.start();
      await nextTick();
      sendServerMessage(child, {
        jsonrpc: '2.0',
        id: 1,
        result: { serverInfo: { name: 'fake-codex-app-server', version: '0.0.0-test' } },
      });
      await startPromise;
      expect(clientMessages).toEqual([
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: defaultInitializeParams },
        { jsonrpc: '2.0', method: 'initialized', params: {} },
      ]);

      const threadPromise = client.request<{ thread: { id: string } }>('thread/start', { cwd: process.cwd() });
      await nextTick();
      sendServerMessage(child, { jsonrpc: '2.0', id: 2, result: { thread: { id: 'thread-1' } } });
      const thread = await threadPromise;

      const turnPromise = client.request<{ turn: { id: string } }>('turn/start', {
        threadId: thread.thread.id,
        input: [{ type: 'text', text: 'hello' }],
      });
      await nextTick();
      sendServerMessage(child, { jsonrpc: '2.0', id: 3, result: { turn: { id: 'turn-1' } } });
      sendServerMessage(child, {
        jsonrpc: '2.0',
        method: 'turn/started',
        params: { threadId: 'thread-1', turnId: 'turn-1' },
      });
      sendServerMessage(child, {
        jsonrpc: '2.0',
        method: 'item/agentMessage/delta',
        params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'msg-1', delta: 'hello' },
      });
      sendServerMessage(child, {
        jsonrpc: '2.0',
        method: 'turn/completed',
        params: { threadId: 'thread-1', turn: { id: 'turn-1' } },
      });
      const turn = await turnPromise;
      await receivedTurnCompleted;

      expect(thread.thread.id).toBe('thread-1');
      expect(turn.turn.id).toBe('turn-1');
      expect(notifications).toEqual(['turn/started', 'item/agentMessage/delta', 'turn/completed']);
    } finally {
      await client.dispose();
    }
  });

  it('responds to unsupported server requests with a JSON-RPC error', async () => {
    const child = createFakeChild(1002);
    spawnMock.mockReturnValueOnce(child);
    const clientMessages = collectClientMessages(child);
    const client = new CodexAppServerClient({
      command: 'codex',
      args: ['app-server'],
      cwd: process.cwd(),
    });

    try {
      const startPromise = client.start();
      await nextTick();
      sendServerMessage(child, {
        jsonrpc: '2.0',
        id: 1,
        result: { serverInfo: { name: 'fake-codex-app-server', version: '0.0.0-test' } },
      });
      await startPromise;

      const resultPromise = client.request<{ ok: boolean; response: { error?: { code: number; message: string } } }>(
        'server/request/unsupported'
      );
      await nextTick();
      sendServerMessage(child, { jsonrpc: '2.0', id: 'server-request-1', method: 'client/unknown', params: {} });
      await nextTick();
      const serverResponse = clientMessages.find((message) => message.id === 'server-request-1');
      sendServerMessage(child, { jsonrpc: '2.0', id: 2, result: { ok: true, response: serverResponse } });
      const result = await resultPromise;

      expect(result.ok).toBe(true);
      expect(result.response.error).toEqual(expect.objectContaining({ code: -32601 }));
    } finally {
      await client.dispose();
    }
  });

  it('shares one initialization handshake across concurrent start callers and resolves them after initialized is sent', async () => {
    const child = createFakeChild(1003);
    spawnMock.mockReturnValueOnce(child);
    const order: string[] = [];
    const clientMessages = collectClientMessages(child, order);
    const client = new CodexAppServerClient({
      command: 'codex',
      args: ['app-server'],
      cwd: process.cwd(),
    });

    try {
      const firstStart = client.start().then(() => order.push('first:resolved'));
      await nextTick();

      let secondResolved = false;
      const secondStart = client.start().then(() => {
        secondResolved = true;
        order.push('second:resolved');
      });
      await nextTick();

      expect(secondResolved).toBe(false);
      expect(clientMessages.filter((message) => 'method' in message && message.method === 'initialize')).toHaveLength(
        1
      );

      sendServerMessage(child, {
        jsonrpc: '2.0',
        id: 1,
        result: { serverInfo: { name: 'fake-codex-app-server', version: '0.0.0-test' } },
      });
      await Promise.all([firstStart, secondStart]);

      expect(clientMessages.filter((message) => 'method' in message && message.method === 'initialized')).toHaveLength(
        1
      );
      expect(order).toEqual(['initialize:write', 'initialized:write', 'first:resolved', 'second:resolved']);
    } finally {
      await client.dispose();
    }
  });

  it('clears the dead child and transport after exit so a later start can spawn again', async () => {
    const firstChild = createFakeChild(1004);
    const secondChild = createFakeChild(1005);
    spawnMock.mockReturnValueOnce(firstChild).mockReturnValueOnce(secondChild);
    collectClientMessages(firstChild);
    const secondMessages = collectClientMessages(secondChild);
    const client = new CodexAppServerClient({
      command: 'codex',
      args: ['app-server'],
      cwd: process.cwd(),
    });

    try {
      const firstStart = client.start();
      await nextTick();
      sendServerMessage(firstChild, {
        jsonrpc: '2.0',
        id: 1,
        result: { serverInfo: { name: 'fake-codex-app-server', version: '0.0.0-test' } },
      });
      await firstStart;

      firstChild.emit('exit', 1, null);
      await nextTick();

      const secondStart = client.start();
      await nextTick();
      sendServerMessage(secondChild, {
        jsonrpc: '2.0',
        id: 2,
        result: { serverInfo: { name: 'fake-codex-app-server', version: '0.0.0-test' } },
      });
      await secondStart;

      expect(spawnMock).toHaveBeenCalledTimes(2);
      expect(client.pid).toBe(1005);
      expect(secondMessages).toContainEqual({
        jsonrpc: '2.0',
        id: 2,
        method: 'initialize',
        params: defaultInitializeParams,
      });
    } finally {
      await client.dispose();
    }
  });

  it('clears the stale transport after transport errors so a later start can spawn again', async () => {
    const firstChild = createFakeChild(1006);
    const secondChild = createFakeChild(1007);
    spawnMock.mockReturnValueOnce(firstChild).mockReturnValueOnce(secondChild);
    collectClientMessages(firstChild);
    const secondMessages = collectClientMessages(secondChild);
    const client = new CodexAppServerClient({
      command: 'codex',
      args: ['app-server'],
      cwd: process.cwd(),
    });

    try {
      const firstStart = client.start();
      await nextTick();
      sendServerMessage(firstChild, {
        jsonrpc: '2.0',
        id: 1,
        result: { serverInfo: { name: 'fake-codex-app-server', version: '0.0.0-test' } },
      });
      await firstStart;

      firstChild.stdout.emit('error', new Error('stdout failed'));
      await nextTick();

      const secondStart = client.start();
      await nextTick();
      sendServerMessage(secondChild, {
        jsonrpc: '2.0',
        id: 2,
        result: { serverInfo: { name: 'fake-codex-app-server', version: '0.0.0-test' } },
      });
      await secondStart;

      expect(spawnMock).toHaveBeenCalledTimes(2);
      expect(client.pid).toBe(1007);
      expect(secondMessages).toContainEqual({
        jsonrpc: '2.0',
        id: 2,
        method: 'initialize',
        params: defaultInitializeParams,
      });
    } finally {
      await client.dispose();
    }
  });

  it('notifies failure listeners when the app-server exits', async () => {
    const child = createFakeChild(1008);
    spawnMock.mockReturnValueOnce(child);
    collectClientMessages(child);
    const client = new CodexAppServerClient({
      command: 'codex',
      args: ['app-server'],
      cwd: process.cwd(),
    });
    const failures: string[] = [];
    const unsubscribe = client.onFailure((error) => failures.push(error.message));

    try {
      const startPromise = client.start();
      await nextTick();
      sendServerMessage(child, {
        jsonrpc: '2.0',
        id: 1,
        result: { serverInfo: { name: 'fake-codex-app-server', version: '0.0.0-test' } },
      });
      await startPromise;

      const pendingRequest = client.request('thread/start', { cwd: process.cwd() });
      await nextTick();
      child.emit('exit', 1, null);

      await expect(pendingRequest).rejects.toThrow('Codex app-server exited with code 1 and signal null');
      expect(failures).toEqual(['Codex app-server exited with code 1 and signal null']);
    } finally {
      unsubscribe();
      await client.dispose();
    }
  });

  it('explains macOS SIGKILL app-server exits', async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    const child = createFakeChild(1009);
    spawnMock.mockReturnValueOnce(child);
    collectClientMessages(child);
    const client = new CodexAppServerClient({
      command: '/opt/codex/bin/codex',
      args: ['app-server'],
      cwd: process.cwd(),
    });

    try {
      const startPromise = client.start();
      await nextTick();
      sendServerMessage(child, {
        jsonrpc: '2.0',
        id: 1,
        result: { serverInfo: { name: 'fake-codex-app-server', version: '0.0.0-test' } },
      });
      await startPromise;

      const pendingRequest = client.request('thread/start', { cwd: process.cwd() });
      await nextTick();
      child.emit('exit', null, 'SIGKILL');

      await expect(pendingRequest).rejects.toThrow('macOS blocked or killed the Codex CLI binary');
    } finally {
      await client.dispose();
      if (platformDescriptor) {
        Object.defineProperty(process, 'platform', platformDescriptor);
      }
    }
  });
});
