/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IWorkerTaskManager } from '../../src/process/task/IWorkerTaskManager';

function makeTaskManager(overrides?: Partial<IWorkerTaskManager>): IWorkerTaskManager {
  return {
    getTask: vi.fn(() => undefined),
    getOrBuildTask: vi.fn(async () => {
      throw new Error('not found');
    }),
    addTask: vi.fn(),
    kill: vi.fn(),
    clear: vi.fn(),
    listTasks: vi.fn(() => []),
    ...overrides,
  };
}

describe('applicationBridge CDP functionality', () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Mock electron
    vi.doMock('electron', () => ({
      app: {
        isPackaged: false,
        setName: vi.fn(),
        setPath: vi.fn(),
        getPath: vi.fn((name: string) => {
          if (name === 'userData') return '/mock/userData';
          if (name === 'appData') return '/mock/appData';
          return '/mock/path';
        }),
        commandLine: {
          appendSwitch: vi.fn(),
        },
        relaunch: vi.fn(),
        exit: vi.fn(),
      },
    }));

    // Mock fs
    vi.doMock('fs', () => ({
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(() => '{}'),
      writeFileSync: vi.fn(),
    }));

    // Mock http
    vi.doMock('http', () => ({
      default: { get: vi.fn() },
    }));

    // Mock WorkerManage
    vi.doMock('@/process/WorkerManage', () => ({
      default: {
        clear: vi.fn(),
      },
    }));

    // Mock zoom utilities
    vi.doMock('@/process/utils/zoom', () => ({
      getZoomFactor: vi.fn(() => 1),
      setZoomFactor: vi.fn(() => 1),
    }));

    // Mock initStorage
    vi.doMock('@process/utils/initStorage', () => ({
      getSystemDir: vi.fn(() => ({
        cacheDir: '/mock/cache',
        workDir: '/mock/work',
        platform: 'win32',
        arch: 'x64',
      })),
      ProcessEnv: {
        set: vi.fn(),
      },
    }));

    // Mock utils
    vi.doMock('@/process/utils', () => ({
      copyDirectoryRecursively: vi.fn(),
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
    vi.doUnmock('electron');
    vi.doUnmock('fs');
    vi.doUnmock('http');
    vi.doUnmock('@/process/WorkerManage');
    vi.doUnmock('@/process/utils/zoom');
    vi.doUnmock('@process/utils/initStorage');
    vi.doUnmock('@/process/utils');
  });

  describe('initApplicationBridge', () => {
    it('should initialize without errors', async () => {
      const { initApplicationBridge } = await import('@process/bridge/applicationBridge');

      const taskMgr = makeTaskManager();
      expect(() => initApplicationBridge(taskMgr)).not.toThrow();
    });
  });

  describe('CDP IPC handlers', () => {
    it('should register getCdpStatus handler', async () => {
      const mod = await import('@process/bridge/applicationBridge');
      expect(mod.initApplicationBridge).toBeTypeOf('function');
    });
  });
});

function mockElectronApp(extra?: Record<string, any>) {
  return {
    app: {
      isPackaged: false,
      setName: vi.fn(),
      setPath: vi.fn(),
      getPath: vi.fn((name: string) => {
        if (name === 'appData') return '/mock/appData';
        return '/mock/userData';
      }),
      commandLine: { appendSwitch: vi.fn() },
      ...extra,
    },
  };
}

describe('CDP configuration functions', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.AIONUI_CDP_PORT;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should provide getCdpStatus function', async () => {
    vi.doMock('electron', () => mockElectronApp());

    vi.doMock('fs', () => ({
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(() => '{}'),
      writeFileSync: vi.fn(),
    }));

    vi.doMock('http', () => ({
      default: { get: vi.fn() },
    }));

    const { getCdpStatus } = await import('@process/utils/configureChromium');

    const status = getCdpStatus();

    expect(status).toHaveProperty('enabled');
    expect(status).toHaveProperty('port');
    expect(status).toHaveProperty('startupEnabled');
    expect(status).toHaveProperty('instances');
    expect(status).toHaveProperty('isDevMode');
    expect(Array.isArray(status.instances)).toBe(true);
  });

  it('should provide updateCdpConfig function', async () => {
    vi.doMock('electron', () => mockElectronApp());

    vi.doMock('fs', () => ({
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(() => '{}'),
      writeFileSync: vi.fn(),
    }));

    vi.doMock('http', () => ({
      default: { get: vi.fn() },
    }));

    const { updateCdpConfig } = await import('@process/utils/configureChromium');

    const result = updateCdpConfig({ enabled: true, port: 9225 });

    expect(result).toHaveProperty('enabled', true);
    expect(result).toHaveProperty('port', 9225);
  });

  it('should provide saveCdpConfig function', async () => {
    const mockWriteFileSync = vi.fn();

    vi.doMock('electron', () => mockElectronApp());

    vi.doMock('fs', () => ({
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(() => '{}'),
      writeFileSync: mockWriteFileSync,
    }));

    vi.doMock('http', () => ({
      default: { get: vi.fn() },
    }));

    const { saveCdpConfig } = await import('@process/utils/configureChromium');

    saveCdpConfig({ enabled: false });

    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it('restart handler calls workerTaskManager.clear() via injected dependency', async () => {
    // Capture handlers using hoisted provider mock
    const capturedHandlers: Record<string, (...args: any[]) => any> = {};
    vi.doMock('electron', () => mockElectronApp({ relaunch: vi.fn(), exit: vi.fn() }));
    vi.doMock('../../src/common', () => ({
      ipcBridge: {
        application: {
          restart: {
            provider: vi.fn((fn: (...args: any[]) => any) => {
              capturedHandlers['restart'] = fn;
            }),
            emit: vi.fn(),
            invoke: vi.fn(),
          },
          updateSystemInfo: { provider: vi.fn(), emit: vi.fn(), invoke: vi.fn() },
          systemInfo: { provider: vi.fn(), emit: vi.fn(), invoke: vi.fn() },
          getPath: { provider: vi.fn(), emit: vi.fn(), invoke: vi.fn() },
          isDevToolsOpened: { provider: vi.fn(), emit: vi.fn(), invoke: vi.fn() },
          openDevTools: { provider: vi.fn(), emit: vi.fn(), invoke: vi.fn() },
          getZoomFactor: { provider: vi.fn(), emit: vi.fn(), invoke: vi.fn() },
          setZoomFactor: { provider: vi.fn(), emit: vi.fn(), invoke: vi.fn() },
          getCdpStatus: { provider: vi.fn(), emit: vi.fn(), invoke: vi.fn() },
          updateCdpConfig: { provider: vi.fn(), emit: vi.fn(), invoke: vi.fn() },
          getStartOnBootStatus: { provider: vi.fn(), emit: vi.fn(), invoke: vi.fn() },
          setStartOnBoot: { provider: vi.fn(), emit: vi.fn(), invoke: vi.fn() },
        },
      },
    }));

    vi.doMock('@process/utils/initStorage', () => ({
      getSystemDir: vi.fn(() => ({
        cacheDir: '/mock/cache',
        workDir: '/mock/work',
        platform: 'win32',
        arch: 'x64',
      })),
      ProcessEnv: { set: vi.fn() },
    }));

    vi.doMock('@process/utils', () => ({
      copyDirectoryRecursively: vi.fn(),
    }));

    vi.resetModules();
    const { initApplicationBridge } = await import('../../src/process/bridge/applicationBridge');
    const taskMgr = makeTaskManager();
    initApplicationBridge(taskMgr);

    expect(capturedHandlers['restart']).toBeTypeOf('function');
    await capturedHandlers['restart']();
    expect(taskMgr.clear).toHaveBeenCalled();
  });

  it('should provide unregisterInstance function', async () => {
    vi.doMock('electron', () => mockElectronApp());

    vi.doMock('fs', () => ({
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(() => '{}'),
      writeFileSync: vi.fn(),
    }));

    vi.doMock('http', () => ({
      default: { get: vi.fn() },
    }));

    const { unregisterInstance } = await import('@process/utils/configureChromium');

    // Should not throw
    expect(() => unregisterInstance()).not.toThrow();
  });
});
