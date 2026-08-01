/**
 * Tests for startWebHost (M6)
 *
 * After the M6 auth cleanup, startWebHost is a thin orchestrator: start backend,
 * start static-server, return the combined handle. No credentials, no config
 * file reads — the caller (Electron main process, aionui-web CLI) resolves
 * port / allowRemote from its own source of truth.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

describe('startWebHost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure each test's vi.doMock takes effect on the fresh dynamic import of
    // ../src/index.js (which itself dynamically imports the mocked modules).
    vi.resetModules();
  });

  afterEach(() => {
    // Runs even when an assertion fails, so no mock leaks into the next test.
    vi.doUnmock('../src/backend-launcher.js');
    vi.doUnmock('../src/static-server.js');
  });

  test('Returns handle without initialPassword', async () => {
    // Mock backend-launcher
    vi.doMock('../src/backend-launcher.js', () => ({
      startBackend: vi.fn().mockResolvedValue({
        port: 55555,
        stop: vi.fn().mockResolvedValue(undefined),
      }),
    }));

    // Mock static-server
    vi.doMock('../src/static-server.js', () => ({
      startStaticServer: vi.fn().mockResolvedValue({
        port: 33000,
        url: 'http://127.0.0.1:33000',
        localUrl: 'http://127.0.0.1:33000',
        stop: vi.fn().mockResolvedValue(undefined),
      }),
    }));

    const { startWebHost } = await import('../src/index.js');

    const handle = await startWebHost({
      app: {
        version: '1.0.0',
        isPackaged: false,
        resourcesPath: '/app',
        userDataPath: '/tmp/test-data',
      },
      staticDir: '/tmp/static',
      backend: {
        kind: 'ownBackend',
        resolveBackend: () => '/bin/backend',
      },
    });

    // No initialPassword field on the handle — admin credentials flow through
    // backend's /api/webui/reset-password, not through startWebHost.
    expect('initialPassword' in handle).toBe(false);
    expect(handle.port).toBe(33000);
    expect(handle.backendPort).toBe(55555);

    await handle.stop();
  });

  test('Backend port conflict: throws and does not leak resources', async () => {
    const startBackend = vi.fn().mockRejectedValue(new Error('EADDRINUSE: port in use'));
    const startStaticServer = vi.fn();

    vi.doMock('../src/backend-launcher.js', () => ({ startBackend }));
    vi.doMock('../src/static-server.js', () => ({ startStaticServer }));

    const { startWebHost } = await import('../src/index.js');

    await expect(
      startWebHost({
        app: {
          version: '1.0.0',
          isPackaged: false,
          resourcesPath: '/app',
          userDataPath: '/tmp/test-data',
        },
        staticDir: '/tmp/static',
        backend: {
          kind: 'ownBackend',
          resolveBackend: () => '/bin/backend',
        },
      })
    ).rejects.toThrow('EADDRINUSE');

    // Static server must never start when the backend failed to come up.
    expect(startStaticServer).not.toHaveBeenCalled();
  });

  test('Static-server port conflict: cleans up backend before throwing', async () => {
    // Deferred stop: proves startWebHost *awaits* backend cleanup before
    // rejecting, rather than fire-and-forget (`void stop(); throw err`).
    let backendStopped = false;
    let openStopGate!: () => void;
    const stopGate = new Promise<void>((resolve) => {
      openStopGate = resolve;
    });
    const backendStop = vi.fn().mockImplementation(async () => {
      await stopGate;
      backendStopped = true;
    });
    const startBackend = vi.fn().mockResolvedValue({ port: 55555, stop: backendStop });
    const startStaticServer = vi.fn().mockRejectedValue(new Error('EADDRINUSE: static port in use'));

    vi.doMock('../src/backend-launcher.js', () => ({ startBackend }));
    vi.doMock('../src/static-server.js', () => ({ startStaticServer }));

    const { startWebHost } = await import('../src/index.js');

    const startPromise = startWebHost({
      app: {
        version: '1.0.0',
        isPackaged: false,
        resourcesPath: '/app',
        userDataPath: '/tmp/test-data',
      },
      staticDir: '/tmp/static',
      backend: {
        kind: 'ownBackend',
        resolveBackend: () => '/bin/backend',
      },
    });

    let rejected = false;
    const outcome = startPromise.catch((err: unknown) => {
      rejected = true;
      return err;
    });

    // Give startWebHost a chance to reject prematurely (it must not — the
    // backend stop promise is still pending).
    await vi.waitFor(() => expect(backendStop).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(rejected).toBe(false);

    // Only after backend cleanup completes may the error propagate.
    openStopGate();
    const err = await outcome;
    expect(rejected).toBe(true);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('EADDRINUSE');
    expect(backendStopped).toBe(true);
  });

  test('Stop cleanup: stops static-server then backend in sequence', async () => {
    const stopOrder: string[] = [];
    const backendStop = vi.fn().mockImplementation(async () => {
      stopOrder.push('backend');
    });
    const staticStop = vi.fn().mockImplementation(async () => {
      stopOrder.push('static');
    });

    vi.doMock('../src/backend-launcher.js', () => ({
      startBackend: vi.fn().mockResolvedValue({ port: 55555, stop: backendStop }),
    }));
    vi.doMock('../src/static-server.js', () => ({
      startStaticServer: vi.fn().mockResolvedValue({
        port: 33000,
        url: 'http://127.0.0.1:33000',
        localUrl: 'http://127.0.0.1:33000',
        stop: staticStop,
      }),
    }));

    const { startWebHost } = await import('../src/index.js');

    const handle = await startWebHost({
      app: {
        version: '1.0.0',
        isPackaged: false,
        resourcesPath: '/app',
        userDataPath: '/tmp/test-data',
      },
      staticDir: '/tmp/static',
      backend: {
        kind: 'ownBackend',
        resolveBackend: () => '/bin/backend',
      },
    });

    await handle.stop();

    // Static server (front door) closes first, then the backend it proxies to.
    expect(stopOrder).toEqual(['static', 'backend']);
    expect(staticStop).toHaveBeenCalledTimes(1);
    expect(backendStop).toHaveBeenCalledTimes(1);
  });
});
