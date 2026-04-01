/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const originalPlatform = process.platform;
const originalArgv = [...process.argv];

const setPlatform = (platform: NodeJS.Platform): void => {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  });
};

describe('applicationBridge start-on-boot helpers', () => {
  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
    process.argv = [...originalArgv];
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock('electron');
  });

  const mockBridgeDependencies = (): void => {
    vi.doMock('@/common', () => ({
      ipcBridge: {
        application: {
          restart: { provider: vi.fn() },
          isDevToolsOpened: { provider: vi.fn() },
          openDevTools: { provider: vi.fn() },
          getZoomFactor: { provider: vi.fn() },
          setZoomFactor: { provider: vi.fn() },
          getCdpStatus: { provider: vi.fn() },
          updateCdpConfig: { provider: vi.fn() },
          getStartOnBootStatus: { provider: vi.fn() },
          setStartOnBoot: { provider: vi.fn() },
        },
      },
    }));

    vi.doMock('@process/utils/initStorage', () => ({
      ProcessConfig: {
        get: vi.fn(),
        set: vi.fn(),
      },
    }));

    vi.doMock('@process/utils/zoom', () => ({
      getZoomFactor: vi.fn(() => 1),
      setZoomFactor: vi.fn((factor: number) => factor),
    }));

    vi.doMock('@process/utils/configureChromium', () => ({
      getCdpStatus: vi.fn(() => ({
        enabled: false,
        port: null,
        startupEnabled: false,
        instances: [],
        configEnabled: false,
        isDevMode: false,
      })),
      updateCdpConfig: vi.fn(),
    }));

    vi.doMock('@process/bridge/applicationBridgeCore', () => ({
      initApplicationBridgeCore: vi.fn(),
    }));
  };

  it('reports the packaged macOS login-item state', async () => {
    setPlatform('darwin');
    mockBridgeDependencies();

    vi.doMock('electron', () => ({
      app: {
        isPackaged: true,
        getLoginItemSettings: vi.fn(() => ({ openAtLogin: true })),
        setLoginItemSettings: vi.fn(),
      },
    }));

    const { getStartOnBootStatus } = await import('@process/bridge/applicationBridge');

    expect(getStartOnBootStatus()).toEqual({
      supported: true,
      enabled: true,
      isPackaged: true,
      platform: 'darwin',
    });
  });

  it('detects login launches on packaged macOS', async () => {
    setPlatform('darwin');
    mockBridgeDependencies();

    vi.doMock('electron', () => ({
      app: {
        isPackaged: true,
        getLoginItemSettings: vi.fn(() => ({
          openAtLogin: true,
          wasOpenedAtLogin: true,
        })),
        setLoginItemSettings: vi.fn(),
      },
    }));

    const { wasLaunchedAtLogin } = await import('@process/bridge/applicationBridge');

    expect(wasLaunchedAtLogin()).toBe(true);
  });

  it('updates Windows start-on-boot via login item settings', async () => {
    setPlatform('win32');
    mockBridgeDependencies();

    let openAtLogin = false;
    const getLoginItemSettings = vi.fn(() => ({
      openAtLogin,
      executableWillLaunchAtLogin: openAtLogin,
    }));
    const setLoginItemSettings = vi.fn(({ openAtLogin: nextValue }: { openAtLogin: boolean }) => {
      openAtLogin = nextValue;
    });

    vi.doMock('electron', () => ({
      app: {
        isPackaged: true,
        getLoginItemSettings,
        setLoginItemSettings,
      },
    }));

    const { START_ON_BOOT_WINDOWS_ARG, setStartOnBootEnabled } = await import('@process/bridge/applicationBridge');
    const status = setStartOnBootEnabled(true);

    expect(setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      args: [START_ON_BOOT_WINDOWS_ARG],
      enabled: true,
    });
    expect(status).toEqual({
      supported: true,
      enabled: true,
      isPackaged: true,
      platform: 'win32',
    });
    expect(getLoginItemSettings).toHaveBeenCalledWith({ args: [START_ON_BOOT_WINDOWS_ARG] });
  });

  it('detects login launches on packaged Windows via startup argument', async () => {
    setPlatform('win32');
    mockBridgeDependencies();

    const originalArgv = process.argv;
    process.argv = [...originalArgv, '--start-on-boot'];

    vi.doMock('electron', () => ({
      app: {
        isPackaged: true,
        getLoginItemSettings: vi.fn(() => ({
          openAtLogin: true,
          executableWillLaunchAtLogin: true,
        })),
        setLoginItemSettings: vi.fn(),
      },
    }));

    try {
      const { wasLaunchedAtLogin } = await import('@process/bridge/applicationBridge');

      expect(wasLaunchedAtLogin()).toBe(true);
    } finally {
      process.argv = originalArgv;
    }
  });

  it('returns unsupported status on non-desktop-login platforms', async () => {
    setPlatform('linux');
    mockBridgeDependencies();

    vi.doMock('electron', () => ({
      app: {
        isPackaged: true,
        getLoginItemSettings: vi.fn(),
        setLoginItemSettings: vi.fn(),
      },
    }));

    const { getStartOnBootStatus } = await import('@process/bridge/applicationBridge');

    expect(getStartOnBootStatus()).toEqual({
      supported: false,
      enabled: false,
      isPackaged: true,
      platform: 'linux',
    });
  });

  it('returns false for login-launch detection when app is not packaged', async () => {
    setPlatform('darwin');
    mockBridgeDependencies();

    vi.doMock('electron', () => ({
      app: {
        isPackaged: false,
        getLoginItemSettings: vi.fn(() => ({ wasOpenedAtLogin: true })),
        setLoginItemSettings: vi.fn(),
      },
    }));

    const { wasLaunchedAtLogin } = await import('@process/bridge/applicationBridge');

    expect(wasLaunchedAtLogin()).toBe(false);
  });

  it('registers start-on-boot IPC handlers that return current status', async () => {
    setPlatform('darwin');

    const capturedHandlers: Record<string, (payload?: { enabled: boolean }) => Promise<unknown>> = {};

    vi.doMock('@/common', () => ({
      ipcBridge: {
        application: {
          restart: { provider: vi.fn() },
          isDevToolsOpened: { provider: vi.fn() },
          openDevTools: { provider: vi.fn() },
          getZoomFactor: { provider: vi.fn() },
          setZoomFactor: { provider: vi.fn() },
          getCdpStatus: { provider: vi.fn() },
          updateCdpConfig: { provider: vi.fn() },
          getStartOnBootStatus: {
            provider: vi.fn((fn: (payload?: { enabled: boolean }) => Promise<unknown>) => {
              capturedHandlers.getStartOnBootStatus = fn;
            }),
          },
          setStartOnBoot: {
            provider: vi.fn((fn: (payload: { enabled: boolean }) => Promise<unknown>) => {
              capturedHandlers.setStartOnBoot = fn;
            }),
          },
        },
      },
    }));

    vi.doMock('@process/utils/initStorage', () => ({
      ProcessConfig: {
        get: vi.fn(),
        set: vi.fn(),
      },
    }));

    vi.doMock('@process/utils/zoom', () => ({
      getZoomFactor: vi.fn(() => 1),
      setZoomFactor: vi.fn((factor: number) => factor),
    }));

    vi.doMock('@process/utils/configureChromium', () => ({
      getCdpStatus: vi.fn(() => ({
        enabled: false,
        port: null,
        startupEnabled: false,
        instances: [],
        configEnabled: false,
        isDevMode: false,
      })),
      updateCdpConfig: vi.fn(),
    }));

    vi.doMock('@process/bridge/applicationBridgeCore', () => ({
      initApplicationBridgeCore: vi.fn(),
    }));

    vi.doMock('electron', () => ({
      app: {
        isPackaged: true,
        getLoginItemSettings: vi.fn(() => ({ openAtLogin: true, wasOpenedAtLogin: true })),
        setLoginItemSettings: vi.fn(),
      },
    }));

    const { initApplicationBridge } = await import('@process/bridge/applicationBridge');
    initApplicationBridge({
      getTask: vi.fn(),
      getOrBuildTask: vi.fn(),
      addTask: vi.fn(),
      kill: vi.fn(),
      clear: vi.fn(),
      listTasks: vi.fn(() => []),
    });

    await expect(capturedHandlers.getStartOnBootStatus?.()).resolves.toEqual({
      success: true,
      data: {
        supported: true,
        enabled: true,
        isPackaged: true,
        platform: 'darwin',
      },
    });
  });

  it('returns an unsupported response from the set-start-on-boot IPC handler on linux', async () => {
    setPlatform('linux');

    const capturedHandlers: Record<string, (payload: { enabled: boolean }) => Promise<unknown>> = {};

    vi.doMock('@/common', () => ({
      ipcBridge: {
        application: {
          restart: { provider: vi.fn() },
          isDevToolsOpened: { provider: vi.fn() },
          openDevTools: { provider: vi.fn() },
          getZoomFactor: { provider: vi.fn() },
          setZoomFactor: { provider: vi.fn() },
          getCdpStatus: { provider: vi.fn() },
          updateCdpConfig: { provider: vi.fn() },
          getStartOnBootStatus: { provider: vi.fn() },
          setStartOnBoot: {
            provider: vi.fn((fn: (payload: { enabled: boolean }) => Promise<unknown>) => {
              capturedHandlers.setStartOnBoot = fn;
            }),
          },
        },
      },
    }));

    vi.doMock('@process/utils/initStorage', () => ({
      ProcessConfig: {
        get: vi.fn(),
        set: vi.fn(),
      },
    }));

    vi.doMock('@process/utils/zoom', () => ({
      getZoomFactor: vi.fn(() => 1),
      setZoomFactor: vi.fn((factor: number) => factor),
    }));

    vi.doMock('@process/utils/configureChromium', () => ({
      getCdpStatus: vi.fn(() => ({
        enabled: false,
        port: null,
        startupEnabled: false,
        instances: [],
        configEnabled: false,
        isDevMode: false,
      })),
      updateCdpConfig: vi.fn(),
    }));

    vi.doMock('@process/bridge/applicationBridgeCore', () => ({
      initApplicationBridgeCore: vi.fn(),
    }));

    vi.doMock('electron', () => ({
      app: {
        isPackaged: true,
        getLoginItemSettings: vi.fn(),
        setLoginItemSettings: vi.fn(),
      },
    }));

    const { initApplicationBridge } = await import('@process/bridge/applicationBridge');
    initApplicationBridge({
      getTask: vi.fn(),
      getOrBuildTask: vi.fn(),
      addTask: vi.fn(),
      kill: vi.fn(),
      clear: vi.fn(),
      listTasks: vi.fn(() => []),
    });

    await expect(capturedHandlers.setStartOnBoot?.({ enabled: true })).resolves.toEqual({
      success: false,
      msg: 'Start on boot is only available in packaged macOS and Windows apps.',
      data: {
        supported: false,
        enabled: false,
        isPackaged: true,
        platform: 'linux',
      },
    });
  });
});
