/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The autoUpdaterService module pulls in electron-updater / electron / electron-log
// which are not loadable under the vitest node env. Mock them with the minimal
// surface the module touches at import time so we can exercise the pure
// feed-resolution logic and the no-feed quiet state.
// vi.hoisted lets the mock factory (hoisted to top of file) safely reference this.
const { setFeedURL } = vi.hoisted(() => ({ setFeedURL: vi.fn() }));
vi.mock('electron-updater', () => ({
  autoUpdater: {
    logger: { transports: { file: { level: 'info' } } },
    autoDownload: false,
    autoInstallOnAppQuit: false,
    allowDowngrade: false,
    channel: undefined as string | undefined,
    on: vi.fn(),
    removeListener: vi.fn(),
    setFeedURL,
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    checkForUpdatesAndNotify: vi.fn(),
    quitAndInstall: vi.fn(),
  },
}));
vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0-alpha.5', getPath: () => '/tmp/command-eve-test' },
}));
vi.mock('electron-log', () => {
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    transports: { file: { level: 'info' } },
  };
  return { default: log, ...log };
});
vi.mock('@/process/services/autoUpdateDiagnostics', () => ({
  recordAutoUpdateStatus: vi.fn(),
  recordAutoUpdateQuitAndInstall: vi.fn(),
}));

import {
  resolveUpdateFeedUrl,
  UPDATE_FEED_URL_ENV,
  UPDATE_FEED_URL_CONFIG_KEY,
  autoUpdaterService,
} from '@/process/services/autoUpdaterService';

const ORIGINAL_ENV = process.env[UPDATE_FEED_URL_ENV];

beforeEach(() => {
  delete process.env[UPDATE_FEED_URL_ENV];
  setFeedURL.mockClear();
  autoUpdaterService.reset();
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env[UPDATE_FEED_URL_ENV];
  else process.env[UPDATE_FEED_URL_ENV] = ORIGINAL_ENV;
});

describe('resolveUpdateFeedUrl', () => {
  it('prefers the env var over the persisted config', async () => {
    process.env[UPDATE_FEED_URL_ENV] = 'https://env.example/feed';
    const read = vi.fn(async () => 'https://config.example/feed');
    const url = await resolveUpdateFeedUrl(read);
    expect(url).toBe('https://env.example/feed');
    expect(read).not.toHaveBeenCalled();
  });

  it('falls back to the persisted config when env is unset', async () => {
    const read = vi.fn(async (key: typeof UPDATE_FEED_URL_CONFIG_KEY) => {
      expect(key).toBe(UPDATE_FEED_URL_CONFIG_KEY);
      return 'https://config.example/feed';
    });
    const url = await resolveUpdateFeedUrl(read);
    expect(url).toBe('https://config.example/feed');
  });

  it('returns undefined (quiet no-feed state) when neither is set', async () => {
    const read = vi.fn(async () => undefined);
    const url = await resolveUpdateFeedUrl(read);
    expect(url).toBeUndefined();
  });

  it('trims and ignores whitespace-only values', async () => {
    process.env[UPDATE_FEED_URL_ENV] = '   ';
    const read = vi.fn(async () => '  https://config.example/feed  ');
    const url = await resolveUpdateFeedUrl(read);
    expect(url).toBe('https://config.example/feed');
  });
});

describe('autoUpdaterService.configureFeed', () => {
  it('no-ops quietly and does not call setFeedURL when no feed is configured', async () => {
    const result = await autoUpdaterService.configureFeed(async () => undefined);
    expect(result.configured).toBe(false);
    expect(autoUpdaterService.isFeedConfigured).toBe(false);
    expect(setFeedURL).not.toHaveBeenCalled();
  });

  it('applies a generic feed via setFeedURL when a URL is present', async () => {
    const result = await autoUpdaterService.configureFeed(async () => 'https://config.example/feed');
    expect(result.configured).toBe(true);
    expect(autoUpdaterService.isFeedConfigured).toBe(true);
    expect(setFeedURL).toHaveBeenCalledTimes(1);
    const arg = setFeedURL.mock.calls[0][0];
    expect(arg.provider).toBe('generic');
    expect(arg.url).toBe('https://config.example/feed');
  });
});

describe('autoUpdaterService.checkForUpdatesAndNotify', () => {
  it('does not throw and no-ops when no feed is configured', async () => {
    autoUpdaterService.initialize();
    await expect(autoUpdaterService.checkForUpdatesAndNotify(async () => undefined)).resolves.toBeUndefined();
    expect(setFeedURL).not.toHaveBeenCalled();
  });
});
