/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import type { Server, Socket } from 'node:net';

// Mock electron
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    setName: vi.fn(),
    setPath: vi.fn(),
    getPath: vi.fn((name: string) => (name === 'appData' ? '/tmp' : '/tmp')),
  },
}));

// Mock net module - callbacks fire synchronously for predictable test timing
const mockSockets: Socket[] = [];

vi.mock('node:net', () => {
  const createMockServer = (): Server => {
    const server = new EventEmitter() as Server;
    server.listen = vi.fn((_port: number, _host: string, callback?: () => void) => {
      if (callback) callback();
      return server;
    });
    server.address = vi.fn(() => ({ port: 5000, family: 'IPv4', address: '127.0.0.1' }));
    server.close = vi.fn((callback?: (err?: Error) => void) => {
      if (callback) callback();
      return server;
    });
    return server;
  };

  const createMockSocket = (): Socket => {
    const socket = new EventEmitter() as Socket;
    socket.destroy = vi.fn();
    mockSockets.push(socket);
    return socket;
  };

  return {
    default: {
      createServer: vi.fn(createMockServer),
      connect: vi.fn(createMockSocket),
    },
    createServer: vi.fn(createMockServer),
    connect: vi.fn(createMockSocket),
  };
});

// Mock child_process
vi.mock('node:child_process', () => {
  return {
    spawn: vi.fn(() => {
      const child = new EventEmitter() as ChildProcess;
      child.kill = vi.fn();
      child.stdout = new EventEmitter() as any;
      child.stderr = new EventEmitter() as any;
      return child;
    }),
  };
});

// Mock shellEnv
vi.mock('@process/utils/shellEnv', () => ({
  getEnhancedEnv: vi.fn(() => ({ PATH: '/usr/bin' })),
}));

// Mock ipcBridge
const handlers: Record<string, (...args: any[]) => any> = {};
function makeChannel(name: string) {
  return {
    provider: vi.fn((fn: (...args: any[]) => any) => {
      handlers[name] = fn;
    }),
    emit: vi.fn(),
    invoke: vi.fn(),
  };
}

vi.mock('@/common', () => ({
  ipcBridge: {
    pptPreview: {
      start: makeChannel('start'),
      stop: makeChannel('stop'),
      status: makeChannel('status'),
    },
  },
}));

import { spawn } from 'node:child_process';
import { initPptPreviewBridge, stopAllWatchSessions } from '../../../../src/process/bridge/pptPreviewBridge';

const mockSpawn = vi.mocked(spawn);

// Helper to create mock child processes for tests
const createMockChild = (): ChildProcess => {
  const child = new EventEmitter() as ChildProcess;
  child.kill = vi.fn();
  child.stdout = new EventEmitter() as any;
  child.stderr = new EventEmitter() as any;
  return child;
};

// Flush pending microtasks and timers
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Start a watch session and resolve by emitting the correct events.
 */
async function startAndResolve(filePath: string, child: ChildProcess): Promise<{ url: string }> {
  const promise = handlers['start']({ filePath });
  await tick();
  child.stdout?.emit('data', Buffer.from('Watch: http://localhost:5000\n'));
  await tick();
  const socket = mockSockets[mockSockets.length - 1];
  if (socket) socket.emit('connect');
  return promise;
}

describe('pptPreviewBridge', () => {
  beforeEach(() => {
    mockSockets.length = 0;
    initPptPreviewBridge();
  });

  afterEach(() => {
    stopAllWatchSessions();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('registers start and stop handlers on bridge', () => {
    expect(handlers['start']).toBeDefined();
    expect(handlers['stop']).toBeDefined();
  });

  it('returns URL when officecli starts successfully and port becomes ready', async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child);

    const result = await startAndResolve('/path/to/test.pptx', child);

    expect(result).toEqual({ url: 'http://localhost:5000' });
    expect(mockSpawn).toHaveBeenCalledWith(
      'officecli',
      ['watch', '/path/to/test.pptx', '--port', '5000'],
      expect.objectContaining({
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { PATH: '/usr/bin' },
      })
    );
  });

  it('rejects when spawn emits error event', async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child);

    const promise = handlers['start']({ filePath: '/path/to/test.pptx' });
    await tick();
    child.emit('error', new Error('ENOENT: command not found'));

    await expect(promise).rejects.toThrow('Failed to start officecli: ENOENT: command not found');
  });

  it('rejects when child process exits before ready', async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child);

    const promise = handlers['start']({ filePath: '/path/to/test.pptx' });
    await tick();
    child.emit('exit', 1, null);

    await expect(promise).rejects.toThrow('officecli exited with code 1');
  });

  it('rejects when timeout expires before officecli becomes ready', async () => {
    vi.useFakeTimers();
    const child = createMockChild();
    mockSpawn.mockReturnValue(child);

    const promise = handlers['start']({ filePath: '/path/to/test.pptx' });
    // Attach rejection handler BEFORE advancing time to avoid unhandled rejection
    const assertion = expect(promise).rejects.toThrow('officecli watch timed out');
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
    vi.useRealTimers();
  });

  it('rejects when process exits while waiting for port', async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child);

    const promise = handlers['start']({ filePath: '/path/to/test.pptx' });
    await tick();
    child.stdout?.emit('data', Buffer.from('Watch: http://localhost:5000\n'));
    await tick();
    child.emit('exit', 1, null);

    await expect(promise).rejects.toThrow('officecli exited with code 1');
  });

  it('kills existing session when starting watch for same file', async () => {
    const child1 = createMockChild();
    const child2 = createMockChild();
    mockSpawn.mockReturnValueOnce(child1).mockReturnValueOnce(child2);

    await startAndResolve('/path/to/test.pptx', child1);
    await startAndResolve('/path/to/test.pptx', child2);

    expect(child1.kill).toHaveBeenCalled();
    expect(child2.kill).not.toHaveBeenCalled();
  });

  it('stop handler kills the session for specified file after delay', async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child);

    await startAndResolve('/path/to/test.pptx', child);
    await handlers['stop']({ filePath: '/path/to/test.pptx' });

    // Stop uses a 500ms delayed kill for Strict Mode re-mount tolerance
    expect(child.kill).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 600));
    expect(child.kill).toHaveBeenCalled();
  });

  it('stop handler does nothing when no session exists for file', async () => {
    await expect(handlers['stop']({ filePath: '/path/to/nonexistent.pptx' })).resolves.toBeUndefined();
  });

  it('manages multiple sessions for different files independently', async () => {
    const child1 = createMockChild();
    const child2 = createMockChild();
    mockSpawn.mockReturnValueOnce(child1).mockReturnValueOnce(child2);

    await startAndResolve('/path/to/file1.pptx', child1);
    await startAndResolve('/path/to/file2.pptx', child2);

    await handlers['stop']({ filePath: '/path/to/file1.pptx' });
    await new Promise((r) => setTimeout(r, 600));

    expect(child1.kill).toHaveBeenCalled();
    expect(child2.kill).not.toHaveBeenCalled();
  });

  it('kills all active sessions on stopAllWatchSessions', async () => {
    const child1 = createMockChild();
    const child2 = createMockChild();
    mockSpawn.mockReturnValueOnce(child1).mockReturnValueOnce(child2);

    await startAndResolve('/path/to/file1.pptx', child1);
    await startAndResolve('/path/to/file2.pptx', child2);

    stopAllWatchSessions();

    expect(child1.kill).toHaveBeenCalled();
    expect(child2.kill).toHaveBeenCalled();
  });

  it('stopAllWatchSessions completes when no sessions are active', () => {
    expect(() => stopAllWatchSessions()).not.toThrow();
  });
});
