import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startWebHost } from './index.js';

const mocks = vi.hoisted(() => ({
  startBackend: vi.fn(),
  startStaticServer: vi.fn(),
}));
vi.mock('./backend-launcher.js', () => ({ startBackend: mocks.startBackend }));
vi.mock('./static-server.js', () => ({ startStaticServer: mocks.startStaticServer }));

const app = { version: 'test', isPackaged: false, resourcesPath: '/unused', userDataPath: '/unused' };
beforeEach(() => vi.resetAllMocks());

describe('WebUI backend authentication and ownership', () => {
  it('starts owned backends with authentication enabled', async () => {
    mocks.startBackend.mockResolvedValue({ port: 12345, stop: vi.fn() });
    mocks.startStaticServer.mockResolvedValue({ port: 23456, stop: vi.fn() });
    await startWebHost({ app, staticDir: '/unused', backend: { kind: 'ownBackend', resolveBackend: () => '/unused' } });
    expect(mocks.startBackend).toHaveBeenCalledWith(expect.objectContaining({ local: false }));
  });

  it('stops its owned backend if the remote authentication check refuses the listener', async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    mocks.startBackend.mockResolvedValue({ port: 12345, stop });
    mocks.startStaticServer.mockRejectedValue(new Error('authentication required'));
    await expect(
      startWebHost({
        app,
        staticDir: '/unused',
        allowRemote: true,
        backend: { kind: 'ownBackend', resolveBackend: () => '/unused' },
      })
    ).rejects.toThrow('authentication required');
    expect(stop).toHaveBeenCalledOnce();
  });

  it('keeps existing backend ownership and passes remote intent through for verification', async () => {
    mocks.startStaticServer.mockResolvedValue({ port: 23456, stop: vi.fn() });
    await startWebHost({
      app,
      staticDir: '/unused',
      allowRemote: true,
      backend: { kind: 'useExistingBackend', port: 12345 },
    });
    expect(mocks.startBackend).not.toHaveBeenCalled();
    expect(mocks.startStaticServer).toHaveBeenCalledWith(
      expect.objectContaining({ backendPort: 12345, allowRemote: true })
    );
  });
});
