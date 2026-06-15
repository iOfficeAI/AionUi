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
  forceDevUpdateConfig: false,
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

const appMock = vi.hoisted(() => ({
  isPackaged: false,
  getVersion: vi.fn(() => '2.1.13'),
  getPath: vi.fn(() => '/tmp/aionui-test'),
  exit: vi.fn(),
}));

vi.mock('electron-updater', () => ({
  autoUpdater: autoUpdaterMock,
}));

vi.mock('electron', () => ({
  app: appMock,
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
    autoUpdaterMock.forceDevUpdateConfig = false;
    autoUpdaterMock.allowPrerelease = false;
    autoUpdaterMock.allowDowngrade = false;
    autoUpdaterMock.channel = undefined;
    appMock.isPackaged = false;
    delete process.env.AIONUI_FORCE_DEV_AUTO_UPDATE;
    delete process.env.AIONUI_DEBUG_AUTO_UPDATE_CURRENT_VERSION;
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

  it('enables forced updater checks in unpacked dev builds when requested', async () => {
    process.env.AIONUI_FORCE_DEV_AUTO_UPDATE = '1';

    await import('@/process/services/autoUpdaterService');

    expect(autoUpdaterMock.forceDevUpdateConfig).toBe(true);
  });

  it('overrides the updater current version only for forced unpacked dev checks', async () => {
    process.env.AIONUI_FORCE_DEV_AUTO_UPDATE = '1';
    process.env.AIONUI_DEBUG_AUTO_UPDATE_CURRENT_VERSION = '2.1.12';

    await import('@/process/services/autoUpdaterService');

    expect(autoUpdaterMock.currentVersion.version).toBe('2.1.12');
  });

  it('ignores forced updater debug env in packaged builds', async () => {
    appMock.isPackaged = true;
    process.env.AIONUI_FORCE_DEV_AUTO_UPDATE = '1';
    process.env.AIONUI_DEBUG_AUTO_UPDATE_CURRENT_VERSION = '2.1.12';

    await import('@/process/services/autoUpdaterService');

    expect(autoUpdaterMock.forceDevUpdateConfig).toBe(false);
    expect(autoUpdaterMock.currentVersion.version).toBe('2.1.13');
  });

  const getErrorHandler = (): ((error: Error) => void) => {
    const entry = autoUpdaterMock.on.mock.calls.find(([event]) => event === 'error');
    if (!entry) throw new Error('error handler not registered');
    return entry[1] as (error: Error) => void;
  };

  it('clarifies the Squirrel bundle error in dev mode', async () => {
    appMock.isPackaged = false;
    const { autoUpdaterService } = await import('@/process/services/autoUpdaterService');
    autoUpdaterService.initialize();

    const statuses: Array<{ status: string; error?: string }> = [];
    autoUpdaterService.on('update-status', (s: { status: string; error?: string }) => statuses.push(s));

    getErrorHandler()(new Error('Could not locate update bundle for com.github.Electron within file:///tmp/x'));

    const errorStatus = statuses.find((s) => s.status === 'error');
    expect(errorStatus?.error).toContain('[dev]');
    expect(errorStatus?.error).toContain('Could not locate update bundle');
  });

  it('passes through unrelated auto-updater errors verbatim', async () => {
    appMock.isPackaged = false;
    const { autoUpdaterService } = await import('@/process/services/autoUpdaterService');
    autoUpdaterService.initialize();

    const statuses: Array<{ status: string; error?: string }> = [];
    autoUpdaterService.on('update-status', (s: { status: string; error?: string }) => statuses.push(s));

    getErrorHandler()(new Error('network timeout'));

    const errorStatus = statuses.find((s) => s.status === 'error');
    expect(errorStatus?.error).toBe('network timeout');
  });
});
