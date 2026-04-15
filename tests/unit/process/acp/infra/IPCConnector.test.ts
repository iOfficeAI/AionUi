// tests/unit/process/acp/infra/IPCConnector.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IPCConnector } from '@process/acp/infra/IPCConnector';
import type { LocalProcessConfig } from '@process/acp/infra/AgentConnector';
import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('@process/acp/infra/processUtils', async () => {
  const actual = await vi.importActual('@process/acp/infra/processUtils');
  return {
    ...actual,
    isProcessAlive: vi.fn((pid: number) => pid === 12345),
  };
});

import { spawn } from 'node:child_process';
import { isProcessAlive } from '@process/acp/infra/processUtils';

function createMockChild() {
  const child = new EventEmitter() as any;
  child.stdin = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  child.stdout = new Readable({ read() {} });
  child.stderr = new Readable({ read() {} });
  child.pid = 12345;
  child.exitCode = null;
  child.signalCode = null;
  child.killed = false;
  child.kill = vi.fn((signal?: string) => {
    child.killed = true;
    child.signalCode = signal ?? 'SIGTERM';
    child.exitCode = 1;
    child.emit('exit', 1, signal);
    return true;
  });
  child.unref = vi.fn();
  return child;
}

describe('IPCConnector', () => {
  const config: LocalProcessConfig = {
    command: '/usr/local/bin/agent',
    args: ['--stdio'],
    cwd: '/tmp',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('connect() spawns process and returns ConnectorHandle', async () => {
    const mockChild = createMockChild();
    (spawn as any).mockReturnValue(mockChild);
    setTimeout(() => mockChild.emit('spawn'), 10);

    const connector = new IPCConnector(config);
    const handle = await connector.connect();
    expect(handle.stream).toBeDefined();
    expect(typeof handle.shutdown).toBe('function');
    expect(connector.isAlive()).toBe(true);
  });

  it('isAlive() returns false after shutdown (INV-I-01)', async () => {
    const mockChild = createMockChild();
    (spawn as any).mockReturnValue(mockChild);
    setTimeout(() => mockChild.emit('spawn'), 10);

    const connector = new IPCConnector(config);
    const handle = await connector.connect();

    // Mock isProcessAlive to return false after shutdown
    (isProcessAlive as any).mockImplementation(() => false);

    await handle.shutdown();
    expect(connector.isAlive()).toBe(false);
  });

  it('connect() rejects on spawn error', async () => {
    const mockChild = createMockChild();
    (spawn as any).mockReturnValue(mockChild);
    setTimeout(() => mockChild.emit('error', new Error('spawn ENOENT')), 10);

    const connector = new IPCConnector(config);
    await expect(connector.connect()).rejects.toThrow();
  });
});
