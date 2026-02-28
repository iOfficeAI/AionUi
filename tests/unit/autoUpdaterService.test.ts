/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { autoUpdater } from 'electron-updater';

// Mock electron modules
vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '1.0.0'),
    isPackaged: true,
  },
}));

// Mock electron-updater
vi.mock('electron-updater', () => ({
  autoUpdater: {
    logger: null,
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowPrerelease: false,
    allowDowngrade: false,
    on: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
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
  let mockStatusBroadcast: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Reset modules to ensure fresh import
    vi.resetModules();

    // Reset all mocks
    vi.clearAllMocks();

    // Create mock status broadcast callback
    mockStatusBroadcast = vi.fn();

    // Import the service (after mocks are set up)
    const module = await import('@/process/services/autoUpdaterService');
    autoUpdaterService = module.autoUpdaterService;
  });

  afterEach(() => {
    // Use resetForTest to fully reset state including handlers
    autoUpdaterService?.resetForTest();
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize with status broadcast callback', () => {
      expect(autoUpdaterService.isInitialized).toBe(false);

      autoUpdaterService.initialize(mockStatusBroadcast);

      expect(autoUpdaterService.isInitialized).toBe(true);
    });

    it('should initialize without callback (null)', () => {
      autoUpdaterService.initialize();

      expect(autoUpdaterService.isInitialized).toBe(true);
    });

    it('should set up event handlers only once', () => {
      autoUpdaterService.initialize(mockStatusBroadcast);
      const firstCallCount = vi.mocked(autoUpdater.on).mock.calls.length;

      // Initialize again without reset - should not register again
      autoUpdaterService.initialize(mockStatusBroadcast);

      // Event handlers should not be registered again
      expect(vi.mocked(autoUpdater.on).mock.calls.length).toBe(firstCallCount);
    });

    it('should not register handlers twice without reset', () => {
      autoUpdaterService.initialize(mockStatusBroadcast);
      const firstCallCount = vi.mocked(autoUpdater.on).mock.calls.length;

      // Initialize again without reset
      autoUpdaterService.reset(); // Production reset doesn't clear handlers
      autoUpdaterService.initialize(mockStatusBroadcast);

      // Event handlers should not be registered again
      expect(vi.mocked(autoUpdater.on).mock.calls.length).toBe(firstCallCount);
    });
  });

  describe('setStatusBroadcastCallback', () => {
    it('should update status broadcast callback', () => {
      autoUpdaterService.initialize();

      const newCallback = vi.fn();
      autoUpdaterService.setStatusBroadcastCallback(newCallback);

      // Trigger an event to verify the new callback is used
      autoUpdaterService.triggerEventForTest('checking-for-update');

      expect(newCallback).toHaveBeenCalledWith({ status: 'checking' });
    });
  });

  describe('checkForUpdates', () => {
    it('should fail when not initialized', async () => {
      const result = await autoUpdaterService.checkForUpdates();

      expect(result.success).toBe(false);
      expect(result.error).toBe('AutoUpdaterService not initialized');
    });

    it('should check for updates successfully', async () => {
      autoUpdaterService.initialize(mockStatusBroadcast);

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
      autoUpdaterService.initialize(mockStatusBroadcast);

      vi.mocked(autoUpdater.checkForUpdates).mockRejectedValueOnce(new Error('Network error'));

      const result = await autoUpdaterService.checkForUpdates();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle non-Error thrown in checkForUpdates', async () => {
      autoUpdaterService.initialize(mockStatusBroadcast);

      vi.mocked(autoUpdater.checkForUpdates).mockRejectedValueOnce('String error');

      const result = await autoUpdaterService.checkForUpdates();

      expect(result.success).toBe(false);
      expect(result.error).toBe('String error');
    });
  });

  describe('downloadUpdate', () => {
    it('should fail when not initialized', async () => {
      const result = await autoUpdaterService.downloadUpdate();

      expect(result.success).toBe(false);
      expect(result.error).toBe('AutoUpdaterService not initialized');
    });

    it('should download update successfully', async () => {
      autoUpdaterService.initialize(mockStatusBroadcast);

      vi.mocked(autoUpdater.downloadUpdate).mockResolvedValueOnce([]);

      const result = await autoUpdaterService.downloadUpdate();

      expect(result.success).toBe(true);
    });

    it('should handle download error', async () => {
      autoUpdaterService.initialize(mockStatusBroadcast);

      vi.mocked(autoUpdater.downloadUpdate).mockRejectedValueOnce(new Error('Download failed'));

      const result = await autoUpdaterService.downloadUpdate();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Download failed');
    });

    it('should handle non-Error thrown in downloadUpdate', async () => {
      autoUpdaterService.initialize(mockStatusBroadcast);

      vi.mocked(autoUpdater.downloadUpdate).mockRejectedValueOnce('Download string error');

      const result = await autoUpdaterService.downloadUpdate();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Download string error');
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

    it('should handle checkForUpdatesAndNotify error gracefully', async () => {
      vi.mocked(autoUpdater.checkForUpdatesAndNotify).mockRejectedValueOnce(new Error('Update check failed'));

      // Should not throw
      await expect(autoUpdaterService.checkForUpdatesAndNotify()).resolves.not.toThrow();
    });
  });

  describe('setAllowPrerelease', () => {
    it('should enable prerelease updates', () => {
      autoUpdaterService.setAllowPrerelease(true);

      expect(autoUpdaterService.allowPrerelease).toBe(true);
      expect(autoUpdater.allowPrerelease).toBe(true);
      expect(autoUpdater.allowDowngrade).toBe(true);
    });

    it('should disable prerelease updates', () => {
      autoUpdaterService.setAllowPrerelease(false);

      expect(autoUpdaterService.allowPrerelease).toBe(false);
      expect(autoUpdater.allowPrerelease).toBe(false);
    });
  });

  describe('Event Emitter', () => {
    it('should emit update-status event when checking for updates', () => {
      autoUpdaterService.initialize(mockStatusBroadcast);

      const statusListener = vi.fn();
      autoUpdaterService.on('update-status', statusListener);

      autoUpdaterService.triggerEventForTest('checking-for-update');

      expect(statusListener).toHaveBeenCalledWith({ status: 'checking' });
    });

    it('should emit update-status event when update is available', () => {
      autoUpdaterService.initialize(mockStatusBroadcast);

      const statusListener = vi.fn();
      autoUpdaterService.on('update-status', statusListener);

      autoUpdaterService.triggerEventForTest('update-available', {
        version: '2.0.0',
        releaseDate: '2025-01-01',
        releaseNotes: 'New features',
      });

      expect(statusListener).toHaveBeenCalledWith({
        status: 'available',
        version: '2.0.0',
        releaseDate: '2025-01-01',
        releaseNotes: 'New features',
      });
    });

    it('should emit update-status event when update is not available', () => {
      autoUpdaterService.initialize(mockStatusBroadcast);

      const statusListener = vi.fn();
      autoUpdaterService.on('update-status', statusListener);

      autoUpdaterService.triggerEventForTest('update-not-available');

      expect(statusListener).toHaveBeenCalledWith({ status: 'not-available' });
    });

    it('should emit update-status event with download progress', () => {
      autoUpdaterService.initialize(mockStatusBroadcast);

      const statusListener = vi.fn();
      autoUpdaterService.on('update-status', statusListener);

      const mockProgress = {
        bytesPerSecond: 1024 * 1024,
        percent: 50,
        transferred: 50 * 1024 * 1024,
        total: 100 * 1024 * 1024,
      };
      autoUpdaterService.triggerEventForTest('download-progress', mockProgress);

      expect(statusListener).toHaveBeenCalledWith({
        status: 'downloading',
        progress: {
          bytesPerSecond: 1024 * 1024,
          percent: 50,
          transferred: 50 * 1024 * 1024,
          total: 100 * 1024 * 1024,
        },
      });
    });

    it('should emit update-status event when update is downloaded', () => {
      autoUpdaterService.initialize(mockStatusBroadcast);

      const statusListener = vi.fn();
      autoUpdaterService.on('update-status', statusListener);

      autoUpdaterService.triggerEventForTest('update-downloaded', { version: '2.0.0' });

      expect(statusListener).toHaveBeenCalledWith({
        status: 'downloaded',
        version: '2.0.0',
      });
    });

    it('should emit update-status event on error', () => {
      autoUpdaterService.initialize(mockStatusBroadcast);

      const statusListener = vi.fn();
      autoUpdaterService.on('update-status', statusListener);

      autoUpdaterService.triggerEventForTest('error', new Error('Update failed'));

      expect(statusListener).toHaveBeenCalledWith({
        status: 'error',
        error: 'Update failed',
      });
    });

    it('should handle non-string releaseNotes', () => {
      autoUpdaterService.initialize(mockStatusBroadcast);

      const statusListener = vi.fn();
      autoUpdaterService.on('update-status', statusListener);

      autoUpdaterService.triggerEventForTest('update-available', {
        version: '2.0.0',
        releaseDate: '2025-01-01',
        releaseNotes: { some: 'object' }, // Non-string releaseNotes
      });

      expect(statusListener).toHaveBeenCalledWith({
        status: 'available',
        version: '2.0.0',
        releaseDate: '2025-01-01',
        releaseNotes: undefined,
      });
    });

    it('should throw when triggering an event before initialize', () => {
      // Handler not registered yet — triggerEventForTest must throw a clear error
      expect(() => autoUpdaterService.triggerEventForTest('checking-for-update')).toThrow('No handler registered for autoUpdater event "checking-for-update"');
    });
  });

  describe('Status Broadcast Callback', () => {
    it('should call status broadcast callback on status change', () => {
      autoUpdaterService.initialize(mockStatusBroadcast);

      autoUpdaterService.triggerEventForTest('checking-for-update');

      expect(mockStatusBroadcast).toHaveBeenCalledWith({ status: 'checking' });
    });

    it('should not call callback if no callback registered', () => {
      autoUpdaterService.initialize(); // No callback

      // Should not throw
      expect(() => autoUpdaterService.triggerEventForTest('checking-for-update')).not.toThrow();
    });
  });

  describe('reset vs resetForTest', () => {
    it('reset() should not clear event handlers flag', () => {
      autoUpdaterService.initialize(mockStatusBroadcast);
      const handlerCountAfterInit = vi.mocked(autoUpdater.on).mock.calls.length;

      autoUpdaterService.reset();
      autoUpdaterService.initialize(mockStatusBroadcast);

      // Handlers should not be registered again
      expect(vi.mocked(autoUpdater.on).mock.calls.length).toBe(handlerCountAfterInit);
    });

    it('resetForTest() should clear event handlers flag', () => {
      autoUpdaterService.initialize(mockStatusBroadcast);
      const handlerCountAfterInit = vi.mocked(autoUpdater.on).mock.calls.length;

      autoUpdaterService.resetForTest();
      autoUpdaterService.initialize(mockStatusBroadcast);

      // Handlers should be registered again
      expect(vi.mocked(autoUpdater.on).mock.calls.length).toBe(handlerCountAfterInit * 2);
    });

    it('resetForTest() should remove each registered handler from autoUpdater', () => {
      autoUpdaterService.initialize(mockStatusBroadcast);

      autoUpdaterService.resetForTest();

      // removeListener should have been called for each registered event
      expect(vi.mocked(autoUpdater.removeListener).mock.calls.length).toBeGreaterThan(0);
    });

    it('resetForTest() should prevent triggering events after reset', () => {
      autoUpdaterService.initialize(mockStatusBroadcast);
      autoUpdaterService.resetForTest();

      // After reset, handlers are gone — triggerEventForTest must throw
      expect(() => autoUpdaterService.triggerEventForTest('checking-for-update')).toThrow('No handler registered for autoUpdater event "checking-for-update"');
    });
  });
});
