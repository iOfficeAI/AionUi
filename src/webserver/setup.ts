/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express } from 'express';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { doubleCsrf } from 'csrf-csrf';
import { AuthMiddleware } from '@/webserver/auth/middleware/AuthMiddleware';
import { errorHandler } from './middleware/errorHandler';
import { csrfCookieOptions, attachCsrfToken } from './middleware/security';
import { CSRF_COOKIE_NAME } from './config/constants';

// Initialize csrf-csrf with Double Submit Cookie pattern
// 使用双重提交 Cookie 模式初始化 CSRF 保护
const { doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production',
  cookieName: CSRF_COOKIE_NAME,
  cookieOptions: csrfCookieOptions,
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getSessionIdentifier: (req) => req.ip || req.socket.remoteAddress || 'unknown',
});

/**
 * 配置基础中间件
 * Configure basic middleware for Express app
 */
export function setupBasicMiddleware(app: Express): void {
  // 请求体解析器
  // Body parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // CSRF middleware protects state-changing requests for WebUI
  // CSRF 中间件保护 WebUI 的状态修改请求
  app.use(doubleCsrfProtection);
  app.use(attachCsrfToken);

  // 安全中间件
  // Security middleware
  app.use(AuthMiddleware.securityHeadersMiddleware);
  app.use(AuthMiddleware.requestLoggingMiddleware);
}

/**
 * 配置 CORS（跨域资源共享）
 * Configure CORS based on server mode
 */
function normalizeOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    const portSuffix = url.port ? `:${url.port}` : '';
    return `${url.protocol}//${url.hostname}${portSuffix}`;
  } catch (error) {
    return null;
  }
}

function getConfiguredOrigins(port: number, allowRemote: boolean): Set<string> {
  const baseOrigins = new Set<string>([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);

  if (process.env.SERVER_BASE_URL) {
    const normalizedBase = normalizeOrigin(process.env.SERVER_BASE_URL);
    if (normalizedBase) {
      baseOrigins.add(normalizedBase);
    }
  }

  const extraOrigins = (process.env.AIONUI_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => normalizeOrigin(origin))
    .filter((origin): origin is string => Boolean(origin));

  extraOrigins.forEach((origin) => baseOrigins.add(origin));

  if (allowRemote && baseOrigins.size === 2 && extraOrigins.length === 0) {
    console.warn('[security] Remote access enabled but no additional CORS origins configured. Requests from other origins will be blocked. Set AIONUI_ALLOWED_ORIGINS to a comma-separated list if cross-origin access is required.');
  }

  return baseOrigins;
}

export function setupCors(app: Express, port: number, allowRemote: boolean): void {
  const allowedOrigins = getConfiguredOrigins(port, allowRemote);

  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin) {
          // Requests like curl or same-origin don't send an Origin header
          callback(null, true);
          return;
        }

        if (origin === 'null') {
          callback(null, true);
          return;
        }

        const normalizedOrigin = normalizeOrigin(origin);
        if (normalizedOrigin && allowedOrigins.has(normalizedOrigin)) {
          callback(null, true);
          return;
        }

        callback(null, false);
      },
    })
  );
}

/**
 * 配置错误处理中间件（必须最后注册）
 * Configure error handling middleware (must be registered last)
 */
export function setupErrorHandler(app: Express): void {
  app.use(errorHandler);
}
