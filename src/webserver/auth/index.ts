/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 认证模块统一导出入口
 * Authentication module unified export entry
 *
 * 目录结构 / Directory Structure:
 * - middleware/   : 中间件层，处理请求验证和拦截
 * - repository/   : 数据访问层，负责数据存储和查询
 * - service/      : 业务逻辑层，核心认证功能
 */

// 中间件 / Middleware
export { AuthMiddleware } from './middleware/AuthMiddleware';
export { TokenMiddleware, TokenUtils, createAuthMiddleware } from './middleware/TokenMiddleware';
export type { TokenPayload } from './middleware/TokenMiddleware';

// 仓储层 / Repository
export { UserRepository } from './repository/UserRepository';
export { RateLimitStore } from './repository/RateLimitStore';
export type { AuthUser } from './repository/UserRepository';

// 服务层 / Service
export { AuthService } from './service/AuthService';
