/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile } from '@/common/ipcBridge';
import { AIONUI_TIMESTAMP_REGEX } from '@/common/constants';
import { app } from 'electron';
import { existsSync } from 'fs';
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

export const getConfigPath = () => {
  const rootPath = app.getPath('userData');
  return path.join(rootPath, 'config');
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

export async function copyDirectoryRecursively(src: string, dest: string) {
  if (!existsSync(dest)) {
    await fs.mkdir(dest, { recursive: true });
  }
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true });
      await copyDirectoryRecursively(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

// 验证两个目录的文件名结构是否相同
export async function verifyDirectoryFiles(dir1: string, dir2: string): Promise<boolean> {
  try {
    if (!existsSync(dir1) || !existsSync(dir2)) {
      return false;
    }

    const entries1 = await fs.readdir(dir1, { withFileTypes: true });
    const entries2 = await fs.readdir(dir2, { withFileTypes: true });

    if (entries1.length !== entries2.length) {
      return false;
    }

    entries1.sort((a, b) => a.name.localeCompare(b.name));
    entries2.sort((a, b) => a.name.localeCompare(b.name));

    for (let i = 0; i < entries1.length; i++) {
      const entry1 = entries1[i];
      const entry2 = entries2[i];

      if (entry1.name !== entry2.name || entry1.isDirectory() !== entry2.isDirectory()) {
        return false;
      }

      if (entry1.isDirectory()) {
        const path1 = path.join(dir1, entry1.name);
        const path2 = path.join(dir2, entry2.name);
        if (!(await verifyDirectoryFiles(path1, path2))) {
          return false;
        }
      }
    }

    return true;
  } catch (error) {
    console.warn('[AionUi] Error verifying directory files:', error);
    return false;
  }
}

export const copyFilesToDirectory = async (dir: string, files?: string[]) => {
  if (!files) return Promise.resolve();

  const { getSystemDir } = await import('./initStorage');
  const { cacheDir } = getSystemDir();
  const tempDir = path.join(cacheDir, 'temp');

  for (const file of files) {
    let fileName = path.basename(file);

    // 如果是临时文件，去掉 AionUI 时间戳后缀
    if (file.startsWith(tempDir)) {
      // 去掉 AionUI 时间戳后缀 (例如: package_aionui_1758016286689.json -> package.json)
      fileName = fileName.replace(AIONUI_TIMESTAMP_REGEX, '$1');
    }

    const destPath = path.join(dir, fileName);
    await fs.copyFile(file, destPath);

    // 如果是临时文件，复制完成后删除
    if (file.startsWith(tempDir)) {
      try {
        await fs.unlink(file);
        console.log(`Cleaned up temp file: ${file}`);
      } catch (error) {
        console.warn(`Failed to cleanup temp file ${file}:`, error);
      }
    }
  }
};

/**
 * 处理文件列表：区分上传文件和工作空间文件，只复制需要复制的文件
 * @param targetDir 目标工作空间目录
 * @param files 文件列表（包含绝对路径的上传文件和相对路径的工作空间文件）
 * @returns Promise<{processedFiles: string[], copiedCount: number}>
 */
export const processAndCopyFiles = async (targetDir: string, files?: string[]) => {
  if (!files || files.length === 0) {
    return { processedFiles: [], copiedCount: 0 };
  }

  const processedFiles: string[] = [];

  // 处理文件路径：区分上传文件（绝对路径）和工作空间文件（相对路径）
  for (const file of files) {
    if (path.isAbsolute(file)) {
      // 上传的文件，直接使用绝对路径
      processedFiles.push(file);
    } else {
      // 工作空间文件，转换为绝对路径
      const absolutePath = path.join(targetDir, file);
      try {
        await fs.access(absolutePath); // 检查文件是否存在
        processedFiles.push(absolutePath);
        console.log(`📁 [processAndCopyFiles] Found workspace file: ${file} -> ${absolutePath}`);
      } catch (error) {
        console.warn(`⚠️ [processAndCopyFiles] Workspace file not found: ${file}, skipping`);
      }
    }
  }

  // 只复制上传的文件，工作空间文件已经在目标位置
  const uploadedFiles = processedFiles.filter((f) => !f.startsWith(targetDir));
  let copiedCount = 0;

  if (uploadedFiles.length > 0) {
    await copyFilesToDirectory(targetDir, uploadedFiles);
    copiedCount = uploadedFiles.length;
    console.log(`📁 [processAndCopyFiles] Copied ${copiedCount} uploaded files to workspace`);
  }

  return {
    processedFiles,
    copiedCount,
  };
};
