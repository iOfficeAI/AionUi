/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express } from 'express';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { AuthMiddleware } from '@/webserver/auth/middleware/AuthMiddleware';
import { errorHandler } from './middleware/errorHandler';
import { csrfProtection } from './middleware/security';

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
  app.use(csrfProtection);

  // 安全中间件
  // Security middleware
  app.use(AuthMiddleware.securityHeadersMiddleware);
  app.use(AuthMiddleware.requestLoggingMiddleware);
}

/**
 * 配置 CORS（跨域资源共享）
 * Configure CORS based on server mode
 */
export function setupCors(app: Express, port: number, allowRemote: boolean): void {
  if (allowRemote) {
    // 远程模式：允许所有来源
    // Remote mode: allow all origins
    app.use(
      cors({
        origin: true,
        credentials: true,
      })
    );
  } else {
    // 本地模式：仅允许 localhost
    // Local mode: allow localhost only
    app.use(
      cors({
        origin: [`http://localhost:${port}`, `http://127.0.0.1:${port}`],
        credentials: true,
      })
    );
  }
}

/**
 * 配置错误处理中间件（必须最后注册）
 * Configure error handling middleware (must be registered last)
 */
export function setupErrorHandler(app: Express): void {
  app.use(errorHandler);
}
