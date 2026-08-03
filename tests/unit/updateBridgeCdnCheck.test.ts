/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/common/platform/bridge', () => ({
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
}));

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '2.1.40'),
    getPath: vi.fn(() => '/test/path'),
    exit: vi.fn(),
    isPackaged: true,
  },
  autoUpdater: {
    on: vi.fn(),
    removeListener: vi.fn(),
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

vi.mock('@process/services/i18n', () => ({
  default: { t: (key: string) => key },
}));

// The fixtures below are mac-arm64 assets and both resolveCdnChannelFile and
// pickRecommendedAsset read the host platform/arch, so pin the runtime to keep
// results identical on every CI runner (linux/windows x64 would otherwise
// filter the assets out and pick no recommended asset).
import { afterAll, beforeAll } from 'vitest';

const realPlatform = process.platform;
const realArch = process.arch;
beforeAll(() => {
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  Object.defineProperty(process, 'arch', { value: 'arm64', configurable: true });
});
afterAll(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
  Object.defineProperty(process, 'arch', { value: realArch, configurable: true });
});

const CDN_YML = `version: 2.1.45
files:
  - url: AionUi-2.1.45-mac-arm64.zip
    size: 100
  - url: AionUi-2.1.45-mac-arm64.dmg
    size: 200
path: AionUi-2.1.45-mac-arm64.zip
releaseDate: '2026-07-31T14:45:19.381Z'
`;

const GITHUB_RELEASES = [
  {
    tag_name: 'v2.1.45',
    name: 'v2.1.45',
    body: 'changelog body',
    html_url: 'https://github.com/iOfficeAI/AionUi/releases/tag/v2.1.45',
    prerelease: false,
    draft: false,
    assets: [],
  },
];

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

type FetchScenario = {
  cdn?: () => Promise<Response> | Response;
  github?: () => Promise<Response> | Response;
};

const stubFetch = (scenario: FetchScenario) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('https://static.aionui.com/releases/latest')) {
      if (!scenario.cdn) throw new Error('unexpected CDN request');
      return scenario.cdn();
    }
    if (url.startsWith('https://api.github.com/')) {
      if (!scenario.github) throw new Error('github unreachable');
      return scenario.github();
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const ymlResponse = (body: string) => new Response(body, { status: 200 });
const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('update.check CDN-first', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports an update from the CDN manifest and attaches GitHub notes', async () => {
    stubFetch({ cdn: () => ymlResponse(CDN_YML), github: () => jsonResponse(GITHUB_RELEASES) });
    const handler = await getCheckHandler();
    const res = await handler({});
    expect(res.success).toBe(true);
    expect(res.data?.updateAvailable).toBe(true);
    expect(res.data?.latest?.version).toBe('2.1.45');
    expect(res.data?.latest?.body).toBe('changelog body');
    expect(res.data?.latest?.htmlUrl).toBe('https://github.com/iOfficeAI/AionUi/releases/tag/v2.1.45');
    expect(res.data?.latest?.recommendedAsset?.url).toBe(
      'https://static.aionui.com/releases/2.1.45/AionUi-2.1.45-mac-arm64.dmg'
    );
  });

  it('succeeds without notes when GitHub is unreachable', async () => {
    stubFetch({ cdn: () => ymlResponse(CDN_YML) });
    const handler = await getCheckHandler();
    const res = await handler({});
    expect(res.success).toBe(true);
    expect(res.data?.updateAvailable).toBe(true);
    expect(res.data?.latest?.body).toBeUndefined();
    expect(res.data?.latest?.htmlUrl).toBe('');
    expect(res.data?.latest?.assets.length).toBeGreaterThan(0);
  });

  it('ignores GitHub releases that do not match the CDN version', async () => {
    stubFetch({
      cdn: () => ymlResponse(CDN_YML),
      github: () => jsonResponse([{ ...GITHUB_RELEASES[0], tag_name: 'v9.9.9' }]),
    });
    const handler = await getCheckHandler();
    const res = await handler({});
    expect(res.success).toBe(true);
    expect(res.data?.latest?.body).toBeUndefined();
  });

  it('reports up-to-date when CDN version equals current version', async () => {
    stubFetch({
      cdn: () => ymlResponse(CDN_YML.replace(/2\.1\.45/g, '2.1.40')),
      github: () => jsonResponse([]),
    });
    const handler = await getCheckHandler();
    const res = await handler({});
    expect(res.success).toBe(true);
    expect(res.data?.updateAvailable).toBe(false);
  });

  it('fails the check when the CDN manifest request fails', async () => {
    stubFetch({ cdn: () => new Response('nope', { status: 502 }), github: () => jsonResponse(GITHUB_RELEASES) });
    const handler = await getCheckHandler();
    const res = await handler({});
    expect(res.success).toBe(false);
  });

  it('fails the check when the CDN manifest is malformed', async () => {
    stubFetch({ cdn: () => ymlResponse('not: [valid'), github: () => jsonResponse(GITHUB_RELEASES) });
    const handler = await getCheckHandler();
    const res = await handler({});
    expect(res.success).toBe(false);
  });
});
