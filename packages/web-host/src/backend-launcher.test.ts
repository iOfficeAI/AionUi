/**
 * M4 unit tests for backend-launcher.
 * All external I/O mocked: node:child_process.spawn, node:net.createServer, fetch.
 * No real backend is spawned.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';

// ---- Module-level mocks ----
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('node:net', () => ({
  createServer: vi.fn(),
}));

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { buildSpawnArgs, buildSpawnEnv, findAvailablePort, BackendLifecycleManager } from './backend-launcher.js';
import type { AppMetadata } from './types.js';

const APP_META: AppMetadata = {
  version: '1.2.3',
  isPackaged: false,
  resourcesPath: '/mock/resources',
  userDataPath: '/mock/userData',
};

const APP_META_PACKAGED: AppMetadata = { ...APP_META, isPackaged: true };

function makeFakeServer(port = 54321) {
  const server = new EventEmitter() as EventEmitter & {
    listen: (p: number, h: string, cb: () => void) => void;
    address: () => { port: number };
    close: (cb?: () => void) => void;
  };
  server.listen = (_p, _h, cb) => {
    setImmediate(cb);
  };
  server.address = () => ({ port });
  server.close = (cb) => {
    if (cb) setImmediate(cb);
  };
  return server;
}

function makeSyncFakeServer(port = 54321) {
  const server = makeFakeServer(port);
  server.listen = (_p, _h, cb) => {
    cb();
  };
  server.close = (cb) => {
    if (cb) cb();
  };
  return server;
}

function makeFakeChild(): ChildProcess {
  const child = new EventEmitter() as EventEmitter & Partial<ChildProcess>;
  child.stdout = new EventEmitter() as ChildProcess['stdout'];
  child.stderr = new EventEmitter() as ChildProcess['stderr'];
  (child.stdin as unknown) = { end: vi.fn() };
  child.kill = vi.fn() as unknown as ChildProcess['kill'];
  child.pid = 99999;
  return child as ChildProcess;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  // Do NOT call restoreAllMocks; it would remove vi.mock() module factories.
  vi.useRealTimers();
});

describe('buildSpawnArgs', () => {
  it('produces all required flags with logDir and local=true', () => {
    const args = buildSpawnArgs({
      port: 12345,
      dbPath: '/data/path',
      local: true,
      logDir: '/log/dir',
      appVersion: '9.9.9',
      isPackaged: true,
    });
    expect(args).toEqual([
      '--port',
      '12345',
      '--data-dir',
      '/data/path',
      '--log-level',
      'info',
      '--app-version',
      '9.9.9',
      '--log-dir',
      '/log/dir',
      '--local',
    ]);
  });

  it('uses debug log level when not packaged', () => {
    const args = buildSpawnArgs({
      port: 1,
      dbPath: '/d',
      local: false,
      appVersion: '0.0.1',
      isPackaged: false,
    });
    expect(args).toContain('debug');
    expect(args).not.toContain('--log-dir');
    expect(args).not.toContain('--local');
  });

  it('respects AIONUI_LOG_LEVEL override', () => {
    const prev = process.env.AIONUI_LOG_LEVEL;
    process.env.AIONUI_LOG_LEVEL = 'trace';
    try {
      const args = buildSpawnArgs({
        port: 1,
        dbPath: '/d',
        local: false,
        appVersion: 'x',
        isPackaged: true,
      });
      expect(args).toContain('trace');
    } finally {
      if (prev === undefined) delete process.env.AIONUI_LOG_LEVEL;
      else process.env.AIONUI_LOG_LEVEL = prev;
    }
  });
});

describe('buildSpawnEnv', () => {
  it('merges process.env with AIONUI_* dir vars', () => {
    const env = buildSpawnEnv({
      cacheDir: '/c',
      workDir: '/w',
      logDir: '/l',
    });
    expect(env.AIONUI_CACHE_DIR).toBe('/c');
    expect(env.AIONUI_WORK_DIR).toBe('/w');
    expect(env.AIONUI_LOG_DIR).toBe('/l');
    expect(env.PATH).toBe(process.env.PATH); // inherits
  });
});

describe('findAvailablePort', () => {
  it('resolves with the port reported by the listening server', async () => {
    vi.mocked(createServer).mockImplementationOnce(
      () => makeFakeServer(40404) as unknown as ReturnType<typeof createServer>
    );
    const port = await findAvailablePort();
    expect(port).toBe(40404);
  });
});

describe('BackendLifecycleManager.start (success path)', () => {
  it('spawns with correct args, waits for /health, reports running', async () => {
    vi.mocked(createServer).mockImplementation(
      () => makeFakeServer(55555) as unknown as ReturnType<typeof createServer>
    );
    const child = makeFakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }) as unknown as Response);

    const resolveBackend = vi.fn(() => '/abs/path/aioncore');
    const mgr = new BackendLifecycleManager(APP_META_PACKAGED, resolveBackend);

    const port = await mgr.start('/db/path', '/log/dir', {
      cacheDir: '/c',
      workDir: '/w',
      logDir: '/l',
    });

    expect(port).toBe(55555);
    expect(mgr.port).toBe(55555);
    expect(mgr.status).toBe('running');
    expect(resolveBackend).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledTimes(1);

    const spawnCall = vi.mocked(spawn).mock.calls[0];
    expect(spawnCall[0]).toBe('/abs/path/aioncore');
    expect(spawnCall[1]).toEqual([
      '--port',
      '55555',
      '--data-dir',
      '/db/path',
      '--log-level',
      'info',
      '--app-version',
      '1.2.3',
      '--log-dir',
      '/log/dir',
      '--work-dir',
      '/w',
      '--local',
    ]);
    const opts = spawnCall[2] as { env: NodeJS.ProcessEnv };
    expect(opts.env.AIONUI_CACHE_DIR).toBe('/c');
    expect(opts.env.AIONUI_WORK_DIR).toBe('/w');
    expect(opts.env.AIONUI_LOG_DIR).toBe('/l');

    expect(fetchSpy).toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});

describe('BackendLifecycleManager.start (health timeout)', () => {
  it('kills child and throws when /health never responds OK within timeout', async () => {
    vi.useFakeTimers();
    vi.mocked(createServer).mockImplementation(
      () => makeFakeServer(33333) as unknown as ReturnType<typeof createServer>
    );
    const child = makeFakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const mgr = new BackendLifecycleManager(APP_META, () => '/x');
    const startPromise = mgr.start('/db');
    const expectedRejection = expect(startPromise).rejects.toThrow(/failed to start within timeout/);

    // First await the timer advance so all setTimeout callbacks fire
    await vi.advanceTimersByTimeAsync(31_000);
    // Then await the rejection
    await expectedRejection;

    expect(mgr.status).toBe('error');
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');

    fetchSpy.mockRestore();
    vi.useRealTimers();
  }, 15_000);

  it('includes startup diagnostics when health check times out', async () => {
    vi.useFakeTimers();
    vi.mocked(createServer).mockImplementation(
      () => makeSyncFakeServer(33334) as unknown as ReturnType<typeof createServer>
    );
    const child = makeFakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const mgr = new BackendLifecycleManager(APP_META_PACKAGED, () => '/abs/path/aioncore');
    const startPromise = mgr.start('/db/path', '/log/dir', {
      cacheDir: '/cache',
      workDir: '/work',
      logDir: '/log',
    });
    const expectedRejection = expect(startPromise).rejects.toMatchObject({
      name: 'BackendStartupError',
      details: expect.objectContaining({
        stage: 'health_timeout',
        binaryPath: '/abs/path/aioncore',
        port: 33334,
        healthCheckAttempts: expect.any(Number),
        healthCheckLastError: 'ECONNREFUSED',
        dataDir: '/db/path',
        stderrTail: expect.stringContaining('database is locked'),
      }),
    });

    await Promise.resolve();
    await Promise.resolve();
    child.stderr?.emit('data', Buffer.from('database is locked\n'));
    await vi.advanceTimersByTimeAsync(31_000);

    await expectedRejection;

    fetchSpy.mockRestore();
  }, 15_000);

  it('records the last non-OK health response when health check times out', async () => {
    vi.useFakeTimers();
    vi.mocked(createServer).mockImplementation(
      () => makeSyncFakeServer(33336) as unknown as ReturnType<typeof createServer>
    );
    const child = makeFakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(new Response('starting', { status: 503 })));

    const mgr = new BackendLifecycleManager(APP_META_PACKAGED, () => '/abs/path/aioncore');
    const startPromise = mgr.start('/db/path');
    const expectedRejection = expect(startPromise).rejects.toMatchObject({
      name: 'BackendStartupError',
      details: expect.objectContaining({
        stage: 'health_timeout',
        port: 33336,
        healthCheckAttempts: expect.any(Number),
        healthCheckLastStatus: 503,
        healthCheckLastBody: 'starting',
      }),
    });

    await vi.advanceTimersByTimeAsync(31_000);
    await expectedRejection;

    fetchSpy.mockRestore();
  }, 15_000);

  it('keeps child alive and reports ready later when pending timeout is allowed', async () => {
    vi.useFakeTimers();
    vi.mocked(createServer).mockImplementation(
      () => makeSyncFakeServer(33335) as unknown as ReturnType<typeof createServer>
    );
    const child = makeFakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const onHealthTimeout = vi.fn();
    const onReady = vi.fn();

    const mgr = new BackendLifecycleManager(APP_META_PACKAGED, () => '/abs/path/aioncore');
    const startPromise = mgr.start('/db/path', '/log/dir', undefined, {
      allowPendingOnHealthTimeout: true,
      onHealthTimeout,
      onReady,
    });

    await vi.advanceTimersByTimeAsync(31_000);
    await expect(startPromise).resolves.toBe(33335);

    expect(mgr.status).toBe('starting');
    expect(child.kill).not.toHaveBeenCalled();
    expect(onHealthTimeout).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'BackendStartupError',
        details: expect.objectContaining({
          stage: 'health_timeout',
          port: 33335,
        }),
      })
    );

    fetchSpy.mockResolvedValue(new Response('ok', { status: 200 }) as unknown as Response);
    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    expect(mgr.status).toBe('running');
    expect(onReady).toHaveBeenCalledWith(33335);

    fetchSpy.mockRestore();
  }, 15_000);
});

describe('BackendLifecycleManager.stop', () => {
  it('sends SIGTERM then resolves when child emits exit', async () => {
    vi.mocked(createServer).mockImplementation(
      () => makeFakeServer(22222) as unknown as ReturnType<typeof createServer>
    );
    const child = makeFakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }) as unknown as Response);

    const mgr = new BackendLifecycleManager(APP_META, () => '/x');
    await mgr.start('/db');

    const stopPromise = mgr.stop();
    // Simulate graceful child exit
    (child as unknown as EventEmitter).emit('exit', 0);
    await stopPromise;

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(mgr.status).toBe('stopped');

    fetchSpy.mockRestore();
  });

  it('escalates to SIGKILL when SIGTERM times out', async () => {
    vi.mocked(createServer).mockImplementation(
      () => makeFakeServer(22223) as unknown as ReturnType<typeof createServer>
    );
    const child = makeFakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }) as unknown as Response);

    const mgr = new BackendLifecycleManager(APP_META, () => '/x');
    await mgr.start('/db');

    const stopPromise = mgr.stop();
    // Let real timeout happen (5s), then check result
    await new Promise((r) => setTimeout(r, 5_200));
    await stopPromise;

    expect(vi.mocked(child.kill).mock.calls).toEqual(expect.arrayContaining([['SIGTERM'], ['SIGKILL']]));

    fetchSpy.mockRestore();
  }, 7_000);
});

describe('BackendLifecycleManager crash restart', () => {
  it('attempts restart on unexpected exit within window', async () => {
    // First createServer call assigns port 60001; subsequent restart uses port 60002
    let portCounter = 60000;
    vi.mocked(createServer).mockImplementation(
      () => makeFakeServer(++portCounter) as unknown as ReturnType<typeof createServer>
    );
    const child1 = makeFakeChild();
    const child2 = makeFakeChild();
    vi.mocked(spawn)
      .mockReturnValueOnce(child1 as unknown as ChildProcess)
      .mockReturnValueOnce(child2 as unknown as ChildProcess);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }) as unknown as Response);

    const mgr = new BackendLifecycleManager(APP_META, () => '/x');
    await mgr.start('/db');
    expect(mgr.status).toBe('running');

    // Simulate first child crash
    (child1 as unknown as EventEmitter).emit('exit', 1);
    // handleCrash schedules restart after 1000ms (2^(1-1) * 1000)
    await new Promise((r) => setTimeout(r, 1_200));

    expect(vi.mocked(spawn)).toHaveBeenCalledTimes(2);

    fetchSpy.mockRestore();
  }, 5_000);
});
