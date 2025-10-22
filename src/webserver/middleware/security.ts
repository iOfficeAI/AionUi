/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NextFunction, Request, Response } from 'express';
import rateLimit, { type Options as RateLimitOptions, type RateLimitRequestHandler } from 'express-rate-limit';
import csrf from 'csurf';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, SECURITY_CONFIG } from '@/webserver/config/constants';

/**
 * 创建带默认配置的限流器
 */
function createLimiter(options: RateLimitOptions): RateLimitRequestHandler {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    ...options,
  });
}

export function createRateLimiter(options: RateLimitOptions): RateLimitRequestHandler {
  return createLimiter(options);
}

/**
 * 登录/注册等敏感操作的限流
 */
export const authRateLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again later.',
  },
  skipSuccessfulRequests: true,
});

/**
 * 一般 API 请求限流
 */
export const apiRateLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: {
    error: 'Too many API requests, please slow down.',
  },
});

/**
 * 文件浏览等操作限流
 */
export const fileOperationLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: {
    error: 'Too many file operations, please slow down.',
  },
});

/**
 * 已认证用户的敏感操作限流（优先按用户 ID，其次按 IP）
 */
export const authenticatedActionLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: {
    success: false,
    error: 'Too many sensitive actions, please try again later.',
  },
  keyGenerator: (req: Request) => {
    if (req.user?.id) {
      return `user:${req.user.id}`;
    }
    return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
  },
});

/**
 * 基于 cookie 的 CSRF 保护，允许 WebUI 从 cookie 读取 token
 */
const rawCsrfMiddleware = csrf({
  cookie: {
    key: CSRF_COOKIE_NAME,
    sameSite: SECURITY_CONFIG.CSRF.COOKIE_OPTIONS.sameSite,
    secure: SECURITY_CONFIG.CSRF.COOKIE_OPTIONS.secure,
    httpOnly: SECURITY_CONFIG.CSRF.COOKIE_OPTIONS.httpOnly,
    path: SECURITY_CONFIG.CSRF.COOKIE_OPTIONS.path,
  },
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
});

/**
 * 将 CSRF token 写回 cookie 与响应头
 */
function setCsrfToken(req: Request, res: Response): void {
  if (typeof req.csrfToken !== 'function') {
    return;
  }
  const token = req.csrfToken();
  res.cookie(CSRF_COOKIE_NAME, token, SECURITY_CONFIG.CSRF.COOKIE_OPTIONS);
  res.setHeader(CSRF_HEADER_NAME, token);
  res.locals.csrfToken = token;
}

/**
 * 综合 CSRF 中间件（对 Bearer Token 请求放行）
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    next();
    return;
  }

  rawCsrfMiddleware(req, res, (err?: unknown) => {
    if (err) {
      next(err);
      return;
    }
    setCsrfToken(req, res);
    next();
  });
}
