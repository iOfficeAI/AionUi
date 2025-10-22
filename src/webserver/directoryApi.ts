/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileOperationLimiter } from './middleware/rateLimiter';

const router = Router();

/**
 * Validate and sanitize user-provided file paths to prevent directory traversal attacks
 * 验证和清理用户提供的文件路径，防止目录遍历攻击
 * @param userPath - User-provided path / 用户提供的路径
 * @param allowedBasePaths - Optional array of allowed base directories / 可选的允许的基础目录列表
 * @returns Validated absolute path / 验证后的绝对路径
 * @throws Error if path is invalid or outside allowed directories / 如果路径无效或在允许目录之外则抛出错误
 */
function validatePath(userPath: string, allowedBasePaths?: string[]): string {
  if (!userPath || typeof userPath !== 'string') {
    throw new Error('Invalid path: path must be a non-empty string');
  }

  // Resolve to absolute path / 解析为绝对路径
  const resolvedPath = path.resolve(userPath);

  // Check for null bytes (security issue) / 检查空字节（安全问题）
  if (resolvedPath.includes('\0')) {
    throw new Error('Invalid path: null bytes detected');
  }

  // If no allowed base paths specified, allow any valid path
  // 如果没有指定允许的基础路径，则允许任何有效路径
  if (!allowedBasePaths || allowedBasePaths.length === 0) {
    return resolvedPath;
  }

  // Ensure resolved path is within one of the allowed base directories
  // 确保解析后的路径在允许的基础目录之一内
  const isAllowed = allowedBasePaths.some((basePath) => {
    const resolvedBase = path.resolve(basePath);
    return resolvedPath === resolvedBase || resolvedPath.startsWith(resolvedBase + path.sep);
  });

  if (!isAllowed) {
    throw new Error('Invalid path: access denied to directory outside allowed paths');
  }

  return resolvedPath;
}

/**
 * 获取目录列表
 */
// Rate limit directory browsing to mitigate brute-force scanning
// 为目录浏览接口增加限流，避免暴力扫描
router.get('/browse', fileOperationLimiter, (req, res) => {
  try {
    // 默认打开 AionUi 运行目录，而不是用户 home 目录
    const rawPath = (req.query.path as string) || process.cwd();

    // Validate path to prevent directory traversal / 验证路径以防止目录遍历
    const dirPath = validatePath(rawPath);

    // 安全检查：确保路径存在且是目录
    if (!fs.existsSync(dirPath)) {
      return res.status(404).json({ error: 'Directory not found' });
    }

    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    // 获取查询参数，确定是否显示文件
    const showFiles = req.query.showFiles === 'true';

    // 读取目录内容，过滤隐藏文件/目录
    const items = fs
      .readdirSync(dirPath)
      .filter((name) => !name.startsWith('.')) // 过滤隐藏文件/目录
      .map((name) => {
        const itemPath = path.join(dirPath, name);
        try {
          const itemStats = fs.statSync(itemPath);
          const isDirectory = itemStats.isDirectory();
          const isFile = itemStats.isFile();

          // 根据模式过滤：如果不显示文件，则只显示目录
          if (!showFiles && !isDirectory) {
            return null;
          }

          return {
            name,
            path: itemPath,
            isDirectory,
            isFile,
            size: itemStats.size,
            modified: itemStats.mtime,
          };
        } catch (error) {
          // 跳过无法访问的文件/目录
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

    res.json({
      currentPath: dirPath,
      parentPath: path.dirname(dirPath),
      items,
      canGoUp: dirPath !== path.parse(dirPath).root,
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
    const dirPath = validatePath(rawPath);

    // 检查路径是否存在
    if (!fs.existsSync(dirPath)) {
      return res.status(404).json({ error: 'Path does not exist' });
    }

    // 检查是否为目录
    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    // 检查是否可读
    try {
      fs.accessSync(dirPath, fs.constants.R_OK);
    } catch {
      return res.status(403).json({ error: 'Directory is not readable' });
    }

    res.json({
      valid: true,
      path: dirPath,
      name: path.basename(dirPath),
    });
  } catch (error) {
    console.error('Path validation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to validate path';
    res.status(error instanceof Error && error.message.includes('access denied') ? 403 : 500).json({ error: errorMessage });
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
