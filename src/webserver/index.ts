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
import AionDatabase from '../database';
import { AuthService } from '../auth/AuthService';
import { AuthMiddleware } from '../auth/middleware';
import { initWebAdapter } from './adapter';
import directoryApi from './directoryApi';

// Express Request type extension is defined in src/types/express.d.ts

const DEFAULT_ADMIN_USERNAME = 'admin';

// JWT Token 验证函数
function isTokenValid(token: string): boolean {
  return AuthService.verifyToken(token) !== null;
}

export async function startWebServer(port: number, allowRemote = false): Promise<void> {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  // 初始化数据库
  const db = AionDatabase.getInstance();
  let initialCredentials: { username: string; password: string } | null = null;

  if (!db.hasUsers()) {
    const username = DEFAULT_ADMIN_USERNAME;
    const password = AuthService.generateRandomPassword();

    try {
      const hashedPassword = await AuthService.hashPassword(password);
      db.createUser(username, hashedPassword);
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

  // JWT Token 验证中间件 (用于Bearer token)
  const validateApiAccess = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.cookies['aionui-session'];

    if (!token || !isTokenValid(token)) {
      return res.status(403).json({ error: 'Access denied. Please login first.' });
    }
    next();
  };

  // Cookie 验证中间件 - 用于静态资源保护
  const validateCookie = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.cookies['aionui-session'];

    if (!token || !isTokenValid(token)) {
      return res.status(403).send('Access Denied');
    }
    next();
  };

  // 静态文件服务 (Webpack 构建的 React 应用)
  const rendererPath = path.join(__dirname, '../../.webpack/renderer');
  const indexHtmlPath = path.join(rendererPath, 'main_window/index.html');

  // 处理登录请求 - 只支持用户名密码登录
  app.post('/login', AuthMiddleware.rateLimitMiddleware('login'), AuthMiddleware.validateLoginInput, async (req, res) => {
    try {
      const { username, password } = req.body;

      // Get user from database
      const user = db.getUserByUsername(username);
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
      db.updateLastLogin(user.id);

      // 设置安全cookie
      res.cookie('aionui-session', token, {
        httpOnly: true,
        secure: false, // 在开发环境下设为false，生产环境可设为true
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30天
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

  // 生成临时 WebSocket Token（短期有效，仅用于 WebSocket 连接）
  // Generate temporary WebSocket token (short-lived, only for WebSocket connection)
  app.get('/api/ws-token', (req, res) => {
    try {
      // 从 httpOnly cookie 中验证 session token
      // Verify session token from httpOnly cookie
      const sessionToken = req.cookies['aionui-session'];

      if (!sessionToken || !isTokenValid(sessionToken)) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: Invalid or missing session',
        });
      }

      // 验证 token 并获取用户信息
      // Verify token and get user info
      const decoded = AuthService.verifyToken(sessionToken);
      if (!decoded) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: Invalid session token',
        });
      }

      // 生成短期 WebSocket token（5分钟有效）
      // Generate short-lived WebSocket token (valid for 5 minutes)
      const wsToken = AuthService.generateWebSocketToken(
        { id: decoded.userId, username: decoded.username },
        '5m' // 5分钟过期
      );

      res.json({
        success: true,
        wsToken,
        expiresIn: 300, // 5分钟 = 300秒
      });
    } catch (error) {
      console.error('WebSocket token generation error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  });

  // 特殊处理主页HTML - 检查cookie或显示登录页面
  app.get('/', (req, res) => {
    try {
      // 禁用缓存，确保每次都检查最新的认证状态 / Disable cache to ensure fresh auth check
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const authHeader = req.headers.authorization;
      const sessionCookie = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.cookies['aionui-session'];

      // 如果有 cookie 但验证失败，清除它并强制显示登录页 / Clear invalid cookie and show login page
      if (sessionCookie && !isTokenValid(sessionCookie)) {
        res.clearCookie('aionui-session');
        // 不要 return，继续显示登录页 / Continue to show login page
      }

      // 如果已有有效cookie，直接进入应用 / If valid cookie exists, enter app directly
      if (sessionCookie && isTokenValid(sessionCookie)) {
        const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

        res.setHeader('Content-Type', 'text/html');
        res.send(htmlContent);
        return;
      }

      // 显示登录页面
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>AionUi - Login</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              margin: 0;
              padding: 0;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .login-container {
              background: white;
              padding: 40px;
              border-radius: 12px;
              box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
              width: 100%;
              max-width: 400px;
              text-align: center;
            }
            h1 {
              color: #333;
              margin-bottom: 10px;
              font-size: 24px;
            }
            .subtitle {
              color: #666;
              margin-bottom: 30px;
              font-size: 14px;
            }
            .input-group {
              margin-bottom: 20px;
              text-align: left;
            }
            label {
              display: block;
              margin-bottom: 8px;
              color: #555;
              font-weight: 500;
            }
            input[type="password"], input[type="text"] {
              width: 100%;
              padding: 12px;
              border: 1px solid #ddd;
              border-radius: 6px;
              font-size: 16px;
              box-sizing: border-box;
              transition: border-color 0.3s;
            }
            input[type="password"]:focus, input[type="text"]:focus {
              outline: none;
              border-color: #667eea;
              box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
            }
            .login-btn {
              width: 100%;
              padding: 12px;
              background: #667eea;
              color: white;
              border: none;
              border-radius: 6px;
              font-size: 16px;
              font-weight: 500;
              cursor: pointer;
              transition: background 0.3s;
            }
            .login-btn:hover {
              background: #5a6fd8;
            }
            .login-btn:disabled {
              background: #ccc;
              cursor: not-allowed;
            }
            .error {
              color: #e74c3c;
              margin-top: 10px;
              font-size: 14px;
            }
            .success {
              color: #27ae60;
              margin-top: 10px;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="login-container">
            <h1>AionUi</h1>
            <p class="subtitle">Please login with your credentials</p>

            <!-- 用户名密码登录表单 -->
            <form id="loginForm">
              <div class="input-group">
                <label for="username">Username</label>
                <input type="text" id="username" name="username" placeholder="Enter username" required>
              </div>
              <div class="input-group">
                <label for="password">Password</label>
                <input type="password" id="password" name="password" placeholder="Enter password" required>
              </div>
              <button type="submit" class="login-btn" id="loginBtn">Login</button>
            </form>

            <div id="message"></div>
          </div>

          <script>
            async function handleLogin(username, password) {
              const message = document.getElementById('message');
              const loginBtn = document.getElementById('loginBtn');

              loginBtn.disabled = true;
              loginBtn.textContent = 'Logging in...';
              message.innerHTML = '';

              try {
                const response = await fetch('/login', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ username, password }),
                });

                const result = await response.json();

                if (result.success) {
                  message.innerHTML = '<div class="success">Login successful! Redirecting...</div>';
                  setTimeout(() => {
                    window.location.reload();
                  }, 1000);
                } else {
                  message.innerHTML = '<div class="error">' + result.message + '</div>';
                }
              } catch (error) {
                message.innerHTML = '<div class="error">Connection error. Please try again.</div>';
              }

              loginBtn.disabled = false;
              loginBtn.textContent = 'Login';
            }

            // 登录表单提交
            document.getElementById('loginForm').addEventListener('submit', async (e) => {
              e.preventDefault();
              const username = document.getElementById('username').value;
              const password = document.getElementById('password').value;

              if (!username || !password) {
                document.getElementById('message').innerHTML = '<div class="error">Please enter both username and password</div>';
                return;
              }

              await handleLogin(username, password);
            });

            // 默认聚焦到用户名输入框
            document.getElementById('username').focus();
          </script>
        </body>
        </html>
      `);
    } catch (error) {
      console.error('Error serving index.html:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  // 处理 favicon 请求
  app.get('/favicon.ico', (_req, res) => {
    res.status(204).end(); // No Content
  });

  // 处理子路径路由 (React Router)
  app.get(/^\/(?!api|static|main_window).*/, validateCookie, (req, res) => {
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
  app.use('/main_window.css', validateCookie, express.static(path.join(rendererPath, 'main_window.css')));
  app.use('/main_window', validateCookie, express.static(path.join(rendererPath, 'main_window')));
  app.use('/static', validateCookie, express.static(path.join(rendererPath, 'static')));

  // React Syntax Highlighter 语言包
  app.use(
    '/react-syntax-highlighter_languages_highlight_',
    validateCookie,
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

  app.use('/api', validateApiAccess, (_req, res) => {
    res.json({ message: 'API endpoint - bridge integration working' });
  });

  // WebSocket connection will be handled by initWebAdapter

  // 启动服务器
  // API 路由
  // Auth status endpoint
  app.get('/api/auth/status', (_req, res) => {
    try {
      const hasUsers = db.hasUsers();
      const userCount = db.getUserCount();

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

  // Get current user (protected route)
  app.get('/api/auth/user', AuthMiddleware.authenticateToken, (req, res) => {
    res.json({
      success: true,
      user: req.user,
    });
  });

  // Change password endpoint (protected route)
  app.post('/api/auth/change-password', AuthMiddleware.authenticateToken, async (req, res) => {
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
      const user = db.getUserById(req.user!.id);
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
      db.updateUserPassword(user.id, newPasswordHash);

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

  // Token refresh endpoint
  app.post('/api/auth/refresh', (req, res) => {
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

  // 添加登出路由
  app.post('/logout', AuthMiddleware.authenticateToken, (_req, res) => {
    res.clearCookie('aionui-session');
    res.json({ success: true, message: 'Logged out successfully' });
  });

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
        const primaryUser = db.getAllUsers()[0];
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
      shell.openExternal(localUrl);

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
    const db = AionDatabase.getInstance();

    if (username) {
      // Reset specific user password
      const user = db.getUserByUsername(username);
      if (!user) {
        console.error(`❌ User '${username}' not found`);
        return;
      }

      const newCredentials = AuthService.generateUserCredentials();
      const hashedPassword = await AuthService.hashPassword(newCredentials.password);

      db.updateUserPassword(user.id, hashedPassword);

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
      const users = db.getUserCount();
      if (users === 0) {
        console.log('❌ No users found in the database');
        return;
      }

      console.log(`📊 Found ${users} user(s) in the database`);
    }
  } catch (error) {
    console.error('❌ Password reset failed:', error);
  }
}
