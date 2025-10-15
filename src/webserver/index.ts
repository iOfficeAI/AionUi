/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { shell } from 'electron';
import path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import os from 'os';
import fs from 'fs';
import { AuthService } from '../auth/service/AuthService';
import { AuthMiddleware } from '../auth/middleware/AuthMiddleware';
import { createAuthMiddleware, TokenUtils } from '../auth/middleware/TokenMiddleware';
import { UserRepository } from '../auth/repository/UserRepository';
import { AUTH_CONFIG, SERVER_CONFIG } from '../config/constants';
import { initWebAdapter } from './adapter';
import directoryApi from './directoryApi';
import { errorHandler, createAppError } from './middleware/errorHandler';
import { LoginPage } from './views/pages/login';

// Express Request type extension is defined in src/types/express.d.ts

const DEFAULT_ADMIN_USERNAME = AUTH_CONFIG.DEFAULT_USER.USERNAME;

export async function startWebServer(port: number, allowRemote = false): Promise<void> {
  // 设置服务器配置，用于生成正确的 BASE_URL
  // Set server configuration for generating correct BASE_URL
  SERVER_CONFIG.setServerConfig(port, allowRemote);

  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  const requireJsonAuth = createAuthMiddleware('json');
  const requireHtmlAuth = createAuthMiddleware('html');

  let initialCredentials: { username: string; password: string } | null = null;

  if (!UserRepository.hasUsers()) {
    const username = DEFAULT_ADMIN_USERNAME;
    const password = AuthService.generateRandomPassword();

    try {
      const hashedPassword = await AuthService.hashPassword(password);
      UserRepository.createUser(username, hashedPassword);
      initialCredentials = { username, password };
    } catch (error) {
      console.error('❌ 创建默认管理员账户失败:', error);
    }
  }

  // 基础中间件
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // 安全中间件
  app.use(AuthMiddleware.securityHeadersMiddleware);
  app.use(AuthMiddleware.requestLoggingMiddleware);

  // CORS 设置
  if (allowRemote) {
    app.use(
      cors({
        origin: true, // Allow all origins when remote is enabled
        credentials: true,
      })
    );
  } else {
    app.use(
      cors({
        origin: [`http://localhost:${port}`, `http://127.0.0.1:${port}`],
        credentials: true,
      })
    );
  }

  // 静态文件服务 (Webpack 构建的 React 应用)
  const rendererPath = path.join(__dirname, '../../.webpack/renderer');
  const indexHtmlPath = path.join(rendererPath, 'main_window/index.html');

  // 处理登录请求 - 只支持用户名密码登录
  app.post('/login', AuthMiddleware.rateLimitMiddleware('login'), AuthMiddleware.validateLoginInput, async (req, res, next) => {
    try {
      const { username, password } = req.body;

      // Get user from database
      const user = UserRepository.findByUsername(username);
      if (!user) {
        // Use constant time verification to prevent timing attacks
        await AuthService.constantTimeVerify('dummy', 'dummy', true);
        return next(createAppError('Invalid username or password', 401, 'invalid_credentials'));
      }

      // Verify password with constant time
      const isValidPassword = await AuthService.constantTimeVerify(password, user.password_hash, true);
      if (!isValidPassword) {
        return next(createAppError('Invalid username or password', 401, 'invalid_credentials'));
      }

      // Generate JWT token
      const token = AuthService.generateToken(user);

      // Update last login
      UserRepository.updateLastLogin(user.id);

      // 设置安全cookie
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
      next(error);
    }
  });

  // 生成临时 WebSocket Token（短期有效，仅用于 WebSocket 连接）
  // Generate temporary WebSocket token (short-lived, only for WebSocket connection)
  app.get('/api/ws-token', (req, res, next) => {
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

      const wsToken = AuthService.generateWebSocketToken({ id: user.id, username: user.username }, '5m');

      res.json({
        success: true,
        wsToken,
        expiresIn: 300,
      });
    } catch (error) {
      next(error);
    }
  });

  // 特殊处理主页HTML - 检查cookie或显示登录页面
  app.get('/', (req, res, next) => {
    try {
      // 禁用缓存，确保每次都检查最新的认证状态 / Disable cache to ensure fresh auth check
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const sessionToken = TokenUtils.extractFromRequest(req);

      if (sessionToken) {
        const decoded = AuthService.verifyToken(sessionToken);
        if (!decoded) {
          res.clearCookie(AUTH_CONFIG.COOKIE.NAME);
        } else {
          const user = UserRepository.findById(decoded.userId);
          if (user) {
            const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
            res.setHeader('Content-Type', 'text/html');
            res.send(htmlContent);
            return;
          }
          res.clearCookie(AUTH_CONFIG.COOKIE.NAME);
        }
      }

      // 显示美观的登录页面
      res.send(LoginPage.render());
    } catch (error) {
      next(error);
    }
  });

  // 处理 favicon 请求
  app.get('/favicon.ico', (_req, res) => {
    res.status(204).end(); // No Content
  });

  // 处理子路径路由 (React Router)
  app.get(/^\/(?!api|static|main_window).*/, requireHtmlAuth, (req, res) => {
    try {
      const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

      // 直接返回 HTML，token 通过 httpOnly cookie 传递
      res.setHeader('Content-Type', 'text/html');
      res.send(htmlContent);
    } catch (error) {
      console.error('Error serving SPA route:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  // 静态资源 - 需要cookie验证
  app.use('/main_window.css', requireHtmlAuth, express.static(path.join(rendererPath, 'main_window.css')));
  app.use('/main_window', requireHtmlAuth, express.static(path.join(rendererPath, 'main_window')));
  app.use('/static', requireHtmlAuth, express.static(path.join(rendererPath, 'static')));

  // React Syntax Highlighter 语言包
  app.use(
    '/react-syntax-highlighter_languages_highlight_',
    requireHtmlAuth,
    express.static(rendererPath, {
      setHeaders: (res, path) => {
        if (path.includes('react-syntax-highlighter_languages_highlight_')) {
          res.setHeader('Content-Type', 'application/javascript');
        }
      },
    })
  );

  // API 路由 - 已被全局验证保护
  app.use('/api/directory', directoryApi);

  app.use('/api', requireJsonAuth, (_req, res) => {
    res.json({ message: 'API endpoint - bridge integration working' });
  });

  // WebSocket connection will be handled by initWebAdapter

  // 启动服务器
  // API 路由
  // Auth status endpoint
  app.get('/api/auth/status', (_req, res, next) => {
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
      next(error);
    }
  });

  // Get current user (protected route)
  app.get('/api/auth/user', AuthMiddleware.authenticateToken, (req, res) => {
    res.json({
      success: true,
      user: req.user,
    });
  });

  // Change password endpoint (protected route)
  app.post('/api/auth/change-password', AuthMiddleware.authenticateToken, async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return next(createAppError('Current password and new password are required', 400, 'validation_error'));
      }

      // Validate new password strength
      const passwordValidation = AuthService.validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        return res.status(400).json({
          success: false,
          error: 'New password does not meet security requirements',
          details: passwordValidation.errors,
        });
      }

      // Get current user
      const user = UserRepository.findById(req.user!.id);
      if (!user) {
        return next(createAppError('User not found', 404, 'not_found'));
      }

      // Verify current password
      const isValidPassword = await AuthService.verifyPassword(currentPassword, user.password_hash);
      if (!isValidPassword) {
        return next(createAppError('Current password is incorrect', 401, 'invalid_credentials'));
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
      next(error);
    }
  });

  // Token refresh endpoint
  app.post('/api/auth/refresh', (req, res, next) => {
    try {
      const { token } = req.body;

      if (!token) {
        return next(createAppError('Token is required', 400, 'validation_error'));
      }

      const newToken = AuthService.refreshToken(token);
      if (!newToken) {
        return next(createAppError('Invalid or expired token', 401, 'invalid_token'));
      }

      res.json({
        success: true,
        token: newToken,
      });
    } catch (error) {
      next(error);
    }
  });

  // 添加登出路由
  app.post('/logout', AuthMiddleware.authenticateToken, (_req, res) => {
    res.clearCookie(AUTH_CONFIG.COOKIE.NAME);
    res.json({ success: true, message: 'Logged out successfully' });
  });

  // 全局错误处理
  app.use(errorHandler);

  return new Promise((resolve, reject) => {
    const host = allowRemote ? '0.0.0.0' : '127.0.0.1';
    server.listen(port, host, () => {
      const localUrl = `http://localhost:${port}`;

      console.log(`🚀 AionUi WebUI started on ${localUrl}`);

      if (initialCredentials) {
        console.log('👤 已创建默认管理员账户（首次启动）');
        console.log(`   Username: ${initialCredentials.username}`);
        console.log(`   Password: ${initialCredentials.password}`);
        console.log('⚠️  请立即登录 WebUI 并在“修改密码”中更新此密码。');
      } else {
        const primaryUser = UserRepository.listUsers()[0];
        if (primaryUser) {
          console.log(`🔐 已检测到管理员账户：${primaryUser.username}`);
        }
        console.log('⚠️  如需重置密码，请使用命令行 /resetpass 或 WebUI 中的“修改密码”功能。');
      }

      if (allowRemote) {
        // 显示所有可用的网络地址
        const interfaces = os.networkInterfaces();
        const addresses: string[] = [];
        Object.keys(interfaces).forEach((name) => {
          interfaces[name]?.forEach((iface) => {
            if (iface.family === 'IPv4' && !iface.internal) {
              addresses.push(`http://${iface.address}:${port}`);
            }
          });
        });

        if (addresses.length > 0) {
          console.log('🌍 Remote access URLs:');
          addresses.forEach((url) => console.log(`   ${url}`));
        }
      }

      console.log(`🎯 Opening browser automatically...`);

      // 自动打开浏览器
      void shell.openExternal(localUrl);

      // 初始化 Web 适配器（WebSocket 使用临时 token）
      // Initialize Web Adapter (WebSocket uses temporary token)
      initWebAdapter(wss);

      resolve();
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${port} is already in use`);
        process.exit(1);
      }
      reject(err);
    });
  });
}

// Reset password command line utility
export async function resetPassword(username?: string): Promise<void> {
  try {
    if (username) {
      // Reset specific user password
      const user = UserRepository.findByUsername(username);
      if (!user) {
        console.error(`❌ User '${username}' not found`);
        return;
      }

      const newCredentials = AuthService.generateUserCredentials();
      const hashedPassword = await AuthService.hashPassword(newCredentials.password);

      UserRepository.updatePassword(user.id, hashedPassword);
      AuthService.invalidateAllTokens();

      console.log('\n📋 =================================');
      console.log('🔄 PASSWORD RESET SUCCESSFUL');
      console.log('📋 =================================');
      console.log(`👤 Username: ${user.username}`);
      console.log(`🔑 New Password: ${newCredentials.password}`);
      console.log('📋 =================================');
      console.log('⚠️  Please save the new password safely!');
      console.log('📋 =================================\n');
    } else {
      // Show available users
      if (UserRepository.countUsers() === 0) {
        console.log('❌ No users found in the database');
        return;
      }

      console.log(`📊 Found ${UserRepository.countUsers()} user(s) in the database`);
    }
  } catch (error) {
    console.error('❌ Password reset failed:', error);
  }
}
