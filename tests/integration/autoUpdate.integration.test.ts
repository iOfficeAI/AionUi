/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @office-ai/platform at module level (before any imports)
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
}));

// Mock electron modules
vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '1.0.0'),
    getPath: vi.fn(() => '/test/path'),
    isPackaged: true,
  },
  BrowserWindow: vi.fn(() => ({
    webContents: { send: vi.fn() },
    isDestroyed: vi.fn(() => false),
  })),
}));

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

vi.mock('electron-log', () => ({
  default: {
    transports: { file: { level: 'info' } },
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('Auto-Update IPC Bridge Integration', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('IPC Bridge Registration', () => {
    it('should register all auto-update IPC handlers', async () => {
      const { ipcBridge } = await import('@/common');

      // Verify IPC endpoints exist with correct structure
      expect(ipcBridge.autoUpdate).toBeDefined();
      expect(typeof ipcBridge.autoUpdate.check.provider).toBe('function');
      expect(typeof ipcBridge.autoUpdate.download.provider).toBe('function');
      expect(typeof ipcBridge.autoUpdate.quitAndInstall.provider).toBe('function');
      expect(typeof ipcBridge.autoUpdate.status.emit).toBe('function');
    });

    it('should register handlers when initUpdateBridge is called', async () => {
      const { initUpdateBridge } = await import('@/process/bridge/updateBridge');

      // Should not throw
      expect(() => initUpdateBridge()).not.toThrow();
    });
  });

  describe('createAutoUpdateStatusBroadcast', () => {
    it('should create a pure emitter callback that emits via ipcBridge', async () => {
      const { createAutoUpdateStatusBroadcast } = await import('@/process/bridge/updateBridge');
      const { ipcBridge } = await import('@/common');

      // No window argument needed — pure emitter
      const broadcast = createAutoUpdateStatusBroadcast();

      broadcast({ status: 'checking' });

      expect(ipcBridge.autoUpdate.status.emit).toHaveBeenCalledWith({ status: 'checking' });
    });

    it('should forward all status fields correctly', async () => {
      const { createAutoUpdateStatusBroadcast } = await import('@/process/bridge/updateBridge');
      const { ipcBridge } = await import('@/common');

      const broadcast = createAutoUpdateStatusBroadcast();

      const fullStatus = {
        status: 'available' as const,
        version: '2.0.0',
        releaseDate: '2025-01-01',
        releaseNotes: 'New features',
      };
      broadcast(fullStatus);

      expect(ipcBridge.autoUpdate.status.emit).toHaveBeenCalledWith(fullStatus);
    });
  });

  describe('Auto-Update Check Handler', () => {
    it('should return error when service not initialized', async () => {
      const { initUpdateBridge } = await import('@/process/bridge/updateBridge');
      const { autoUpdaterService } = await import('@/process/services/autoUpdaterService');

      // Reset service to ensure not initialized
      autoUpdaterService.resetForTest();

      initUpdateBridge();

      // Check for updates without initializing
      const result = await autoUpdaterService.checkForUpdates();

      expect(result.success).toBe(false);
      expect(result.error).toBe('AutoUpdaterService not initialized');
    });

    it('should set allowPrerelease before checking', async () => {
      const { initUpdateBridge } = await import('@/process/bridge/updateBridge');
      const { autoUpdaterService } = await import('@/process/services/autoUpdaterService');
      const { ipcBridge } = await import('@/common');

      autoUpdaterService.resetForTest();
      initUpdateBridge();

      // Hard assert: the handler must have been registered
      const checkProviderCalls = vi.mocked(ipcBridge.autoUpdate.check.provider).mock.calls;
      expect(checkProviderCalls.length).toBeGreaterThan(0);

      const checkHandler = checkProviderCalls[0][0];
      expect(typeof checkHandler).toBe('function');

      // Initialize service so the handler can actually run
      autoUpdaterService.initialize();

      // Call with includePrerelease: true
      await checkHandler({ includePrerelease: true });

      expect(autoUpdaterService.allowPrerelease).toBe(true);
    });
  });

  describe('Auto-Update Download Handler', () => {
    it('should return error when service not initialized', async () => {
      const { initUpdateBridge } = await import('@/process/bridge/updateBridge');
      const { autoUpdaterService } = await import('@/process/services/autoUpdaterService');

      autoUpdaterService.resetForTest();
      initUpdateBridge();

      const result = await autoUpdaterService.downloadUpdate();

      expect(result.success).toBe(false);
      expect(result.error).toBe('AutoUpdaterService not initialized');
    });
  });

  describe('Service Integration', () => {
    it('should work end-to-end with status broadcast', async () => {
      const { autoUpdaterService } = await import('@/process/services/autoUpdaterService');

      autoUpdaterService.resetForTest();

      // Create mock broadcast callback
      const mockBroadcast = vi.fn();
      autoUpdaterService.initialize(mockBroadcast);

      // Verify initialized
      expect(autoUpdaterService.isInitialized).toBe(true);

      // Trigger event via the test helper — no mock.calls digging needed
      autoUpdaterService.triggerEventForTest('checking-for-update');

      // The broadcast callback should have been called
      expect(mockBroadcast).toHaveBeenCalledWith({ status: 'checking' });
    });

    it('should wire createAutoUpdateStatusBroadcast into autoUpdaterService correctly', async () => {
      // This test covers the full chain:
      //   initUpdateBridge() registers IPC handlers
      //   autoUpdaterService.initialize(createAutoUpdateStatusBroadcast()) wires the emitter
      //   triggering an autoUpdater event causes ipcBridge.autoUpdate.status.emit to be called
      const { initUpdateBridge, createAutoUpdateStatusBroadcast } = await import('@/process/bridge/updateBridge');
      const { autoUpdaterService } = await import('@/process/services/autoUpdaterService');
      const { ipcBridge } = await import('@/common');

      autoUpdaterService.resetForTest();

      // Wire up the full chain as main.ts would do
      initUpdateBridge();
      autoUpdaterService.initialize(createAutoUpdateStatusBroadcast());

      // Simulate an autoUpdater event
      autoUpdaterService.triggerEventForTest('update-available', {
        version: '2.0.0',
        releaseDate: '2025-01-01',
        releaseNotes: 'Changelog',
      });

      // The status must have been broadcast via ipcBridge
      expect(ipcBridge.autoUpdate.status.emit).toHaveBeenCalledWith({
        status: 'available',
        version: '2.0.0',
        releaseDate: '2025-01-01',
        releaseNotes: 'Changelog',
      });
    });
  });
});
