/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { ProgressInfo, UpdateInfo } from 'electron-updater';
import { ipcBridge } from '@/common';
import log from 'electron-log';

export interface AutoUpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'cancelled';
  version?: string;
  releaseDate?: string;
  releaseNotes?: string;
  progress?: {
    bytesPerSecond: number;
    percent: number;
    transferred: number;
    total: number;
  };
  error?: string;
}

class AutoUpdaterService {
  private mainWindow: BrowserWindow | null = null;
  private isInitialized = false;

  constructor() {
    // Configure logging
    autoUpdater.logger = log;
    (autoUpdater.logger as typeof log).transports.file.level = 'info';

    // Disable auto-download for manual control
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // Setup event handlers
    this.setupEventHandlers();
  }

  initialize(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.isInitialized = true;
  }

  private setupEventHandlers() {
    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for updates...');
      this.emitStatus({ status: 'checking' });
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      log.info(`Update available: ${info.version}`);
      this.emitStatus({
        status: 'available',
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      });
    });

    autoUpdater.on('update-not-available', () => {
      log.info('Application is up to date');
      this.emitStatus({ status: 'not-available' });
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      log.info(`Download progress: ${progress.percent.toFixed(2)}%`);
      this.emitStatus({
        status: 'downloading',
        progress: {
          bytesPerSecond: progress.bytesPerSecond,
          percent: progress.percent,
          transferred: progress.transferred,
          total: progress.total,
        },
      });
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      log.info('Update downloaded');
      this.emitStatus({
        status: 'downloaded',
        version: info.version,
      });
    });

    autoUpdater.on('error', (error: Error) => {
      log.error('Auto-updater error:', error);
      this.emitStatus({
        status: 'error',
        error: error.message,
      });
    });
  }

  private emitStatus(status: AutoUpdateStatus) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    this.mainWindow.webContents.send('auto-update-status', status);
  }

  async checkForUpdates(): Promise<{ success: boolean; updateInfo?: UpdateInfo; error?: string }> {
    try {
      if (!this.isInitialized) {
        throw new Error('AutoUpdaterService not initialized');
      }

      const result = await autoUpdater.checkForUpdates();
      return {
        success: true,
        updateInfo: result.updateInfo,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error('Check for updates failed:', message);
      return {
        success: false,
        error: message,
      };
    }
  }

  async downloadUpdate(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.isInitialized) {
        throw new Error('AutoUpdaterService not initialized');
      }

      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error('Download update failed:', message);
      return {
        success: false,
        error: message,
      };
    }
  }

  quitAndInstall() {
    log.info('Quitting and installing update...');
    autoUpdater.quitAndInstall(false, true);
  }

  // Check for updates and notify (for startup)
  async checkForUpdatesAndNotify(): Promise<void> {
    try {
      await autoUpdater.checkForUpdatesAndNotify();
    } catch (error) {
      log.error('Auto-update check failed:', error);
    }
  }
}

// Singleton instance
export const autoUpdaterService = new AutoUpdaterService();
