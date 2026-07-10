/**
 * M4 unit tests for backend-launcher.
 * All external I/O mocked: node:child_process.spawn, node:net.createServer, fetch.
 * No real backend is spawned.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import type { Socket } from 'node:net';

// ---- Module-level mocks ----
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
}));

vi.mock('node:net', () => ({
  createServer: vi.fn(),
  connect: vi.fn(),
}));

vi.mock('./agent-process-registry.js', () => ({
  cleanupRegisteredAgentProcesses: vi.fn().mockResolvedValue(undefined),
}));

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import { cleanupRegisteredAgentProcesses } from './agent-process-registry.js';
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

function makeFakeTaskkillChild(): ChildProcess {
  const child = new EventEmitter() as EventEmitter & Partial<ChildProcess>;
  child.unref = vi.fn() as unknown as ChildProcess['unref'];
  return child as ChildProcess;
}

function emitListening(child: ChildProcess, port: number): void {
  child.stdout?.emit('data', Buffer.from(`AIONCORE_LISTENING {"host":"127.0.0.1","port":${port}}\n`));
}

function makeFakeSocket(): Socket {
  const socket = new EventEmitter() as EventEmitter & Partial<Socket>;
  socket.setTimeout = vi.fn(() => socket as Socket) as unknown as Socket['setTimeout'];
  socket.destroy = vi.fn() as unknown as Socket['destroy'];
  socket.end = vi.fn() as unknown as Socket['end'];
  return socket as Socket;
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
      '--managed-resources-mode',
      'bundled',
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
    expect(args).not.toContain('--dump-prompts');
    expect(args).not.toContain('--managed-resources-mode');
    expect(args).not.toContain('--log-dir');
    expect(args).not.toContain('--local');
  });

  it('passes prompt dump flag in development only when AIONUI_DUMP_PROMPTS is enabled', () => {
    const prev = process.env.AIONUI_DUMP_PROMPTS;
    process.env.AIONUI_DUMP_PROMPTS = '1';
    try {
      const args = buildSpawnArgs({
        port: 1,
        dbPath: '/d',
        local: false,
        appVersion: '0.0.1',
        isPackaged: false,
      });

      expect(args).toContain('--dump-prompts');
    } finally {
      if (prev === undefined) delete process.env.AIONUI_DUMP_PROMPTS;
      else process.env.AIONUI_DUMP_PROMPTS = prev;
    }
  });

  it('passes bundled managed resources mode when packaged', () => {
    const prev = process.env.AIONUI_DUMP_PROMPTS;
    process.env.AIONUI_DUMP_PROMPTS = '1';
    try {
      const args = buildSpawnArgs({
        port: 1,
        dbPath: '/d',
        local: false,
        appVersion: '0.0.1',
        isPackaged: true,
      });

      expect(args).toContain('--managed-resources-mode');
      expect(args).toContain('bundled');
      expect(args).not.toContain('--dump-prompts');
    } finally {
      if (prev === undefined) delete process.env.AIONUI_DUMP_PROMPTS;
      else process.env.AIONUI_DUMP_PROMPTS = prev;
    }
  });

  it('passes corrupted database recovery authorization only when requested', () => {
    const args = buildSpawnArgs({
      port: 1,
      dbPath: '/d',
      local: true,
      appVersion: '0.0.1',
      isPackaged: true,
      recoverCorruptedDatabase: true,
    });

    expect(args).toContain('--recover-corrupted-database');
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

  it('resolves the preferred port when it is available', async () => {
    const server = makeFakeServer(65303);
    server.listen = (port, host, cb) => {
      expect(port).toBe(65303);
      expect(host).toBe('127.0.0.1');
      setImmediate(cb);
    };
    vi.mocked(createServer).mockImplementationOnce(() => server as unknown as ReturnType<typeof createServer>);

    const port = await findAvailablePort(65303);

    expect(port).toBe(65303);
  });

  it('skips ports blocked by Fetch so health checks can use the selected port', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      vi.mocked(createServer)
        .mockImplementationOnce(() => makeFakeServer(1720) as unknown as ReturnType<typeof createServer>)
        .mockImplementationOnce(() => makeFakeServer(40404) as unknown as ReturnType<typeof createServer>);

      const port = await findAvailablePort();

      expect(port).toBe(40404);
      expect(createServer).toHaveBeenCalledTimes(2);
      expect(infoSpy).toHaveBeenCalledWith('[aioncore] skipped fetch-blocked backend port 1720');
      expect(infoSpy).toHaveBeenCalledWith('[aioncore] selected backend port 40404 after 2 attempts');
    } finally {
      infoSpy.mockRestore();
    }
  });

  it('does not bind a preferred port when Fetch would block requests to it', async () => {
    const server = makeFakeServer(40404);
    server.listen = (port, host, cb) => {
      expect(port).toBe(0);
      expect(host).toBe('127.0.0.1');
      setImmediate(cb);
    };
    vi.mocked(createServer).mockImplementationOnce(() => server as unknown as ReturnType<typeof createServer>);

    const port = await findAvailablePort(1720);

    expect(port).toBe(40404);
  });

  it('rejects instead of retrying forever when every attempt returns a Fetch-blocked port', async () => {
    vi.mocked(createServer).mockImplementation(
      () => makeFakeServer(1720) as unknown as ReturnType<typeof createServer>
    );

    await expect(findAvailablePort(undefined, 2)).rejects.toThrow('Failed to get a fetch-compatible port');

    expect(createServer).toHaveBeenCalledTimes(2);
  });
});

describe('BackendLifecycleManager.start (success path)', () => {
  it('lets aioncore choose the backend port and waits for the reported listening event', async () => {
    vi.mocked(createServer).mockImplementation(() => {
      throw new Error('launcher must not pre-bind backend ports');
    });
    const child = makeFakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }) as unknown as Response);

    const mgr = new BackendLifecycleManager(APP_META_PACKAGED, () => '/abs/path/aioncore');
    const startPromise = mgr.start('/db/path', '/log/dir', {
      cacheDir: '/c',
      workDir: '/w',
      logDir: '/l',
    });

    await Promise.resolve();
    child.stdout?.emit('data', Buffer.from('AIONCORE_LISTENING {"host":"127.0.0.1","port":55555}\n'));

    const port = await startPromise;

    expect(port).toBe(55555);
    expect(mgr.port).toBe(55555);
    expect(createServer).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith('http://127.0.0.1:55555/health');
    expect(vi.mocked(spawn).mock.calls[0][1]).toEqual([
      '--port',
      '0',
      '--data-dir',
      '/db/path',
      '--parent-pid',
      String(process.pid),
      '--log-level',
      'info',
      '--app-version',
      '1.2.3',
      '--managed-resources-mode',
      'bundled',
      '--log-dir',
      '/log/dir',
      '--work-dir',
      '/w',
      '--local',
    ]);

    fetchSpy.mockRestore();
  });

  it('spawns with correct args, waits for /health, reports running', async () => {
    const child = makeFakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }) as unknown as Response);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const resolveBackend = vi.fn(() => '/abs/path/aioncore');
    const mgr = new BackendLifecycleManager(APP_META_PACKAGED, resolveBackend);

    try {
      const startPromise = mgr.start('/db/path', '/log/dir', {
        cacheDir: '/c',
        workDir: '/w',
        logDir: '/l',
      });
      await Promise.resolve();
      emitListening(child, 55555);

      const port = await startPromise;

      expect(port).toBe(55555);
      expect(mgr.port).toBe(55555);
      expect(mgr.status).toBe('running');
      expect(resolveBackend).toHaveBeenCalledTimes(1);
      expect(spawn).toHaveBeenCalledTimes(1);

      const spawnCall = vi.mocked(spawn).mock.calls[0];
      expect(spawnCall[0]).toBe('/abs/path/aioncore');
      expect(spawnCall[1]).toEqual([
        '--port',
        '0',
        '--data-dir',
        '/db/path',
        '--parent-pid',
        String(process.pid),
        '--log-level',
        'info',
        '--app-version',
        '1.2.3',
        '--managed-resources-mode',
        'bundled',
        '--log-dir',
        '/log/dir',
        '--work-dir',
        '/w',
        '--local',
      ]);
      const opts = spawnCall[2] as { cwd?: string; env: NodeJS.ProcessEnv };
      expect(opts.cwd).toBe('/w');
      expect(opts.env.AIONUI_CACHE_DIR).toBe('/c');
      expect(opts.env.AIONUI_WORK_DIR).toBe('/w');
      expect(opts.env.AIONUI_LOG_DIR).toBe('/l');
      expect((spawnCall[2] as { detached?: boolean }).detached).toBe(process.platform !== 'win32');
      expect(mkdirSync).toHaveBeenCalledWith('/db/path', { recursive: true });
      expect(mkdirSync).toHaveBeenCalledWith('/log/dir', { recursive: true });
      expect(mkdirSync).toHaveBeenCalledWith('/w', { recursive: true });
      expect(mkdirSync).toHaveBeenCalledWith('/l', { recursive: true });

      expect(fetchSpy).toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[aioncore] health ready on port 55555 after 1 attempts, elapsed_ms=')
      );
    } finally {
      fetchSpy.mockRestore();
      infoSpy.mockRestore();
    }
  });
});

describe('BackendLifecycleManager.start (health timeout)', () => {
  it('fails before spawn when startup directory preparation fails', async () => {
    vi.mocked(mkdirSync).mockImplementationOnce(() => {
      throw new Error('EPERM: operation not permitted, mkdir /db/path');
    });

    const mgr = new BackendLifecycleManager(APP_META_PACKAGED, () => '/abs/path/aioncore');

    await expect(
      mgr.start('/db/path', '/log/dir', {
        cacheDir: '/cache',
        workDir: '/work',
        logDir: '/log',
      })
    ).rejects.toMatchObject({
      name: 'BackendStartupError',
      details: expect.objectContaining({
        causeMessage: 'EPERM: operation not permitted, mkdir /db/path',
        stage: 'spawn',
      }),
    });

    expect(spawn).not.toHaveBeenCalled();
    expect(mgr.status).toBe('error');
  });

  it('captures backend boundary code and stage from early-exit stderr', async () => {
    vi.useFakeTimers();
    vi.mocked(createServer).mockImplementation(
      () => makeSyncFakeServer(33337) as unknown as ReturnType<typeof createServer>
    );
    const child = makeFakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

    const mgr = new BackendLifecycleManager(APP_META_PACKAGED, () => '/abs/path/aioncore');
    const startPromise = mgr.start('/db/path', '/log/dir', {
      cacheDir: '/cache',
      workDir: '/work',
      logDir: '/log',
    });

    await Promise.resolve();
    child.stderr?.emit(
      'data',
      Buffer.from(
        'BOOTSTRAP_DATA_INIT_FAILED stage=database.open databasePath=/db/path/aionui-backend.db: failed to initialize application data\n'
      )
    );
    child.emit('exit', 1, null);
    child.emit('close', 1, null);

    await expect(startPromise).rejects.toMatchObject({
      name: 'BackendStartupError',
      details: expect.objectContaining({
        backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
        backendBoundaryStage: 'database.open',
      }),
    });
  });

  it('captures backend boundary code when stderr drains after exit but before close', async () => {
    vi.useFakeTimers();
    vi.mocked(createServer).mockImplementation(
      () => makeSyncFakeServer(33337) as unknown as ReturnType<typeof createServer>
    );
    const child = makeFakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

    const mgr = new BackendLifecycleManager(APP_META_PACKAGED, () => '/abs/path/aioncore');
    const startPromise = mgr.start('/db/path', '/log/dir', {
      cacheDir: '/cache',
      workDir: '/work',
      logDir: '/log',
    });

    await Promise.resolve();
    child.emit('exit', 1, null);
    child.stderr?.emit(
      'data',
      Buffer.from(
        'BOOTSTRAP_DATA_INIT_FAILED stage=database.migration databasePath=/db/path/aionui-backend.db: failed to initialize application data\n'
      )
    );
    child.emit('close', 1, null);

    await expect(startPromise).rejects.toMatchObject({
      name: 'BackendStartupError',
      details: expect.objectContaining({
        backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
        backendBoundaryStage: 'database.migration',
      }),
    });
  });

  it('kills child and reports listen_timeout when aioncore never reports a port', async () => {
    vi.useFakeTimers();
    const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    const child = makeFakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const mgr = new BackendLifecycleManager(APP_META_PACKAGED, () => '/abs/path/aioncore');
    const startPromise = mgr.start('/db/path');
    const expectedRejection = expect(startPromise).rejects.toMatchObject({
      name: 'BackendStartupError',
      details: expect.objectContaining({
        stage: 'listen_timeout',
        port: 0,
      }),
    });

    await vi.advanceTimersByTimeAsync(31_000);
    await expectedRejection;

    expect(mgr.status).toBe('error');
    expect(killSpy).toHaveBeenCalled();

    killSpy.mockRestore();
    platformSpy.mockRestore();
  }, 15_000);

  it('kills child and throws when /health never responds OK within timeout', async () => {
    vi.useFakeTimers();
    const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    vi.mocked(createServer).mockImplementation(
      () => makeFakeServer(33333) as unknown as ReturnType<typeof createServer>
    );
    const child = makeFakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const mgr = new BackendLifecycleManager(APP_META, () => '/x');
    const startPromise = mgr.start('/db');
    const expectedRejection = expect(startPromise).rejects.toThrow(/failed to start within timeout/);

    await Promise.resolve();
    emitListening(child, 33333);

    // First await the timer advance so all setTimeout callbacks fire
    await vi.advanceTimersByTimeAsync(31_000);
    // Then await the rejection
    await expectedRejection;

    expect(mgr.status).toBe('error');
    expect(killSpy).toHaveBeenCalled();

    fetchSpy.mockRestore();
    killSpy.mockRestore();
    platformSpy.mockRestore();
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
    emitListening(child, 33334);
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

    await Promise.resolve();
    emitListening(child, 33336);
    await vi.advanceTimersByTimeAsync(31_000);
    await expectedRejection;

    fetchSpy.mockRestore();
  }, 15_000);

  it('records when server listening appears before health check times out', async () => {
    vi.useFakeTimers();
    vi.mocked(createServer).mockImplementation(
      () => makeSyncFakeServer(33337) as unknown as ReturnType<typeof createServer>
    );
    const child = makeFakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));

    const mgr = new BackendLifecycleManager(APP_META_PACKAGED, () => '/abs/path/aioncore');
    const startPromise = mgr.start('/db/path');
    const expectedRejection = expect(startPromise).rejects.toMatchObject({
      name: 'BackendStartupError',
      details: expect.objectContaining({
        stage: 'health_timeout',
        port: 33337,
        healthCheckLastError: 'fetch failed',
        serverListeningObserved: true,
        serverListeningObservedAfterMs: expect.any(Number),
        serverListeningLine: expect.stringContaining('AIONCORE_LISTENING'),
      }),
    });

    await Promise.resolve();
    emitListening(child, 33337);
    await vi.advanceTimersByTimeAsync(31_000);

    await expectedRejection;

    fetchSpy.mockRestore();
  }, 15_000);

  it('records TCP reachability when fetch fails after the server starts listening', async () => {
    vi.useFakeTimers();
    vi.mocked(createServer).mockImplementation(
      () => makeSyncFakeServer(33338) as unknown as ReturnType<typeof createServer>
    );
    const child = makeFakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

    const socket = makeFakeSocket();
    vi.mocked(connect).mockImplementation((_options, onConnect) => {
      queueMicrotask(() => onConnect?.());
      return socket;
    });

    const fetchError = new TypeError('fetch failed') as TypeError & { cause?: NodeJS.ErrnoException };
    fetchError.cause = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:33338'), {
      code: 'ECONNREFUSED',
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(fetchError);

    const mgr = new BackendLifecycleManager(APP_META_PACKAGED, () => '/abs/path/aioncore');
    const startPromise = mgr.start('/db/path');
    const expectedRejection = expect(startPromise).rejects.toMatchObject({
      details: expect.objectContaining({
        backendPid: 99999,
        healthCheckUrl: 'http://127.0.0.1:33338/health',
        healthCheckTimeoutMs: 30_000,
        healthCheckIntervalMs: 200,
        healthCheckExpectedAttempts: 150,
        healthCheckElapsedMs: expect.any(Number),
        healthCheckLastAttemptAfterMs: expect.any(Number),
        healthCheckAttemptDeficit: expect.any(Number),
        healthCheckTimeoutOverrunMs: expect.any(Number),
        healthCheckPollingDelayed: expect.any(Boolean),
        healthCheckLastError: 'fetch failed',
        healthCheckLastErrorName: 'TypeError',
        healthCheckLastErrorCauseMessage: 'connect ECONNREFUSED 127.0.0.1:33338',
        healthCheckLastErrorCauseCode: 'ECONNREFUSED',
        healthCheckTcpProbeOk: true,
        healthCheckTcpProbeElapsedMs: expect.any(Number),
        healthCheckTcpProbeTimeoutMs: 1_000,
      }),
    });

    await Promise.resolve();
    emitListening(child, 33338);
    await vi.advanceTimersByTimeAsync(31_000);

    await expectedRejection;

    expect(connect).toHaveBeenCalledWith({ host: '127.0.0.1', port: 33338 }, expect.any(Function));
    expect(socket.destroy).toHaveBeenCalled();
    fetchSpy.mockRestore();
  }, 15_000);

  it('records polling delay when a health attempt stalls past the timeout', async () => {
    vi.useFakeTimers();
    vi.mocked(createServer).mockImplementation(
      () => makeSyncFakeServer(33340) as unknown as ReturnType<typeof createServer>
    );
    const child = makeFakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

    const socket = makeFakeSocket();
    vi.mocked(connect).mockImplementation(() => {
      queueMicrotask(() => {
        socket.emit(
          'error',
          Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:33340'), { code: 'ECONNREFUSED' })
        );
      });
      return socket;
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((_resolve, reject) => {
          setTimeout(() => reject(new Error('fetch failed')), 545_000);
        })
    );

    const mgr = new BackendLifecycleManager(APP_META_PACKAGED, () => '/abs/path/aioncore');
    const startPromise = mgr.start('/db/path');
    const expectedRejection = expect(startPromise).rejects.toMatchObject({
      details: expect.objectContaining({
        port: 33340,
        healthCheckAttempts: 1,
        healthCheckExpectedAttempts: 150,
        healthCheckAttemptDeficit: 149,
        healthCheckPollingDelayed: true,
        healthCheckTimeoutOverrunMs: expect.any(Number),
      }),
    });

    await Promise.resolve();
    emitListening(child, 33340);
    await vi.advanceTimersByTimeAsync(545_250);
    await expectedRejection;

    fetchSpy.mockRestore();
  }, 15_000);

  it('records TCP connection errors when fetch fails and the port is unreachable', async () => {
    vi.useFakeTimers();
    vi.mocked(createServer).mockImplementation(
      () => makeSyncFakeServer(33339) as unknown as ReturnType<typeof createServer>
    );
    const child = makeFakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

    const socket = makeFakeSocket();
    vi.mocked(connect).mockImplementation(() => {
      queueMicrotask(() => {
        socket.emit(
          'error',
          Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:33339'), { code: 'ECONNREFUSED' })
        );
      });
      return socket;
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));

    const mgr = new BackendLifecycleManager(APP_META_PACKAGED, () => '/abs/path/aioncore');
    const startPromise = mgr.start('/db/path');
    const expectedRejection = expect(startPromise).rejects.toMatchObject({
      details: expect.objectContaining({
        port: 33339,
        healthCheckLastError: 'fetch failed',
        healthCheckTcpProbeOk: false,
        healthCheckTcpProbeError: 'connect ECONNREFUSED 127.0.0.1:33339',
        healthCheckTcpProbeErrorName: 'Error',
        healthCheckTcpProbeErrorCode: 'ECONNREFUSED',
        healthCheckTcpProbeElapsedMs: expect.any(Number),
      }),
    });

    await Promise.resolve();
    emitListening(child, 33339);
    await vi.advanceTimersByTimeAsync(31_000);

    await expectedRejection;

    expect(socket.destroy).toHaveBeenCalled();
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

    await Promise.resolve();
    emitListening(child, 33335);
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
  it('rejects startup as cancelled when stopped before health check passes', async () => {
    vi.mocked(createServer).mockImplementation(
      () => makeSyncFakeServer(22221) as unknown as ReturnType<typeof createServer>
    );
    const child = makeFakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const mgr = new BackendLifecycleManager(APP_META, () => '/x');
    const startPromise = mgr.start('/db');

    await Promise.resolve();
    const stopPromise = mgr.stop();
    (child as unknown as EventEmitter).emit('exit', null, 'SIGTERM');
    (child as unknown as EventEmitter).emit('close', null, 'SIGTERM');
    await stopPromise;

    await expect(startPromise).rejects.toMatchObject({
      name: 'BackendStartupCancelledError',
    });
    expect(mgr.status).toBe('stopped');

    fetchSpy.mockRestore();
  });

  it('sends SIGTERM then resolves when child emits exit', async () => {
    const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    vi.mocked(createServer).mockImplementation(
      () => makeFakeServer(22222) as unknown as ReturnType<typeof createServer>
    );
    const child = makeFakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }) as unknown as Response);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const mgr = new BackendLifecycleManager(APP_META, () => '/x');
    const startPromise = mgr.start('/db');
    await Promise.resolve();
    emitListening(child, 22222);
    await startPromise;

    const stopPromise = mgr.stop();
    // Simulate graceful child exit
    (child as unknown as EventEmitter).emit('exit', 0);
    await stopPromise;

    expect(killSpy).toHaveBeenCalled();
    expect(cleanupRegisteredAgentProcesses).toHaveBeenCalledWith('/db');
    expect(mgr.status).toBe('stopped');

    fetchSpy.mockRestore();
    killSpy.mockRestore();
    platformSpy.mockRestore();
  });

  it('escalates to SIGKILL when SIGTERM times out', async () => {
    const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    vi.mocked(createServer).mockImplementation(
      () => makeFakeServer(22223) as unknown as ReturnType<typeof createServer>
    );
    const child = makeFakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }) as unknown as Response);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const mgr = new BackendLifecycleManager(APP_META, () => '/x');
    const startPromise = mgr.start('/db');
    await Promise.resolve();
    emitListening(child, 22223);
    await startPromise;

    const stopPromise = mgr.stop();
    // Let real timeout happen (5s), then check result
    await new Promise((r) => setTimeout(r, 5_200));
    await stopPromise;

    expect(killSpy.mock.calls).toEqual(expect.arrayContaining([[expect.any(Number), 'SIGTERM']]));
    expect(killSpy.mock.calls).toEqual(expect.arrayContaining([[expect.any(Number), 'SIGKILL']]));
    expect(cleanupRegisteredAgentProcesses).toHaveBeenCalledWith('/db');

    fetchSpy.mockRestore();
    killSpy.mockRestore();
    platformSpy.mockRestore();
  }, 7_000);

  it('waits for Windows taskkill to finish before cleaning registered agent processes', async () => {
    const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    vi.mocked(createServer).mockImplementation(
      () => makeFakeServer(22224) as unknown as ReturnType<typeof createServer>
    );
    const child = makeFakeChild();
    const taskkillChild = makeFakeTaskkillChild();
    vi.mocked(spawn)
      .mockReturnValueOnce(child as unknown as ChildProcess)
      .mockReturnValueOnce(taskkillChild as unknown as ChildProcess);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }) as unknown as Response);

    const mgr = new BackendLifecycleManager(APP_META, () => '/x');
    const startPromise = mgr.start('/db');
    await Promise.resolve();
    emitListening(child, 22224);
    await startPromise;

    const stopPromise = mgr.stop();
    child.emit('exit', 0);
    await Promise.resolve();

    expect(cleanupRegisteredAgentProcesses).not.toHaveBeenCalledWith('/db');

    taskkillChild.emit('close', 0);
    await stopPromise;

    expect(spawn).toHaveBeenLastCalledWith('taskkill', ['/PID', '99999', '/T'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    expect(cleanupRegisteredAgentProcesses).toHaveBeenCalledWith('/db');

    fetchSpy.mockRestore();
    platformSpy.mockRestore();
  });

  it('waits for forced Windows taskkill before cleanup when graceful stop times out', async () => {
    vi.useFakeTimers();
    const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    vi.mocked(createServer).mockImplementation(
      () => makeSyncFakeServer(22225) as unknown as ReturnType<typeof createServer>
    );
    const child = makeFakeChild();
    const gracefulTaskkillChild = makeFakeTaskkillChild();
    const forcedTaskkillChild = makeFakeTaskkillChild();
    vi.mocked(spawn)
      .mockReturnValueOnce(child as unknown as ChildProcess)
      .mockReturnValueOnce(gracefulTaskkillChild as unknown as ChildProcess)
      .mockReturnValueOnce(forcedTaskkillChild as unknown as ChildProcess);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }) as unknown as Response);

    const mgr = new BackendLifecycleManager(APP_META, () => '/x');
    const startPromise = mgr.start('/db');
    await Promise.resolve();
    emitListening(child, 22225);
    await startPromise;

    const stopPromise = mgr.stop();
    gracefulTaskkillChild.emit('close', 0);
    await vi.advanceTimersByTimeAsync(5_000);
    await Promise.resolve();

    expect(cleanupRegisteredAgentProcesses).not.toHaveBeenCalledWith('/db');

    forcedTaskkillChild.emit('close', 0);
    await stopPromise;

    expect(spawn).toHaveBeenLastCalledWith('taskkill', ['/F', '/PID', '99999', '/T'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    expect(cleanupRegisteredAgentProcesses).toHaveBeenCalledWith('/db');

    fetchSpy.mockRestore();
    platformSpy.mockRestore();
  });
});

describe('BackendLifecycleManager crash restart', () => {
  it('restarts on the existing backend port after an unexpected exit', async () => {
    const child1 = makeFakeChild();
    const child2 = makeFakeChild();
    vi.mocked(spawn)
      .mockReturnValueOnce(child1 as unknown as ChildProcess)
      .mockReturnValueOnce(child2 as unknown as ChildProcess);
    const onReady = vi.fn();

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }) as unknown as Response);

    const mgr = new BackendLifecycleManager(APP_META, () => '/x');
    const startPromise = mgr.start('/db', undefined, undefined, { onReady });
    await Promise.resolve();
    emitListening(child1, 65303);
    await startPromise;
    expect(mgr.status).toBe('running');
    expect(vi.mocked(spawn).mock.calls[0][1]).toContain('0');

    (child1 as unknown as EventEmitter).emit('exit', 1, 'SIGABRT');
    await new Promise((r) => setTimeout(r, 1_200));
    emitListening(child2, 65303);
    await new Promise((r) => setTimeout(r, 1));

    expect(vi.mocked(spawn)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(spawn).mock.calls[1][1]).toContain('65303');
    expect(mgr.port).toBe(65303);
    expect(onReady).toHaveBeenCalledWith(65303);

    fetchSpy.mockRestore();
  }, 5_000);

  it('logs crash restart scheduling details', async () => {
    vi.mocked(createServer).mockImplementation(
      () => makeFakeServer(65303) as unknown as ReturnType<typeof createServer>
    );
    const child1 = makeFakeChild();
    const child2 = makeFakeChild();
    vi.mocked(spawn)
      .mockReturnValueOnce(child1 as unknown as ChildProcess)
      .mockReturnValueOnce(child2 as unknown as ChildProcess);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }) as unknown as Response);

    const mgr = new BackendLifecycleManager(APP_META, () => '/x');
    const startPromise = mgr.start('/db');
    await Promise.resolve();
    emitListening(child1, 65303);
    await startPromise;

    (child1 as unknown as EventEmitter).emit('exit', 1, 'SIGABRT');
    await new Promise((r) => setTimeout(r, 1_200));

    expect(warnSpy).toHaveBeenCalledWith('[aioncore] child exited unexpectedly; scheduling restart', {
      exitCode: 1,
      signal: 'SIGABRT',
      port: 65303,
      restartCount: 1,
      maxRestarts: 3,
      delayMs: 1000,
    });

    warnSpy.mockRestore();
    fetchSpy.mockRestore();
  }, 5_000);

  it('does not reuse corrupted database recovery authorization during crash restart', async () => {
    const child1 = makeFakeChild();
    const child2 = makeFakeChild();
    vi.mocked(spawn)
      .mockReturnValueOnce(child1 as unknown as ChildProcess)
      .mockReturnValueOnce(child2 as unknown as ChildProcess);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }) as unknown as Response);

    const mgr = new BackendLifecycleManager(APP_META_PACKAGED, () => '/x');
    const startPromise = mgr.start('/db', undefined, undefined, undefined, undefined, {
      recoverCorruptedDatabase: true,
    });
    await Promise.resolve();
    emitListening(child1, 65303);
    await startPromise;

    (child1 as unknown as EventEmitter).emit('exit', 1, 'SIGABRT');
    await new Promise((r) => setTimeout(r, 1_200));

    const firstSpawnArgs = vi.mocked(spawn).mock.calls[0]?.[1] as string[];
    const restartSpawnArgs = vi.mocked(spawn).mock.calls[1]?.[1] as string[];
    expect(firstSpawnArgs).toContain('--recover-corrupted-database');
    expect(restartSpawnArgs).not.toContain('--recover-corrupted-database');

    fetchSpy.mockRestore();
  }, 5_000);

  it('logs when crash restart limit is exceeded', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mgr = new BackendLifecycleManager(APP_META, () => '/x') as unknown as {
      restartCount: number;
      restartWindowStart: number;
      handleCrash: (code: number | null, signal?: NodeJS.Signals | string | null) => void;
      status: string;
    };
    mgr.restartCount = 3;
    mgr.restartWindowStart = Date.now();

    mgr.handleCrash(1, 'SIGABRT');

    expect(mgr.status).toBe('error');
    expect(errorSpy).toHaveBeenCalledWith('[aioncore] child exited unexpectedly; restart limit exceeded', {
      exitCode: 1,
      signal: 'SIGABRT',
      port: 0,
      restartCount: 4,
      maxRestarts: 3,
    });

    errorSpy.mockRestore();
  });
});
