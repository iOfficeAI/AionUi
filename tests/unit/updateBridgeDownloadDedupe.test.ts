/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    getPath: vi.fn(() => '/tmp/aionui-update-dedupe-test'),
    exit: vi.fn(),
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
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

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

const getDownloadHandlers = async () => {
  vi.resetModules();
  const { initUpdateBridge } = await import('@process/bridge/updateBridge');
  const { ipcBridge } = await import('@/common');

  initUpdateBridge();

  const downloadProvider = vi.mocked(ipcBridge.update.download.provider);
  const cancelProvider = vi.mocked(ipcBridge.update.cancelDownload.provider);
  const downloadCall = downloadProvider.mock.calls.at(-1);
  const cancelCall = cancelProvider.mock.calls.at(-1);
  if (!downloadCall) throw new Error('update.download handler not registered');
  if (!cancelCall) throw new Error('update.download.cancel handler not registered');
  return {
    download: downloadCall[0],
    cancel: cancelCall[0],
    ipcBridge,
  };
};

describe('updateBridge manual download dedupe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {}))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reuses the active manual download for the same URL, fallback URL, and file name', async () => {
    const handler = await getDownloadHandler();
    const request = {
      url: 'https://static.aionui.com/releases/2.2.0/AionUi-2.2.0-mac-arm64.dmg',
      fallbackUrl: 'https://github.com/iOfficeAI/AionUi/releases/download/v2.2.0/AionUi-2.2.0-mac-arm64.dmg',
      file_name: 'AionUi-2.2.0-mac-arm64.dmg',
    };

    const first = await handler({
      ...request,
      downloadId: 'first-download',
    });
    const second = await handler({
      ...request,
      downloadId: 'second-download',
    });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.data).toEqual(first.data);
    expect(first.data?.downloadId).toBe('first-download');
  });

  it('creates a new manual download after the prior matching task reaches a terminal state', async () => {
    fs.mkdirSync('/tmp/aionui-update-dedupe-test', { recursive: true });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-length': '0' }),
        body: {
          getReader: () => ({
            read: async () => ({ done: true, value: undefined }),
          }),
        },
      })
    );

    const handler = await getDownloadHandler();
    const request = {
      url: 'https://static.aionui.com/releases/2.2.0/AionUi-2.2.0-mac-arm64.dmg',
      fallbackUrl: 'https://github.com/iOfficeAI/AionUi/releases/download/v2.2.0/AionUi-2.2.0-mac-arm64.dmg',
      file_name: 'AionUi-2.2.0-mac-arm64.dmg',
    };

    const first = await handler({
      ...request,
      downloadId: 'first-download',
    });

    const { ipcBridge } = await import('@/common');
    await expect
      .poll(() =>
        vi.mocked(ipcBridge.update.downloadProgress.emit).mock.calls.some(([evt]) => evt.status === 'completed')
      )
      .toBe(true);

    const second = await handler({
      ...request,
      downloadId: 'second-download',
    });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(first.data?.downloadId).toBe('first-download');
    expect(second.data?.downloadId).toBe('second-download');
  });

  it('cancels an active manual download by download id and clears its dedupe slot', async () => {
    fs.mkdirSync('/tmp/aionui-update-dedupe-test', { recursive: true });
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        const signal = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        });
      })
    );

    const { download, cancel, ipcBridge } = await getDownloadHandlers();
    const request = {
      url: 'https://static.aionui.com/releases/2.2.0/AionUi-2.2.0-mac-arm64.dmg',
      fallbackUrl: 'https://github.com/iOfficeAI/AionUi/releases/download/v2.2.0/AionUi-2.2.0-mac-arm64.dmg',
      file_name: 'AionUi-2.2.0-mac-arm64.dmg',
    };

    const first = await download({
      ...request,
      downloadId: 'first-download',
    });
    const cancelResult = await cancel({ downloadId: 'first-download' });

    expect(first.success).toBe(true);
    expect(cancelResult).toEqual({ success: true });
    await expect
      .poll(() =>
        vi
          .mocked(ipcBridge.update.downloadProgress.emit)
          .mock.calls.some(([evt]) => evt.downloadId === 'first-download' && evt.status === 'cancelled')
      )
      .toBe(true);

    const second = await download({
      ...request,
      downloadId: 'second-download',
    });

    expect(second.success).toBe(true);
    expect(second.data?.downloadId).toBe('second-download');
  });
});
