/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { ipcBridge } from '@/common';

// 存储所有文件监听器 / Store all file watchers
const watchers = new Map<string, fs.FSWatcher>();

const WORKSPACE_OFFICE_RE = /\.(pptx|docx|xlsx)$/i;
const WORKSPACE_OFFICE_TEMP_RE = /^(~\$|~|～)/;
const WORKSPACE_SCAN_IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'out',
  'target',
  'vendor',
  'bin',
  'obj',
]);

export const isIgnoredOfficeTempFileName = (fileName: string): boolean => WORKSPACE_OFFICE_TEMP_RE.test(fileName);

export const shouldSkipWorkspaceOfficeScanDir = (dirName: string): boolean =>
  dirName.startsWith('.') || WORKSPACE_SCAN_IGNORED_DIRS.has(dirName);

export async function scanWorkspaceOfficeFiles(workspace: string): Promise<string[]> {
  const discovered = new Set<string>();
  const pendingDirs = [workspace];

  while (pendingDirs.length > 0) {
    const currentDir = pendingDirs.pop();
    if (!currentDir) continue;

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (shouldSkipWorkspaceOfficeScanDir(entry.name)) continue;
        pendingDirs.push(entryPath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!WORKSPACE_OFFICE_RE.test(entry.name)) continue;
      if (isIgnoredOfficeTempFileName(entry.name)) continue;

      discovered.add(entryPath);
    }
  }

  return [...discovered].toSorted();
}

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

  // 扫描工作空间内可自动预览的 Office 文件 / Scan auto-previewable Office files in workspace
  ipcBridge.workspaceOfficeWatch.scan.provider(async ({ workspace }) => {
    try {
      return await scanWorkspaceOfficeFiles(workspace);
    } catch (error) {
      console.error('[WorkspaceOfficeWatch] Failed to scan workspace office files:', error);
      return [];
    }
  });
}
