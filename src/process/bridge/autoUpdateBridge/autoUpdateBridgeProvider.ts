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
      this.startDownload(session).catch((error) => {
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

      // 使用 electron-updater 进行自动更新

      try {
        // 配置electron-updater
        autoUpdater.autoDownload = false; // 我们已经手动下载了
        autoUpdater.autoInstallOnAppQuit = true;

        console.log('Starting installation process');

        // 获取下载的文件信息
        const updateInfo = session.updateInfo;

        // 使用electron-updater安装更新
        console.log('Calling autoUpdater.quitAndInstall()');
        autoUpdater.quitAndInstall(false, true); // (isSilent, isForceRunAfter)

        return { success: true };
      } catch (autoUpdaterError) {
        console.error('electron-updater installation failed, trying manual installation:', autoUpdaterError);

        // electron-updater失败时的降级方案
        return await this.fallbackInstallation(session);
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

  // ===== Version Management Methods =====

  // ===== Private Helper Methods =====

  /**
   * 降级安装方案 - 当electron-updater失败时使用
   */
  private async fallbackInstallation(session: any): Promise<{ success: boolean; msg?: string }> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    // eslint-disable-next-line @typescript-eslint/no-var-requires

    try {
      const downloadPath = session.downloadPath;
      if (!downloadPath || !fs.existsSync(downloadPath)) {
        throw new Error('Downloaded update file not found');
      }

      console.log('Using fallback installation for:', downloadPath);

      const platform = process.platform;
      const fileExtension = downloadPath.split('.').pop()?.toLowerCase();

      switch (platform) {
        case 'darwin': // macOS
          if (fileExtension === 'dmg') {
            await this.installDMGFile(downloadPath);
            return { success: true };
          }
          break;

        case 'win32': // Windows
          if (fileExtension === 'exe') {
            await this.installEXEFile(downloadPath);
            return { success: true };
          }
          break;

        case 'linux': // Linux
          if (fileExtension === 'appimage') {
            await this.installAppImageFile(downloadPath);
            return { success: true };
          } else if (fileExtension === 'deb') {
            await this.installDebFile(downloadPath);
            return { success: true };
          }
          break;

        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }

      // 如果无法自动安装，提示用户手动安装
      shell.showItemInFolder(downloadPath);
      return {
        success: false,
        msg: `Please manually install the downloaded update file: ${downloadPath}`,
      };
    } catch (error) {
      console.error('Fallback installation failed:', error);
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Installation failed',
      };
    }
  }

  /**
   * 安装DMG文件 (macOS)
   */
  private async installDMGFile(dmgPath: string): Promise<void> {
    const execAsync = promisify(exec);

    console.log('Starting DMG installation:', dmgPath);

    try {
      // 1. 挂载DMG文件
      const { stdout: mountOutput } = await execAsync(`hdiutil attach "${dmgPath}" -nobrowse -quiet`);
      console.log('DMG mounted successfully');

      // 解析挂载点
      const mountPoint = mountOutput.trim().split('\n').pop()?.split('\t').pop();
      if (!mountPoint) {
        throw new Error('Failed to find mount point');
      }

      console.log('Mount point:', mountPoint);

      try {
        // 2. 查找.app文件
        const files = fs.readdirSync(mountPoint);
        const appFile = files.find((file: string) => file.endsWith('.app'));

        if (!appFile) {
          throw new Error('No .app file found in DMG');
        }

        const sourcePath = path.join(mountPoint, appFile);
        const targetPath = `/Applications/${appFile}`;

        console.log('Installing app:', { sourcePath, targetPath });

        // 3. 如果目标应用已存在，先删除
        if (fs.existsSync(targetPath)) {
          console.log('Removing existing application');
          await execAsync(`rm -rf "${targetPath}"`);
        }

        // 4. 复制新应用到Applications目录
        console.log('Copying application to Applications folder');
        await execAsync(`cp -R "${sourcePath}" "/Applications/"`);

        console.log('Application copied successfully');
      } finally {
        // 5. 卸载DMG
        try {
          await execAsync(`hdiutil detach "${mountPoint}" -quiet`);
          console.log('DMG unmounted successfully');
        } catch (unmountError) {
          console.warn('Failed to unmount DMG:', unmountError);
          // 卸载失败不影响安装结果
        }
      }
    } catch (error) {
      console.error('DMG installation failed:', error);
      throw error;
    }
  }

  /**
   * 安装EXE文件 (Windows)
   */
  private async installEXEFile(exePath: string): Promise<void> {
    const execAsync = promisify(exec);

    console.log('Installing EXE file:', exePath);

    try {
      // Windows安装器通常支持静默安装
      await execAsync(`"${exePath}" /S`);
      console.log('EXE installation completed');
    } catch (error) {
      // 如果静默安装失败，尝试普通安装
      console.log('Silent installation failed, trying normal installation');
      await execAsync(`"${exePath}"`);
    }
  }

  /**
   * 安装AppImage文件 (Linux)
   */
  private async installAppImageFile(appImagePath: string): Promise<void> {
    const execAsync = promisify(exec);

    console.log('Installing AppImage file:', appImagePath);

    try {
      // 1. 将AppImage复制到用户的bin目录
      const binDir = path.join(process.env.HOME || '/home/user', '.local', 'bin');
      const fileName = path.basename(appImagePath);
      const targetPath = path.join(binDir, fileName);

      // 确保目录存在
      await execAsync(`mkdir -p "${binDir}"`);

      // 复制文件
      await execAsync(`cp "${appImagePath}" "${targetPath}"`);

      // 设置执行权限
      await execAsync(`chmod +x "${targetPath}"`);

      console.log('AppImage installation completed');
    } catch (error) {
      console.error('AppImage installation failed:', error);
      throw error;
    }
  }

  /**
   * 安装DEB文件 (Linux)
   */
  private async installDebFile(debPath: string): Promise<void> {
    const execAsync = promisify(exec);

    console.log('Installing DEB file:', debPath);

    try {
      // 使用dpkg安装deb包
      await execAsync(`sudo dpkg -i "${debPath}"`);
      console.log('DEB installation completed');
    } catch (error) {
      console.error('DEB installation failed:', error);
      throw error;
    }
  }

  /**
   * 开始下载
   */
  private async startDownload(session: UpdateSession): Promise<void> {

    try {
      // 确定下载目录和文件路径
      const downloadsDir = app.getPath('downloads');
      const updateInfo = session.updateInfo;
      const fileName = updateInfo.filename || `AionUi-update-${updateInfo.version}.${this.getFileExtensionForPlatform()}`;
      const downloadPath = path.join(downloadsDir, fileName);

      console.log('Starting real download:', {
        url: updateInfo.downloadUrl,
        downloadPath,
        fileSize: updateInfo.fileSize,
      });

      // 创建下载目录（如果不存在）
      const dir = path.dirname(downloadPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 开始真实下载
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

      // 更新session为失败状态
      const currentSession = this.updateSessions.get(session.sessionId);
      if (currentSession) {
        const failedSession = currentSession.fail(error instanceof Error ? error.message : 'Download failed');
        this.updateSessions.set(session.sessionId, failedSession);
        this.emitProgressEvent(failedSession);
      }
    }
  }

  /**
   * 实际下载文件
   */
  private downloadFile(url: string, downloadPath: string, sessionId: string): Promise<void> {
    return new Promise((resolve, reject) => {

      const file = fs.createWriteStream(downloadPath);
      let downloadedBytes = 0;

      const request = https.get(url, (response: any) => {
        // 处理重定向
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          file.close(); // 关闭当前文件流
          if (redirectUrl) {
            console.log(`Following redirect from ${url} to ${redirectUrl}`);
            // 递归调用处理重定向
            this.downloadFile(redirectUrl, downloadPath, sessionId)
              .then(resolve)
              .catch(reject);
            return;
          } else {
            reject(new Error(`Redirect response without location header: HTTP ${response.statusCode}`));
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
            totalBytes: totalBytes
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

      // 设置更长的超时时间：10分钟（对于大文件）
      request.setTimeout(600000, () => {
        request.destroy();
        file.destroy();
        fs.unlink(downloadPath, () => {});
        reject(new Error('Download timeout'));
      });
    });
  }

  /**
   * 根据平台获取文件扩展名
   */
  private getFileExtensionForPlatform(): string {
    const platform = process.platform;
    switch (platform) {
      case 'darwin':
        return 'dmg';
      case 'win32':
        return 'exe';
      case 'linux':
        return 'AppImage';
      default:
        return 'bin';
    }
  }

  /**
   * 发送进度事件
   */
  private emitProgressEvent(session: UpdateSession): void {
    const event: IUpdateProgressEvent = {
      sessionId: session.sessionId,
      status: session.status,
      progress: session.progress,
      bytesDownloaded: session.bytesDownloaded,
      totalBytes: session.totalBytes,
      speed: session.speed,
      estimatedTimeRemaining: session.estimatedTimeRemaining,
      error: session.error,
    };

    console.debug('Emitting progress event', {
      sessionId: session.sessionId,
      progress: session.progress,
      status: session.status,
    });

    // 发送事件到渲染进程
    updateProgressStream.emit(event);
  }


}

// Singleton instance
export const autoUpdateBridgeProvider = new AutoUpdateBridgeProvider();
