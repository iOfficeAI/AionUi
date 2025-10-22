/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import csrf from 'csurf';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, SECURITY_CONFIG } from '@/webserver/config/constants';

/**
 * 登录/注册等敏感操作的限流
 */
export const authRateLimiter = rateLimit({
  standardHeaders: true,
  legacyHeaders: false,
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
export const apiRateLimiter = rateLimit({
  standardHeaders: true,
  legacyHeaders: false,
  windowMs: 60 * 1000,
  max: 60,
  message: {
    error: 'Too many API requests, please slow down.',
  },
});

/**
 * 文件浏览等操作限流
 */
export const fileOperationLimiter = rateLimit({
  standardHeaders: true,
  legacyHeaders: false,
  windowMs: 60 * 1000,
  max: 30,
  message: {
    error: 'Too many file operations, please slow down.',
  },
});

/**
 * 已认证用户的敏感操作限流（优先按用户 ID，其次按 IP）
 */
export const authenticatedActionLimiter = rateLimit({
  standardHeaders: true,
  legacyHeaders: false,
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
export const csrfCookieProtection = csrf({
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
export function attachCsrfToken(req: Request, res: Response, next: NextFunction): void {
  if (typeof req.csrfToken === 'function') {
    const token = req.csrfToken();
    res.cookie(CSRF_COOKIE_NAME, token, SECURITY_CONFIG.CSRF.COOKIE_OPTIONS);
    res.setHeader(CSRF_HEADER_NAME, token);
    res.locals.csrfToken = token;
  }
  next();
}

/**
 * 供静态路由等场景使用的通用限流器工厂
 */
export function createRateLimiter(options: Parameters<typeof rateLimit>[0]) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    ...options,
  });
}
