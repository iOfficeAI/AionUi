/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { autoUpdater } from 'electron-updater';
import type { ProgressInfo, UpdateInfo } from 'electron-updater';
import log from 'electron-log';
import { EventEmitter } from 'events';

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

/** Callback type for broadcasting update status */
export type StatusBroadcastCallback = (status: AutoUpdateStatus) => void;

/** Events emitted by AutoUpdaterService */
export interface AutoUpdaterEvents {
  'update-status': (status: AutoUpdateStatus) => void;
}

class AutoUpdaterService extends EventEmitter {
  private _isInitialized = false;
  private _eventHandlersSetup = false;
  private _allowPrerelease = false;
  private _statusBroadcastCallback: StatusBroadcastCallback | null = null;
  /** Stores registered autoUpdater event handlers for cleanup and test access */
  private readonly _autoUpdaterHandlers = new Map<string, (...args: unknown[]) => void>();

  constructor() {
    super();
    // Configure logging
    autoUpdater.logger = log;
    (autoUpdater.logger as typeof log).transports.file.level = 'info';

    // Disable auto-download for manual control
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
  }

  /**
   * Initialize the service with an optional status broadcast callback.
   * This decouples the service from any specific window implementation.
   */
  initialize(statusBroadcastCallback?: StatusBroadcastCallback): void {
    this._statusBroadcastCallback = statusBroadcastCallback ?? null;
    this._isInitialized = true;

    // Setup event handlers only once
    if (!this._eventHandlersSetup) {
      this.setupEventHandlers();
      this._eventHandlersSetup = true;
    }
  }

  /**
   * Set the status broadcast callback (can be called after initialize)
   */
  setStatusBroadcastCallback(callback: StatusBroadcastCallback | null): void {
    this._statusBroadcastCallback = callback;
  }

  /**
   * Check if the service has been initialized
   */
  get isInitialized(): boolean {
    return this._isInitialized;
  }

  /**
   * Reset the service state (for production use)
   */
  reset(): void {
    this._isInitialized = false;
    // Note: _eventHandlersSetup is NOT reset to avoid duplicate handler registration
    this._allowPrerelease = false;
    this._statusBroadcastCallback = null;
  }

  /**
   * Reset the service state completely, including event handlers.
   * Use this only in tests where you need to reset handler state.
   */
  resetForTest(): void {
    this._isInitialized = false;
    this._eventHandlersSetup = false;
    this._allowPrerelease = false;
    this._statusBroadcastCallback = null;
    // Remove listeners from this EventEmitter instance
    this.removeAllListeners();
    // Remove each registered handler from autoUpdater to prevent
    // duplicate handler accumulation across multiple initialize() calls in tests
    for (const [event, handler] of this._autoUpdaterHandlers) {
      autoUpdater.removeListener(event as Parameters<typeof autoUpdater.removeListener>[0], handler as Parameters<typeof autoUpdater.removeListener>[1]);
    }
    this._autoUpdaterHandlers.clear();
  }

  /**
   * Trigger a registered autoUpdater event handler by event name with optional arguments.
   * Intended for use in tests only — do not call in production code.
   * Throws if the handler for the given event has not been registered yet.
   */
  triggerEventForTest(event: string, ...args: unknown[]): void {
    const handler = this._autoUpdaterHandlers.get(event);
    if (!handler) {
      throw new Error(`No handler registered for autoUpdater event "${event}". Did you call initialize() first?`);
    }
    handler(...args);
  }

  /**
   * Set whether to allow prerelease/dev updates
   * When enabled, also sets allowDowngrade to true
   */
  setAllowPrerelease(allow: boolean): void {
    this._allowPrerelease = allow;
    autoUpdater.allowPrerelease = allow;
    // When allowing prerelease, also allow downgrade for channel switching
    autoUpdater.allowDowngrade = allow;
    log.info(`Prerelease updates ${allow ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get current prerelease setting
   */
  get allowPrerelease(): boolean {
    return this._allowPrerelease;
  }

  private setupEventHandlers(): void {
    const register = <T extends unknown[]>(event: string, handler: (...args: T) => void) => {
      // Cast to satisfy overloaded autoUpdater.on signature
      autoUpdater.on(event as Parameters<typeof autoUpdater.on>[0], handler as Parameters<typeof autoUpdater.on>[1]);
      this._autoUpdaterHandlers.set(event, handler as (...args: unknown[]) => void);
    };

    register('checking-for-update', () => {
      log.info('Checking for updates...');
      this.broadcastStatus({ status: 'checking' });
    });

    register('update-available', (info: UpdateInfo) => {
      log.info(`Update available: ${info.version}`);
      this.broadcastStatus({
        status: 'available',
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      });
    });

    register('update-not-available', () => {
      log.info('Application is up to date');
      this.broadcastStatus({ status: 'not-available' });
    });

    register('download-progress', (progress: ProgressInfo) => {
      log.info(`Download progress: ${progress.percent.toFixed(2)}%`);
      this.broadcastStatus({
        status: 'downloading',
        progress: {
          bytesPerSecond: progress.bytesPerSecond,
          percent: progress.percent,
          transferred: progress.transferred,
          total: progress.total,
        },
      });
    });

    register('update-downloaded', (info: UpdateInfo) => {
      log.info('Update downloaded');
      this.broadcastStatus({
        status: 'downloaded',
        version: info.version,
      });
    });

    register('error', (error: Error) => {
      log.error('Auto-updater error:', error);
      this.broadcastStatus({
        status: 'error',
        error: error.message,
      });
    });
  }

  /**
   * Broadcast status to both EventEmitter listeners and the registered callback
   */
  private broadcastStatus(status: AutoUpdateStatus): void {
    // Emit to internal listeners (for testing and extensibility)
    this.emit('update-status', status);

    // Call the registered callback if available
    if (this._statusBroadcastCallback) {
      this._statusBroadcastCallback(status);
    }
  }

  async checkForUpdates(): Promise<{ success: boolean; updateInfo?: UpdateInfo; error?: string }> {
    try {
      if (!this._isInitialized) {
        throw new Error('AutoUpdaterService not initialized');
      }

      const result = await autoUpdater.checkForUpdates();
      if (!result) {
        return { success: false, error: 'checkForUpdates returned null (not packaged or dev mode)' };
      }
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
      if (!this._isInitialized) {
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

  quitAndInstall(): void {
    log.info('Quitting and installing update...');
    autoUpdater.quitAndInstall(false, true);
  }

  /**
   * Check for updates and notify (for startup)
   */
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
