/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { shell } from 'electron';
import { AuthService } from '../auth/service/AuthService';
import { UserRepository } from '../auth/repository/UserRepository';
import { AUTH_CONFIG, SERVER_CONFIG } from '../config/constants';
import { initWebAdapter } from './adapter';
import { setupBasicMiddleware, setupCors, setupErrorHandler } from './setup';
import { registerAuthRoutes } from './routes/auth.routes';
import { registerApiRoutes } from './routes/api.routes';
import { registerStaticRoutes } from './routes/static.routes';

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
  if (!UserRepository.hasUsers()) {
    const username = DEFAULT_ADMIN_USERNAME;
    const password = AuthService.generateRandomPassword();

    try {
      const hashedPassword = await AuthService.hashPassword(password);
      UserRepository.createUser(username, hashedPassword);
      return { username, password };
    } catch (error) {
      console.error('❌ Failed to create default admin account:', error);
      console.error('❌ 创建默认管理员账户失败:', error);
    }
  }
  return null;
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

/**
 * 重置用户密码（管理员工具）
 * Reset user password (admin utility)
 *
 * @param username 用户名（可选，默认为管理员）/ Username (optional, defaults to admin)
 */
export async function resetPassword(username?: string): Promise<void> {
  const targetUsername = username || DEFAULT_ADMIN_USERNAME;
  const user = UserRepository.findByUsername(targetUsername);

  if (!user) {
    console.error(`❌ User not found / 用户不存在: ${targetUsername}`);
    return;
  }

  const newPassword = AuthService.generateRandomPassword();
  const hashedPassword = await AuthService.hashPassword(newPassword);

  try {
    UserRepository.updatePassword(user.id, hashedPassword);
    console.log('\n' + '='.repeat(60));
    console.log('✅ Password reset successful / 密码重置成功');
    console.log('='.repeat(60));
    console.log(`Username / 用户名: ${targetUsername}`);
    console.log(`New Password / 新密码: ${newPassword}`);
    console.log('='.repeat(60) + '\n');
  } catch (error) {
    console.error('❌ Failed to reset password / 密码重置失败:', error);
  }
}
