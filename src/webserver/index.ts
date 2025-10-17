/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { shell } from 'electron';
import { AuthService } from '@/webserver/auth/service/AuthService';
import { UserRepository } from '@/webserver/auth/repository/UserRepository';
import { AUTH_CONFIG, SERVER_CONFIG } from './config/constants';
import { initWebAdapter } from './adapter';
import { setupBasicMiddleware, setupCors, setupErrorHandler } from './setup';
import { registerAuthRoutes } from './routes/authRoutes';
import { registerApiRoutes } from './routes/apiRoutes';
import { registerStaticRoutes } from './routes/staticRoutes';

// Express Request 类型扩展定义在 src/webserver/types/express.d.ts
// Express Request type extension is defined in src/webserver/types/express.d.ts

const DEFAULT_ADMIN_USERNAME = AUTH_CONFIG.DEFAULT_USER.USERNAME;

/**
 * 初始化默认管理员账户（如果不存在）
 * Initialize default admin account if no users exist
 *
 * @returns 初始凭证（仅首次创建时）/ Initial credentials (only on first creation)
 */
async function initializeDefaultAdmin(): Promise<{ username: string; password: string } | null> {
  const username = DEFAULT_ADMIN_USERNAME;

  const systemUser = UserRepository.getSystemUser();
  const existingAdmin = UserRepository.findByUsername(username);

  // 已存在且密码有效则视为完成初始化
  // Treat existing admin with valid password as already initialized
  const hasValidPassword = (user: typeof existingAdmin): boolean => !!user && typeof user.password_hash === 'string' && user.password_hash.trim().length > 0;

  // 如果已经有有效的管理员用户，直接跳过初始化
  // Skip initialization if a valid admin already exists
  if (hasValidPassword(existingAdmin)) {
    return null;
  }

  const password = AuthService.generateRandomPassword();

  try {
    const hashedPassword = await AuthService.hashPassword(password);

    if (existingAdmin) {
      // 情况 1：库中已有 admin 记录但密码缺失 -> 重置密码并输出凭证
      // Case 1: admin row exists but password is blank -> refresh password and expose credentials
      UserRepository.updatePassword(existingAdmin.id, hashedPassword);
      return { username, password };
    }

    if (systemUser) {
      // 情况 2：仅存在 system_default_user 占位行 -> 更新用户名和密码
      // Case 2: only placeholder system user exists -> update username/password in place
      UserRepository.setSystemUserCredentials(username, hashedPassword);
      return { username, password };
    }

    // 情况 3：初次启动，无任何用户 -> 新建 admin 账户
    // Case 3: fresh install with no users -> create admin user explicitly
    UserRepository.createUser(username, hashedPassword);
    return { username, password };
  } catch (error) {
    console.error('❌ Failed to initialize default admin account:', error);
    console.error('❌ 初始化默认管理员账户失败:', error);
    return null;
  }
}

/**
 * 在控制台显示初始凭证信息
 * Display initial credentials in console
 */
function displayInitialCredentials(credentials: { username: string; password: string }, localUrl: string): void {
  console.log('\n' + '='.repeat(70));
  console.log('🎉 AionUI Web Server Started Successfully! / AionUI Web 服务器启动成功！');
  console.log('='.repeat(70));
  console.log(`\n📍 Local URL / 本地地址:    ${localUrl}`);
  console.log('\n🔐 Initial Admin Credentials / 初始管理员凭证:');
  console.log(`   Username / 用户名: ${credentials.username}`);
  console.log(`   Password / 密码:   ${credentials.password}`);
  console.log('\n⚠️  Please change the password after first login!');
  console.log('⚠️  请在首次登录后修改密码！');
  console.log('='.repeat(70) + '\n');
}

/**
 * 启动 Web 服务器
 * Start web server with authentication and WebSocket support
 *
 * @param port 服务器端口 / Server port
 * @param allowRemote 是否允许远程访问 / Allow remote access
 */
export async function startWebServer(port: number, allowRemote = false): Promise<void> {
  // 设置服务器配置
  // Set server configuration
  SERVER_CONFIG.setServerConfig(port, allowRemote);

  // 创建 Express 应用和服务器
  // Create Express app and server
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  // 初始化默认管理员账户
  // Initialize default admin account
  const initialCredentials = await initializeDefaultAdmin();

  // 配置中间件
  // Configure middleware
  setupBasicMiddleware(app);
  setupCors(app, port, allowRemote);

  // 注册路由
  // Register routes
  registerAuthRoutes(app);
  registerApiRoutes(app);
  registerStaticRoutes(app);

  // 配置错误处理（必须最后）
  // Configure error handler (must be last)
  setupErrorHandler(app);

  // 启动服务器
  // Start server
  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      const localUrl = `http://localhost:${port}`;

      // 显示初始凭证（如果是首次启动）
      // Display initial credentials (if first time)
      if (initialCredentials) {
        displayInitialCredentials(initialCredentials, localUrl);
      } else {
        console.log(`\n🚀 AionUI Web Server running at / 运行于: ${localUrl}\n`);
      }

      // 自动打开浏览器
      // Auto-open browser
      void shell.openExternal(localUrl);

      // 初始化 WebSocket 适配器
      // Initialize WebSocket adapter
      initWebAdapter(wss);

      resolve();
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${port} is already in use / 端口 ${port} 已被占用`);
      } else {
        console.error('❌ Server error / 服务器错误:', err);
      }
      reject(err);
    });
  });
}
