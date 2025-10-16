/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Request, Response, NextFunction } from 'express';
import type { IncomingMessage } from 'http';
import { AuthService } from '../service/AuthService';
import { UserRepository } from '../repository/UserRepository';
import { AUTH_CONFIG, SERVER_CONFIG } from '../../config/constants';

/**
 * Token 负载接口
 * Token payload interface
 */
export interface TokenPayload {
  userId: string;
  username: string;
}

/**
 * Token 提取器 - 从请求中提取认证 token
 * Token Extractor - Extract authentication token from request
 */
class TokenExtractor {
  /**
   * 从请求中提取 token，支持多种来源：
   * 1. Authorization header (Bearer token)
   * 2. Cookie (aionui-session)
   * 3. Query parameter (token)
   *
   * Extract token from request, supporting multiple sources:
   * 1. Authorization header (Bearer token)
   * 2. Cookie (aionui-session)
   * 3. Query parameter (token)
   *
   * @param req - Express 请求对象 / Express request object
   * @returns Token 字符串或 null / Token string or null
   */
  static extract(req: Request): string | null {
    // 1. 尝试从 Authorization header 提取 / Try to extract from Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // 2. 尝试从 Cookie 提取 / Try to extract from Cookie
    if (typeof req.cookies === 'object' && req.cookies) {
      const cookieToken = req.cookies[AUTH_CONFIG.COOKIE.NAME];
      if (typeof cookieToken === 'string' && cookieToken.trim() !== '') {
        return cookieToken;
      }
    }

    // 3. 尝试从 Query 参数提取 / Try to extract from Query parameter
    if (typeof req.query?.token === 'string') {
      return req.query.token;
    }

    return null;
  }
}

/**
 * 验证策略接口 - 定义未授权处理方式
 * Validation Strategy Interface - Define unauthorized handling
 */
interface ValidationStrategy {
  handleUnauthorized(res: Response): void;
}

/**
 * JSON 验证策略 - 返回 JSON 格式的错误响应
 * JSON Validation Strategy - Return JSON format error response
 */
class JsonValidationStrategy implements ValidationStrategy {
  handleUnauthorized(res: Response): void {
    res.status(403).json({ success: false, error: 'Access denied. Please login first.' });
  }
}

/**
 * HTML 验证策略 - 返回 HTML 格式的错误响应
 * HTML Validation Strategy - Return HTML format error response
 */
class HtmlValidationStrategy implements ValidationStrategy {
  handleUnauthorized(res: Response): void {
    res.status(403).send('Access Denied');
  }
}

/**
 * 验证器工厂 - 根据类型创建相应的验证策略
 * Validator Factory - Create validation strategy based on type
 */
class ValidatorFactory {
  /**
   * 创建验证策略
   * Create validation strategy
   * @param type - 策略类型 (json 或 html) / Strategy type (json or html)
   * @returns 验证策略实例 / Validation strategy instance
   */
  static create(type: 'json' | 'html'): ValidationStrategy {
    if (type === 'html') {
      return new HtmlValidationStrategy();
    }
    return new JsonValidationStrategy();
  }
}

/**
 * 创建认证中间件
 * Create authentication middleware
 *
 * 该中间件执行以下步骤：
 * 1. 从请求中提取 token
 * 2. 验证 token 有效性
 * 3. 查找用户信息
 * 4. 将用户信息附加到请求对象
 *
 * This middleware performs the following steps:
 * 1. Extract token from request
 * 2. Verify token validity
 * 3. Find user information
 * 4. Attach user info to request object
 *
 * @param type - 响应类型 (json 或 html) / Response type (json or html)
 * @returns Express 中间件函数 / Express middleware function
 */
export const createAuthMiddleware = (type: 'json' | 'html' = 'json') => {
  const strategy = ValidatorFactory.create(type);

  return (req: Request, res: Response, next: NextFunction): void => {
    // 1. 提取 token / Extract token
    const token = TokenExtractor.extract(req);

    if (!token) {
      strategy.handleUnauthorized(res);
      return;
    }

    // 2. 验证 token / Verify token
    const decoded = AuthService.verifyToken(token);
    if (!decoded) {
      strategy.handleUnauthorized(res);
      return;
    }

    // 3. 查找用户 / Find user
    const user = UserRepository.findById(decoded.userId);
    if (!user) {
      strategy.handleUnauthorized(res);
      return;
    }

    // 4. 附加用户信息到请求对象 / Attach user info to request object
    req.user = {
      id: user.id,
      username: user.username,
    };

    next();
  };
};

/**
 * Token 工具类 - 提供 token 相关的辅助方法
 * Token Utils - Provide token related helper methods
 */
export const TokenUtils = {
  /**
   * 从请求中提取 token
   * Extract token from request
   * @param req - Express 请求对象 / Express request object
   * @returns Token 字符串或 null / Token string or null
   */
  extractFromRequest(req: Request): string | null {
    return TokenExtractor.extract(req);
  },
};

/**
 * TokenMiddleware 工具类 - 提供统一的 Token 认证接口
 * TokenMiddleware Utility - Provides unified token authentication interface
 */
export const TokenMiddleware = {
  /** 从请求中提取 token / Extract token from request */
  extractToken(req: Request): string | null {
    return TokenExtractor.extract(req);
  },

  /** 校验 token 是否有效 / Verify token validity */
  isTokenValid(token: string | null): boolean {
    return Boolean(token && AuthService.verifyToken(token));
  },

  /** 返回认证中间件（默认为 JSON 响应）/ Return auth middleware (JSON response by default) */
  validateToken(options?: { responseType?: 'json' | 'html' }): (req: Request, res: Response, next: NextFunction) => void {
    return createAuthMiddleware(options?.responseType ?? 'json');
  },

  /** 从 WebSocket 请求中提取 token / Extract token from WebSocket request */
  extractWebSocketToken(req: IncomingMessage): string | null {
    // 1. 从 Authorization header 提取
    const authHeader = req.headers['authorization'];
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // 2. 从 Cookie 提取 (WebUI 模式)
    const cookieHeader = req.headers['cookie'];
    if (typeof cookieHeader === 'string') {
      const cookies = cookieHeader.split(';').reduce(
        (acc, cookie) => {
          const [key, value] = cookie.trim().split('=');
          if (key && value) {
            acc[key] = decodeURIComponent(value);
          }
          return acc;
        },
        {} as Record<string, string>
      );

      const cookieToken = cookies[AUTH_CONFIG.COOKIE.NAME];
      if (cookieToken) {
        return cookieToken;
      }
    }

    // 3. 从 sec-websocket-protocol 提取
    const protocolHeader = req.headers['sec-websocket-protocol'];
    if (typeof protocolHeader === 'string' && protocolHeader.trim() !== '') {
      return protocolHeader.split(',')[0]?.trim() ?? null;
    }

    // 4. 从 URL query 参数提取
    if (req.url) {
      const url = new URL(req.url, SERVER_CONFIG.BASE_URL);
      const token = url.searchParams.get('token');
      if (token) {
        return token;
      }
    }

    return null;
  },

  /** 校验 WebSocket token 是否有效 / Validate WebSocket token */
  validateWebSocketToken(token: string | null): boolean {
    return Boolean(token && AuthService.verifyWebSocketToken(token));
  },
};
