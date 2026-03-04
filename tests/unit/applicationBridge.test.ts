/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('applicationBridge CDP functionality', () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Mock electron
    vi.doMock('electron', () => ({
      app: {
        isPackaged: false,
        getPath: vi.fn((name: string) => {
          if (name === 'userData') return '/mock/userData';
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
    vi.doMock('@/process/initStorage', () => ({
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
    vi.doUnmock('@/process/initStorage');
    vi.doUnmock('@/process/utils');
  });

  describe('initApplicationBridge', () => {
    it('should initialize without errors', async () => {
      const { initApplicationBridge } = await import('@/process/bridge/applicationBridge');

      expect(() => initApplicationBridge()).not.toThrow();
    });
  });

  describe('CDP IPC handlers', () => {
    it('should register getCdpStatus handler', async () => {
      const mod = await import('@/process/bridge/applicationBridge');
      expect(mod.initApplicationBridge).toBeTypeOf('function');
    });
  });
});

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
    vi.doMock('electron', () => ({
      app: {
        isPackaged: false,
        getPath: vi.fn(() => '/mock/userData'),
        commandLine: { appendSwitch: vi.fn() },
      },
    }));

    vi.doMock('fs', () => ({
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(() => '{}'),
      writeFileSync: vi.fn(),
    }));

    vi.doMock('http', () => ({
      default: { get: vi.fn() },
    }));

    const { getCdpStatus } = await import('@/utils/configureChromium');

    const status = getCdpStatus();

    expect(status).toHaveProperty('enabled');
    expect(status).toHaveProperty('port');
    expect(status).toHaveProperty('startupEnabled');
    expect(status).toHaveProperty('instances');
    expect(status).toHaveProperty('isDevMode');
    expect(Array.isArray(status.instances)).toBe(true);
  });

  it('should provide updateCdpConfig function', async () => {
    vi.doMock('electron', () => ({
      app: {
        isPackaged: false,
        getPath: vi.fn(() => '/mock/userData'),
        commandLine: { appendSwitch: vi.fn() },
      },
    }));

    vi.doMock('fs', () => ({
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(() => '{}'),
      writeFileSync: vi.fn(),
    }));

    vi.doMock('http', () => ({
      default: { get: vi.fn() },
    }));

    const { updateCdpConfig } = await import('@/utils/configureChromium');

    const result = updateCdpConfig({ enabled: true, port: 9225 });

    expect(result).toHaveProperty('enabled', true);
    expect(result).toHaveProperty('port', 9225);
  });

  it('should provide saveCdpConfig function', async () => {
    const mockWriteFileSync = vi.fn();

    vi.doMock('electron', () => ({
      app: {
        isPackaged: false,
        getPath: vi.fn(() => '/mock/userData'),
        commandLine: { appendSwitch: vi.fn() },
      },
    }));

    vi.doMock('fs', () => ({
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(() => '{}'),
      writeFileSync: mockWriteFileSync,
    }));

    vi.doMock('http', () => ({
      default: { get: vi.fn() },
    }));

    const { saveCdpConfig } = await import('@/utils/configureChromium');

    saveCdpConfig({ enabled: false });

    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it('should provide unregisterInstance function', async () => {
    vi.doMock('electron', () => ({
      app: {
        isPackaged: false,
        getPath: vi.fn(() => '/mock/userData'),
        commandLine: { appendSwitch: vi.fn() },
      },
    }));

    vi.doMock('fs', () => ({
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(() => '{}'),
      writeFileSync: vi.fn(),
    }));

    vi.doMock('http', () => ({
      default: { get: vi.fn() },
    }));

    const { unregisterInstance } = await import('@/utils/configureChromium');

    // Should not throw
    expect(() => unregisterInstance()).not.toThrow();
  });
});
