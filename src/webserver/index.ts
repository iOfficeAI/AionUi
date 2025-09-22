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
import crypto from 'crypto';
import { initWebAdapter } from './adapter';
import directoryApi from './directoryApi';

// Token管理
interface TokenInfo {
  token: string;
  expiresAt: number;
  createdAt: number;
}

// 用户凭证管理
interface UserCredentials {
  username: string;
  password: string;
  createdAt: number;
}

const activeTokens = new Map<string, TokenInfo>();
let globalUserCredentials: UserCredentials | null = null;

// Token工具函数
function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// 生成随机用户名和密码
function generateUserCredentials(): UserCredentials {
  // 生成随机用户名 (6-8位字母数字组合)
  const usernameLength = Math.floor(Math.random() * 3) + 6; // 6-8位
  const usernameChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let username = '';
  for (let i = 0; i < usernameLength; i++) {
    username += usernameChars.charAt(Math.floor(Math.random() * usernameChars.length));
  }

  // 生成随机密码 (8-12位字母数字组合)
  const passwordLength = Math.floor(Math.random() * 5) + 8; // 8-12位
  const passwordChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < passwordLength; i++) {
    password += passwordChars.charAt(Math.floor(Math.random() * passwordChars.length));
  }

  return {
    username,
    password,
    createdAt: Date.now(),
  };
}

function createToken(expirationHours = 24): TokenInfo {
  const token = generateSecureToken();
  const now = Date.now();
  const tokenInfo: TokenInfo = {
    token,
    createdAt: now,
    expiresAt: now + expirationHours * 60 * 60 * 1000,
  };
  activeTokens.set(token, tokenInfo);
  return tokenInfo;
}

function isTokenValid(token: string, allowRemote: boolean = true): boolean {
  const tokenInfo = activeTokens.get(token);
  if (!tokenInfo) return false;

  // 如果不是远程模式，token永不过期
  if (!allowRemote) return true;

  if (Date.now() > tokenInfo.expiresAt) {
    activeTokens.delete(token);
    return false;
  }

  return true;
}

function cleanupExpiredTokens(): void {
  const now = Date.now();
  for (const [token, tokenInfo] of activeTokens.entries()) {
    if (now > tokenInfo.expiresAt) {
      activeTokens.delete(token);
    }
  }
}

export async function startWebServer(port: number, allowRemote = false): Promise<void> {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  // 生成随机用户凭证
  globalUserCredentials = generateUserCredentials();

  // 生成会话令牌用于内部cookie管理
  const tokenInfo = createToken(24);
  const sessionToken = tokenInfo.token;

  // 启动定期清理过期token的任务 (每小时执行一次)
  const cleanupInterval = setInterval(cleanupExpiredTokens, 60 * 60 * 1000);

  // 添加进程退出时的清理
  process.on('exit', () => {
    clearInterval(cleanupInterval);
  });

  process.on('SIGTERM', () => {
    clearInterval(cleanupInterval);
    process.exit(0);
  });

  process.on('SIGINT', () => {
    clearInterval(cleanupInterval);
    process.exit(0);
  });

  // 基础中间件
  app.use(
    cors({
      origin: allowRemote ? true : `http://localhost:${port}`,
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(cookieParser());

  // 安全头
  app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  // API Token 验证中间件 (仅用于API端点)
  const validateApiAccess = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const sessionCookie = req.cookies['aionui-session'];
    if (!sessionCookie || !isTokenValid(sessionCookie, allowRemote)) {
      return res.status(403).json({ error: 'Access denied. Please login first.' });
    }
    next();
  };

  // Cookie 验证中间件 - 用于静态资源保护
  const validateCookie = (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    const sessionCookie = _req.cookies['aionui-session'];
    if (!sessionCookie || !isTokenValid(sessionCookie, allowRemote)) {
      return res.status(403).send('Access Denied');
    }
    next();
  };

  // 静态文件服务 (Webpack 构建的 React 应用)
  const rendererPath = path.join(__dirname, '../../.webpack/renderer');
  const indexHtmlPath = path.join(rendererPath, 'main_window/index.html');

  // 处理登录请求 - 只支持用户名密码登录
  app.post('/login', (req, res) => {
    try {
      const { username, password } = req.body;

      // 验证用户名密码
      if (!username || !password) {
        return res.status(400).json({
          success: false,
          message: 'Username and password are required.',
        });
      }

      if (!globalUserCredentials || username !== globalUserCredentials.username || password !== globalUserCredentials.password) {
        return res.status(401).json({
          success: false,
          message: 'Invalid username or password.',
        });
      }

      // 设置安全cookie
      res.cookie('aionui-session', sessionToken, {
        httpOnly: true,
        secure: false, // 在开发环境下设为false，生产环境可设为true
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24小时
      });

      res.json({ success: true, message: 'Login successful' });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // 特殊处理主页HTML - 检查cookie或显示登录页面
  app.get('/', (req, res) => {
    try {
      const sessionCookie = req.cookies['aionui-session'];

      // 如果已有有效cookie，直接进入应用
      if (sessionCookie && isTokenValid(sessionCookie, allowRemote)) {
        const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

        // 注入token到HTML中，只在WebUI环境下设置
        const modifiedHtml = htmlContent.replace(
          '</head>',
          `<script>
            // 只在WebUI模式下设置token
            if (!window.electronAPI) {
              window.__SESSION_TOKEN__ = '${sessionCookie}';
            }
          </script></head>`
        );

        res.setHeader('Content-Type', 'text/html');
        res.send(modifiedHtml);
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

  // 处理子路径路由 (React Router)
  app.get(/^\/(?!api|static|main_window).*/, validateCookie, (req, res) => {
    try {
      const token = req.cookies['aionui-session'];
      const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

      const modifiedHtml = htmlContent.replace(
        '</head>',
        `<script>
          if (!window.electronAPI) {
            window.__SESSION_TOKEN__ = '${token}';
          }
        </script></head>`
      );

      res.setHeader('Content-Type', 'text/html');
      res.send(modifiedHtml);
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
  // 添加登出路由
  app.post('/logout', (_req, res) => {
    res.clearCookie('aionui-session');
    res.json({ success: true, message: 'Logged out successfully' });
  });

  return new Promise((resolve, reject) => {
    const host = allowRemote ? '0.0.0.0' : '127.0.0.1';
    server.listen(port, host, () => {
      const localUrl = `http://localhost:${port}`;

      console.log(`🚀 AionUi WebUI started on ${localUrl}`);
      console.log(`👤 Username: ${globalUserCredentials.username}`);
      console.log(`🔐 Password: ${globalUserCredentials.password}`);

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

      // 初始化 Web 适配器
      initWebAdapter(wss, (token: string) => isTokenValid(token, allowRemote));

      resolve();
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${port} is already in use`);
        process.exit(1);
      }
      reject(err);
    });
  });
}
