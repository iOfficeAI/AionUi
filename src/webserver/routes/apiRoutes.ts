/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, Request, Response } from 'express';
import { TokenMiddleware } from '@/webserver/auth/middleware/TokenMiddleware';
import directoryApi from '../directoryApi';
import { apiRateLimiter } from '../middleware/security';
import fs from 'fs/promises';
import path from 'path';
import { AIONUI_TIMESTAMP_SEPARATOR } from '@/common/constants';
import { getSystemDir } from '@/process/initStorage';

/** Max upload size in bytes (should align with express.json limit) */
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB

interface UploadTempFileRequest {
  fileName: string;
  data: string; // base64 encoded
  contentType?: string;
}

function sanitizeFileName(fileName: string): string {
  // Extract basename to strip any directory components (path traversal defense)
  const basename = path.basename(fileName);
  const safe = basename.replace(/[<>:"/\\|?*]/g, '_');
  if (!safe || safe === '.' || safe === '..') return `file_${Date.now()}`;
  return safe;
}

async function getTempDir(): Promise<string> {
  const { cacheDir } = getSystemDir();
  const tempDir = path.join(cacheDir, 'temp');
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * 注册 API 路由
 * Register API routes
 */
export function registerApiRoutes(app: Express): void {
  const validateApiAccess = TokenMiddleware.validateToken({ responseType: 'json' });

  /**
   * 目录 API - Directory API
   * /api/directory/*
   */
  app.use('/api/directory', apiRateLimiter, validateApiAccess, directoryApi);

  /**
   * 上传临时文件 - Upload temporary file
   * POST /api/upload-temp
   * 用于 WebUI 模式下粘贴/拖拽文件时创建临时文件
   * Used in WebUI mode for paste/drag files to create temp files
   *
   * Must be registered BEFORE the catch-all /api route below
   */
  app.post('/api/upload-temp', apiRateLimiter, validateApiAccess, async (req: Request, res: Response) => {
    try {
      const { fileName, data, contentType } = req.body as UploadTempFileRequest;

      if (!fileName || !data) {
        res.status(400).json({ success: false, msg: 'Missing fileName or data' });
        return;
      }

      const tempDir = await getTempDir();
      const safeFileName = sanitizeFileName(fileName);
      let tempFilePath = path.join(tempDir, safeFileName);

      // Check for duplicate and append timestamp if needed
      try {
        await fs.access(tempFilePath);
        // File exists, append timestamp
        const timestamp = Date.now();
        const ext = path.extname(safeFileName);
        const name = path.basename(safeFileName, ext);
        const newFileName = `${name}${AIONUI_TIMESTAMP_SEPARATOR}${timestamp}${ext}`;
        tempFilePath = path.join(tempDir, newFileName);
      } catch {
        // File doesn't exist, proceed with original name
      }

      // Verify path is still within tempDir (defense in depth)
      if (!tempFilePath.startsWith(tempDir + path.sep) && tempFilePath !== tempDir) {
        res.status(400).json({ success: false, msg: 'Invalid file name' });
        return;
      }

      // Decode base64 and write file
      const buffer = Buffer.from(data, 'base64');

      // Server-side size check
      if (buffer.length > MAX_UPLOAD_SIZE) {
        res.status(413).json({ success: false, msg: `File too large (max ${MAX_UPLOAD_SIZE / 1024 / 1024}MB)` });
        return;
      }

      await fs.writeFile(tempFilePath, buffer);

      res.json({ success: true, data: { path: tempFilePath, name: path.basename(tempFilePath), size: buffer.length, type: contentType || 'application/octet-stream' } });
    } catch (error) {
      console.error('[API] Upload temp file error:', error);
      res.status(500).json({ success: false, msg: error instanceof Error ? error.message : 'Failed to upload temp file' });
    }
  });

  /**
   * 通用 API 端点 - Generic API endpoint
   * GET /api
   */
  app.use('/api', apiRateLimiter, validateApiAccess, (_req: Request, res: Response) => {
    res.json({ message: 'API endpoint - bridge integration working' });
  });
}

export default registerApiRoutes;
