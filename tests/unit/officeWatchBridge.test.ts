/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks (vi.hoisted so factories can reference them) ---

const {
  wordStartHandler,
  wordStopHandler,
  excelStartHandler,
  excelStopHandler,
  wordStatusEmitMock,
  excelStatusEmitMock,
  spawnMock,
  execSyncMock,
  realpathSyncMock,
  fakePort,
  portConnectSucceeds,
} = vi.hoisted(() => ({
  wordStartHandler: { fn: undefined as ((...args: any[]) => any) | undefined },
  wordStopHandler: { fn: undefined as ((...args: any[]) => any) | undefined },
  excelStartHandler: { fn: undefined as ((...args: any[]) => any) | undefined },
  excelStopHandler: { fn: undefined as ((...args: any[]) => any) | undefined },
  wordStatusEmitMock: vi.fn(),
  excelStatusEmitMock: vi.fn(),
  spawnMock: vi.fn(),
  execSyncMock: vi.fn(),
  realpathSyncMock: vi.fn((p: string) => p),
  fakePort: { value: 55555 },
  // Controls whether net.connect resolves (port ready) or rejects (port not ready).
  // Set to false in tests that expect the process to fail before the port opens.
  portConnectSucceeds: { value: true },
}));

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp') },
}));

vi.mock('../../src/common', () => ({
  ipcBridge: {
    wordPreview: {
      start: {
        provider: vi.fn((fn: (...args: any[]) => any) => {
          wordStartHandler.fn = fn;
        }),
      },
      stop: {
        provider: vi.fn((fn: (...args: any[]) => any) => {
          wordStopHandler.fn = fn;
        }),
      },
      status: {
        emit: wordStatusEmitMock,
      },
    },
    excelPreview: {
      start: {
        provider: vi.fn((fn: (...args: any[]) => any) => {
          excelStartHandler.fn = fn;
        }),
      },
      stop: {
        provider: vi.fn((fn: (...args: any[]) => any) => {
          excelStopHandler.fn = fn;
        }),
      },
      status: {
        emit: excelStatusEmitMock,
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
      if (portConnectSucceeds.value) {
        queueMicrotask(() => emitter.emit('connect'));
      } else {
        queueMicrotask(() => emitter.emit('error', new Error('ECONNREFUSED')));
      }
      return Object.assign(emitter, { destroy: () => {} });
    },
  },
}));

vi.mock('@process/utils/shellEnv', () => ({
  getEnhancedEnv: vi.fn(() => ({ PATH: '/usr/bin' })),
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
  await flush();
  child.stdout.emit('data', Buffer.from('Watch: started'));
  await flush();
}

// --- Tests ---

let initOfficeWatchBridge: typeof import('../../src/process/bridge/officeWatchBridge').initOfficeWatchBridge;
let stopAllOfficeWatchSessions: typeof import('../../src/process/bridge/officeWatchBridge').stopAllOfficeWatchSessions;
let isActiveOfficeWatchPort: typeof import('../../src/process/bridge/officeWatchBridge').isActiveOfficeWatchPort;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  realpathSyncMock.mockImplementation((p: string) => p);
  fakePort.value = 55555;
  portConnectSucceeds.value = true;

  const mod = await import('../../src/process/bridge/officeWatchBridge');
  initOfficeWatchBridge = mod.initOfficeWatchBridge;
  stopAllOfficeWatchSessions = mod.stopAllOfficeWatchSessions;
  isActiveOfficeWatchPort = mod.isActiveOfficeWatchPort;
});

afterEach(() => {
  stopAllOfficeWatchSessions();
});

describe('officeWatchBridge', () => {
  describe('initOfficeWatchBridge', () => {
    it('registers word and excel start/stop providers', () => {
      initOfficeWatchBridge();
      expect(wordStartHandler.fn).toBeDefined();
      expect(wordStopHandler.fn).toBeDefined();
      expect(excelStartHandler.fn).toBeDefined();
      expect(excelStopHandler.fn).toBeDefined();
    });
  });

  describe('word start (startWatch)', () => {
    it('emits starting status and resolves with url for word', async () => {
      initOfficeWatchBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      const promise = wordStartHandler.fn!({ filePath: '/test/file.docx' });
      await emitWatchReady(child);

      const result = await promise;
      expect(wordStatusEmitMock).toHaveBeenCalledWith({ state: 'starting' });
      expect(result).toEqual({ url: 'http://localhost:55555' });
    });

    it('spawns officecli with correct arguments for word', async () => {
      initOfficeWatchBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      const promise = wordStartHandler.fn!({ filePath: '/test/file.docx' });
      await flush();

      expect(spawnMock).toHaveBeenCalledWith(
        'officecli',
        ['watch', '/test/file.docx', '--port', '55555'],
        expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] })
      );

      child.stdout.emit('data', Buffer.from('Watch: started'));
      await flush();
      await promise;
    });

    it('reuses existing alive session for word', async () => {
      initOfficeWatchBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      const promise1 = wordStartHandler.fn!({ filePath: '/test/file.docx' });
      await emitWatchReady(child);
      const url1 = await promise1;

      const result2 = await wordStartHandler.fn!({ filePath: '/test/file.docx' });

      expect(spawnMock).toHaveBeenCalledTimes(1);
      expect(url1).toEqual(result2);
    });

    it('returns error result when word process exits with non-zero code', async () => {
      portConnectSucceeds.value = false; // port never opens; process exit settles first
      initOfficeWatchBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      const promise = wordStartHandler.fn!({ filePath: '/test/file.docx' });
      await flush();
      child.emit('exit', 1, null);

      const result = await promise;
      expect(result).toEqual({ url: '', error: 'officecli exited with code 1' });
    });
  });

  describe('excel start (startWatch)', () => {
    it('emits starting status and resolves with url for excel', async () => {
      initOfficeWatchBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      const promise = excelStartHandler.fn!({ filePath: '/test/file.xlsx' });
      await emitWatchReady(child);

      const result = await promise;
      expect(excelStatusEmitMock).toHaveBeenCalledWith({ state: 'starting' });
      expect(result).toEqual({ url: 'http://localhost:55555' });
    });

    it('spawns officecli with correct arguments for excel', async () => {
      initOfficeWatchBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      const promise = excelStartHandler.fn!({ filePath: '/test/file.xlsx' });
      await flush();

      expect(spawnMock).toHaveBeenCalledWith(
        'officecli',
        ['watch', '/test/file.xlsx', '--port', '55555'],
        expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] })
      );

      child.stdout.emit('data', Buffer.from('Watch: started'));
      await flush();
      await promise;
    });

    it('reuses existing alive session for excel', async () => {
      initOfficeWatchBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      const promise1 = excelStartHandler.fn!({ filePath: '/test/file.xlsx' });
      await emitWatchReady(child);
      const url1 = await promise1;

      const result2 = await excelStartHandler.fn!({ filePath: '/test/file.xlsx' });

      expect(spawnMock).toHaveBeenCalledTimes(1);
      expect(url1).toEqual(result2);
    });

    it('returns error result when excel process is killed by signal', async () => {
      portConnectSucceeds.value = false; // port never opens; process exit settles first
      initOfficeWatchBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      const promise = excelStartHandler.fn!({ filePath: '/test/file.xlsx' });
      await flush();
      child.emit('exit', null, 'SIGKILL');

      const result = await promise;
      expect(result).toEqual({ url: '', error: 'officecli exited with signal SIGKILL' });
    });
  });

  describe('word stop', () => {
    it('uses delayed kill for Strict Mode tolerance (word)', async () => {
      vi.useFakeTimers();
      initOfficeWatchBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      const promise = wordStartHandler.fn!({ filePath: '/test/file.docx' });
      await vi.advanceTimersByTimeAsync(0);
      child.stdout.emit('data', Buffer.from('Watch: started'));
      await vi.advanceTimersByTimeAsync(0);
      await promise;

      await wordStopHandler.fn!({ filePath: '/test/file.docx' });

      expect(child.kill).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(600);
      expect(child.kill).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('excel stop', () => {
    it('uses delayed kill for Strict Mode tolerance (excel)', async () => {
      vi.useFakeTimers();
      initOfficeWatchBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      const promise = excelStartHandler.fn!({ filePath: '/test/file.xlsx' });
      await vi.advanceTimersByTimeAsync(0);
      child.stdout.emit('data', Buffer.from('Watch: started'));
      await vi.advanceTimersByTimeAsync(0);
      await promise;

      await excelStopHandler.fn!({ filePath: '/test/file.xlsx' });

      expect(child.kill).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(600);
      expect(child.kill).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('stopAllOfficeWatchSessions', () => {
    it('kills all running word and excel sessions', async () => {
      initOfficeWatchBridge();

      const wordChild = createMockChildProcess();
      spawnMock.mockReturnValueOnce(wordChild);
      fakePort.value = 55555;
      const p1 = wordStartHandler.fn!({ filePath: '/test/a.docx' });
      await emitWatchReady(wordChild);
      await p1;

      const excelChild = createMockChildProcess();
      spawnMock.mockReturnValueOnce(excelChild);
      fakePort.value = 55556;
      const p2 = excelStartHandler.fn!({ filePath: '/test/b.xlsx' });
      await emitWatchReady(excelChild);
      await p2;

      stopAllOfficeWatchSessions();

      expect(wordChild.kill).toHaveBeenCalled();
      expect(excelChild.kill).toHaveBeenCalled();
    });
  });

  describe('isActiveOfficeWatchPort', () => {
    it('returns false for an unknown port', () => {
      initOfficeWatchBridge();
      expect(isActiveOfficeWatchPort(9999)).toBe(false);
    });

    it('returns true for an active word session port', async () => {
      initOfficeWatchBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      const promise = wordStartHandler.fn!({ filePath: '/test/file.docx' });
      await emitWatchReady(child);
      await promise;

      expect(isActiveOfficeWatchPort(55555)).toBe(true);
    });

    it('returns true for an active excel session port', async () => {
      initOfficeWatchBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      const promise = excelStartHandler.fn!({ filePath: '/test/file.xlsx' });
      await emitWatchReady(child);
      await promise;

      expect(isActiveOfficeWatchPort(55555)).toBe(true);
    });

    it('returns false after word session process exits', async () => {
      initOfficeWatchBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      const promise = wordStartHandler.fn!({ filePath: '/test/file.docx' });
      await emitWatchReady(child);
      await promise;

      child.exitCode = 0;
      expect(isActiveOfficeWatchPort(55555)).toBe(false);
    });

    it('word and excel session maps are independent — same file path does not collide', async () => {
      initOfficeWatchBridge();
      const wordChild = createMockChildProcess();
      const excelChild = createMockChildProcess();
      spawnMock.mockReturnValueOnce(wordChild).mockReturnValueOnce(excelChild);
      fakePort.value = 55555;

      const wordPromise = wordStartHandler.fn!({ filePath: '/test/file' });
      await emitWatchReady(wordChild);
      await wordPromise;

      fakePort.value = 55556;
      const excelPromise = excelStartHandler.fn!({ filePath: '/test/file' });
      await emitWatchReady(excelChild);
      await excelPromise;

      expect(isActiveOfficeWatchPort(55555)).toBe(true);
      expect(isActiveOfficeWatchPort(55556)).toBe(true);

      // Killing word session does not affect excel session
      wordChild.exitCode = 0;
      expect(isActiveOfficeWatchPort(55555)).toBe(false);
      expect(isActiveOfficeWatchPort(55556)).toBe(true);
    });

    it('returns false after word session is stopped', async () => {
      vi.useFakeTimers();
      initOfficeWatchBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      const promise = wordStartHandler.fn!({ filePath: '/test/file.docx' });
      await vi.advanceTimersByTimeAsync(0);
      child.stdout.emit('data', Buffer.from('Watch: started'));
      await vi.advanceTimersByTimeAsync(0);
      await promise;

      await wordStopHandler.fn!({ filePath: '/test/file.docx' });
      await vi.advanceTimersByTimeAsync(600);

      expect(isActiveOfficeWatchPort(55555)).toBe(false);
      vi.useRealTimers();
    });
  });

  describe('auto-install on ENOENT', () => {
    it('attempts auto-install on ENOENT for word and emits installing status', async () => {
      initOfficeWatchBridge();

      const child1 = createMockChildProcess();
      spawnMock.mockReturnValueOnce(child1);
      execSyncMock.mockReturnValue('');

      const child2 = createMockChildProcess();
      spawnMock.mockReturnValueOnce(child2);

      const promise = wordStartHandler.fn!({ filePath: '/test/file.docx' });
      await flush();

      const enoentErr = Object.assign(new Error('spawn officecli ENOENT'), { code: 'ENOENT' });
      child1.emit('error', enoentErr);

      await flush();
      expect(wordStatusEmitMock).toHaveBeenCalledWith({ state: 'installing' });

      await emitWatchReady(child2);
      await promise;
    });

    it('rejects if auto-install fails for excel', async () => {
      portConnectSucceeds.value = false; // port never opens; ENOENT error settles first
      initOfficeWatchBridge();
      const child = createMockChildProcess();
      spawnMock.mockReturnValue(child);

      execSyncMock.mockImplementation(() => {
        throw new Error('install failed');
      });

      const promise = excelStartHandler.fn!({ filePath: '/test/file.xlsx' });
      await flush();

      const enoentErr = Object.assign(new Error('spawn officecli ENOENT'), { code: 'ENOENT' });
      child.emit('error', enoentErr);

      const result = await promise;
      expect(result).toEqual({ url: '', error: 'officecli is not installed and auto-install failed' });
    });
  });
});
