/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Request, Response, NextFunction } from 'express';
import { AuthService } from './AuthService';
import AionDatabase from '../database';
import { RateLimitStore } from './RateLimitStore';

// Express Request type extension is defined in src/types/express.d.ts

export class AuthMiddleware {
  private static rateLimitStore: RateLimitStore = new RateLimitStore();
  private static readonly RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
  private static readonly MAX_LOGIN_ATTEMPTS = 5;
  private static readonly MAX_REGISTER_ATTEMPTS = 3;

  // JWT authentication middleware
  public static async authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

      if (!token) {
        res.status(401).json({
          success: false,
          error: 'Access denied. No token provided.',
        });
        return;
      }

      const decoded = AuthService.verifyToken(token);
      if (!decoded) {
        res.status(403).json({
          success: false,
          error: 'Invalid or expired token.',
        });
        return;
      }

      // Verify user still exists in database
      const db = AionDatabase.getInstance();
      const user = db.getUserById(decoded.userId);
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User not found.',
        });
        return;
      }

      req.user = {
        id: user.id,
        username: user.username,
      };

      next();
    } catch (error) {
      console.error('Authentication error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error.',
      });
    }
  }

  // Rate limiting middleware
  public static rateLimitMiddleware(action: 'login' | 'register') {
    return (req: Request, res: Response, next: NextFunction): void => {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const key = AuthService.createRateLimitKey(ip, action);
      const now = Date.now();

      const limit = action === 'login' ? this.MAX_LOGIN_ATTEMPTS : this.MAX_REGISTER_ATTEMPTS;
      const current = this.rateLimitStore.get(key);

      if (!current) {
        this.rateLimitStore.set(key, {
          count: 1,
          resetTime: now + this.RATE_LIMIT_WINDOW,
        });
        next();
        return;
      }

      if (now > current.resetTime) {
        // Reset the counter
        this.rateLimitStore.set(key, {
          count: 1,
          resetTime: now + this.RATE_LIMIT_WINDOW,
        });
        next();
        return;
      }

      if (current.count >= limit) {
        const resetIn = Math.ceil((current.resetTime - now) / 1000 / 60); // minutes
        res.status(429).json({
          success: false,
          error: `Too many ${action} attempts. Try again in ${resetIn} minutes.`,
          retryAfter: resetIn * 60, // seconds
        });
        return;
      }

      current.count++;
      this.rateLimitStore.set(key, current);
      next();
    };
  }

  // CORS middleware for development
  public static corsMiddleware(req: Request, res: Response, next: NextFunction): void {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }

    next();
  }

  // Security headers middleware
  public static securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
    // Prevent clickjacking
    res.header('X-Frame-Options', 'DENY');

    // Prevent MIME type sniffing
    res.header('X-Content-Type-Options', 'nosniff');

    // Enable XSS protection
    res.header('X-XSS-Protection', '1; mode=block');

    // Referrer policy
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Content Security Policy (relaxed in development for webpack-dev-server)
    const isDevelopment = process.env.NODE_ENV === 'development';
    const cspPolicy = isDevelopment ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws: wss:;" : "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';";

    res.header('Content-Security-Policy', cspPolicy);

    next();
  }

  // Request logging middleware
  public static requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    const ip = req.ip || req.connection.remoteAddress || 'unknown';

    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${ip}`);

    // Log response time
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
    });

    next();
  }

  // Input validation middleware
  public static validateLoginInput(req: Request, res: Response, next: NextFunction): void {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({
        success: false,
        error: 'Username and password are required.',
      });
      return;
    }

    if (typeof username !== 'string' || typeof password !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Username and password must be strings.',
      });
      return;
    }

    // Basic length checks
    if (username.length > 32 || password.length > 128) {
      res.status(400).json({
        success: false,
        error: 'Invalid input length.',
      });
      return;
    }

    next();
  }

  public static validateRegisterInput(req: Request, res: Response, next: NextFunction): void {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({
        success: false,
        error: 'Username and password are required.',
      });
      return;
    }

    // Validate username
    const usernameValidation = AuthService.validateUsername(username);
    if (!usernameValidation.isValid) {
      res.status(400).json({
        success: false,
        error: 'Invalid username.',
        details: usernameValidation.errors,
      });
      return;
    }

    // Validate password strength
    const passwordValidation = AuthService.validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      res.status(400).json({
        success: false,
        error: 'Password does not meet security requirements.',
        details: passwordValidation.errors,
      });
      return;
    }

    next();
  }

  // Clear rate limit for IP (useful for testing or admin reset)
  public static clearRateLimit(ip: string, action?: string): void {
    this.rateLimitStore.clearByIp(ip, action);
  }
}

export default AuthMiddleware;
