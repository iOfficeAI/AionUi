/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Simple in-memory rate limiter middleware without external dependencies
 * 简单的内存速率限制中间件，无需外部依赖
 */

import type { Request, Response, NextFunction } from 'express';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds / 时间窗口（毫秒）
  max: number; // Max requests per window / 每个窗口最大请求数
  message?: string; // Custom error message / 自定义错误消息
  keyGenerator?: (req: Request) => string; // Custom key generator / 自定义key生成器
  skipSuccessfulRequests?: boolean; // Skip counting successful requests / 跳过成功请求计数
  skip?: (req: Request) => boolean; // Function to skip certain requests / 跳过特定请求的函数
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

type RateLimitMiddleware = ((req: Request, res: Response, next: NextFunction) => void) & {
  destroy: () => void;
};

/**
 * In-memory store for rate limit tracking
 * 内存存储用于速率限制跟踪
 */
class RateLimitStore {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 60 seconds / 每60秒清理过期条目
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  get(key: string): RateLimitEntry | undefined {
    return this.store.get(key);
  }

  set(key: string, value: RateLimitEntry): void {
    this.store.set(key, value);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

/**
 * Create a rate limiter middleware
 * 创建速率限制中间件
 */
export function createRateLimiter(config: RateLimitConfig): RateLimitMiddleware {
  const { windowMs, max, message = 'Too many requests, please try again later', keyGenerator = (req: Request) => req.ip || req.socket.remoteAddress || 'unknown', skipSuccessfulRequests = false, skip = () => false } = config;

  const store = new RateLimitStore();

  const middleware: RateLimitMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    // Skip if configured to skip / 如果配置跳过则跳过
    if (skip(req)) {
      return next();
    }

    const key = keyGenerator(req);
    const now = Date.now();

    let entry = store.get(key);

    // Initialize or reset if window expired / 初始化或重置如果窗口已过期
    if (!entry || now > entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + windowMs,
      };
    }

    // Increment request count / 增加请求计数
    entry.count++;
    store.set(key, entry);

    // Set rate limit headers / 设置速率限制头
    res.setHeader('X-RateLimit-Limit', max.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count).toString());
    res.setHeader('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());

    // Check if limit exceeded / 检查是否超过限制
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetTime - now) / 1000).toString());
      res.status(429).json({
        error: message,
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      });
      return;
    }

    // If skipSuccessfulRequests is true, decrement on successful response
    // 如果skipSuccessfulRequests为true，在成功响应时递减
    if (skipSuccessfulRequests) {
      res.on('finish', () => {
        if (res.statusCode < 400) {
          const currentEntry = store.get(key);
          if (currentEntry) {
            currentEntry.count = Math.max(0, currentEntry.count - 1);
            store.set(key, currentEntry);
          }
        }
      });
    }

    next();
  };

  // Add cleanup method / 添加清理方法
  middleware.destroy = () => store.destroy();

  return middleware;
}

/**
 * Predefined rate limiters for common use cases
 * 常见用例的预定义速率限制器
 */

// Authentication endpoints - strict limit / 认证端点 - 严格限制
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes / 15分钟
  max: 5, // 5 attempts per window / 每个窗口5次尝试
  message: 'Too many authentication attempts, please try again later',
  skipSuccessfulRequests: true, // Don't count successful logins / 不计算成功登录
});

// API endpoints - moderate limit / API端点 - 中等限制
export const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute / 1分钟
  max: 60, // 60 requests per minute / 每分钟60次请求
  message: 'Too many API requests, please slow down',
});

// File operations - moderate limit / 文件操作 - 中等限制
export const fileOperationLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute / 1分钟
  max: 30, // 30 operations per minute / 每分钟30次操作
  message: 'Too many file operations, please slow down',
});

// WebSocket/Streaming - lenient limit / WebSocket/流式传输 - 宽松限制
export const streamingLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute / 1分钟
  max: 120, // 120 requests per minute / 每分钟120次请求
  message: 'Too many streaming requests, please slow down',
});

// Authenticated user actions - protect sensitive endpoints / 已认证用户操作 - 保护敏感端点
export const authenticatedActionLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute / 1分钟
  max: 20, // 20 actions per minute / 每分钟20次操作
  message: 'Too many sensitive actions, please try again later',
  keyGenerator: (req) => {
    if (req.user?.id) {
      return `user:${req.user.id}`;
    }
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return `ip:${ip}`;
  },
});
