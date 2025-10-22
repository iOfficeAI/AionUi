/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@/webserver/config/constants';

// Read cookie by name in browser environment
// 在浏览器环境中根据名称读取指定 Cookie
function readCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookieString = document.cookie;
  if (!cookieString) {
    return null;
  }

  const cookies = cookieString.split(';');
  for (const cookie of cookies) {
    const [rawName, ...rawValueParts] = cookie.trim().split('=');
    if (rawName === name) {
      return decodeURIComponent(rawValueParts.join('='));
    }
  }

  return null;
}

// Retrieve current CSRF token from cookie (if present)
// 从 Cookie 中获取当前的 CSRF Token（若不存在则返回 null）
export function getCsrfToken(): string | null {
  return readCookie(CSRF_COOKIE_NAME);
}

// Attach CSRF token to request headers, keeping original headers untouched when token missing
// 将 CSRF Token 写入请求头，若 Token 不存在则保持原始请求头不变
export function withCsrfHeader(headers: HeadersInit = {}): HeadersInit {
  const token = getCsrfToken();
  if (!token) {
    return headers;
  }

  if (headers instanceof Headers) {
    headers.set(CSRF_HEADER_NAME, token);
    return headers;
  }

  if (Array.isArray(headers)) {
    // [[name, value]] format
    const normalized = headers.filter(([name]) => name.toLowerCase() !== CSRF_HEADER_NAME.toLowerCase());
    normalized.push([CSRF_HEADER_NAME, token]);
    return normalized;
  }

  if (typeof headers === 'object' && headers !== null) {
    const plainHeaders: Record<string, string> = { ...(headers as Record<string, string>) };
    plainHeaders[CSRF_HEADER_NAME] = token;
    return plainHeaders;
  }

  return headers;
}

// Attach CSRF token to request body for tiny-csrf compatibility
// tiny-csrf expects token in req.body._csrf, not in headers
// 将 CSRF Token 附加到请求体以兼容 tiny-csrf
// tiny-csrf 期望从 req.body._csrf 读取 token，而不是从请求头
export function withCsrfToken<T = unknown>(body: T): T & { _csrf?: string } {
  const token = getCsrfToken();
  if (!token) {
    return body as T & { _csrf?: string };
  }

  // Handle different body types
  if (body === null || body === undefined) {
    return { _csrf: token } as T & { _csrf?: string };
  }

  if (typeof body === 'object' && !Array.isArray(body)) {
    return { ...body, _csrf: token };
  }

  // For non-object bodies (string, FormData, etc.), return as-is
  // The caller should handle adding _csrf manually for these cases
  return body as T & { _csrf?: string };
}
