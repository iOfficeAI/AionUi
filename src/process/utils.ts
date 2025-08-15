/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile } from '@/common/ipcBridge';
import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
export const getTempPath = () => {
  const rootPath = app.getPath('temp');
  return path.join(rootPath, 'aionui');
};

export const getDataPath = () => {
  const rootPath = app.getPath('userData');
  return path.join(rootPath, 'aionui');
};

export const generateHashWithFullName = (fullName: string): string => {
  let hash = 0;
  for (let i = 0; i < fullName.length; i++) {
    const char = fullName.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // 取绝对值并转换为16进制，然后取前8位
  return Math.abs(hash).toString(16).padStart(8, '0'); //.slice(0, 8);
};

// 递归读取目录内容，返回树状结构
export async function readDirectoryRecursive(dirPath: string, root = dirPath + '/', fileService?: any): Promise<IDirOrFile> {
  const stats = await fs.stat(dirPath);
  if (!stats.isDirectory()) {
    return null;
  }
  const result: IDirOrFile = {
    name: path.basename(dirPath),
    path: dirPath.replace(root, ''),
    isDir: true,
    isFile: false,
    children: [],
  };
  const items = await fs.readdir(dirPath);
  for (const item of items) {
    if (item === 'node_modules') continue;
    const itemPath = path.join(dirPath, item);
    const itemStats = await fs.stat(itemPath);

    if (fileService && fileService.shouldGitIgnoreFile(itemPath)) continue;
    if (itemStats.isDirectory()) {
      const child = await readDirectoryRecursive(itemPath, root, fileService);
      if (child) result.children.push(child);
    } else {
      result.children.push({
        name: item,
        path: itemPath.replace(root, ''),
        isDir: false,
        isFile: true,
      });
    }
  }
  result.children.sort((a: any, b: any) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return 0;
  });
  return result;
}
