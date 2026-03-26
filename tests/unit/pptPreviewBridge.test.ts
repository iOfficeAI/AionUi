/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks (vi.hoisted so factories can reference them) ---

const {
  startHandler,
  stopHandler,
  statusEmitMock,
  spawnMock,
  execSyncMock,
  realpathSyncMock,
  statSyncMock,
  writeFileSyncMock,
  fakePort,
} = vi.hoisted(() => ({
  startHandler: { fn: undefined as ((...args: any[]) => any) | undefined },
  stopHandler: { fn: undefined as ((...args: any[]) => any) | undefined },
  statusEmitMock: vi.fn(),
  spawnMock: vi.fn(),
  execSyncMock: vi.fn(),
  realpathSyncMock: vi.fn((p: string) => p),
  statSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
  fakePort: { value: 55555 },
}));

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp') },
}));

vi.mock('../../src/common', () => ({
  ipcBridge: {
    pptPreview: {
      start: {
        provider: vi.fn((fn: (...args: any[]) => any) => {
          startHandler.fn = fn;
        }),
      },
      stop: {
        provider: vi.fn((fn: (...args: any[]) => any) => {
          stopHandler.fn = fn;
        }),
      },
      status: {
        emit: statusEmitMock,
      },
    },
  },
}));

vi.mock('node:child_process', () => ({
  spawn: (...args: any[]) => spawnMock(...args),
  execSync: (...args: any[]) => execSyncMock(...args),
}));

vi.mock('node:fs', () => ({
  default: {
    realpathSync: (...args: any[]) => realpathSyncMock(...args),
    statSync: (...args: any[]) => statSyncMock(...args),
    writeFileSync: (...args: any[]) => writeFileSyncMock(...args),
  },
}));

// Mock net — findFreePort and waitForPort both use this
vi.mock('node:net', () => ({
  default: {
    createServer: () => {
      const server = {
        listen: (_port: number, _host: string, cb: () => void) => {
          queueMicrotask(cb);
        },
        address: () => ({ port: fakePort.value }),
        close: (cb: () => void) => cb(),
        on: () => server,
      };
      return server;
    },
    connect: (_port: number, _host: string) => {
      const emitter = new EventEmitter();
      queueMicrotask(() => emitter.emit('connect'));
      return Object.assign(emitter, { destroy: () => {} });
    },
  },
}));

vi.mock('@process/utils/shellEnv', () => ({
  getEnhancedEnv: vi.fn(() => ({ PATH: '/usr/bin' })),
}));

vi.mock('../../src/common/platform/index', () => ({
  getPlatformServices: vi.fn(() => ({
    paths: {
      getDataDir: vi.fn(() => '/mock/data'),
    },
  })),
}));

// --- Helpers ---

function createMockChildProcess() {
  const emitter = new EventEmitter();
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  return Object.assign(emitter, {
    stdout,
    stderr,
    kill: vi.fn(),
    exitCode: null as number | null,
    pid: 12345,
  });
}

/** Flush microtask queue so findFreePort / waitForPort promises resolve */
function flush() {
  return new Promise<void>((r) => setTimeout(r, 0));
}

/** Wait until spawnMock has been called, then emit stdout data */
async function emitWatchReady(child: ReturnType<typeof createMockChildProcess>) {
  // Wait for findFreePort to resolve and spawn to be called
  await flush();
  child.stdout.emit('data', Buffer.from('Watch: started'));
  // Wait for waitForPort to resolve
  await flush();
}

// --- Tests ---

let initPptPreviewBridge: typeof import('../../src/process/bridge/pptPreviewBridge').initPptPreviewBridge;
let stopAllWatchSessions: typeof import('../../src/process/bridge/pptPreviewBridge').stopAllWatchSessions;
let isActivePreviewPort: typeof import('../../src/process/bridge/pptPreviewBridge').isActivePreviewPort;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  realpathSyncMock.mockImplementation((p: string) => p);
  fakePort.value = 55555;

  const mod = await import('../../src/process/bridge/pptPreviewBridge');
  initPptPreviewBridge = mod.initPptPreviewBridge;
  stopAllWatchSessions = mod.stopAllWatchSessions;
  isActivePreviewPort = mod.isActivePreviewPort;
});

afterEach(() => {
  stopAllWatchSessions();
});

describe('pptPreviewBridge', () => {
  describe('initPptPreviewBridge', () => {
    it('registers start and stop providers', () => {
      initPptPreviewBridge();
      expect(startHandler.fn).toBeDefined();
      expect(stopHandler.fn).toBeDefined();
    });
  });

  describe('start (startWatch)', () => {
    it('emits starting status and resolves with url', async () => {
      initPptPreviewBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      const promise = startHandler.fn!({ filePath: '/test/file.pptx' });
      await emitWatchReady(child);

      const result = await promise;
      expect(statusEmitMock).toHaveBeenCalledWith({ state: 'starting' });
      expect(result).toEqual({ url: 'http://localhost:55555' });
    });

    it('resolves symlinks via fs.realpathSync', async () => {
      realpathSyncMock.mockReturnValue('/real/path/file.pptx');
      initPptPreviewBridge();

      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      const promise = startHandler.fn!({ filePath: '/symlink/file.pptx' });
      expect(realpathSyncMock).toHaveBeenCalledWith('/symlink/file.pptx');

      await emitWatchReady(child);
      await promise;
    });

    it('spawns officecli with correct arguments', async () => {
      initPptPreviewBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      const promise = startHandler.fn!({ filePath: '/test/file.pptx' });
      await flush(); // wait for findFreePort

      expect(spawnMock).toHaveBeenCalledWith(
        'officecli',
        ['watch', '/test/file.pptx', '--port', '55555'],
        expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] })
      );

      // Emit Watch: to resolve
      child.stdout.emit('data', Buffer.from('Watch: started'));
      await flush();
      await promise;
    });

    it('rejects when process exits with non-zero code', async () => {
      initPptPreviewBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      const promise = startHandler.fn!({ filePath: '/test/file.pptx' });
      await flush(); // wait for spawn
      child.emit('exit', 1, null);

      const result = await promise;
      expect(result).toEqual({ url: '', error: 'officecli exited with code 1' });
    });

    it('returns error result when process is killed by signal', async () => {
      initPptPreviewBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      const promise = startHandler.fn!({ filePath: '/test/file.pptx' });
      await flush();
      child.emit('exit', null, 'SIGKILL');

      const result = await promise;
      expect(result).toEqual({ url: '', error: 'officecli exited with signal SIGKILL' });
    });

    it('attempts auto-install on ENOENT and emits installing status', async () => {
      initPptPreviewBridge();

      const child1 = createMockChildProcess();
      spawnMock.mockReturnValueOnce(child1);
      execSyncMock.mockReturnValue('');

      const child2 = createMockChildProcess();
      spawnMock.mockReturnValueOnce(child2);

      const promise = startHandler.fn!({ filePath: '/test/file.pptx' });
      await flush();

      const enoentErr = Object.assign(new Error('spawn officecli ENOENT'), { code: 'ENOENT' });
      child1.emit('error', enoentErr);

      // installOfficecli runs synchronously, then retry calls startWatch again
      await flush(); // for retry's findFreePort
      expect(statusEmitMock).toHaveBeenCalledWith({ state: 'installing' });

      await emitWatchReady(child2);
      await promise;
    });

    it('rejects if auto-install fails', async () => {
      initPptPreviewBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      execSyncMock.mockImplementation(() => {
        throw new Error('install failed');
      });

      const promise = startHandler.fn!({ filePath: '/test/file.pptx' });
      await flush();

      const enoentErr = Object.assign(new Error('spawn officecli ENOENT'), { code: 'ENOENT' });
      child.emit('error', enoentErr);

      const result = await promise;
      expect(result).toEqual({ url: '', error: 'officecli is not installed and auto-install failed' });
    });

    it('reuses existing alive session', async () => {
      initPptPreviewBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      const promise1 = startHandler.fn!({ filePath: '/test/file.pptx' });
      await emitWatchReady(child);
      const url1 = await promise1;

      // Second call should reuse (process still alive: exitCode === null)
      const result2 = await startHandler.fn!({ filePath: '/test/file.pptx' });

      expect(spawnMock).toHaveBeenCalledTimes(1);
      expect(url1).toEqual(result2);
    });
  });

  describe('stop', () => {
    it('uses delayed kill for Strict Mode tolerance', async () => {
      vi.useFakeTimers();
      initPptPreviewBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      const promise = startHandler.fn!({ filePath: '/test/file.pptx' });
      // Flush microtasks for findFreePort
      await vi.advanceTimersByTimeAsync(0);
      child.stdout.emit('data', Buffer.from('Watch: started'));
      // Flush microtasks for waitForPort
      await vi.advanceTimersByTimeAsync(0);
      await promise;

      await stopHandler.fn!({ filePath: '/test/file.pptx' });

      expect(child.kill).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(600);
      expect(child.kill).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('stopAllWatchSessions', () => {
    it('kills all running sessions', async () => {
      initPptPreviewBridge();

      const child1 = createMockChildProcess();
      spawnMock.mockReturnValueOnce(child1);
      fakePort.value = 55555;
      const p1 = startHandler.fn!({ filePath: '/test/a.pptx' });
      await emitWatchReady(child1);
      await p1;

      const child2 = createMockChildProcess();
      spawnMock.mockReturnValueOnce(child2);
      fakePort.value = 55556;
      const p2 = startHandler.fn!({ filePath: '/test/b.pptx' });
      await emitWatchReady(child2);
      await p2;

      stopAllWatchSessions();

      expect(child1.kill).toHaveBeenCalled();
      expect(child2.kill).toHaveBeenCalled();
    });
  });

  describe('checkForUpdate', () => {
    it('skips check if marker file is recent (within 24h)', async () => {
      vi.useFakeTimers();
      statSyncMock.mockReturnValue({ mtimeMs: Date.now() });
      initPptPreviewBridge();

      await vi.advanceTimersByTimeAsync(6000);

      expect(execSyncMock).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('triggers install if versions differ', async () => {
      vi.useFakeTimers();
      statSyncMock.mockReturnValue({ mtimeMs: Date.now() - 25 * 60 * 60 * 1000 });
      execSyncMock
        .mockReturnValueOnce('1.0.17')
        .mockReturnValueOnce('https://github.com/iOfficeAI/OfficeCli/releases/tag/v1.0.18')
        .mockReturnValue('');

      initPptPreviewBridge();
      await vi.advanceTimersByTimeAsync(6000);

      expect(execSyncMock).toHaveBeenCalledWith('officecli --version', expect.any(Object));
      expect(writeFileSyncMock).toHaveBeenCalled();
      expect(statusEmitMock).toHaveBeenCalledWith({ state: 'installing' });
      vi.useRealTimers();
    });

    it('does not install if versions match', async () => {
      vi.useFakeTimers();
      statSyncMock.mockReturnValue({ mtimeMs: Date.now() - 25 * 60 * 60 * 1000 });
      execSyncMock
        .mockReturnValueOnce('1.0.18')
        .mockReturnValueOnce('https://github.com/iOfficeAI/OfficeCli/releases/tag/v1.0.18');

      initPptPreviewBridge();
      await vi.advanceTimersByTimeAsync(6000);

      expect(statusEmitMock).not.toHaveBeenCalledWith({ state: 'installing' });
      vi.useRealTimers();
    });
  });

  describe('isActivePreviewPort', () => {
    it('returns false for an unknown port', () => {
      initPptPreviewBridge();
      expect(isActivePreviewPort(9999)).toBe(false);
    });

    it('returns true for an active session port', async () => {
      initPptPreviewBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      const promise = startHandler.fn!({ filePath: '/test/file.pptx' });
      await emitWatchReady(child);
      await promise;

      expect(isActivePreviewPort(55555)).toBe(true);
    });

    it('returns false after the session process exits', async () => {
      initPptPreviewBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      const promise = startHandler.fn!({ filePath: '/test/file.pptx' });
      await emitWatchReady(child);
      await promise;

      child.exitCode = 0;
      expect(isActivePreviewPort(55555)).toBe(false);
    });

    it('returns false after the session is stopped', async () => {
      vi.useFakeTimers();
      initPptPreviewBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      const promise = startHandler.fn!({ filePath: '/test/file.pptx' });
      await vi.advanceTimersByTimeAsync(0);
      child.stdout.emit('data', Buffer.from('Watch: started'));
      await vi.advanceTimersByTimeAsync(0);
      await promise;

      await stopHandler.fn!({ filePath: '/test/file.pptx' });
      await vi.advanceTimersByTimeAsync(600);

      expect(isActivePreviewPort(55555)).toBe(false);
      vi.useRealTimers();
    });
  });
});
