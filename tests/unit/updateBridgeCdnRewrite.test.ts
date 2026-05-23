/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@office-ai/platform', () => ({
  bridge: {
    buildProvider: vi.fn(() => {
      const handlerMap = new Map<string, Function>();
      return {
        provider: vi.fn((handler: Function) => {
          handlerMap.set('handler', handler);
          return vi.fn();
        }),
        invoke: vi.fn(),
        _getHandler: () => handlerMap.get('handler'),
      };
    }),
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
    setFeedURL: vi.fn(),
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

const makeManifest = (name: string) => `version: 1.9.22\npath: ${name}\nreleaseDate: 2026-04-29T00:00:00Z\n`;

const getDownloadHandler = async () => {
  vi.resetModules();
  const { initUpdateBridge } = await import('@process/bridge/updateBridge');
  const { ipcBridge } = await import('@/common');

  initUpdateBridge();

  const provider = vi.mocked(ipcBridge.update.download.provider);
  const lastCall = provider.mock.calls.at(-1);
  if (!lastCall) throw new Error('update.download handler not registered');
  return lastCall[0];
};

const getCheckHandler = async () => {
  vi.resetModules();
  const { initUpdateBridge } = await import('@process/bridge/updateBridge');
  const { ipcBridge } = await import('@/common');

  initUpdateBridge();

  const provider = vi.mocked(ipcBridge.update.check.provider);
  const lastCall = provider.mock.calls.at(-1);
  if (!lastCall) throw new Error('update.check handler not registered');
  return lastCall[0];
};

describe('updateBridge CDN URL rewriting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the matching manifest for mac arm64', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, text: async () => makeManifest('AionUi-1.9.22-mac-arm64.dmg') });
    vi.stubGlobal('fetch', fetchMock);
    const originalPlatform = process.platform;
    const originalArch = process.arch;
    Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' });
    Object.defineProperty(process, 'arch', { configurable: true, value: 'arm64' });

    try {
      const handler = await getCheckHandler();
      const result = await handler({ repo: 'halojerry/AionUi-2.0.2-dev-a3881e2' });
      expect(result.success).toBe(true);
      expect(result.data?.latest?.recommendedAsset?.url).toBe(
        'https://yss-1256275613.cos.ap-guangzhou.myqcloud.com/releases/download/1.9.22/AionUi-1.9.22-mac-arm64.dmg'
      );
      expect(result.data?.latest?.recommendedAsset?.fallbackUrl).toBe(
        'https://yss-1256275613.cos.ap-guangzhou.myqcloud.com/releases/latest/AionUi-1.9.22-mac-arm64.dmg'
      );
      expect(fetchMock).toHaveBeenCalledWith(
        'https://yss-1256275613.cos.ap-guangzhou.myqcloud.com/releases/latest/latest-arm64-mac.yml',
        expect.any(Object)
      );
    } finally {
      Object.defineProperty(process, 'platform', { configurable: true, value: originalPlatform });
      Object.defineProperty(process, 'arch', { configurable: true, value: originalArch });
      vi.unstubAllGlobals();
    }
  });

  it('uses the matching manifest for linux x64', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, text: async () => makeManifest('AionUi-1.9.22-linux-amd64.deb') });
    vi.stubGlobal('fetch', fetchMock);
    const originalPlatform = process.platform;
    const originalArch = process.arch;
    Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' });
    Object.defineProperty(process, 'arch', { configurable: true, value: 'x64' });

    try {
      const handler = await getCheckHandler();
      const result = await handler({ repo: 'halojerry/AionUi-2.0.2-dev-a3881e2' });
      expect(result.success).toBe(true);
      expect(result.data?.latest?.recommendedAsset?.url).toBe(
        'https://yss-1256275613.cos.ap-guangzhou.myqcloud.com/releases/download/1.9.22/AionUi-1.9.22-linux-amd64.deb'
      );
      expect(result.data?.latest?.recommendedAsset?.url).not.toContain('/v1.9.22/');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://yss-1256275613.cos.ap-guangzhou.myqcloud.com/releases/latest/latest-linux.yml',
        expect.any(Object)
      );
    } finally {
      Object.defineProperty(process, 'platform', { configurable: true, value: originalPlatform });
      Object.defineProperty(process, 'arch', { configurable: true, value: originalArch });
      vi.unstubAllGlobals();
    }
  });
});

describe('updateBridge allowlist includes CDN host', () => {
  it('accepts COS URLs for download', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-length': '0' }),
      body: {
        getReader: () => ({
          read: async () => ({ done: true, value: undefined }),
        }),
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const handler = await getDownloadHandler();
      const result = await handler({
        url: 'https://yss-1256275613.cos.ap-guangzhou.myqcloud.com/releases/download/1.9.22/AionUi-1.9.22-mac-arm64.dmg',
        fallbackUrl: 'https://yss-1256275613.cos.ap-guangzhou.myqcloud.com/releases/latest/AionUi-1.9.22-mac-arm64.dmg',
        file_name: 'AionUi-1.9.22-mac-arm64.dmg',
      });

      expect(result.success).toBe(true);
      expect(result.data?.downloadId).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects non-allowlisted hosts', async () => {
    const handler = await getDownloadHandler();
    const result = await handler({
      url: 'https://evil.example.com/fake.dmg',
      file_name: 'fake.dmg',
    });

    expect(result.success).toBe(false);
  });
});
