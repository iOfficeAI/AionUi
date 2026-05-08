/**
 * Tests for startWebHost (M6 Phase 3)
 *
 * Coverage: first-run password generation, existing config reuse, error cleanup.
 * Mock strategy: mock readConfig, resetPassword, startBackend, startStaticServer.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

describe('startWebHost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('First-run: generates password when config has empty passwordHash', async () => {
    // Mock auth/config
    vi.doMock('../src/auth/config.js', () => ({
      readConfig: vi.fn().mockResolvedValue({
        passwordHash: '',
        adminUsername: 'admin',
      }),
    }));

    // Mock auth/index
    vi.doMock('../src/auth/index.js', () => ({
      resetPassword: vi.fn().mockResolvedValue('GeneratedPass123'),
    }));

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
    const { resetPassword } = await import('../src/auth/index.js');

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

    expect(resetPassword).toHaveBeenCalledWith({
      app: expect.objectContaining({ userDataPath: '/tmp/test-data' }),
    });
    expect(handle.initialPassword).toBe('GeneratedPass123');
    expect(handle.port).toBe(33000);
    expect(handle.backendPort).toBe(55555);

    await handle.stop();

    vi.doUnmock('../src/auth/config.js');
    vi.doUnmock('../src/auth/index.js');
    vi.doUnmock('../src/backend-launcher.js');
    vi.doUnmock('../src/static-server.js');
  });

  test.todo('Existing config: reuses password when passwordHash exists');
  test.todo('Backend port conflict: throws and does not leak resources');
  test.todo('Static-server port conflict: cleans up backend before throwing');
  test.todo('Stop cleanup: stops static-server then backend in sequence');
});
