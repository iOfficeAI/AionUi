/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import { app } from 'electron';
import { getEnvAwareName } from '@/common/config/appEnv';
import { existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  readDirectoryTree as nativeReadDirectoryTree,
  copyDirectory as nativeCopyDirectory,
  verifyDirectoryStructure as nativeVerifyDirectoryStructure,
  ensureDir as nativeEnsureDir,
} from '@aionui/native';
import type { DirOrFile } from '@aionui/native';
// Lazy import to break circular dependency (initStorage.ts imports from this file)
let _getSystemDir: typeof import('./initStorage').getSystemDir;
const lazyGetSystemDir = () => {
  if (!_getSystemDir) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _getSystemDir = require('./initStorage').getSystemDir;
  }
  return _getSystemDir();
};

const hasElectronAppPath = (): boolean => {
  return typeof app?.getPath === 'function';
};

const getElectronPathOrFallback = (name: 'temp' | 'home' | 'userData'): string => {
  if (hasElectronAppPath()) {
    try {
      return app.getPath(name);
    } catch (_error) {
      // Fall through to deterministic filesystem paths for tests and non-Electron environments.
    }
  }

  switch (name) {
    case 'temp':
      return os.tmpdir();
    case 'home':
      return os.homedir();
    case 'userData':
      return path.join(os.tmpdir(), getEnvAwareName('aionui-user-data'));
  }
};

export const getTempPath = () => {
  const rootPath = getElectronPathOrFallback('temp');
  return path.join(rootPath, 'aionui');
};

/**
 * Ensure CLI-safe symlink exists and return the symlink path.
 * On macOS, creates a symlink in home directory to avoid spaces in paths.
 * CLI tools like Qwen can't handle spaces in paths properly.
 *
 * 确保 CLI 安全符号链接存在并返回符号链接路径。
 * 在 macOS 上，在用户目录创建符号链接以避免路径中的空格。
 * CLI 工具如 Qwen 无法正确处理路径中的空格。
 */
const ensureCliSafeSymlink = (targetPath: string, symlinkName: string): string => {
  // Only needed on macOS where Application Support has a space
  if (process.platform !== 'darwin' || !hasElectronAppPath()) {
    return targetPath;
  }

  const homePath = getElectronPathOrFallback('home');
  const symlinkPath = path.join(homePath, symlinkName);

  // Ensure symlink exists
  try {
    const stats = lstatSync(symlinkPath);
    if (stats.isSymbolicLink()) {
      // Symlink exists, verify it points to the correct location
      const target = readlinkSync(symlinkPath);
      if (target === targetPath) {
        // Ensure the target directory still exists (broken symlink if deleted, #841)
        if (!existsSync(targetPath)) {
          mkdirSync(targetPath, { recursive: true });
        }
        return symlinkPath;
      }
      // Wrong target, remove and recreate
      unlinkSync(symlinkPath);
    } else if (stats.isDirectory()) {
      // Real directory exists, don't touch it
      return targetPath;
    } else {
      // Regular file blocking the symlink path (#841), remove it
      unlinkSync(symlinkPath);
    }
  } catch {
    // Symlink doesn't exist, create it
  }

  try {
    // Ensure the target directory exists first
    if (!existsSync(targetPath)) {
      mkdirSync(targetPath, { recursive: true });
    }
    symlinkSync(targetPath, symlinkPath);
    return symlinkPath;
  } catch (error) {
    return targetPath;
  }
};

/**
 * Get data path, using CLI-safe symlink on macOS.
 * Release builds use ~/.aionui; dev builds use ~/.aionui-dev.
 * 获取数据目录路径，macOS 上使用符号链接。
 * Release 使用 ~/.aionui，Dev 模式使用 ~/.aionui-dev。
 */
export const getDataPath = (): string => {
  const rootPath = getElectronPathOrFallback('userData');
  const dataPath = path.join(rootPath, 'aionui');
  return ensureCliSafeSymlink(dataPath, getEnvAwareName('.aionui'));
};

/**
 * Get config path, using CLI-safe symlink on macOS.
 * Release builds use ~/.aionui-config; dev builds use ~/.aionui-config-dev.
 * 获取配置目录路径，macOS 上使用符号链接。
 * Release 使用 ~/.aionui-config，Dev 模式使用 ~/.aionui-config-dev。
 */
export const getConfigPath = (): string => {
  const rootPath = getElectronPathOrFallback('userData');
  const configPath = path.join(rootPath, 'config');
  return ensureCliSafeSymlink(configPath, getEnvAwareName('.aionui-config'));
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

// Recursive directory tree builder — delegates to Rust native addon.
// Stateful options (fileService, search.onProcess) are handled in TS post-processing.
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
  const { root = dirPath, maxDepth = 1, fileService, search } = options || {};

  // Delegate core traversal to Rust (node_modules is skipped by default)
  const tree = await nativeReadDirectoryTree(dirPath, root, maxDepth, undefined, search?.text ?? null);

  if (!tree) return null;

  // Post-filter with fileService and collect stats in a single pass
  const needStats = !!search?.onProcess;
  const stats = needStats ? { files: 0, dirs: 0 } : undefined;

  if (fileService || needStats) {
    walkTree(tree, fileService, stats);
  }

  if (search?.onProcess && stats) {
    search.onProcess({ file: stats.files, dir: stats.dirs, match: tree as IDirOrFile });
  }

  return tree as IDirOrFile;
}

// Single-pass tree walk: filters ignored children (in-place) and counts nodes.
// Both operations are optional — pass null/undefined to skip either.
function walkTree(
  node: DirOrFile,
  fileService: { shouldIgnoreFile(path: string): boolean } | undefined,
  stats: { files: number; dirs: number } | undefined
): void {
  if (stats) {
    if (node.isFile) stats.files++;
    if (node.isDir) stats.dirs++;
  }
  if (!node.children) return;
  if (fileService) {
    node.children = node.children.filter((child) => !fileService.shouldIgnoreFile(child.fullPath));
  }
  for (const child of node.children) {
    walkTree(child, fileService, stats);
  }
}

// Recursive directory copy — delegates to Rust native addon.
// Safety checks (self-copy, subdirectory-copy) are handled in Rust.
interface CopyOptions {
  overwrite?: boolean;
}

export async function copyDirectoryRecursively(src: string, dest: string, options: CopyOptions = {}) {
  const { overwrite = true } = options;
  await nativeCopyDirectory(src, dest, overwrite);
}

// Verify two directories have identical file name structure — delegates to Rust native addon.
export async function verifyDirectoryFiles(dir1: string, dir2: string): Promise<boolean> {
  try {
    return await nativeVerifyDirectoryStructure(dir1, dir2);
  } catch (error) {
    console.warn('[AionUi] Error verifying directory files:', error);
    return false;
  }
}

export const copyFilesToDirectory = async (dir: string, files?: string[], skipCleanup = false): Promise<string[]> => {
  if (!files) return [];

  const { cacheDir } = lazyGetSystemDir();
  const tempDir = path.join(cacheDir, 'temp');
  const copiedFiles: string[] = [];
  const resolvedDir = path.resolve(dir);

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

    // Skip files that are already inside the target directory to avoid duplicates
    // 跳过已在目标目录中的文件，避免创建重复副本
    const resolvedFile = path.resolve(absoluteFilePath);
    if (resolvedFile.startsWith(resolvedDir + path.sep)) {
      copiedFiles.push(absoluteFilePath);
      continue;
    }

    // 使用原始文件名，只在目标文件已存在时才添加唯一后缀
    // Use original filename, only add unique suffix when destination exists
    let fileName = path.basename(absoluteFilePath);
    let destPath = path.join(dir, fileName);

    // 如果目标文件已存在，添加时间戳后缀避免覆盖
    // If destination exists, add timestamp suffix to avoid overwriting
    if (existsSync(destPath)) {
      const ext = path.extname(fileName);
      const baseName = path.basename(fileName, ext);
      fileName = `${baseName}_${Date.now()}${ext}`;
      destPath = path.join(dir, fileName);
    }

    try {
      await fs.copyFile(absoluteFilePath, destPath);
      copiedFiles.push(destPath);
    } catch (error) {
      console.error(`[AionUi] Failed to copy file from ${absoluteFilePath} to ${destPath}:`, error);
      // 继续处理其他文件，而不是完全失败
    }

    // 如果是临时文件，复制完成后删除
    if (absoluteFilePath.startsWith(tempDir) && !skipCleanup) {
      try {
        await fs.unlink(absoluteFilePath);
      } catch (error) {
        console.warn(`Failed to cleanup temp file ${absoluteFilePath}:`, error);
      }
    }
  }

  return copiedFiles;
};

// Ensure directory exists — delegates to Rust native addon.
// Handles edge cases: removes blocking files/broken symlinks before creating.
export function ensureDirectory(dirPath: string): void {
  nativeEnsureDir(dirPath);
}
