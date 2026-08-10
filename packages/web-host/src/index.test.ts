import { beforeEach, describe, expect, it, vi } from 'vitest';

const startBackend = vi.fn();
const startStaticServer = vi.fn();

vi.mock('./backend-launcher.js', () => ({ startBackend }));
vi.mock('./static-server.js', () => ({ startStaticServer }));

const baseOptions = {
  app: {
    version: '1.0.0',
    isPackaged: true,
    resourcesPath: '/app',
    userDataPath: '/data',
  },
  staticDir: '/app/static',
  dataDir: '/data',
} as const;

describe('startWebHost identity boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startBackend.mockResolvedValue({ port: 43123, localClientSecret: undefined, stop: vi.fn() });
    startStaticServer.mockResolvedValue({
      port: 25808,
      url: 'http://127.0.0.1:25808',
      localUrl: 'http://127.0.0.1:25808',
      stop: vi.fn(),
    });
  });

  it('rejects remote exposure before starting a local-mode backend', async () => {
    const { startWebHost } = await import('./index.js');

    await expect(
      startWebHost({
        ...baseOptions,
        allowRemote: true,
        backend: { kind: 'ownBackend', resolveBackend: () => '/app/aioncore', identityMode: 'local' },
      })
    ).rejects.toThrow('Remote WebUI requires an authenticated webui backend');
    expect(startBackend).not.toHaveBeenCalled();
  });

  it('passes authenticated identity mode to an owned browser backend', async () => {
    const { startWebHost } = await import('./index.js');

    await startWebHost({
      ...baseOptions,
      allowRemote: true,
      backend: { kind: 'ownBackend', resolveBackend: () => '/app/aioncore', identityMode: 'webui' },
    });

    expect(startBackend).toHaveBeenCalledWith(expect.objectContaining({ identityMode: 'webui' }));
  });

  it('returns a local capability only for a caller-owned local backend', async () => {
    startBackend.mockResolvedValue({ port: 43123, localClientSecret: 'a'.repeat(43), stop: vi.fn() });
    const { startWebHost } = await import('./index.js');

    const handle = await startWebHost({
      ...baseOptions,
      allowRemote: false,
      backend: { kind: 'ownBackend', resolveBackend: () => '/app/aioncore', identityMode: 'local' },
    });

    expect(handle.localClientSecret).toBe('a'.repeat(43));
  });
});
