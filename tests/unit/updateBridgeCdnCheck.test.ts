/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const checkForUpdatesMock = vi.hoisted(() => vi.fn());
const updateSourceKind = vi.hoisted(() => ({ value: 'github' as 'github' | 'internal-http' }));
const originalPlatform = process.platform;
const originalArch = process.arch;

const setRuntime = (platform: NodeJS.Platform, arch: NodeJS.Architecture): void => {
  Object.defineProperty(process, 'platform', { configurable: true, value: platform });
  Object.defineProperty(process, 'arch', { configurable: true, value: arch });
};

vi.mock('@/common/platform/bridge', () => ({
  bridge: {
    buildProvider: vi.fn(() => ({ provider: vi.fn(), invoke: vi.fn() })),
    buildEmitter: vi.fn(() => ({ emit: vi.fn(), on: vi.fn() })),
  },
}));

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '2.1.40'),
    getPath: vi.fn(() => '/test/path'),
    exit: vi.fn(),
    isPackaged: true,
  },
  autoUpdater: { on: vi.fn(), removeListener: vi.fn() },
}));

vi.mock('@process/services/autoUpdaterService', () => ({
  autoUpdaterService: {
    setAllowPrerelease: vi.fn(),
    checkForUpdates: (...args: unknown[]) => checkForUpdatesMock(...args),
    downloadUpdate: vi.fn(),
    restoreDownloadedUpdateIfAvailable: vi.fn(),
    cancelDownload: vi.fn(),
    quitAndInstall: vi.fn(),
  },
}));

vi.mock('@process/services/updateFeed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@process/services/updateFeed')>();
  return {
    ...actual,
    isInternalUpdateSourceRequested: vi.fn(() => updateSourceKind.value === 'internal-http'),
    resolveUpdateSourceConfig: vi.fn(() =>
      updateSourceKind.value === 'internal-http'
        ? {
            kind: 'internal-http',
            baseUrl: 'http://10.20.30.40/releases/2.1.52',
            fallback: 'github',
            manifestPublicKey: 'test-public-key',
          }
        : {
            kind: 'github',
            owner: 'suoak',
            repo: 'AionUi',
            manifestPublicKey: 'test-public-key',
          }
    ),
  };
});

vi.mock('electron-log', () => ({
  default: {
    transports: { file: { level: 'info' } },
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@process/services/i18n', () => ({ default: { t: (key: string) => key } }));

const githubRelease = (overrides: Record<string, unknown> = {}) => ({
  tag_name: 'v2.1.52',
  name: 'v2.1.52',
  body: 'release notes',
  html_url: 'https://github.com/suoak/AionUi/releases/tag/v2.1.52',
  published_at: '2026-08-06T00:00:00Z',
  prerelease: false,
  draft: false,
  assets: [
    {
      name: 'CSBU-WorkMate-2.1.52-win-x64.exe',
      browser_download_url:
        'https://github.com/suoak/AionUi/releases/download/v2.1.52/CSBU-WorkMate-2.1.52-win-x64.exe',
      size: 100,
      content_type: 'application/vnd.microsoft.portable-executable',
    },
  ],
  ...overrides,
});

const getCheckHandler = async () => {
  vi.resetModules();
  const { initUpdateBridge } = await import('@process/bridge/updateBridge');
  const { ipcBridge } = await import('@/common');
  initUpdateBridge();
  const call = vi.mocked(ipcBridge.update.check.provider).mock.calls.at(-1);
  if (!call) throw new Error('update.check handler not registered');
  return call[0];
};

describe('unified update check', () => {
  beforeEach(() => {
    setRuntime('win32', 'x64');
    updateSourceKind.value = 'github';
    vi.clearAllMocks();
    checkForUpdatesMock.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setRuntime(originalPlatform, originalArch);
  });

  it('registers update IPC providers only once', async () => {
    vi.resetModules();
    const { initUpdateBridge } = await import('@process/bridge/updateBridge');
    const { ipcBridge } = await import('@/common');

    initUpdateBridge();
    initUpdateBridge();

    expect(ipcBridge.update.check.provider).toHaveBeenCalledTimes(1);
    expect(ipcBridge.autoUpdate.download.provider).toHaveBeenCalledTimes(1);
  });

  it('uses the published GitHub release and direct assets as the manual source', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([githubRelease()]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await (await getCheckHandler())({});

    expect(result.success).toBe(true);
    expect(result.data?.latest?.recommendedAsset?.url).toContain('github.com/suoak/AionUi/releases/download');
    expect(fetchMock).toHaveBeenCalledWith('https://api.github.com/repos/suoak/AionUi/releases', expect.any(Object));
  });

  it('ignores drafts and stable checks ignore prereleases', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify([
              githubRelease({ tag_name: 'v2.1.54', draft: true }),
              githubRelease({ tag_name: 'v2.1.53', prerelease: true }),
              githubRelease(),
            ]),
            { status: 200 }
          )
        )
    );

    const result = await (await getCheckHandler())({ includePrerelease: false });
    expect(result.data?.latest?.version).toBe('2.1.52');
  });

  it('allows prereleases only as manual downloads in the first rollout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([githubRelease({ tag_name: 'v2.1.53-beta.1', prerelease: true })]), {
          status: 200,
        })
      )
    );

    const result = await (await getCheckHandler())({ includePrerelease: true });
    expect(result.data?.latest?.version).toBe('2.1.53-beta.1');
    expect(result.data?.autoUpdateAvailable).toBe(false);
    expect(checkForUpdatesMock).not.toHaveBeenCalled();
  });

  it('keeps automatic installation available when GitHub metadata enrichment fails', async () => {
    checkForUpdatesMock.mockResolvedValue({
      success: true,
      updateInfo: { version: '2.1.52', releaseDate: '2026-08-06T00:00:00Z', releaseNotes: 'native notes' },
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('GitHub unavailable')));

    const result = await (await getCheckHandler())({});
    expect(result.success).toBe(true);
    expect(result.data?.autoUpdateAvailable).toBe(true);
    expect(result.data?.latest?.version).toBe('2.1.52');
  });

  it('uses private Chinese manifest notes without contacting or exposing GitHub for internal updates', async () => {
    updateSourceKind.value = 'internal-http';
    checkForUpdatesMock.mockResolvedValue({
      success: true,
      updateInfo: {
        version: '2.1.52',
        releaseDate: '2026-08-06T00:00:00Z',
        releaseNotes: '**由运营管理部提供**\n\n- 修复更新日志显示异常。',
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await (await getCheckHandler())({});

    expect(result.success).toBe(true);
    expect(result.data?.latest?.body).toContain('由运营管理部提供');
    expect(result.data?.latest?.htmlUrl).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns an error when neither automatic nor GitHub checks succeed', async () => {
    checkForUpdatesMock.mockResolvedValue({ success: false, error: 'native failed' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('GitHub unavailable')));

    const result = await (await getCheckHandler())({});
    expect(result.success).toBe(false);
  });
});
