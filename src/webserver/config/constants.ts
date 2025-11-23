/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

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
  // 默认端口（Default port）
  DEFAULT_PORT: 25808,
  // 请求体大小限制（Request body size limit）
  BODY_LIMIT: '10mb' as const,

  /**
   * 内部状态：当前服务器配置
   * Internal state: Current server configuration
   */
  _currentConfig: {
    host: '127.0.0.1' as string,
    port: 25808 as number,
  },

  /**
   * 设置服务器配置（在 webserver 启动时调用）
   * Set server configuration (called when webserver starts)
   */
  setServerConfig(port: number, allowRemote: boolean): void {
    this._currentConfig.port = port;
    this._currentConfig.host = allowRemote ? '0.0.0.0' : '127.0.0.1';
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
    CSP_DEV: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' ws: wss: blob:; media-src 'self' blob:;",
    // 生产环境 CSP（Content-Security-Policy for production）
    CSP_PROD: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' ws: wss: blob:; media-src 'self' blob:;",
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
