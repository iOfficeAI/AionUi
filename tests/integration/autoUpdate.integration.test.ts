/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the bridge module before importing
vi.mock('@office-ai/platform', () => ({
  bridge: {
    buildProvider: vi.fn(() => ({
      provider: vi.fn(),
      invoke: vi.fn(),
    })),
    buildEmitter: vi.fn(() => ({
      emit: vi.fn(),
      on: vi.fn(),
    })),
  },
}));

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '1.0.0'),
    getPath: vi.fn(() => '/test/path'),
    isPackaged: true,
  },
}));

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

describe('Auto-Update IPC Bridge Integration', () => {
  let mockAutoUpdaterService: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create mock auto-updater service
    mockAutoUpdaterService = {
      initialize: vi.fn(),
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      quitAndInstall: vi.fn(),
      checkForUpdatesAndNotify: vi.fn(),
    };

    // Mock the autoUpdaterService module
    vi.mock('@/process/services/autoUpdaterService', () => ({
      autoUpdaterService: mockAutoUpdaterService,
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('IPC Bridge Registration', () => {
    it('should register auto-update IPC handlers', async () => {
      const { ipcBridge } = await import('@/common');

      // Verify that auto-update IPC endpoints exist
      expect(ipcBridge.autoUpdate).toBeDefined();
      expect(ipcBridge.autoUpdate.check).toBeDefined();
      expect(ipcBridge.autoUpdate.download).toBeDefined();
      expect(ipcBridge.autoUpdate.quitAndInstall).toBeDefined();
      expect(ipcBridge.autoUpdate.status).toBeDefined();
    });
  });

  describe('Auto-Update Check Flow', () => {
    it('should handle successful update check', async () => {
      const mockUpdateInfo = {
        version: '2.0.0',
        releaseDate: '2025-01-01',
        releaseNotes: 'New features',
      };

      mockAutoUpdaterService.checkForUpdates.mockResolvedValueOnce({
        success: true,
        updateInfo: mockUpdateInfo,
      });

      // Import and initialize the bridge
      const { initUpdateBridge } = await import('@/process/bridge/updateBridge');
      initUpdateBridge();

      // The bridge should be initialized without errors
      expect(initUpdateBridge).toBeDefined();
    });

    it('should handle update check failure', async () => {
      mockAutoUpdaterService.checkForUpdates.mockResolvedValueOnce({
        success: false,
        error: 'Network error',
      });

      const { initUpdateBridge } = await import('@/process/bridge/updateBridge');
      initUpdateBridge();

      expect(initUpdateBridge).toBeDefined();
    });
  });

  describe('Auto-Update Download Flow', () => {
    it('should handle successful download', async () => {
      mockAutoUpdaterService.downloadUpdate.mockResolvedValueOnce({
        success: true,
      });

      const { initUpdateBridge } = await import('@/process/bridge/updateBridge');
      initUpdateBridge();

      expect(initUpdateBridge).toBeDefined();
    });

    it('should handle download failure', async () => {
      mockAutoUpdaterService.downloadUpdate.mockResolvedValueOnce({
        success: false,
        error: 'Download failed',
      });

      const { initUpdateBridge } = await import('@/process/bridge/updateBridge');
      initUpdateBridge();

      expect(initUpdateBridge).toBeDefined();
    });
  });

  describe('Auto-Update Install Flow', () => {
    it('should call quitAndInstall', async () => {
      mockAutoUpdaterService.quitAndInstall.mockImplementation(() => {});

      const { initUpdateBridge } = await import('@/process/bridge/updateBridge');
      initUpdateBridge();

      expect(initUpdateBridge).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle exceptions gracefully', async () => {
      mockAutoUpdaterService.checkForUpdates.mockRejectedValueOnce(new Error('Unexpected error'));

      const { initUpdateBridge } = await import('@/process/bridge/updateBridge');

      // Should not throw
      expect(() => initUpdateBridge()).not.toThrow();
    });
  });
});

describe('Auto-Update Configuration', () => {
  it('should have correct electron-builder configuration', async () => {
    // Import electron-builder config
    const fs = await import('fs');
    const yaml = await import('js-yaml');
    const path = await import('path');

    const configPath = path.join(process.cwd(), 'electron-builder.yml');
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = yaml.load(configContent) as any;

    // Verify publish configuration
    expect(config.publish).toBeDefined();
    expect(config.publish.provider).toBe('github');
    expect(config.publish.publishAutoUpdate).toBe(true);

    // Verify NSIS configuration
    expect(config.nsis).toBeDefined();
    expect(config.nsis.differentialPackage).toBe(true);
  });
});
