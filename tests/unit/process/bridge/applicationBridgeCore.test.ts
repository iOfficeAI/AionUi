import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/common', () => ({
  ipcBridge: {
    application: {
      systemInfo: { provider: vi.fn() },
      updateSystemInfo: { provider: vi.fn() },
      getPath: { provider: vi.fn() },
      restart: { provider: vi.fn() },
      openDevTools: { provider: vi.fn() },
      isDevToolsOpened: { provider: vi.fn() },
      getZoomFactor: { provider: vi.fn() },
      setZoomFactor: { provider: vi.fn() },
      getCdpStatus: { provider: vi.fn() },
      updateCdpConfig: { provider: vi.fn() },
      logStream: { emit: vi.fn() },
      devToolsStateChanged: { emit: vi.fn() },
    },
  },
}));

vi.mock('@process/utils/initStorage', () => ({
  getSystemDir: () => ({
    cacheDir: '/mock/cache',
    workDir: '/mock/work',
    logDir: '/mock/logs',
    platform: 'linux',
    arch: 'x64',
  }),
  ProcessEnv: { set: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@process/utils', () => ({
  copyDirectoryRecursively: vi.fn().mockResolvedValue(undefined),
}));

describe('initApplicationBridgeCore', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('imports without requiring electron', async () => {
    const mod = await import('@process/bridge/applicationBridgeCore');
    expect(mod.initApplicationBridgeCore).toBeTypeOf('function');
  });

  it('registers systemInfo and updateSystemInfo providers', async () => {
    const { ipcBridge } = await import('@/common');
    const { initApplicationBridgeCore } = await import('@process/bridge/applicationBridgeCore');
    initApplicationBridgeCore();
    expect(ipcBridge.application.systemInfo.provider).toHaveBeenCalledOnce();
    expect(ipcBridge.application.updateSystemInfo.provider).toHaveBeenCalledOnce();
  });
});
