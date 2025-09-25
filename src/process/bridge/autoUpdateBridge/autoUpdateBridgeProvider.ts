/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IUpdateCheckResult, IVersionInfoData, IDownloadUpdateParams, IUpdateSessionData, IUpdateProgressEvent } from '@/common/ipcBridge';
import { updateProgressStream } from '@/common/ipcBridge';
import { VersionInfo } from '../../../common/update/models/VersionInfo';
import { UpdatePackage } from '../../../common/update/models/UpdatePackage';
import { UpdateSession } from '../../../common/update/models/UpdateSession';
import { UpdateChecker } from '../../services/updateServices/UpdateChecker';
import { generatePlaceholderChecksum } from '@/common/utils/checksum';
import { app, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

/**
 * Auto-Update Bridge Provider
 * Main process IPC handlers for auto-update operations
 */
export class AutoUpdateBridgeProvider {
  private updateChecker: UpdateChecker;
  private updateSessions: Map<string, UpdateSession> = new Map();
  private downloadIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.updateChecker = new UpdateChecker();
  }

  /**
   * Initialize auto-update mcpServices
   */
  async initialize(): Promise<void> {
    console.log('Initializing Auto-Update Bridge Provider');
    console.log('Auto-Update Bridge Provider initialized successfully');
  }

  /**
   * Shutdown auto-update mcpServices
   */
  async shutdown(): Promise<void> {
    console.info('Shutting down Auto-Update Bridge Provider');

    // 清理所有定时器
    this.downloadIntervals.forEach((interval, sessionId) => {
      clearInterval(interval);
    });
    this.downloadIntervals.clear();

    // 取消所有进行中的下载
    const sessions = Array.from(this.updateSessions.entries());
    for (const [sessionId, session] of sessions) {
      if (session.status === 'downloading') {
        await this.cancelDownload(sessionId);
      }
    }

    console.info('Auto-Update Bridge Provider shutdown complete');
  }

  // ===== Update Check Methods =====

  /**
   * 检查可用更新
   */
  async checkForUpdates(params: { force?: boolean } = {}): Promise<{ success: boolean; data?: IUpdateCheckResult; msg?: string }> {
    console.debug('Checking for updates', { force: params.force });

    try {
      const result = await this.updateChecker.checkForUpdates(params.force);

      if (result.success && result.versionInfo) {
        // Version info is ready
      }

      console.info('Update check completed', {
        success: result.success,
        hasUpdate: result.versionInfo?.isUpdateAvailable,
      });

      // Transform legacy result to new interface format
      const transformedResult: IUpdateCheckResult = {
        success: result.success,
        isUpdateAvailable: result.versionInfo?.isUpdateAvailable || false,
        versionInfo: result.versionInfo,
        availablePackages: result.availablePackages,
        error: result.error?.message || result.error?.toString(),
        lastCheckTime: result.lastCheckTime,
        cacheUsed: false, // Legacy interface doesn't have this info
      };

      return {
        success: true,
        data: transformedResult,
      };
    } catch (error) {
      console.error('Update check failed', { error });
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * 获取版本信息
   */
  async getVersionInfo(): Promise<{ success: boolean; data?: IVersionInfoData; msg?: string }> {
    console.debug('Getting version info');

    try {
      const versionInfo = await this.updateChecker.getVersionInfo();
      const jsonData = versionInfo.toJSON();
      const data: IVersionInfoData = {
        current: jsonData.current,
        latest: jsonData.latest,
        minimumRequired: jsonData.minimumRequired,
        releaseDate: jsonData.releaseDate,
        releaseNotes: jsonData.releaseNotes,
        isUpdateAvailable: jsonData.isUpdateAvailable,
        isForced: jsonData.isForced,
      };

      console.info('Version info retrieved', { currentVersion: data.current });

      return {
        success: true,
        data,
      };
    } catch (error) {
      console.error('Failed to get version info', { error });
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  // ===== Download Management Methods =====

  /**
   * 开始下载更新
   */
  async downloadUpdate(params: IDownloadUpdateParams): Promise<{ success: boolean; data?: { sessionId: string }; msg?: string }> {
    console.debug('Starting update download', {
      version: params.packageInfo.version,
      platform: params.packageInfo.platform,
    });

    try {
      const updatePackage = UpdatePackage.fromJSON(params.packageInfo);
      const versionInfo = VersionInfo.fromJSON(params.versionInfo);

      const sessionId = UpdateSession.generateSessionId();
      const session = UpdateSession.create({
        sessionId: sessionId,
        updatePackage: updatePackage,
        totalBytes: updatePackage.fileSize,
      });

      this.updateSessions.set(session.sessionId, session);

      // 发送初始进度事件
      this.emitProgressEvent(session);

      // 开始实际下载（异步执行，不阻塞响应）
      this.startDownload(session).catch((error: Error) => {
        console.error('Download process failed:', error);
        // 错误处理已在startDownload内部完成
      });

      console.info('Update download started', { sessionId: session.sessionId });

      return {
        success: true,
        data: { sessionId: session.sessionId },
      };
    } catch (error) {
      console.error('Failed to start update download', { error });
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * 暂停下载
   */
  async pauseDownload(sessionId: string): Promise<{ success: boolean; msg?: string }> {
    console.debug('Pausing download', { sessionId });

    try {
      const session = this.updateSessions.get(sessionId);
      if (!session) {
        throw new Error('Download session not found');
      }

      // 停止定时器
      const interval = this.downloadIntervals.get(sessionId);
      if (interval) {
        clearInterval(interval);
        this.downloadIntervals.delete(sessionId);
      }

      const updatedSession = session.pause();
      this.updateSessions.set(sessionId, updatedSession);

      this.emitProgressEvent(updatedSession);

      console.info('Download paused', { sessionId });

      return { success: true };
    } catch (error) {
      console.error('Failed to pause download', { error, sessionId });
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * 恢复下载
   */
  async resumeDownload(sessionId: string): Promise<{ success: boolean; msg?: string }> {
    console.debug('Resuming download', { sessionId });

    try {
      const session = this.updateSessions.get(sessionId);
      if (!session) {
        throw new Error('Download session not found');
      }

      const updatedSession = session.resume();
      this.updateSessions.set(sessionId, updatedSession);

      // 重新开始下载
      this.startDownload(updatedSession);

      this.emitProgressEvent(updatedSession);

      console.info('Download resumed', { sessionId });

      return { success: true };
    } catch (error) {
      console.error('Failed to resume download', { error, sessionId });
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * 取消下载
   */
  async cancelDownload(sessionId: string): Promise<{ success: boolean; msg?: string }> {
    console.debug('Cancelling download', { sessionId });

    try {
      const session = this.updateSessions.get(sessionId);
      if (!session) {
        throw new Error('Download session not found');
      }

      // 停止定时器
      const interval = this.downloadIntervals.get(sessionId);
      if (interval) {
        clearInterval(interval);
        this.downloadIntervals.delete(sessionId);
      }

      const updatedSession = session.cancel();
      this.updateSessions.set(sessionId, updatedSession);

      this.emitProgressEvent(updatedSession);

      console.info('Download cancelled', { sessionId });

      return { success: true };
    } catch (error) {
      console.error('Failed to cancel download', { error, sessionId });
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * 获取下载会话信息
   */
  async getDownloadSession(sessionId: string): Promise<{ success: boolean; data?: IUpdateSessionData; msg?: string }> {
    console.debug('Getting download session', { sessionId });

    try {
      const session = this.updateSessions.get(sessionId);
      if (!session) {
        throw new Error('Download session not found');
      }

      const updateInfo = session.updateInfo;
      const sessionData: IUpdateSessionData = {
        sessionId: session.sessionId,
        updateInfo: {
          version: updateInfo.version || '',
          platform: updateInfo.platform || 'darwin',
          arch: updateInfo.arch || 'x64',
          downloadUrl: updateInfo.downloadUrl || '',
          fileSize: updateInfo.fileSize || 0,
          checksum: updateInfo.checksum || generatePlaceholderChecksum(`${updateInfo.version}-${updateInfo.platform}-${updateInfo.arch}`),
          signature: updateInfo.signature,
          isDelta: updateInfo.isDelta || false,
          baseVersion: updateInfo.baseVersion,
        },
        status: session.status,
        progress: session.progress,
        bytesDownloaded: session.bytesDownloaded,
        totalBytes: session.totalBytes,
        speed: session.speed,
        estimatedTimeRemaining: session.estimatedTimeRemaining,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        error: session.error,
      };

      return {
        success: true,
        data: sessionData,
      };
    } catch (error) {
      console.error('Failed to get download session', { error, sessionId });
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * 安装更新并重启
   */
  async installAndRestart(sessionId: string): Promise<{ success: boolean; msg?: string }> {
    console.debug('Installing update and restarting', { sessionId });

    try {
      const session = this.updateSessions.get(sessionId);
      if (!session) {
        throw new Error('Download session not found');
      }

      if (session.status !== 'completed') {
        throw new Error('Download is not completed');
      }

      // 检查是否在开发环境
      const isDevelopment = process.env.NODE_ENV === 'development' || process.argv.includes('--inspect');

      if (isDevelopment) {
        console.warn('Install and restart is not supported in development environment');
        console.info('In production, this would call app.relaunch() and app.exit()');
        return {
          success: false,
          msg: 'Install and restart is not supported in development environment. This feature only works in production builds.',
        };
      }

      // 生产环境中的实际安装和重启逻辑
      console.info('Installing update and restarting application', { sessionId });

      // 简化的安装重启逻辑
      console.log('Starting install and restart process');

      // 获取下载的文件路径
      const downloadPath = session.downloadPath;
      if (!downloadPath || !fs.existsSync(downloadPath)) {
        throw new Error('Downloaded update file not found');
      }

      console.log('Downloaded file found at:', downloadPath);

      // 根据平台执行不同的安装逻辑
      const platform = process.platform;

      if (platform === 'darwin') {
        // macOS: 打开 DMG 文件
        console.log('Opening DMG file for macOS installation');
        await shell.openPath(downloadPath);

        // 提示用户手动完成安装
        return {
          success: true,
          msg: 'Update package opened. Please drag the application to Applications folder and restart.',
        };
      } else if (platform === 'win32') {
        // Windows: 执行安装程序
        console.log('Executing Windows installer');
        const execAsync = promisify(exec);
        await execAsync(`"${downloadPath}" /S`);

        // Windows 安装程序通常会自动重启应用
        return { success: true };
      } else {
        // Linux: 打开安装包
        console.log('Opening update package for Linux');
        await shell.openPath(downloadPath);

        return {
          success: true,
          msg: 'Update package opened. Please install manually and restart the application.',
        };
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to install and restart', { error, sessionId });
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  // ===== Private Helper Methods =====

  /**
   * Start the actual download process
   */
  private async startDownload(session: UpdateSession): Promise<void> {
    try {
      const updateInfo = session.getUpdatePackage();
      const fileName = updateInfo.filename || updateInfo.getExpectedFilename();
      const downloadsDir = path.join(app.getPath('downloads'), 'AionUi-Updates');

      // 确保下载目录存在
      if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
      }

      const downloadPath = path.join(downloadsDir, fileName);

      // 开始下载
      await this.downloadFile(updateInfo.downloadUrl, downloadPath, session.sessionId);

      // 下载完成后，更新session的downloadPath
      const currentSession = this.updateSessions.get(session.sessionId);
      if (currentSession) {
        const completedSession = currentSession.withDownloadPath(downloadPath).complete();
        this.updateSessions.set(session.sessionId, completedSession);
        this.emitProgressEvent(completedSession);
      }

      console.log('Download completed successfully:', downloadPath);
    } catch (error) {
      console.error('Download failed:', error);
      // Update session with error
      const currentSession = this.updateSessions.get(session.sessionId);
      if (currentSession) {
        const errorMessage = error instanceof Error ? error.message : 'Download failed';
        const failedSession = currentSession.fail(errorMessage);
        this.updateSessions.set(session.sessionId, failedSession);
        this.emitProgressEvent(failedSession);
      }
      throw error;
    }
  }

  /**
   * Download file from URL
   */
  private downloadFile(url: string, downloadPath: string, sessionId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(downloadPath);
      let downloadedBytes = 0;

      const request = https.get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          file.close();
          if (redirectUrl) {
            this.downloadFile(redirectUrl, downloadPath, sessionId).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${response.statusCode}`));
          return;
        }

        const totalBytes = parseInt(response.headers['content-length'] || '0', 10);

        // 用实际的文件大小更新session的totalBytes
        const currentSession = this.updateSessions.get(sessionId);
        if (currentSession && totalBytes > 0 && totalBytes !== currentSession.totalBytes) {
          console.log(`Updating download size from ${(currentSession.totalBytes / (1024 * 1024)).toFixed(1)}MB to ${(totalBytes / (1024 * 1024)).toFixed(1)}MB`);
          const updatedSession = UpdateSession.fromJSON({
            ...currentSession.toJSON(),
            totalBytes: totalBytes,
          });
          this.updateSessions.set(sessionId, updatedSession);
        }

        response.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          file.write(chunk);

          // 更新下载进度
          const currentSession = this.updateSessions.get(sessionId);
          if (currentSession && currentSession.status === 'downloading') {
            const updatedSession = currentSession.updateProgress(downloadedBytes);
            this.updateSessions.set(sessionId, updatedSession);
            this.emitProgressEvent(updatedSession);
          }
        });

        response.on('end', () => {
          file.end();

          // 确保最终状态正确设置
          const finalSession = this.updateSessions.get(sessionId);
          if (finalSession) {
            // 确保 bytesDownloaded 等于 totalBytes
            const completedSession = finalSession.updateProgress(finalSession.totalBytes).complete();
            this.updateSessions.set(sessionId, completedSession);
            this.emitProgressEvent(completedSession);
          }

          resolve();
        });

        response.on('error', (error: Error) => {
          file.destroy();
          fs.unlink(downloadPath, () => {}); // 清理部分下载的文件
          reject(error);
        });
      });

      request.on('error', (error: Error) => {
        file.destroy();
        fs.unlink(downloadPath, () => {}); // 清理部分下载的文件
        reject(error);
      });

      request.setTimeout(600000); // 10 minutes timeout
      request.on('timeout', () => {
        request.destroy();
        file.destroy();
        fs.unlink(downloadPath, () => {});
        reject(new Error('Download timeout'));
      });
    });
  }

  /**
   * Emit progress event to renderer
   */
  private emitProgressEvent(session: UpdateSession): void {
    const progressData: IUpdateProgressEvent = {
      sessionId: session.sessionId,
      status: session.status,
      progress: session.progress,
      bytesDownloaded: session.bytesDownloaded,
      totalBytes: session.totalBytes,
      speed: session.speed || 0,
      estimatedTimeRemaining: session.estimatedTimeRemaining,
    };

    updateProgressStream.emit(progressData);
  }
}

// Singleton instance
export const autoUpdateBridgeProvider = new AutoUpdateBridgeProvider();
