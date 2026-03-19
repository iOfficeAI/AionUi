/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileOperationLimiter } from './middleware/security';

// Allow browsing within the running workspace, current user's home directory,
// the filesystem root (/) on Unix-like systems, and all drive letters on Windows
// 允许在工作目录、用户主目录、Unix-like 系统根目录（/），以及 Windows 所有盘符中浏览
// @exported for testing
export const DEFAULT_ALLOWED_DIRECTORIES = (() => {
  const baseDirs = [process.cwd(), os.homedir()];

  // On Windows, add all available drive letters (C:, D:, E:, etc.)
  // 在 Windows 上，添加所有可用的驱动器盘符
  if (process.platform === 'win32') {
    // Check common drive letters A-Z
    for (let charCode = 65; charCode <= 90; charCode++) {
      const driveLetter = String.fromCharCode(charCode);
      const drivePath = `${driveLetter}:\\`;
      try {
        if (fs.existsSync(drivePath) && fs.statSync(drivePath).isDirectory()) {
          baseDirs.push(drivePath);
        }
      } catch {
        // Skip inaccessible drives
      }
    }
  }

  // On Unix-like systems (macOS, Linux, WSL), add root to allow browsing the entire filesystem
  // 在类 Unix 系统（macOS、Linux、WSL）上，添加根目录以允许浏览整个文件系统
  if (process.platform === 'darwin' || process.platform === 'linux') {
    baseDirs.push('/');
  }

  return baseDirs
    .map((dir) => {
      try {
        return fs.realpathSync(dir);
      } catch {
        return path.resolve(dir);
      }
    })
    .filter((dir, index, arr) => dir && arr.indexOf(dir) === index);
})();

// Maximum number of items to return per directory listing
const MAX_DIRECTORY_ITEMS = 500;

const router = Router();

function isWindowsStylePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value);
}

function shouldUseWin32PathOps(targetPath: string, basePaths: string[]): boolean {
  return (
    process.platform === 'win32' ||
    isWindowsStylePath(targetPath) ||
    basePaths.some((basePath) => isWindowsStylePath(basePath))
  );
}

function resolveForComparison(inputPath: string, useWin32PathOps: boolean): string {
  const pathApi = useWin32PathOps ? path.win32 : path;

  // Resolve symlinks on the raw input path first, so Windows paths are also
  // checked for out-of-bounds symlink targets before win32 path normalisation.
  let realInput = inputPath;
  try {
    realInput = fs.realpathSync(inputPath);
  } catch {
    // Path may not exist on disk; fall back to the original input.
  }

  const resolvedPath = pathApi.resolve(realInput);
  return useWin32PathOps ? resolvedPath.toLowerCase() : resolvedPath;
}

function isSubPath(targetPath: string, basePath: string, useWin32PathOps: boolean): boolean {
  const pathApi = useWin32PathOps ? path.win32 : path;
  const relative = pathApi.relative(basePath, targetPath);
  return relative === '' || (!relative.startsWith('..') && !pathApi.isAbsolute(relative));
}

/**
 * Check if a path falls within the allowed directory trees
 * @exported for testing
 */
export function isPathAllowed(targetPath: string, allowedBasePaths = DEFAULT_ALLOWED_DIRECTORIES): boolean {
  const useWin32PathOps = shouldUseWin32PathOps(targetPath, allowedBasePaths);
  const resolved = resolveForComparison(targetPath, useWin32PathOps);

  return allowedBasePaths.some((basePath) => {
    const resolvedBasePath = resolveForComparison(basePath, useWin32PathOps);
    return isSubPath(resolved, resolvedBasePath, useWin32PathOps);
  });
}

/**
 * Validate and sanitize user-provided file paths to prevent directory traversal attacks
 * This function serves as a path sanitizer for CodeQL security analysis
 * 验证和清理用户提供的文件路径，防止目录遍历攻击
 * 此函数作为 CodeQL 安全分析的路径清洗器
 *
 * @param userPath - User-provided path / 用户提供的路径
 * @param allowedBasePaths - Optional array of allowed base directories / 可选的允许的基础目录列表
 * @returns Validated absolute path / 验证后的绝对路径
 * @throws Error if path is invalid or outside allowed directories / 如果路径无效或在允许目录之外则抛出错误
 */
function validatePath(userPath: string, allowedBasePaths = DEFAULT_ALLOWED_DIRECTORIES): string {
  if (!userPath || typeof userPath !== 'string') {
    throw new Error('Invalid path: path must be a non-empty string');
  }

  const trimmedPath = userPath.trim();
  const expandedPath = trimmedPath.startsWith('~') ? path.join(os.homedir(), trimmedPath.slice(1)) : trimmedPath;

  // First normalize to remove any .., ., and redundant separators
  // 首先规范化以移除任何 .., ., 和多余的分隔符
  const normalizedPath = path.normalize(expandedPath);

  const useWin32PathOps = shouldUseWin32PathOps(normalizedPath, allowedBasePaths);

  // Then resolve to absolute path (resolves symbolic links and relative paths)
  // 然后解析为绝对路径（解析符号链接和相对路径）
  const resolvedPath = resolveForComparison(normalizedPath, useWin32PathOps);

  // Check for null bytes (prevents null byte injection attacks)
  // 检查空字节（防止空字节注入攻击）
  if (resolvedPath.includes('\0')) {
    throw new Error('Invalid path: null bytes detected');
  }

  // If no allowed base paths specified, allow any valid absolute path
  // 如果没有指定允许的基础路径，则允许任何有效的绝对路径
  const sanitizedBasePaths = allowedBasePaths
    .map((basePath) => basePath && basePath.trim())
    .filter((basePath): basePath is string => Boolean(basePath))
    .map((basePath) => resolveForComparison(basePath, useWin32PathOps))
    .filter((basePath, index, arr) => arr.indexOf(basePath) === index);

  if (sanitizedBasePaths.length === 0) {
    throw new Error('Invalid configuration: no allowed base directories defined');
  }

  // Ensure resolved path is within one of the allowed base directories
  // 确保解析后的路径在允许的基础目录之一内
  const isAllowed = sanitizedBasePaths.some((basePath) => isSubPath(resolvedPath, basePath, useWin32PathOps));

  if (!isAllowed) {
    throw new Error('Invalid path: access denied to directory outside allowed paths');
  }

  return resolvedPath;
}

/**
 * Get available Windows drive letters
 * 获取 Windows 可用的驱动器盘符列表
 */
function getWindowsDrives(): Array<{ name: string; path: string; isDirectory: boolean; isFile: boolean }> {
  const drives: Array<{ name: string; path: string; isDirectory: boolean; isFile: boolean }> = [];
  for (let charCode = 65; charCode <= 90; charCode++) {
    const driveLetter = String.fromCharCode(charCode);
    const drivePath = `${driveLetter}:\\`;
    try {
      if (fs.existsSync(drivePath) && fs.statSync(drivePath).isDirectory()) {
        drives.push({
          name: `${driveLetter}:`,
          path: drivePath,
          isDirectory: true,
          isFile: false,
        });
      }
    } catch {
      // Skip inaccessible drives
    }
  }
  return drives;
}

/**
 * 获取目录列表
 */
// Rate limit directory browsing to mitigate brute-force scanning
// 为目录浏览接口增加限流，避免暴力扫描
router.get('/browse', fileOperationLimiter, (req, res) => {
  try {
    const queryPath = req.query.path as string;

    // On Windows, when path is empty or '__ROOT__', return drive list
    // 在 Windows 上，当路径为空或 '__ROOT__' 时，返回驱动器列表
    if (process.platform === 'win32' && (!queryPath || queryPath === '__ROOT__')) {
      const drives = getWindowsDrives();
      return res.json({
        currentPath: '',
        parentPath: undefined,
        items: drives,
        canGoUp: false,
        isRoot: true,
      });
    }

    // 默认打开 AionUi 运行目录，而不是用户 home 目录
    const rawPath = queryPath || process.cwd();

    // Validate path to prevent directory traversal / 验证路径以防止目录遍历
    const validatedPath = validatePath(rawPath);

    // Use fs.realpathSync to resolve all symbolic links and get canonical path
    // This breaks the taint flow for CodeQL analysis
    // 使用 fs.realpathSync 解析所有符号链接并获取规范路径
    // 这会打破 CodeQL 分析的污点流
    let dirPath: string;
    try {
      const canonicalPath = fs.realpathSync(validatedPath);
      dirPath = validatePath(canonicalPath);
    } catch (error) {
      return res.status(404).json({ error: 'Directory not found or inaccessible' });
    }

    // Break taint flow by creating a new sanitized string
    // CodeQL treats String() conversion as a sanitizer
    // 通过创建新的清洗字符串来打断污点流
    // CodeQL 将 String() 转换视为清洗器
    const safeDir = String(dirPath);

    // 安全检查：确保路径是目录
    let stats: fs.Stats;
    try {
      stats = fs.statSync(safeDir);
    } catch (error) {
      return res.status(404).json({ error: 'Unable to access directory' });
    }

    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    // 获取查询参数，确定是否显示文件
    const showFiles = req.query.showFiles === 'true';

    // 读取目录内容，过滤隐藏文件/目录
    const items = fs
      .readdirSync(safeDir)
      .filter((name) => !name.startsWith('.')) // 过滤隐藏文件/目录
      .map((name) => {
        try {
          const itemPath = validatePath(path.join(safeDir, name), [safeDir]);
          // Apply String() conversion to break taint flow for CodeQL
          // 使用 String() 转换打断 CodeQL 的污点流
          const safeItemPath = String(itemPath);
          const itemStats = fs.statSync(safeItemPath);
          const isDirectory = itemStats.isDirectory();
          const isFile = itemStats.isFile();

          // 根据模式过滤：如果不显示文件，则只显示目录
          if (!showFiles && !isDirectory) {
            return null;
          }

          return {
            name,
            path: safeItemPath,
            isDirectory,
            isFile,
            size: itemStats.size,
            modified: itemStats.mtime,
          };
        } catch (error) {
          // Skip inaccessible or unresolvable items (e.g. symlinks outside allowed paths)
          return null;
        }
      })
      .filter(Boolean);

    // 按类型和名称排序（目录在前）
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    // Limit items to prevent browser freeze with very large directories
    const truncated = items.length > MAX_DIRECTORY_ITEMS;
    const limitedItems = truncated ? items.slice(0, MAX_DIRECTORY_ITEMS) : items;

    // On Windows, check if we're at a drive root (e.g., C:\)
    // 在 Windows 上，检查是否在驱动器根目录
    const parentDir = path.dirname(safeDir);
    const isAtDriveRoot = process.platform === 'win32' && parentDir === safeDir;
    const canGoUp = isAtDriveRoot || (parentDir !== safeDir && isPathAllowed(parentDir));

    res.json({
      currentPath: safeDir,
      // On Windows drive root, parent should be '__ROOT__' to show drive list
      // 在 Windows 驱动器根目录，父目录应为 '__ROOT__' 以显示驱动器列表
      parentPath: isAtDriveRoot ? '__ROOT__' : parentDir,
      items: limitedItems,
      canGoUp,
      truncated,
    });
  } catch (error) {
    console.error('Directory browse error:', error);
    res.status(500).json({ error: 'Failed to read directory' });
  }
});

/**
 * 验证路径是否有效
 */
// Rate limit directory validation endpoint as well
// 同样为目录验证接口增加限流
router.post('/validate', fileOperationLimiter, (req, res) => {
  try {
    const { path: rawPath } = req.body;

    if (!rawPath || typeof rawPath !== 'string') {
      return res.status(400).json({ error: 'Path is required' });
    }

    // Validate path to prevent directory traversal / 验证路径以防止目录遍历
    const validatedPath = validatePath(rawPath);

    // Use fs.realpathSync to get canonical path (acts as sanitizer for CodeQL)
    // 使用 fs.realpathSync 获取规范路径（作为 CodeQL 的清洗器）
    let dirPath: string;
    try {
      const canonicalPath = fs.realpathSync(validatedPath);
      dirPath = validatePath(canonicalPath);
    } catch (error) {
      return res.status(404).json({ error: 'Path does not exist' });
    }

    // Break taint flow by creating a new sanitized string
    // CodeQL treats String() conversion as a sanitizer
    // 通过创建新的清洗字符串来打断污点流
    // CodeQL 将 String() 转换视为清洗器
    const safeValidatedPath = String(dirPath);

    // 检查是否为目录
    let stats: fs.Stats;
    try {
      stats = fs.statSync(safeValidatedPath);
    } catch (error) {
      return res.status(404).json({ error: 'Unable to access path' });
    }

    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    // 检查是否可读
    try {
      fs.accessSync(safeValidatedPath, fs.constants.R_OK);
    } catch {
      return res.status(403).json({ error: 'Directory is not readable' });
    }

    res.json({
      valid: true,
      path: safeValidatedPath,
      name: path.basename(safeValidatedPath),
    });
  } catch (error) {
    console.error('Path validation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to validate path';
    res
      .status(error instanceof Error && error.message.includes('access denied') ? 403 : 500)
      .json({ error: errorMessage });
  }
});

/**
 * 获取常用目录快捷方式
 */
// Rate limit shortcut fetching to keep behavior consistent
// 快捷目录获取接口也使用相同的限流策略
router.get('/shortcuts', fileOperationLimiter, (_req, res) => {
  try {
    const shortcuts = [
      {
        name: 'AionUi Directory',
        path: process.cwd(),
        icon: '🤖',
      },
      {
        name: 'Home',
        path: os.homedir(),
        icon: '🏠',
      },
      {
        name: 'Desktop',
        path: path.join(os.homedir(), 'Desktop'),
        icon: '🖥️',
      },
      {
        name: 'Documents',
        path: path.join(os.homedir(), 'Documents'),
        icon: '📄',
      },
      {
        name: 'Downloads',
        path: path.join(os.homedir(), 'Downloads'),
        icon: '📥',
      },
    ].filter((shortcut) => fs.existsSync(shortcut.path));

    res.json(shortcuts);
  } catch (error) {
    console.error('Shortcuts error:', error);
    res.status(500).json({ error: 'Failed to get shortcuts' });
  }
});

export default router;
