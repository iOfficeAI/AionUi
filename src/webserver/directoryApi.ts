/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';

const router = Router();

/**
 * 获取目录列表
 */
router.get('/browse', (req, res) => {
  try {
    // 默认打开 AionUi 运行目录，而不是用户 home 目录
    const dirPath = (req.query.path as string) || process.cwd();

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
router.post('/validate', (req, res) => {
  try {
    const { path: dirPath } = req.body;

    if (!dirPath || typeof dirPath !== 'string') {
      return res.status(400).json({ error: 'Path is required' });
    }

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
      path: path.resolve(dirPath),
      name: path.basename(dirPath),
    });
  } catch (error) {
    console.error('Path validation error:', error);
    res.status(500).json({ error: 'Failed to validate path' });
  }
});

/**
 * 获取常用目录快捷方式
 */
router.get('/shortcuts', (_req, res) => {
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
