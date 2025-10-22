/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, Request, Response } from 'express';
import { AuthService } from '@/webserver/auth/service/AuthService';
import { AuthMiddleware } from '@/webserver/auth/middleware/AuthMiddleware';
import { UserRepository } from '@/webserver/auth/repository/UserRepository';
import { AUTH_CONFIG } from '../config/constants';
import { TokenUtils } from '@/webserver/auth/middleware/TokenMiddleware';
import { createAppError } from '../middleware/errorHandler';
import { authRateLimiter, authenticatedActionLimiter, apiRateLimiter } from '../middleware/security';

/**
 * 注册认证相关路由
 * Register authentication routes
 */
export function registerAuthRoutes(app: Express): void {
  /**
   * 用户登录 - Login endpoint
   * POST /login
   */
  // Login attempts are strictly rate limited to defend against brute force
  // 登录尝试严格限流，防止暴力破解
  app.post('/login', authRateLimiter, AuthMiddleware.validateLoginInput, async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      // Get user from database
      const user = UserRepository.findByUsername(username);
      if (!user) {
        // Use constant time verification to prevent timing attacks
        await AuthService.constantTimeVerify('dummy', 'dummy', true);
        res.status(401).json({
          success: false,
          message: 'Invalid username or password',
        });
        return;
      }

      // Verify password with constant time
      const isValidPassword = await AuthService.constantTimeVerify(password, user.password_hash, true);
      if (!isValidPassword) {
        res.status(401).json({
          success: false,
          message: 'Invalid username or password',
        });
        return;
      }

      // Generate JWT token
      const token = AuthService.generateToken(user);

      // Update last login
      UserRepository.updateLastLogin(user.id);

      // Set secure cookie
      res.cookie(AUTH_CONFIG.COOKIE.NAME, token, {
        ...AUTH_CONFIG.COOKIE.OPTIONS,
        maxAge: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE,
      });

      res.json({
        success: true,
        message: 'Login successful',
        user: {
          id: user.id,
          username: user.username,
        },
        token,
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  /**
   * 用户登出 - Logout endpoint
   * POST /logout
   */
  // Authenticated endpoints reuse shared limiter keyed by user/IP
  // 已登录接口复用按用户/IP 计数的限流器
  app.post('/logout', apiRateLimiter, AuthMiddleware.authenticateToken, authenticatedActionLimiter, (_req: Request, res: Response) => {
    res.clearCookie(AUTH_CONFIG.COOKIE.NAME);
    res.json({ success: true, message: 'Logged out successfully' });
  });

  /**
   * 获取认证状态 - Get authentication status
   * GET /api/auth/status
   */
  // Rate limit auth status endpoint to prevent enumeration
  // 为认证状态端点添加速率限制以防止枚举攻击
  app.get('/api/auth/status', apiRateLimiter, (_req: Request, res: Response) => {
    try {
      const hasUsers = UserRepository.hasUsers();
      const userCount = UserRepository.countUsers();

      res.json({
        success: true,
        needsSetup: !hasUsers,
        userCount,
        isAuthenticated: false, // Will be determined by frontend based on token
      });
    } catch (error) {
      console.error('Auth status error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * 获取当前用户信息 - Get current user (protected route)
   * GET /api/auth/user
   */
  // Add rate limiting for authenticated user info endpoint
  // 为已认证用户信息端点添加速率限制
  app.get('/api/auth/user', apiRateLimiter, AuthMiddleware.authenticateToken, authenticatedActionLimiter, (req: Request, res: Response) => {
    res.json({
      success: true,
      user: req.user,
    });
  });

  /**
   * 修改密码 - Change password endpoint (protected route)
   * POST /api/auth/change-password
   */
  app.post('/api/auth/change-password', apiRateLimiter, AuthMiddleware.authenticateToken, authenticatedActionLimiter, async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        res.status(400).json({
          success: false,
          error: 'Current password and new password are required',
        });
        return;
      }

      // Validate new password strength
      const passwordValidation = AuthService.validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        res.status(400).json({
          success: false,
          error: 'New password does not meet security requirements',
          details: passwordValidation.errors,
        });
        return;
      }

      // Get current user
      const user = UserRepository.findById(req.user!.id);
      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      // Verify current password
      const isValidPassword = await AuthService.verifyPassword(currentPassword, user.password_hash);
      if (!isValidPassword) {
        res.status(401).json({
          success: false,
          error: 'Current password is incorrect',
        });
        return;
      }

      // Hash new password
      const newPasswordHash = await AuthService.hashPassword(newPassword);

      // Update password
      UserRepository.updatePassword(user.id, newPasswordHash);
      AuthService.invalidateAllTokens();

      res.json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * Token 刷新 - Token refresh endpoint
   * POST /api/auth/refresh
   */
  app.post('/api/auth/refresh', apiRateLimiter, authenticatedActionLimiter, (req: Request, res: Response) => {
    try {
      const { token } = req.body;

      if (!token) {
        res.status(400).json({
          success: false,
          error: 'Token is required',
        });
        return;
      }

      const newToken = AuthService.refreshToken(token);
      if (!newToken) {
        res.status(401).json({
          success: false,
          error: 'Invalid or expired token',
        });
        return;
      }

      res.json({
        success: true,
        token: newToken,
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * 生成 WebSocket Token - Generate WebSocket token
   * GET /api/ws-token
   *
   * 注意：现在 WebSocket 直接复用主 token，此接口返回主 token 以保持向后兼容
   * Note: WebSocket now reuses the main token, this endpoint returns the main token for backward compatibility
   */
  // Rate limit WebSocket token endpoint
  // 为 WebSocket token 端点添加速率限制
  app.get('/api/ws-token', apiRateLimiter, authenticatedActionLimiter, (req: Request, res: Response, next) => {
    try {
      const sessionToken = TokenUtils.extractFromRequest(req);

      if (!sessionToken) {
        return next(createAppError('Unauthorized: Invalid or missing session', 401, 'unauthorized'));
      }

      const decoded = AuthService.verifyToken(sessionToken);
      if (!decoded) {
        return next(createAppError('Unauthorized: Invalid session token', 401, 'unauthorized'));
      }

      const user = UserRepository.findById(decoded.userId);
      if (!user) {
        return next(createAppError('Unauthorized: User not found', 401, 'unauthorized'));
      }

      // 直接返回主 token，不再生成单独的 WebSocket token
      res.json({
        success: true,
        wsToken: sessionToken, // 复用主 token
        expiresIn: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE, // 使用主 token 的过期时间
      });
    } catch (error) {
      next(error);
    }
  });
}

export default registerAuthRoutes;
