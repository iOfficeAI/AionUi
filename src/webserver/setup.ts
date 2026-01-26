/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express } from 'express';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import csrf from 'tiny-csrf';
import crypto from 'crypto';
import { networkInterfaces } from 'os';
import { AuthMiddleware } from '@/webserver/auth/middleware/AuthMiddleware';
import { errorHandler } from './middleware/errorHandler';
import { attachCsrfToken } from './middleware/security';

/**
 * 获取局域网 IP 地址
 * Get LAN IP address for CORS configuration
 */
function getLanIP(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    const netInfo = nets[name];
    if (!netInfo) continue;

    for (const net of netInfo) {
      // Node.js 18.4+ returns number (4/6), older versions return string ('IPv4'/'IPv6')
      const isIPv4 = net.family === 'IPv4' || (net.family as unknown) === 4;
      const isNotInternal = !net.internal;
      if (isIPv4 && isNotInternal) {
        return net.address;
      }
    }
  }
  return null;
}

/**
 * 获取或生成 CSRF Secret
 * Get or generate CSRF secret
 *
 * CSRF secret must be exactly 32 characters for AES-256-CBC
 * CSRF 密钥必须正好 32 个字符以用于 AES-256-CBC
 *
 * 优先级：环境变量 > 随机生成（每次启动不同）
 * Priority: Environment variable > Random generation (different on each startup)
 */
function getCsrfSecret(): string {
  // 优先使用环境变量 / Prefer environment variable
  if (process.env.CSRF_SECRET && process.env.CSRF_SECRET.length === 32) {
    return process.env.CSRF_SECRET;
  }

  // 生成随机 32 字符密钥（16 字节的 hex 编码）
  // Generate random 32-character secret (16 bytes hex encoded)
  const randomSecret = crypto.randomBytes(16).toString('hex');
  console.log('[security] Generated random CSRF secret for this session');
  return randomSecret;
}

// 在模块加载时生成一次，整个进程生命周期内保持不变
// Generate once at module load, remains constant for process lifetime
const CSRF_SECRET = getCsrfSecret();

/**
 * 配置基础中间件
 * Configure basic middleware for Express app
 */
export function setupBasicMiddleware(app: Express): void {
  // 请求体解析器
  // Body parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // CSRF Protection using tiny-csrf (CodeQL compliant)
  // Must be applied after cookieParser and before routes
  // CSRF 保护使用 tiny-csrf（符合 CodeQL 要求）
  // 必须在 cookieParser 之后、路由之前应用
  app.use(cookieParser('cookie-parser-secret'));
  // P1 安全修复：登录接口启用 CSRF 保护（前端已添加 withCsrfToken）
  // P1 Security fix: Enable CSRF for login (frontend already uses withCsrfToken)
  // 仅排除 QR 登录（有独立的一次性 token 保护机制）
  // Only exclude QR login (has its own one-time token protection)
  app.use(
    csrf(
      CSRF_SECRET,
      ['POST', 'PUT', 'DELETE', 'PATCH'], // Protected methods
      ['/login', '/api/auth/qr-login'], // Excluded: login form and QR login
      [] // No service worker URLs
    )
  );
  app.use(attachCsrfToken); // Attach token to response headers

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

  // 允许远程访问时，自动添加局域网 IP
  // When remote access is enabled, automatically add LAN IP
  if (allowRemote) {
    const lanIP = getLanIP();
    if (lanIP) {
      baseOrigins.add(`http://${lanIP}:${port}`);
      console.log(`[CORS] Added LAN IP to allowed origins: http://${lanIP}:${port}`);
    }
  }

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
