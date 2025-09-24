/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { updateService, UpdateStatus } from '../services/UpdateService';
import type { UpdateState, UpdateEventListener, UpdateEventType } from '../services/UpdateService';
import type { IDownloadUpdateParams } from '@/common/ipcBridge';
import { formatSpeed as formatSpeedFromConfig } from '../../common/update/updateConfig';

/**
 * Auto-Update Hook
 *
 * 提供更新功能集成：
 * - 状态管理和事件监听
 * - 版本检查和更新检测
 * - 下载进度跟踪
 */
export function useAutoUpdate() {
  const [state, setState] = useState<UpdateState>(updateService.getState());

  // ===== 状态同步 =====

  useEffect(() => {
    const handleStateChange: UpdateEventListener = (newState) => {
      setState(newState);
    };

    // 订阅所有更新事件
    const eventTypes: UpdateEventType[] = ['status-changed', 'version-info-updated', 'progress-updated', 'download-completed', 'error-occurred'];

    eventTypes.forEach((eventType) => {
      updateService.addEventListener(eventType, handleStateChange);
    });

    // 获取初始状态
    setState(updateService.getState());

    return () => {
      eventTypes.forEach((eventType) => {
        updateService.removeEventListener(eventType, handleStateChange);
      });
    };
  }, []);

  // ===== 操作方法 =====

  /**
   * 检查更新
   */
  const checkForUpdates = useCallback(async (force: boolean = false) => {
    await updateService.checkForUpdates(force);
  }, []);

  /**
   * 获取版本信息
   */
  const getVersionInfo = useCallback(async () => {
    return await updateService.getVersionInfo();
  }, []);

  /**
   * 下载更新
   */
  const downloadUpdate = useCallback(async (params: IDownloadUpdateParams) => {
    return await updateService.downloadUpdate(params);
  }, []);

  /**
   * 暂停下载
   */
  const pauseDownload = useCallback(async (sessionId: string) => {
    return await updateService.pauseDownload(sessionId);
  }, []);

  /**
   * 恢复下载
   */
  const resumeDownload = useCallback(async (sessionId: string) => {
    return await updateService.resumeDownload(sessionId);
  }, []);

  /**
   * 取消下载
   */
  const cancelDownload = useCallback(async (sessionId: string) => {
    return await updateService.cancelDownload(sessionId);
  }, []);

  /**
   * 安装更新并重启
   */
  const installAndRestart = useCallback(async (sessionId: string) => {
    return await updateService.installAndRestart(sessionId);
  }, []);

  // ===== 计算属性 =====

  /**
   * 是否有可用更新
   */
  const hasUpdate = state.status === UpdateStatus.AVAILABLE;

  /**
   * 是否正在检查更新
   */
  const isChecking = state.status === UpdateStatus.CHECKING;

  /**
   * 是否正在下载
   */
  const isDownloading = state.status === UpdateStatus.DOWNLOADING;

  /**
   * 是否下载完成
   */
  const isDownloaded = state.status === UpdateStatus.DOWNLOADED;

  /**
   * 是否有错误
   */
  const hasError = state.status === UpdateStatus.ERROR;

  /**
   * 下载进度百分比
   */
  const progress = state.progress?.progress || 0;

  /**
   * 格式化的下载速度
   */
  const formattedSpeed = state.progress?.speed ? formatSpeedFromConfig(state.progress.speed) : undefined;

  /**
   * 格式化的剩余时间
   */
  const formattedTimeRemaining = state.progress?.estimatedTimeRemaining ? formatTimeRemaining(state.progress.estimatedTimeRemaining) : undefined;

  /**
   * 当前版本
   */
  const currentVersion = state.version?.current;

  /**
   * 最新版本
   */
  const latestVersion = state.version?.latest;

  /**
   * 是否为重大版本更新
   */
  const isMajorUpdate = state.version?.latest && state.version?.current ? getMajorVersion(state.version.latest) > getMajorVersion(state.version.current) : false;

  return {
    // 状态
    state,
    status: state.status,

    // 计算属性
    hasUpdate,
    isChecking,
    isDownloading,
    isDownloaded,
    hasError,
    progress,
    formattedSpeed,
    formattedTimeRemaining,
    currentVersion,
    latestVersion,
    isMajorUpdate,

    // 数据
    version: state.version,
    updateCheckResult: state.updateCheckResult,
    downloadSession: state.downloadSession,
    progressEvent: state.progress,
    error: state.error,

    // 操作方法
    checkForUpdates,
    getVersionInfo,
    downloadUpdate,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    installAndRestart,
  };
}

// ===== 工具函数 =====

// formatSpeed 函数已移到 @/common/updateConfig 中统一管理

/**
 * 格式化剩余时间
 */
function formatTimeRemaining(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/**
 * 获取主版本号
 */
function getMajorVersion(version: string): number {
  const match = version.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}
