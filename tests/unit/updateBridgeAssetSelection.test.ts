/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@office-ai/platform', () => ({
  bridge: {
    buildProvider: vi.fn(() => ({
      provider: vi.fn(),
      invoke: vi.fn(),
    })),
    buildEmitter: vi.fn(() => ({
      emit: vi.fn(),
      on: vi.fn(),
    })),
  },
  storage: {
    buildStorage: () => ({
      getSync: () => undefined,
      setSync: () => {},
      get: () => Promise.resolve(undefined),
      set: () => Promise.resolve(),
    }),
  },
}));

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '1.0.0'),
    getPath: vi.fn(() => '/test/path'),
    isPackaged: true,
  },
}));

vi.mock('electron-updater', () => ({
  autoUpdater: {
    logger: null,
    autoDownload: false,
    autoInstallOnAppQuit: true,
    allowPrerelease: false,
    allowDowngrade: false,
    on: vi.fn(),
    removeListener: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    checkForUpdatesAndNotify: vi.fn(),
  },
}));

vi.mock('electron-log', () => ({
  default: {
    transports: { file: { level: 'info' } },
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import { pickRecommendedAsset } from '@process/bridge/updateBridge';

const asset = (name: string) => ({
  name,
  url: `https://github.com/iOfficeAI/AionUi/releases/download/v1.0.0/${name}`,
  size: 1,
});

describe('pickRecommendedAsset', () => {
  it('should prefer ia32 package on win32 ia32 runtime', () => {
    const assets = [asset('AionUi-1.0.0-win-x64.exe'), asset('AionUi-1.0.0-win-ia32.exe')];

    const result = pickRecommendedAsset(assets, { platform: 'win32', arch: 'ia32' });

    expect(result?.name).toBe('AionUi-1.0.0-win-ia32.exe');
  });

  it('should return undefined when no compatible arch package exists', () => {
    const assets = [asset('AionUi-1.0.0-win-x64.exe'), asset('AionUi-1.0.0-win-x64.zip')];

    const result = pickRecommendedAsset(assets, { platform: 'win32', arch: 'ia32' });

    expect(result).toBeUndefined();
  });

  it('should allow generic package without explicit arch token', () => {
    const assets = [asset('AionUi-1.0.0-win.exe')];

    const result = pickRecommendedAsset(assets, { platform: 'win32', arch: 'ia32' });

    expect(result?.name).toBe('AionUi-1.0.0-win.exe');
  });
});
