import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('node:os', async (original) => ({
  ...(await original<typeof import('node:os')>()),
  platform: () => 'darwin',
  arch: () => 'arm64',
}));

vi.mock('@process/services/i18n', () => ({ default: { t: (key: string) => key } }));

const updaterMocks = vi.hoisted(() => ({
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
}));

vi.mock('@/common/platform/bridge', () => ({
  bridge: {
    buildProvider: vi.fn(() => ({ provider: vi.fn(), invoke: vi.fn() })),
    buildEmitter: vi.fn(() => ({ emit: vi.fn(), on: vi.fn() })),
  },
}));

const desktop = vi.hoisted(() => ({ isPackaged: true, directory: '/tmp' }));

vi.mock('electron', () => ({
  net: {
    fetch: (...args: Parameters<typeof fetch>) => {
      // Match Electron's real net.fetch behavior: manual redirects are cancelled.
      if (args[1]?.redirect === 'manual') throw new Error('Redirect was cancelled');
      return fetch(...args);
    },
  },
  app: {
    getPath: vi.fn(() => desktop.directory),
    getVersion: vi.fn(() => '1.0.0'),
    get isPackaged() {
      return desktop.isPackaged;
    },
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
    checkForUpdates: updaterMocks.checkForUpdates,
    downloadUpdate: updaterMocks.downloadUpdate,
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

import { ipcBridge } from '@/common';
import { initUpdateBridge } from '@process/bridge/updateBridge';

import { initializeGeaEnvironment, resetGeaEnvironmentForTests } from '@process/services/gea/GeaEnvironmentService';

beforeEach(async () => {
  desktop.directory = await mkdtemp(path.join(os.tmpdir(), 'gea-update-bridge-'));
});

afterEach(async () => {
  desktop.isPackaged = true;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetGeaEnvironmentForTests();
  await rm(desktop.directory, { recursive: true, force: true });
});

describe('GEA update bridge policy', () => {
  it('keeps the GEA release check disabled for an ordinary packaged build', async () => {
    desktop.isPackaged = true;
    vi.stubEnv('AIONUI_GEA_CLIENT_INTEGRATION', '1');
    vi.stubEnv('AIONUI_GEA_VERSION_CODE', '1001');
    initializeGeaEnvironment({ isPackaged: true });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    initUpdateBridge();

    const startup = vi.mocked(ipcBridge.update.getStartupCheckEnabled.provider).mock.calls.at(-1)![0];
    await expect(startup()).resolves.toBe(false);
    const check = vi.mocked(ipcBridge.update.check.provider).mock.calls.at(-1)![0];
    await expect(check({})).resolves.toMatchObject({ success: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enables the GEA release check only for an explicitly marked packaged acceptance build', async () => {
    desktop.isPackaged = true;
    vi.stubEnv('AIONUI_GEA_CLIENT_INTEGRATION', '1');
    vi.stubEnv('AIONUI_GEA_PACKAGED_ACCEPTANCE', '1');
    vi.stubEnv('AIONUI_GEA_VERSION_CODE', '1001');
    initializeGeaEnvironment({ isPackaged: true });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          result: {
            upgradeAvailable: false,
            mandatory: false,
            versionName: null,
            versionCode: null,
            releaseNotes: null,
            downloadUrl: null,
            distributionType: null,
            fileSize: null,
            sha256: null,
          },
          errorCode: null,
        })
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    initUpdateBridge();

    const startup = vi.mocked(ipcBridge.update.getStartupCheckEnabled.provider).mock.calls.at(-1)![0];
    await expect(startup()).resolves.toBe(true);
    const check = vi.mocked(ipcBridge.update.check.provider).mock.calls.at(-1)![0];
    await expect(check({})).resolves.toMatchObject({
      success: true,
      data: { updateAvailable: false, currentVersionCode: 1001 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows GEA release metadata through the existing check entry point in explicit development mode', async () => {
    desktop.isPackaged = false;
    vi.stubEnv('AIONUI_GEA_CLIENT_INTEGRATION', '1');
    vi.stubEnv('AIONUI_GEA_VERSION_CODE', '100');
    initializeGeaEnvironment({ isPackaged: false, env: { AIONUI_GEA_BASE_URL: 'http://127.0.0.1:1234/gea-boot' } });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          result: {
            upgradeAvailable: true,
            mandatory: false,
            versionName: '1.0.0',
            versionCode: 101,
            releaseNotes: 'New build',
            downloadUrl: '/gea-boot/api/v1/public/client-releases/download/abc',
            distributionType: 'UPLOAD',
            fileSize: 100,
            sha256: 'a'.repeat(64),
          },
        })
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    initUpdateBridge();
    const startup = vi.mocked(ipcBridge.update.getStartupCheckEnabled.provider).mock.calls.at(-1)![0];
    await expect(startup()).resolves.toBe(true);
    const check = vi.mocked(ipcBridge.update.check.provider).mock.calls.at(-1)?.[0];
    expect(check).toBeDefined();
    await expect(check!({})).resolves.toMatchObject({
      success: true,
      data: {
        updateAvailable: true,
        currentVersionCode: 100,
        latest: { version: '1.0.0', versionCode: 101, body: 'New build', mandatory: false },
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:1234/gea-boot/api/v1/public/client-releases/check');
    expect(JSON.parse(init.body)).toEqual({
      platform: 'MACOS',
      architecture: 'arm64',
      versionName: '1.0.0',
      versionCode: 100,
    });
    expect(new Headers(init.headers).has('X-Access-Token')).toBe(false);
  });

  it('keeps a confirmed mandatory update blocking when the next check is offline', async () => {
    desktop.isPackaged = false;
    vi.stubEnv('AIONUI_GEA_CLIENT_INTEGRATION', '1');
    vi.stubEnv('AIONUI_GEA_VERSION_CODE', '100');
    initializeGeaEnvironment({ isPackaged: false, env: { AIONUI_GEA_BASE_URL: 'http://127.0.0.1:1234/gea-boot' } });
    let offline = false;
    let releaseVersionCode = 120;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (offline) throw new Error('offline');
        return new Response(
          JSON.stringify({
            success: true,
            result: {
              upgradeAvailable: true,
              mandatory: true,
              versionName: releaseVersionCode === 120 ? '2.2.0' : '2.1.0',
              versionCode: releaseVersionCode,
              releaseNotes: 'Required security update',
              downloadUrl: '/gea-boot/api/v1/public/client-releases/download/mandatory',
              distributionType: 'UPLOAD',
              fileSize: 100,
              sha256: 'a'.repeat(64),
            },
          })
        );
      })
    );
    initUpdateBridge();
    const check = vi.mocked(ipcBridge.update.check.provider).mock.calls.at(-1)![0];

    await expect(check({})).resolves.toMatchObject({
      success: true,
      data: { latest: { mandatory: true, versionCode: 120, recommendedAsset: { size: 100 } } },
    });
    releaseVersionCode = 110;
    await expect(check({})).resolves.toMatchObject({
      success: true,
      data: { latest: { mandatory: true, versionCode: 120, assets: [] } },
    });
    offline = true;

    const fallback = await check({});
    expect(fallback).toMatchObject({
      success: true,
      data: {
        updateAvailable: true,
        currentVersionCode: 100,
        latest: { mandatory: true, version: '2.2.0', versionCode: 120, assets: [] },
      },
    });
    expect(fallback.data!.latest!.recommendedAsset).toBeUndefined();
  });

  it('clears a persisted mandatory requirement only after a successful non-mandatory response', async () => {
    desktop.isPackaged = false;
    vi.stubEnv('AIONUI_GEA_CLIENT_INTEGRATION', '1');
    vi.stubEnv('AIONUI_GEA_VERSION_CODE', '100');
    initializeGeaEnvironment({ isPackaged: false, env: { AIONUI_GEA_BASE_URL: 'http://127.0.0.1:1234/gea-boot' } });
    let response: 'mandatory' | 'optional' | 'offline' = 'mandatory';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (response === 'offline') throw new Error('offline');
        const mandatory = response === 'mandatory';
        return new Response(
          JSON.stringify({
            success: true,
            result: {
              upgradeAvailable: true,
              mandatory,
              versionName: '2.2.0',
              versionCode: 120,
              releaseNotes: '',
              downloadUrl: '/gea-boot/api/v1/public/client-releases/download/release',
              distributionType: 'UPLOAD',
              fileSize: 100,
              sha256: 'a'.repeat(64),
            },
          })
        );
      })
    );
    initUpdateBridge();
    const check = vi.mocked(ipcBridge.update.check.provider).mock.calls.at(-1)![0];
    await check({});
    response = 'optional';
    await expect(check({})).resolves.toMatchObject({ success: true, data: { latest: { mandatory: false } } });
    response = 'offline';

    await expect(check({})).resolves.toMatchObject({ success: false, msg: 'update.checkFailed' });
  });

  it('does not restore a mandatory block after the installed version reaches the requirement', async () => {
    desktop.isPackaged = false;
    vi.stubEnv('AIONUI_GEA_CLIENT_INTEGRATION', '1');
    vi.stubEnv('AIONUI_GEA_VERSION_CODE', '100');
    initializeGeaEnvironment({ isPackaged: false, env: { AIONUI_GEA_BASE_URL: 'http://127.0.0.1:1234/gea-boot' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: true,
              result: {
                upgradeAvailable: true,
                mandatory: true,
                versionName: '2.2.0',
                versionCode: 120,
                releaseNotes: '',
                downloadUrl: '/gea-boot/api/v1/public/client-releases/download/mandatory',
                distributionType: 'UPLOAD',
                fileSize: 100,
                sha256: 'a'.repeat(64),
              },
            })
          )
      )
    );
    initUpdateBridge();
    const check = vi.mocked(ipcBridge.update.check.provider).mock.calls.at(-1)![0];
    await check({});
    vi.stubEnv('AIONUI_GEA_VERSION_CODE', '120');
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));

    await expect(check({})).resolves.toMatchObject({ success: false, msg: 'update.checkFailed' });
  });
  it.each([false, true])('downloads a verified uploaded package (private OSS: %s)', async (privateOss) => {
    desktop.isPackaged = false;
    vi.stubEnv('AIONUI_GEA_CLIENT_INTEGRATION', '1');
    vi.stubEnv('AIONUI_GEA_VERSION_CODE', '100');
    initializeGeaEnvironment({
      isPackaged: false,
      env: { AIONUI_GEA_BASE_URL: privateOss ? 'https://gea.synear.cn/gea-boot' : 'http://127.0.0.1:1234/gea-boot' },
    });
    const contents = Buffer.alloc(512);
    contents.write('koly');
    const checksum = createHash('sha256').update(contents).digest('hex');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/check')
          ? new Response(
              JSON.stringify({
                success: true,
                result: {
                  upgradeAvailable: true,
                  mandatory: false,
                  versionName: '1.0.1',
                  versionCode: 101,
                  releaseNotes: 'New',
                  downloadUrl: '/gea-boot/api/v1/public/client-releases/download/abc',
                  distributionType: 'UPLOAD',
                  fileSize: contents.length,
                  sha256: checksum,
                },
              })
            )
          : privateOss && url.includes('/api/v1/public/')
            ? new Response(null, {
                status: 302,
                headers: {
                  location: 'https://synear-gea.oss-cn-hangzhou.aliyuncs.com/client-release/test.dmg?signature=test',
                },
              })
            : privateOss
              ? Object.defineProperty(new Response(contents), 'url', {
                  value: 'https://synear-gea.oss-cn-hangzhou.aliyuncs.com/client-release/test.dmg?signature=test',
                })
              : new Response(contents, { headers: { 'Content-Disposition': "attachment; filename*=UTF-8''test.dmg" } })
      )
    );
    initUpdateBridge();
    const check = vi.mocked(ipcBridge.update.check.provider).mock.calls.at(-1)![0];
    const download = vi.mocked(ipcBridge.update.download.provider).mock.calls.at(-1)![0];
    const result = await check({});
    const asset = result.data!.latest!.recommendedAsset!;
    expect(asset).toBeDefined();
    const started = await download({ url: asset.url, downloadId: `gea-test-download-${privateOss}` });
    expect(started.success).toBe(true);
    let file = '';
    try {
      await vi.waitFor(() => {
        const event = vi
          .mocked(ipcBridge.update.downloadProgress.emit)
          .mock.calls.map(([e]) => e)
          .find((e) => e.downloadId === started.data!.downloadId && e.status === 'completed');
        expect(event).toBeDefined();
        file = event!.file_path!;
      });
      expect(await readFile(file)).toEqual(contents);
      expect(file.endsWith('.dmg')).toBe(true);
    } finally {
      if (file) await rm(file, { force: true });
    }
  });

  it('rejects a corrupted package instead of emitting install-ready progress', async () => {
    desktop.isPackaged = false;
    vi.stubEnv('AIONUI_GEA_CLIENT_INTEGRATION', '1');
    vi.stubEnv('AIONUI_GEA_VERSION_CODE', '100');
    initializeGeaEnvironment({ isPackaged: false, env: { AIONUI_GEA_BASE_URL: 'http://127.0.0.1:1234/gea-boot' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/check')
          ? new Response(
              JSON.stringify({
                success: true,
                result: {
                  upgradeAvailable: true,
                  mandatory: false,
                  versionName: '1.0.1',
                  versionCode: 101,
                  releaseNotes: '',
                  downloadUrl: '/gea-boot/api/v1/public/client-releases/download/corrupt',
                  distributionType: 'UPLOAD',
                  fileSize: 3,
                  sha256: 'a'.repeat(64),
                },
              })
            )
          : new Response('bad', { headers: { 'Content-Disposition': "attachment; filename*=UTF-8''test.dmg" } })
      )
    );
    initUpdateBridge();
    const check = vi.mocked(ipcBridge.update.check.provider).mock.calls.at(-1)![0];
    const download = vi.mocked(ipcBridge.update.download.provider).mock.calls.at(-1)![0];
    const result = await check({});
    await download({ url: result.data!.latest!.recommendedAsset!.url, downloadId: 'corrupt-download' });
    await vi.waitFor(() =>
      expect(
        vi
          .mocked(ipcBridge.update.downloadProgress.emit)
          .mock.calls.map(([e]) => e)
          .some((e) => e.downloadId === 'corrupt-download' && e.status === 'error')
      ).toBe(true)
    );
    expect(
      vi
        .mocked(ipcBridge.update.downloadProgress.emit)
        .mock.calls.map(([e]) => e)
        .some((e) => e.downloadId === 'corrupt-download' && e.status === 'completed')
    ).toBe(false);
  });

  it('rejects official checks and downloads before any network work starts', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    initUpdateBridge();
    const startup = vi.mocked(ipcBridge.update.getStartupCheckEnabled.provider).mock.calls.at(-1)![0];
    await expect(startup()).resolves.toBe(false);

    const check = vi.mocked(ipcBridge.update.check.provider).mock.calls.at(-1)?.[0];
    const download = vi.mocked(ipcBridge.update.download.provider).mock.calls.at(-1)?.[0];
    const autoCheck = vi.mocked(ipcBridge.autoUpdate.check.provider).mock.calls.at(-1)?.[0];
    if (!check || !download || !autoCheck) throw new Error('update handlers were not registered');

    await expect(check({})).resolves.toMatchObject({
      success: false,
      msg: 'GEA update service is not configured',
    });
    await expect(download({ url: 'https://static.aionui.com/releases/test.zip' })).resolves.toMatchObject({
      success: false,
      msg: 'GEA update service is not configured',
    });
    await expect(autoCheck({})).resolves.toMatchObject({
      success: false,
      msg: 'GEA update service is not configured',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(updaterMocks.checkForUpdates).not.toHaveBeenCalled();
    expect(updaterMocks.downloadUpdate).not.toHaveBeenCalled();
  });
});
