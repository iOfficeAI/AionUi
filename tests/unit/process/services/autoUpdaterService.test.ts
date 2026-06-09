/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const autoUpdaterMock = vi.hoisted(() => ({
  logger: null as unknown,
  autoDownload: true,
  autoInstallOnAppQuit: false,
  allowPrerelease: false,
  allowDowngrade: false,
  channel: undefined as string | undefined,
  currentVersion: { version: '2.1.13' },
  setFeedURL: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn(),
  checkForUpdatesAndNotify: vi.fn(),
}));

vi.mock('electron-updater', () => ({
  autoUpdater: autoUpdaterMock,
}));

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '2.1.13'),
    getPath: vi.fn(() => '/tmp/aionui-test'),
    exit: vi.fn(),
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

describe('AutoUpdaterService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    autoUpdaterMock.logger = null;
    autoUpdaterMock.autoDownload = true;
    autoUpdaterMock.autoInstallOnAppQuit = false;
    autoUpdaterMock.allowPrerelease = false;
    autoUpdaterMock.allowDowngrade = false;
    autoUpdaterMock.channel = undefined;
    Object.defineProperty(autoUpdaterMock, 'currentVersion', {
      configurable: true,
      value: { version: '2.1.13' },
    });
  });

  it('does not use the stable CDN updater when prerelease manual mode is enabled', async () => {
    autoUpdaterMock.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: {
        version: '2.1.14',
        files: [{ url: 'AionUi-2.1.14-mac-arm64.dmg', sha512: 'sha512-value' }],
        path: 'AionUi-2.1.14-mac-arm64.dmg',
        sha512: 'sha512-value',
        releaseDate: '2026-06-08T00:00:00.000Z',
      },
    });

    const { autoUpdaterService } = await import('@/process/services/autoUpdaterService');

    autoUpdaterService.initialize();
    autoUpdaterService.setAllowPrerelease(true);

    const result = await autoUpdaterService.checkForUpdates();

    expect(result).toEqual({ success: true });
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled();
  });

  it('configures electron-updater to read stable metadata from the CDN', async () => {
    const { autoUpdaterService } = await import('@/process/services/autoUpdaterService');
    const { CdnGenericProvider } = await import('@/process/services/cdnGenericProvider');

    autoUpdaterService.resetForTest();

    expect(autoUpdaterMock.setFeedURL).toHaveBeenCalledWith({
      provider: 'custom',
      url: 'https://static.aionui.com/releases',
      updateProvider: CdnGenericProvider,
    });
  });
});
