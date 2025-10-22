/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import { SECURITY_CONFIG } from '../config/constants';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_COOKIE_NAME = SECURITY_CONFIG.CSRF.COOKIE_NAME;
const CSRF_HEADER_NAME = SECURITY_CONFIG.CSRF.HEADER_NAME;

function extractHeaderToken(req: Request): string | null {
  const headerValue = req.headers[CSRF_HEADER_NAME] ?? req.headers[CSRF_HEADER_NAME.toLowerCase()] ?? req.headers[CSRF_HEADER_NAME.toUpperCase()];

  if (!headerValue) {
    return null;
  }

  if (Array.isArray(headerValue)) {
    return headerValue[0] ?? null;
  }

  if (typeof headerValue === 'string') {
    return headerValue;
  }

  return null;
}

function ensureCsrfCookie(req: Request, res: Response): string {
  const existingToken = typeof req.cookies?.[CSRF_COOKIE_NAME] === 'string' ? (req.cookies as Record<string, string>)[CSRF_COOKIE_NAME] : '';

  if (existingToken) {
    return existingToken;
  }

  const newToken = crypto.randomBytes(SECURITY_CONFIG.CSRF.TOKEN_LENGTH).toString('hex');
  res.cookie(CSRF_COOKIE_NAME, newToken, SECURITY_CONFIG.CSRF.COOKIE_OPTIONS);
  return newToken;
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  const method = req.method?.toUpperCase() ?? 'GET';
  const token = ensureCsrfCookie(req, res);

  res.locals.csrfToken = token;
  res.setHeader('X-CSRF-Token', token);

  if (SAFE_METHODS.has(method)) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  // Skip CSRF check for pure Bearer token clients (CLI integrations)
  // 对使用 Bearer Token 的纯 API 客户端跳过 CSRF 校验（例如 CLI 集成）
  if (authHeader && typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    next();
    return;
  }

  const headerToken = extractHeaderToken(req);
  const bodyToken = typeof (req.body as Record<string, unknown> | undefined)?.csrfToken === 'string' ? (req.body as Record<string, string>).csrfToken : null;
  const requestToken = headerToken || bodyToken;

  if (!requestToken || requestToken !== token) {
    res.status(403).json({ success: false, error: 'Invalid CSRF token' });
    return;
  }

  next();
}

export function getCsrfCookieName(): string {
  return CSRF_COOKIE_NAME;
}

export function getCsrfHeaderName(): string {
  return CSRF_HEADER_NAME;
}
