/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import { ipcBridge } from '@/common';

// 存储所有文件监听器 / Store all file watchers
const watchers = new Map<string, fs.FSWatcher>();

// 初始化文件监听桥接，负责 start/stop 所有 watcher / Initialize file watch bridge to manage start/stop of watchers
export function initFileWatchBridge(): void {
  // 开始监听文件 / Start watching file
  ipcBridge.fileWatch.startWatch.provider(({ filePath }) => {
    try {
      // 如果已经在监听，先停止 / Stop existing watcher if any
      if (watchers.has(filePath)) {
        watchers.get(filePath)?.close();
        watchers.delete(filePath);
      }

      // 创建文件监听器 / Create file watcher
      const watcher = fs.watch(filePath, (eventType) => {
        // 文件变化时，通知 renderer 进程 / Notify renderer process on file change
        ipcBridge.fileWatch.fileChanged.emit({ filePath, eventType });
      });

      watchers.set(filePath, watcher);

      return Promise.resolve({ success: true });
    } catch (error) {
      console.error('[FileWatch] Failed to start watching:', error);
      return Promise.resolve({ success: false, msg: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // 停止监听文件 / Stop watching file
  ipcBridge.fileWatch.stopWatch.provider(({ filePath }) => {
    try {
      if (watchers.has(filePath)) {
        watchers.get(filePath)?.close();
        watchers.delete(filePath);
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ success: false, msg: 'No watcher found for this file' });
    } catch (error) {
      console.error('[FileWatch] Failed to stop watching:', error);
      return Promise.resolve({ success: false, msg: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // 停止所有监听 / Stop all watchers
  ipcBridge.fileWatch.stopAllWatches.provider(() => {
    try {
      watchers.forEach((watcher) => {
        watcher.close();
      });
      watchers.clear();
      return Promise.resolve({ success: true });
    } catch (error) {
      console.error('[FileWatch] Failed to stop all watches:', error);
      return Promise.resolve({ success: false, msg: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}
