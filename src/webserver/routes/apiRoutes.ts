/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { TokenMiddleware } from '@/webserver/auth/middleware/TokenMiddleware';
import { ExtensionRegistry } from '@/extensions';
import directoryApi from '../directoryApi';
import { apiRateLimiter } from '../middleware/security';

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
   * 扩展资产 API（WebUI）- Extension asset API (WebUI)
   * GET /api/ext-asset?path={absolutePath}
   */
  app.get('/api/ext-asset', apiRateLimiter, validateApiAccess, (req: Request, res: Response) => {
    const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
    if (!rawPath) {
      return res.status(400).json({ message: 'Missing path query parameter' });
    }

    const normalizedPath = path.resolve(rawPath);
    const registry = ExtensionRegistry.getInstance();
    const allowedRoots = registry.getLoadedExtensions().map((ext) => path.resolve(ext.directory));
    const isAllowed = allowedRoots.some((root) => normalizedPath === root || normalizedPath.startsWith(`${root}${path.sep}`));

    if (!isAllowed) {
      return res.status(403).json({ message: 'Access denied: path is outside extension directories' });
    }

    if (!fs.existsSync(normalizedPath) || !fs.statSync(normalizedPath).isFile()) {
      return res.status(404).json({ message: 'Asset not found' });
    }

    return res.sendFile(normalizedPath);
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
