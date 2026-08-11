/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Request } from 'express';
import { WEBUI_DEFAULT_PORT } from '@/common/config/constants';

// CSRF token cookie/header identifiers (shared by server & WebUI)
// CSRF Token 的 Cookie / Header 名称（服务端与 WebUI 共享）
export const CSRF_COOKIE_NAME = 'aionui-csrf-token';
export const CSRF_HEADER_NAME = 'x-csrf-token';
/**
 * 集中配置管理
 * Centralized configuration management
 */

// 认证配置
export const AUTH_CONFIG = {
  // TOKEN 配置（Token configuration）
  TOKEN: {
    // 会话 JWT 过期时间（Session JWT expiry duration）
    SESSION_EXPIRY: '24h' as const,
    // WebSocket Token 过期时间 - 当前 WebSocket 复用 Web 登录 token，此配置保留用于未来可能的独立方案
    // WebSocket token expiry - Currently WebSocket reuses web login token, reserved for future independent token scheme
    WEBSOCKET_EXPIRY: '5m' as const,
    // Cookie 最大存活时间（Cookie max-age in milliseconds）
    COOKIE_MAX_AGE: 30 * 24 * 60 * 60 * 1000,
    // WebSocket Token 最大存活时间 - 当前未使用，保留用于未来可能的独立方案
    // WebSocket token max-age - Currently unused, reserved for future independent token scheme
    WEBSOCKET_TOKEN_MAX_AGE: 5 * 60,
  },

  // 速率限制配置（Rate limiting configuration）
  RATE_LIMIT: {
    // 登录最大尝试次数（Max login attempts）
    LOGIN_MAX_ATTEMPTS: 5,
    // 注册最大尝试次数（Max register attempts）
    REGISTER_MAX_ATTEMPTS: 3,
    // 限流时间窗口（Rate limit window in milliseconds）
    WINDOW_MS: 15 * 60 * 1000,
  },

  // 默认用户配置（Default user configuration）
  DEFAULT_USER: {
    // 默认管理员用户名（Default admin username）
    USERNAME: 'admin' as const,
  },

  // Cookie 配置（Cookie configuration）
  COOKIE: {
    // Cookie 名称（Cookie name）
    NAME: 'aionui-session' as const,
    OPTIONS: {
      // 仅允许 HTTP 访问 Cookie（httpOnly flag）
      httpOnly: true,
      // 生产环境下建议开启（secure flag, enable under HTTPS）
      secure: false,
      // 同站策略（SameSite strategy）
      sameSite: 'strict' as const,
    },
  },
} as const;

// WebSocket 配置
export const WEBSOCKET_CONFIG = {
  // 心跳发送间隔（Heartbeat interval in ms）
  HEARTBEAT_INTERVAL: 30000,
  // 心跳超时时间（Heartbeat timeout in ms）
  HEARTBEAT_TIMEOUT: 60000,
  CLOSE_CODES: {
    // 策略违规关闭码（Policy violation close code）
    POLICY_VIOLATION: 1008,
    // 正常关闭码（Normal close code）
    NORMAL_CLOSURE: 1000,
  },
} as const;

// 服务器配置
export const SERVER_CONFIG = {
  // 默认监听地址（Default listen host）
  DEFAULT_HOST: '127.0.0.1' as const,
  // 远程模式监听地址（Remote mode listen host）
  REMOTE_HOST: '0.0.0.0' as const,
  // 默认端口（Default port: 25808 for prod, 25809 for dev）
  DEFAULT_PORT: WEBUI_DEFAULT_PORT,
  // 请求体大小限制（Request body size limit）
  BODY_LIMIT: '10mb' as const,

  /**
   * 内部状态：当前服务器配置
   * Internal state: Current server configuration
   */
  _currentConfig: {
    host: '127.0.0.1' as string,
    port: WEBUI_DEFAULT_PORT as number,
    allowRemote: false as boolean,
  },

  /**
   * 设置服务器配置（在 webserver 启动时调用）
   * Set server configuration (called when webserver starts)
   */
  setServerConfig(port: number, allowRemote: boolean): void {
    this._currentConfig.port = port;
    this._currentConfig.host = allowRemote ? '0.0.0.0' : '127.0.0.1';
    this._currentConfig.allowRemote = allowRemote;
  },

  /**
   * 检查是否为远程访问模式
   * Check if remote access mode is enabled
   */
  get isRemoteMode(): boolean {
    return this._currentConfig.allowRemote;
  },

  /**
   * 获取 URL 解析基础地址
   * Get base URL for URL parsing
   * 优先级：环境变量 > 当前服务器配置 > 默认值
   * Priority: Environment variable > Current server config > Default
   */
  get BASE_URL(): string {
    if (process.env.SERVER_BASE_URL) {
      return process.env.SERVER_BASE_URL;
    }

    const host = this._currentConfig.host === '0.0.0.0' ? '127.0.0.1' : this._currentConfig.host;
    return `http://${host}:${this._currentConfig.port}`;
  },
} as const;

/**
 * 判断请求是否通过 HTTPS 到达（包含反向代理场景）
 * Determine whether the request arrived over HTTPS (reverse-proxy aware)
 *
 * 信号来源（按优先级）：
 * 1. AIONUI_HTTPS=true 或 NODE_ENV=production + HTTPS=true（显式开关）
 * 2. SERVER_BASE_URL 以 https:// 开头（显式配置公网入口为 HTTPS，例如 nginx TLS 终止）
 * 3. req.secure === true（Express 通过 app.set('trust proxy', ...) 启用后生效）
 *
 * 注意：故意不读 X-Forwarded-Proto 头，因为在未配置 trust proxy 的情况下该头可被
 * 客户端伪造。若需要识别反代的 HTTPS 来源，请改为显式设置 SERVER_BASE_URL
 * 或在 Express 层配置 trust proxy 让 req.secure 正确反映。
 *
 * Signals (by priority):
 * 1. AIONUI_HTTPS=true / NODE_ENV=production + HTTPS=true (explicit opt-in)
 * 2. SERVER_BASE_URL starts with https:// (explicit public entrypoint, e.g. nginx TLS)
 * 3. req.secure === true (only meaningful once Express trust proxy is configured)
 *
 * X-Forwarded-Proto is intentionally NOT read directly: without trust proxy it
 * would be spoofable. Use SERVER_BASE_URL or trust proxy + req.secure instead.
 */
function detectHttps(req?: Request): boolean {
  if (process.env.AIONUI_HTTPS === 'true' || (process.env.NODE_ENV === 'production' && process.env.HTTPS === 'true')) {
    return true;
  }

  if (process.env.SERVER_BASE_URL?.startsWith('https://')) {
    return true;
  }

  if (req?.secure) {
    return true;
  }

  return false;
}

/**
 * 获取动态 Cookie 选项（根据 HTTPS 配置与请求协议决定 secure/sameSite）
 * Get dynamic cookie options (secure/sameSite driven by HTTPS config + request protocol)
 *
 * 传入 req 时，会同时检查 X-Forwarded-Proto 头与 Express req.secure，以便在
 * nginx TLS 终止 + 后端 HTTP 的反代部署下也能正确下发 Secure cookie。
 * When req is provided, X-Forwarded-Proto and req.secure are honoured so that
 * deployments with TLS-terminating reverse proxies (nginx) issue Secure cookies.
 *
 * 不传 req 时退回到环境变量判断，保持与旧调用点（无请求上下文的地方）兼容。
 * When req is omitted, falls back to env-var detection for callers without a request context.
 */
export function getCookieOptions(req?: Request): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  maxAge?: number;
} {
  const isHttps = detectHttps(req);

  // HTTPS 场景下使用 SameSite=None 以支持跨域反向代理（需要同时设置 Secure=true）
  // HTTP 远程模式使用 lax，允许从其它 IP 访问同一后端
  // 本地 HTTP 保持 strict，最大程度限制第三方站点
  // HTTPS deployments use SameSite=None to support cross-origin reverse proxies (requires Secure=true)
  // Remote HTTP mode uses 'lax' to allow access from other IPs
  // Local HTTP stays on 'strict' to minimize third-party exposure
  let sameSite: 'strict' | 'lax' | 'none';
  if (isHttps) {
    sameSite = 'none';
  } else if (SERVER_CONFIG.isRemoteMode) {
    sameSite = 'lax';
  } else {
    sameSite = AUTH_CONFIG.COOKIE.OPTIONS.sameSite;
  }

  return {
    httpOnly: AUTH_CONFIG.COOKIE.OPTIONS.httpOnly,
    // HTTP 环境下 secure=false，允许 cookie 在非 HTTPS 连接中工作
    // In HTTP environment secure=false, allows cookies to work over non-HTTPS connections
    secure: isHttps,
    sameSite,
  };
}

// 安全配置
export const SECURITY_CONFIG = {
  HEADERS: {
    // 防点击劫持策略（Clickjacking protection）
    FRAME_OPTIONS: 'DENY',
    // 禁止 MIME 嗅探（No MIME sniffing）
    CONTENT_TYPE_OPTIONS: 'nosniff',
    // XSS 保护策略（XSS protection header）
    XSS_PROTECTION: '1; mode=block',
    // Referrer 策略（Referrer policy）
    REFERRER_POLICY: 'strict-origin-when-cross-origin',
    // 开发环境 CSP（Content-Security-Policy for development）
    CSP_DEV:
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' ws: wss: blob:; media-src 'self' blob:;",
    // 生产环境 CSP（Content-Security-Policy for production）
    CSP_PROD:
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' ws: wss: blob:; media-src 'self' blob:;",
  },
  CSRF: {
    COOKIE_NAME: CSRF_COOKIE_NAME,
    HEADER_NAME: CSRF_HEADER_NAME,
    TOKEN_LENGTH: 32,
    COOKIE_OPTIONS: {
      httpOnly: false,
      sameSite: 'strict' as const,
      secure: false,
      path: '/',
    },
  },
} as const;
