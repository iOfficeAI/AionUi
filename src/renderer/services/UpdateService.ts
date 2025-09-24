/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { autoUpdate, updateProgressStream } from '@/common/ipcBridge';
import type {
  IUpdateCheckResult,
  IVersionInfoData,
  IDownloadUpdateParams,
  IUpdateSessionData,
  IUpdateProgressEvent
} from '@/common/ipcBridge';

/**
 * 更新状态枚举
 */
export enum UpdateStatus {
  IDLE = 'idle',
  CHECKING = 'checking',
  AVAILABLE = 'available',
  NOT_AVAILABLE = 'not_available',
  DOWNLOADING = 'downloading',
  DOWNLOADED = 'downloaded',
  ERROR = 'error'
}

/**
 * 更新状态信息
 */
export interface UpdateState {
  status: UpdateStatus;
  version?: IVersionInfoData;
  updateCheckResult?: IUpdateCheckResult;
  downloadSession?: IUpdateSessionData;
  progress?: IUpdateProgressEvent;
  error?: string;
  lastCheckTime?: number;
}

/**
 * 更新事件类型
 */
export type UpdateEventType = 
  | 'status-changed'
  | 'version-info-updated'
  | 'progress-updated'
  | 'download-completed'
  | 'error-occurred';

/**
 * 事件监听器
 */
export type UpdateEventListener = (state: UpdateState) => void;

/**
 * UpdateService - 渲染进程更新服务
 * 
 * 提供：
 * - 版本检查和更新状态管理
 * - 下载进度跟踪
 * - 事件通知和状态同步
 */
export class UpdateService {
  private state: UpdateState = {
    status: UpdateStatus.IDLE
  };

  private listeners: Map<UpdateEventType, Set<UpdateEventListener>> = new Map();
  private progressSubscription: (() => void) | null = null;

  constructor() {
    this.initializeEventListeners();
  }

  // ===== 公共 API =====

  /**
   * 获取当前更新状态
   */
  getState(): UpdateState {
    return { ...this.state };
  }

  /**
   * 检查更新
   */
  async checkForUpdates(force: boolean = false): Promise<void> {
    try {
      this.updateStatus(UpdateStatus.CHECKING);

      const result = await autoUpdate.checkForUpdates.invoke({ force });

      if (!result.success) {
        this.handleError(result.msg || 'Update check failed');
        return;
      }

      this.state.updateCheckResult = result.data;
      this.state.lastCheckTime = Date.now();

      if (result.data?.versionInfo?.isUpdateAvailable) {
        this.state.version = result.data.versionInfo;
        this.updateStatus(UpdateStatus.AVAILABLE);
      } else {
        this.updateStatus(UpdateStatus.NOT_AVAILABLE);
      }

      this.emit('version-info-updated');
    } catch (error) {
      this.handleError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * 获取版本信息
   */
  async getVersionInfo(): Promise<IVersionInfoData | null> {
    try {
      const result = await autoUpdate.getVersionInfo.invoke();
      
      if (result.success && result.data) {
        this.state.version = result.data;
        this.emit('version-info-updated');
        return result.data;
      }

      return null;
    } catch (error) {
      console.error('Failed to get version info:', error);
      return null;
    }
  }


  /**
   * 下载更新
   */
  async downloadUpdate(params: IDownloadUpdateParams): Promise<string | null> {
    try {
      this.updateStatus(UpdateStatus.DOWNLOADING);

      const result = await autoUpdate.downloadUpdate.invoke(params);

      if (!result.success || !result.data) {
        this.handleError(result.msg || 'Download start failed');
        return null;
      }

      const sessionId = result.data.sessionId;
      
      // 获取会话信息
      const sessionResult = await autoUpdate.getDownloadSession.invoke({ sessionId });
      if (sessionResult.success && sessionResult.data) {
        this.state.downloadSession = sessionResult.data;
      }

      return sessionId;
    } catch (error) {
      this.handleError(error instanceof Error ? error.message : 'Download failed');
      return null;
    }
  }

  /**
   * 暂停下载
   */
  async pauseDownload(sessionId: string): Promise<boolean> {
    try {
      const result = await autoUpdate.pauseDownload.invoke({ sessionId });
      return result.success;
    } catch (error) {
      console.error('Failed to pause download:', error);
      return false;
    }
  }

  /**
   * 恢复下载
   */
  async resumeDownload(sessionId: string): Promise<boolean> {
    try {
      const result = await autoUpdate.resumeDownload.invoke({ sessionId });
      return result.success;
    } catch (error) {
      console.error('Failed to resume download:', error);
      return false;
    }
  }

  /**
   * 取消下载
   */
  async cancelDownload(sessionId: string): Promise<boolean> {
    try {
      const result = await autoUpdate.cancelDownload.invoke({ sessionId });
      
      if (result.success) {
        this.updateStatus(UpdateStatus.AVAILABLE);
        this.state.downloadSession = undefined;
        this.state.progress = undefined;
      }
      
      return result.success;
    } catch (error) {
      console.error('Failed to cancel download:', error);
      return false;
    }
  }

  /**
   * 安装更新并重启
   */
  async installAndRestart(sessionId: string): Promise<boolean> {
    try {
      const result = await autoUpdate.installAndRestart.invoke({ sessionId });
      return result.success;
    } catch (error) {
      console.error('Failed to install and restart:', error);
      return false;
    }
  }


  // ===== 事件管理 =====

  /**
   * 添加事件监听器
   */
  addEventListener(eventType: UpdateEventType, listener: UpdateEventListener): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);
  }

  /**
   * 移除事件监听器
   */
  removeEventListener(eventType: UpdateEventType, listener: UpdateEventListener): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * 移除所有事件监听器
   */
  removeAllEventListeners(): void {
    this.listeners.clear();
    this.cleanup();
  }

  // ===== 私有方法 =====

  /**
   * 初始化事件监听器
   */
  private initializeEventListeners(): void {
    // 监听下载进度事件
    this.progressSubscription = updateProgressStream.on((event: IUpdateProgressEvent) => {
      this.handleProgressUpdate(event);
    });
  }

  /**
   * 更新状态
   */
  private updateStatus(status: UpdateStatus): void {
    if (this.state.status !== status) {
      this.state.status = status;
      this.emit('status-changed');
    }
  }

  /**
   * 处理错误
   */
  private handleError(error: string): void {
    this.state.error = error;
    this.updateStatus(UpdateStatus.ERROR);
    this.emit('error-occurred');
  }

  /**
   * 处理进度更新
   */
  private handleProgressUpdate(event: IUpdateProgressEvent): void {
    this.state.progress = event;

    // 更新下载会话信息
    if (this.state.downloadSession && this.state.downloadSession.sessionId === event.sessionId) {
      this.state.downloadSession = {
        ...this.state.downloadSession,
        status: event.status,
        progress: event.progress,
        bytesDownloaded: event.bytesDownloaded,
        speed: event.speed,
        estimatedTimeRemaining: event.estimatedTimeRemaining,
        error: event.error
      };
    }

    // 根据进度状态更新整体状态
    switch (event.status) {
      case 'downloading':
        this.updateStatus(UpdateStatus.DOWNLOADING);
        break;
      case 'completed':
        this.updateStatus(UpdateStatus.DOWNLOADED);
        this.emit('download-completed');
        break;
      case 'failed':
      case 'cancelled':
        this.updateStatus(UpdateStatus.AVAILABLE);
        break;
    }

    this.emit('progress-updated');
  }


  /**
   * 发送事件
   */
  private emit(eventType: UpdateEventType): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      const state = this.getState();
      listeners.forEach(listener => {
        try {
          listener(state);
        } catch (error) {
          console.error(`Error in update event listener for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    if (this.progressSubscription) {
      this.progressSubscription();
      this.progressSubscription = null;
    }
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    this.removeAllEventListeners();
  }
}

// 单例实例
export const updateService = new UpdateService();