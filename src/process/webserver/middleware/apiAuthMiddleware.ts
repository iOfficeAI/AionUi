/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Request, Response, NextFunction } from 'express';
import { getDatabase } from '@process/services/database';

/**
 * API Token authentication middleware
 * Validates Bearer token from Authorization header
 * API Token 认证中间件 - 验证 Authorization 头中的 Bearer token
 */
export const validateApiToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // 1. Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Missing or invalid Authorization header. Expected: Bearer {token}',
      });
      return;
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'API token is empty',
      });
      return;
    }

    // 2. Get API config from database
    const db = await getDatabase();
    const configResult = db.getApiConfig();

    if (!configResult.success) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve API configuration',
      });
      return;
    }

    if (!configResult.data?.enabled) {
      res.status(403).json({
        success: false,
        error: 'API is currently disabled',
      });
      return;
    }

    // 3. Validate token
    if (!configResult.data.authToken) {
      res.status(403).json({
        success: false,
        error: 'API token not configured. Please generate a token in settings.',
      });
      return;
    }

    // Use constant-time comparison to prevent timing attacks
    if (!timingSafeEqual(configResult.data.authToken, token)) {
      res.status(401).json({
        success: false,
        error: 'Invalid API token',
      });
      return;
    }

    // 4. Attach system user to request
    // API requests use the default system user
    (req as any).user = {
      id: 'system_default_user',
      username: 'api_user',
    };

    next();
  } catch (error) {
    console.error('[API Auth] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal authentication error',
    });
  }
};

/**
 * Constant-time string comparison to prevent timing attacks
 * 常量时间字符串比较以防止时序攻击
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
