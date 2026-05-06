import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    shell: {
      openExternal: {
        invoke: (...args: unknown[]) => mockInvoke(...args),
      },
    },
  },
}));

describe('openExternalUrl', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('forwards allowed https urls to the Electron shell bridge', async () => {
    const mod = await import('@/renderer/utils/platform');
    window.electronAPI = {};

    await mod.openExternalUrl('https://example.com/docs');

    expect(mockInvoke).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('blocks unsupported protocols before hitting the shell bridge', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await import('@/renderer/utils/platform');
    window.electronAPI = {};

    await mod.openExternalUrl('file:///etc/passwd');

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[platform] Blocked unsupported external URL protocol: file:');
    warnSpy.mockRestore();
  });

  it('blocks invalid urls in browser mode without calling window.open', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const mod = await import('@/renderer/utils/platform');
    delete window.electronAPI;

    await mod.openExternalUrl('not-a-valid-url');

    expect(windowOpenSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[platform] Invalid URL passed to openExternalUrl: not-a-valid-url');
    warnSpy.mockRestore();
    windowOpenSpy.mockRestore();
  });
});
