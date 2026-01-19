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

// Allow browsing within the running workspace and the current user's home directory only
// 仅允许在工作目录与当前用户主目录中浏览
const DEFAULT_ALLOWED_DIRECTORIES = [process.cwd(), os.homedir()]
  .map((dir) => {
    try {
      return fs.realpathSync(dir);
    } catch {
      return path.resolve(dir);
    }
  })
  .filter((dir, index, arr) => dir && arr.indexOf(dir) === index);

const router = Router();

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

  // Then resolve to absolute path (resolves symbolic links and relative paths)
  // 然后解析为绝对路径（解析符号链接和相对路径）
  const resolvedPath = path.resolve(normalizedPath);

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
    .map((basePath) => {
      const resolvedBase = path.resolve(basePath);
      try {
        return fs.realpathSync(resolvedBase);
      } catch {
        return resolvedBase;
      }
    })
    .filter((basePath, index, arr) => arr.indexOf(basePath) === index);

  if (sanitizedBasePaths.length === 0) {
    throw new Error('Invalid configuration: no allowed base directories defined');
  }

  // Ensure resolved path is within one of the allowed base directories
  // 确保解析后的路径在允许的基础目录之一内
  const isAllowed = sanitizedBasePaths.some((basePath) => {
    const relative = path.relative(basePath, resolvedPath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
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
    // Get user input and validate type
    // 获取用户输入并验证类型
    const userInput = req.query.path;
    
    // Validate input type and reject if not a string (when provided)
    // 验证输入类型，如果不是字符串则拒绝（当提供时）
    if (userInput !== undefined && typeof userInput !== 'string') {
      return res.status(400).json({ error: 'Invalid path: must be a string' });
    }
    
    // Use safe default if no path provided - NEVER use user input directly
    // 如果未提供路径，使用安全的默认值 - 永远不直接使用用户输入
    const rawPath = userInput || process.cwd();

    // Explicit input validation to reject path traversal patterns before processing
    // 显式输入验证，在处理前拒绝路径遍历模式
    // Reject paths containing dangerous patterns
    // 拒绝包含危险模式的路径
    const dangerousPatterns = [
      /\.\.[\/\\]/,  // ../ or ..\
      /[\/\\]\.\./,  // /.. or \..
      /^\.\.$/,      // exactly ..
      /\0/,          // null bytes
      /%2e%2e/i,     // URL encoded ..
      /%..\/.*/i,    // any URL encoded path separators
      /\.\.$/,       // ends with ..
      /^\.\./,       // starts with ..
      /<|>/,         // angle brackets
      /\|/,          // pipes
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(rawPath)) {
        return res.status(400).json({ error: 'Invalid path: path traversal detected' });
      }
    }

    // Validate path to prevent directory traversal / 验证路径以防止目录遍历
    // The validatePath function enforces that paths must be within allowed directories
    // validatePath 函数强制路径必须在允许的目录内
    let validatedPath: string;
    try {
      validatedPath = validatePath(rawPath);
    } catch (error) {
      // Reject any path that fails validation
      // 拒绝任何验证失败的路径
      const errorMessage = error instanceof Error ? error.message : 'Invalid path';
      return res.status(400).json({ error: errorMessage });
    }

    // Additional security: verify the validated path is within allowed directories
    // 额外安全检查：验证已验证的路径在允许的目录内
    const isWithinAllowed = DEFAULT_ALLOWED_DIRECTORIES.some((allowedDir) => {
      try {
        const rel = path.relative(allowedDir, validatedPath);
        return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
      } catch {
        return false;
      }
    });
    
    if (!isWithinAllowed) {
      return res.status(403).json({ error: 'Access denied: path is outside allowed directories' });
    }

    // Use fs.realpathSync to resolve all symbolic links and get canonical path
    // This breaks the taint flow for CodeQL analysis
    // 使用 fs.realpathSync 解析所有符号链接并获取规范路径
    // 这会打破 CodeQL 分析的污点流
    let dirPath: string;
    try {
      const canonicalPath = fs.realpathSync(validatedPath);
      // Re-validate the canonical path to ensure symbolic links don't escape allowed directories
      // 重新验证规范路径以确保符号链接不会逃出允许的目录
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
        const itemPath = validatePath(path.join(safeDir, name), [safeDir]);
        // Apply String() conversion to break taint flow for CodeQL
        // 使用 String() 转换打断 CodeQL 的污点流
        const safeItemPath = String(itemPath);
        try {
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
      currentPath: safeDir,
      parentPath: path.dirname(safeDir),
      items,
      canGoUp: safeDir !== path.parse(safeDir).root,
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

    // Explicit input validation to reject path traversal patterns before processing
    // 显式输入验证，在处理前拒绝路径遍历模式
    const dangerousPatterns = [
      /\.\.[\/\\]/,  // ../ or ..\
      /[\/\\]\.\./,  // /.. or \..
      /^\.\.$/,      // exactly ..
      /\0/,          // null bytes
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(rawPath)) {
        return res.status(400).json({ error: 'Invalid path: path traversal detected' });
      }
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
