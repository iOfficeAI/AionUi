/**
 * Tests for startWebHost (M6)
 *
 * After the M6 auth cleanup, startWebHost is a thin orchestrator: start backend,
 * start static-server, return the combined handle. No credentials, no config
 * file reads — the caller (Electron main process, aionui-web CLI) resolves
 * port / allowRemote from its own source of truth.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

describe('startWebHost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    vi.doUnmock('../src/backend-launcher.js');
    vi.doUnmock('../src/static-server.js');
  });

  test.todo('Backend port conflict: throws and does not leak resources');
  test.todo('Static-server port conflict: cleans up backend before throwing');
  test.todo('Stop cleanup: stops static-server then backend in sequence');
});
