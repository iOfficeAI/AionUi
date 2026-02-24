/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';

// Mock electron modules
vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '1.0.0'),
    isPackaged: true,
  },
  BrowserWindow: vi.fn(() => ({
    webContents: {
      send: vi.fn(),
    },
    isDestroyed: vi.fn(() => false),
  })),
}));

// Mock electron-updater
vi.mock('electron-updater', () => ({
  autoUpdater: {
    logger: null,
    autoDownload: true,
    autoInstallOnAppQuit: true,
    on: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    checkForUpdatesAndNotify: vi.fn(),
  },
}));

// Mock electron-log
vi.mock('electron-log', () => ({
  default: {
    transports: {
      file: {
        level: 'info',
      },
    },
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('AutoUpdaterService', () => {
  let autoUpdaterService: any;
  let mockMainWindow: any;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock main window
    mockMainWindow = {
      webContents: {
        send: vi.fn(),
      },
      isDestroyed: vi.fn(() => false),
    };

    // Import the service (after mocks are set up)
    const module = await import('@/process/services/autoUpdaterService');
    autoUpdaterService = module.autoUpdaterService;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize with main window', () => {
      autoUpdaterService.initialize(mockMainWindow);

      expect(autoUpdaterService.isInitialized).toBe(true);
    });

    it('should set up event handlers', () => {
      autoUpdaterService.initialize(mockMainWindow);

      // Check that event handlers are registered
      expect(autoUpdater.on).toHaveBeenCalledWith('checking-for-update', expect.any(Function));
      expect(autoUpdater.on).toHaveBeenCalledWith('update-available', expect.any(Function));
      expect(autoUpdater.on).toHaveBeenCalledWith('update-not-available', expect.any(Function));
      expect(autoUpdater.on).toHaveBeenCalledWith('download-progress', expect.any(Function));
      expect(autoUpdater.on).toHaveBeenCalledWith('update-downloaded', expect.any(Function));
      expect(autoUpdater.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('checkForUpdates', () => {
    it('should return error if not initialized', async () => {
      const result = await autoUpdaterService.checkForUpdates();

      expect(result.success).toBe(false);
      expect(result.error).toBe('AutoUpdaterService not initialized');
    });

    it('should check for updates successfully', async () => {
      autoUpdaterService.initialize(mockMainWindow);

      const mockUpdateInfo = {
        version: '2.0.0',
        releaseDate: '2025-01-01',
        releaseNotes: 'New features',
      };

      vi.mocked(autoUpdater.checkForUpdates).mockResolvedValueOnce({
        updateInfo: mockUpdateInfo,
      });

      const result = await autoUpdaterService.checkForUpdates();

      expect(result.success).toBe(true);
      expect(result.updateInfo).toEqual(mockUpdateInfo);
    });

    it('should handle check for updates error', async () => {
      autoUpdaterService.initialize(mockMainWindow);

      vi.mocked(autoUpdater.checkForUpdates).mockRejectedValueOnce(new Error('Network error'));

      const result = await autoUpdaterService.checkForUpdates();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('downloadUpdate', () => {
    it('should return error if not initialized', async () => {
      const result = await autoUpdaterService.downloadUpdate();

      expect(result.success).toBe(false);
      expect(result.error).toBe('AutoUpdaterService not initialized');
    });

    it('should download update successfully', async () => {
      autoUpdaterService.initialize(mockMainWindow);

      vi.mocked(autoUpdater.downloadUpdate).mockResolvedValueOnce([]);

      const result = await autoUpdaterService.downloadUpdate();

      expect(result.success).toBe(true);
    });

    it('should handle download error', async () => {
      autoUpdaterService.initialize(mockMainWindow);

      vi.mocked(autoUpdater.downloadUpdate).mockRejectedValueOnce(new Error('Download failed'));

      const result = await autoUpdaterService.downloadUpdate();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Download failed');
    });
  });

  describe('quitAndInstall', () => {
    it('should call quitAndInstall on autoUpdater', () => {
      autoUpdaterService.quitAndInstall();

      expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
    });
  });

  describe('checkForUpdatesAndNotify', () => {
    it('should call checkForUpdatesAndNotify', async () => {
      vi.mocked(autoUpdater.checkForUpdatesAndNotify).mockResolvedValueOnce(null);

      await autoUpdaterService.checkForUpdatesAndNotify();

      expect(autoUpdater.checkForUpdatesAndNotify).toHaveBeenCalled();
    });
  });

  describe('Event Handlers', () => {
    beforeEach(() => {
      autoUpdaterService.initialize(mockMainWindow);
    });

    it('should emit checking status', () => {
      const checkingHandler = vi.mocked(autoUpdater.on).mock.calls.find((call) => call[0] === 'checking-for-update')?.[1];

      if (checkingHandler) {
        checkingHandler();

        expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('auto-update-status', {
          status: 'checking',
        });
      }
    });

    it('should emit available status with update info', () => {
      const availableHandler = vi.mocked(autoUpdater.on).mock.calls.find((call) => call[0] === 'update-available')?.[1];

      if (availableHandler) {
        const mockInfo = {
          version: '2.0.0',
          releaseDate: '2025-01-01',
          releaseNotes: 'New features',
        };

        availableHandler(mockInfo);

        expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('auto-update-status', {
          status: 'available',
          version: '2.0.0',
          releaseDate: '2025-01-01',
          releaseNotes: 'New features',
        });
      }
    });

    it('should emit downloading status with progress', () => {
      const progressHandler = vi.mocked(autoUpdater.on).mock.calls.find((call) => call[0] === 'download-progress')?.[1];

      if (progressHandler) {
        const mockProgress = {
          bytesPerSecond: 1024 * 1024,
          percent: 50,
          transferred: 50 * 1024 * 1024,
          total: 100 * 1024 * 1024,
        };

        progressHandler(mockProgress);

        expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('auto-update-status', {
          status: 'downloading',
          progress: mockProgress,
        });
      }
    });

    it('should emit downloaded status', () => {
      const downloadedHandler = vi.mocked(autoUpdater.on).mock.calls.find((call) => call[0] === 'update-downloaded')?.[1];

      if (downloadedHandler) {
        const mockInfo = {
          version: '2.0.0',
        };

        downloadedHandler(mockInfo);

        expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('auto-update-status', {
          status: 'downloaded',
          version: '2.0.0',
        });
      }
    });

    it('should emit error status', () => {
      const errorHandler = vi.mocked(autoUpdater.on).mock.calls.find((call) => call[0] === 'error')?.[1];

      if (errorHandler) {
        const mockError = new Error('Update failed');

        errorHandler(mockError);

        expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('auto-update-status', {
          status: 'error',
          error: 'Update failed',
        });
      }
    });

    it('should not emit status if window is destroyed', () => {
      mockMainWindow.isDestroyed.mockReturnValue(true);

      const checkingHandler = vi.mocked(autoUpdater.on).mock.calls.find((call) => call[0] === 'checking-for-update')?.[1];

      if (checkingHandler) {
        checkingHandler();

        expect(mockMainWindow.webContents.send).not.toHaveBeenCalled();
      }
    });
  });
});
