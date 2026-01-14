/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AIONUI_TIMESTAMP_REGEX } from '@/common/constants';
import type { IDirOrFile } from '@/common/ipcBridge';
import { app } from 'electron';
import { existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { getSystemDir } from './initStorage';
export const getTempPath = () => {
  const rootPath = app.getPath('temp');
  return path.join(rootPath, 'aionui');
};

export const getDataPath = () => {
  const rootPath = app.getPath('userData');
  return path.join(rootPath, 'aionui');
};

/**
 * Get symlink path for CLI tools that don't handle spaces in paths.
 * Creates ~/.aionui symlink pointing to ~/Library/Application Support/AionUi/aionui/
 * This allows CLI tools like Qwen to work with paths that don't contain spaces.
 *
 * 获取用于 CLI 工具的符号链接路径。
 * 创建 ~/.aionui 符号链接指向 ~/Library/Application Support/AionUi/aionui/
 * 这允许像 Qwen 这样不能正确处理路径中空格的 CLI 工具正常工作。
 *
 * @returns The symlink path on macOS, or original path on other platforms
 */
export const getCliSafePath = (): string => {
  const dataPath = getDataPath();

  // Only needed on macOS where Application Support has a space
  if (process.platform !== 'darwin') {
    return dataPath;
  }

  const homePath = app.getPath('home');
  const symlinkPath = path.join(homePath, '.aionui');

  // Ensure symlink exists
  try {
    const stats = lstatSync(symlinkPath);
    if (stats.isSymbolicLink()) {
      // Symlink exists, verify it points to the correct location
      const target = readlinkSync(symlinkPath);
      if (target === dataPath) {
        return symlinkPath;
      }
      // Wrong target, remove and recreate
      unlinkSync(symlinkPath);
    } else {
      // Not a symlink (maybe a directory), don't touch it
      return dataPath;
    }
  } catch {
    // Symlink doesn't exist, create it
  }

  try {
    // Ensure the target directory exists first
    if (!existsSync(dataPath)) {
      mkdirSync(dataPath, { recursive: true });
    }
    symlinkSync(dataPath, symlinkPath);
    return symlinkPath;
  } catch (error) {
    return dataPath;
  }
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
export async function readDirectoryRecursive(
  dirPath: string,
  options?: {
    root?: string;
    abortController?: AbortController;
    fileService?: { shouldIgnoreFile(path: string): boolean };
    maxDepth?: number;
    search?: {
      text: string;
      onProcess?(result: { file: number; dir: number; match?: IDirOrFile }): void;
      process?: { file: number; dir: number };
    };
  }
): Promise<IDirOrFile> {
  const { root = dirPath, maxDepth = 1, fileService, search, abortController } = options || {};
  const { text: searchText, onProcess: onSearchProcess = () => {}, process = { file: 0, dir: 1 } } = search || {};

  const matchSearch = searchText ? (fullPath: string) => fullPath.includes(searchText) : (_: string) => false;

  const checkStatus = () => {
    if (abortController.signal.aborted) throw new Error('readDirectoryRecursive aborted!');
  };

  const stats = await fs.stat(dirPath);
  if (!stats.isDirectory()) {
    return null;
  }
  const result: IDirOrFile = {
    name: path.basename(dirPath),
    fullPath: dirPath,
    relativePath: path.relative(root, dirPath),
    isDir: true,
    isFile: false,
    children: [],
  };
  let searchResult = matchSearch(result.name);
  onSearchProcess({
    ...process,
    match: searchResult ? result : undefined,
  });
  if (maxDepth === 0 || searchResult) return result;
  checkStatus();
  const items = await fs.readdir(dirPath);
  checkStatus();

  for (const item of items) {
    checkStatus();
    if (item === 'node_modules') continue;
    const itemPath = path.join(dirPath, item);
    if (fileService && fileService.shouldIgnoreFile(itemPath)) continue;

    const itemStats = await fs.stat(itemPath);
    if (itemStats.isDirectory()) {
      process.dir += 1;
      const child = await readDirectoryRecursive(itemPath, {
        ...options,
        maxDepth: searchText ? maxDepth : maxDepth - 1,
        root,
        search: {
          ...search,
          process,
          onProcess(searchResult) {
            if (searchResult.match) {
              if (!result.children.find((v) => v.fullPath === searchResult.match.fullPath)) {
                result.children.push(searchResult.match);
              }
              onSearchProcess({ ...process, match: result });
            }
          },
        },
      });
      if (child && !searchText) {
        result.children.push(child);
      }
    } else {
      const children = {
        name: item,
        relativePath: path.relative(root, itemPath),
        fullPath: itemPath,
        isDir: false,
        isFile: true,
      };
      if (!searchText) {
        result.children.push(children);
        continue;
      }
      searchResult = matchSearch(children.name);
      if (searchResult) {
        result.children.push(children);
      }
      process.file += 1;
      onSearchProcess({
        ...process,
        match: searchResult ? result : undefined,
      });
    }
  }
  result.children.sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.name.localeCompare(b.name);
  });
  return result;
}

/**
 * 递归复制目录
 * 注意：包含路径验证，防止复制到自身或子目录导致无限递归（修复 Windows 下 cache 目录循环创建的 bug）
 */
interface CopyOptions {
  overwrite?: boolean;
}

export async function copyDirectoryRecursively(src: string, dest: string, options: CopyOptions = {}) {
  const { overwrite = true } = options;

  // 标准化路径：Windows 转小写（不区分大小写），Unix/macOS 保持原样（区分大小写）
  const isWindows = process.platform === 'win32';
  const normalizedSrc = isWindows ? path.resolve(src).toLowerCase() : path.resolve(src);
  const normalizedDest = isWindows ? path.resolve(dest).toLowerCase() : path.resolve(dest);

  // 防止复制到自身 (F:\code -> F:\code)
  if (normalizedSrc === normalizedDest) {
    throw new Error(`Cannot copy directory into itself: ${src}`);
  }

  // 防止复制到子目录 (F:\code -> F:\code\cache) - 会导致无限递归
  if (normalizedDest.startsWith(normalizedSrc + path.sep)) {
    throw new Error(`Cannot copy directory into its subdirectory: ${src} -> ${dest}`);
  }

  // 防止复制到父目录 (F:\code\cache -> F:\code)
  if (normalizedSrc.startsWith(normalizedDest + path.sep)) {
    throw new Error(`Cannot copy parent directory into child directory: ${src} -> ${dest}`);
  }

  if (!existsSync(dest)) {
    await fs.mkdir(dest, { recursive: true });
  }

  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      if (!existsSync(destPath)) {
        await fs.mkdir(destPath, { recursive: true });
      }
      await copyDirectoryRecursively(srcPath, destPath, options);
    } else {
      // 如果不覆盖且目标文件已存在，跳过
      if (!overwrite && existsSync(destPath)) {
        continue;
      }
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

  const { cacheDir } = getSystemDir();
  const tempDir = path.join(cacheDir, 'temp');

  for (const file of files) {
    // 确保文件路径是绝对路径
    const absoluteFilePath = path.isAbsolute(file) ? file : path.resolve(file);

    // 检查源文件是否存在
    try {
      await fs.access(absoluteFilePath);
    } catch (error) {
      console.warn(`[AionUi] Source file does not exist, skipping: ${absoluteFilePath}`);
      console.warn(`[AionUi] Original path: ${file}`);
      // 跳过不存在的文件，而不是抛出错误
      continue;
    }

    let fileName = path.basename(absoluteFilePath);

    // 如果是临时文件，去掉 AionUI 时间戳后缀
    if (absoluteFilePath.startsWith(tempDir)) {
      // 去掉 AionUI 时间戳后缀 (例如: package_aionui_1758016286689.json -> package.json)
      fileName = fileName.replace(AIONUI_TIMESTAMP_REGEX, '$1');
    }

    const destPath = path.join(dir, fileName);

    try {
      await fs.copyFile(absoluteFilePath, destPath);
    } catch (error) {
      console.error(`[AionUi] Failed to copy file from ${absoluteFilePath} to ${destPath}:`, error);
      // 继续处理其他文件，而不是完全失败
    }

    // 如果是临时文件，复制完成后删除
    if (absoluteFilePath.startsWith(tempDir)) {
      try {
        await fs.unlink(absoluteFilePath);
        console.log(`Cleaned up temp file: ${absoluteFilePath}`);
      } catch (error) {
        console.warn(`Failed to cleanup temp file ${absoluteFilePath}:`, error);
      }
    }
  }
};

export function ensureDirectory(dirPath: string): void {
  if (existsSync(dirPath)) {
    return;
  }
  mkdirSync(dirPath, { recursive: true });
}
