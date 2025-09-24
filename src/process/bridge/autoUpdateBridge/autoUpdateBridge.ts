/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { autoUpdate, updateProgressStream } from '@/common/ipcBridge';
import { autoUpdateBridgeProvider } from './autoUpdateBridgeProvider';

/**
 * 初始化自动更新相关的IPC桥接
 */
export function initAutoUpdateBridge(): void {
  // 手动更新检查
  autoUpdate.checkForUpdates.provider(async (params) => {
    return await autoUpdateBridgeProvider.checkForUpdates(params);
  });

  // 获取版本信息
  autoUpdate.getVersionInfo.provider(async () => {
    return await autoUpdateBridgeProvider.getVersionInfo();
  });


  // 开始下载更新
  autoUpdate.downloadUpdate.provider(async (params) => {
    return await autoUpdateBridgeProvider.downloadUpdate(params);
  });

  // 暂停下载
  autoUpdate.pauseDownload.provider(async ({ sessionId }) => {
    return await autoUpdateBridgeProvider.pauseDownload(sessionId);
  });

  // 恢复下载
  autoUpdate.resumeDownload.provider(async ({ sessionId }) => {
    return await autoUpdateBridgeProvider.resumeDownload(sessionId);
  });

  // 取消下载
  autoUpdate.cancelDownload.provider(async ({ sessionId }) => {
    return await autoUpdateBridgeProvider.cancelDownload(sessionId);
  });

  // 获取下载会话信息
  autoUpdate.getDownloadSession.provider(async ({ sessionId }) => {
    return await autoUpdateBridgeProvider.getDownloadSession(sessionId);
  });

  // 安装更新并重启
  autoUpdate.installAndRestart.provider(async ({ sessionId }) => {
    return await autoUpdateBridgeProvider.installAndRestart(sessionId);
  });


  // 初始化 Auto-Update Bridge Provider
  autoUpdateBridgeProvider.initialize().catch((error) => {
    console.error('Failed to initialize Auto-Update Bridge Provider:', error);
  });
}