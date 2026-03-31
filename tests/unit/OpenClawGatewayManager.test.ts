/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChildProcess } from 'child_process';
import EventEmitter from 'events';

const isWindows = process.platform === 'win32';
const mockBinDir = isWindows ? 'C:\\usr\\local\\bin' : '/usr/local/bin';
const mockPath = isWindows ? 'C:\\bin;C:\\usr\\local\\bin' : '/usr/bin:/usr/local/bin';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockSpawn = vi.hoisted(() => vi.fn());
const mockExecFileSync = vi.hoisted(() => vi.fn());
const mockAccessSync = vi.hoisted(() => vi.fn());
const mockOpenSync = vi.hoisted(() => vi.fn());
const mockReadSync = vi.hoisted(() => vi.fn());
const mockCloseSync = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  spawn: mockSpawn,
  execFileSync: mockExecFileSync,
}));

vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
  execFileSync: mockExecFileSync,
}));

vi.mock('node:fs', () => ({
  default: {
    accessSync: mockAccessSync,
    openSync: mockOpenSync,
    readSync: mockReadSync,
    closeSync: mockCloseSync,
    constants: { X_OK: 1 },
  },
  accessSync: mockAccessSync,
  openSync: mockOpenSync,
  readSync: mockReadSync,
  closeSync: mockCloseSync,
  constants: { X_OK: 1 },
}));

vi.mock('@process/utils/shellEnv', () => ({
  getEnhancedEnv: vi.fn((customEnv?: Record<string, string>) => ({
    PATH: mockPath,
    ...customEnv,
  })),
}));

import { OpenClawGatewayManager } from '../../src/process/agent/openclaw/OpenClawGatewayManager';

// Helper: create a mock ChildProcess
function createMockProcess(): ChildProcess {
  const proc = new EventEmitter() as ChildProcess & { killed: boolean; kill: ReturnType<typeof vi.fn> };
  proc.killed = false;
  proc.kill = vi.fn();
  (proc as unknown as Record<string, unknown>).stdout = new EventEmitter();
  (proc as unknown as Record<string, unknown>).stderr = new EventEmitter();
  return proc;
}

describe('OpenClawGatewayManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('start() with missing CLI binary', () => {
    it('should reject with a clear error when CLI is not found on PATH', async () => {
      // accessSync throws for every candidate → resolveCommandPath returns null
      mockAccessSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const manager = new OpenClawGatewayManager({ cliPath: 'openclaw' });
      const promise = manager.start();

      await expect(promise).rejects.toThrow('CLI not found: "openclaw"');
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should reject when absolute CLI path does not exist', async () => {
      mockAccessSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const manager = new OpenClawGatewayManager({ cliPath: '/opt/bin/openclaw' });
      const promise = manager.start();

      await expect(promise).rejects.toThrow('CLI not found: "/opt/bin/openclaw"');
      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });

  describe('start() with available CLI binary', () => {
    it('should spawn the process when CLI is found', async () => {
      const expectedBinary = path.join(mockBinDir, 'openclaw');
      mockAccessSync.mockImplementation((p: string) => {
        if (p === expectedBinary) return;
        throw new Error('ENOENT');
      });

      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const manager = new OpenClawGatewayManager({ cliPath: 'openclaw' });
      const promise = manager.start();

      // Emit ready signal
      (proc.stdout as EventEmitter).emit('data', Buffer.from('Gateway listening on port 18789'));

      const port = await promise;
      expect(port).toBe(18789);
      expect(mockSpawn).toHaveBeenCalledWith(expectedBinary, ['gateway', '--port', '18789'], expect.any(Object));
    });
  });
});
