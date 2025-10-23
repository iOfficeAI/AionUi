/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { shell } from 'electron';
import { execSync } from 'child_process';
import { networkInterfaces } from 'os';
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
 * 获取局域网 IP 地址
 * Get LAN IP address using os.networkInterfaces()
 */
function getLanIP(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    const netInfo = nets[name];
    if (!netInfo) continue;

    for (const net of netInfo) {
      // 跳过内部地址（127.0.0.1）和 IPv6
      // Skip internal addresses (127.0.0.1) and IPv6
      const isIPv4 = net.family === 'IPv4';
      const isNotInternal = !net.internal;
      if (isIPv4 && isNotInternal) {
        return net.address;
      }
    }
  }
  return null;
}

/**
 * 获取公网 IP 地址（仅 Linux 无桌面环境）
 * Get public IP address (Linux headless only)
 */
function getPublicIP(): string | null {
  // 只在 Linux 无桌面环境下尝试获取公网 IP
  // Only try to get public IP on Linux headless environment
  const isLinuxHeadless = process.platform === 'linux' && !process.env.DISPLAY;
  if (!isLinuxHeadless) {
    return null;
  }

  try {
    // 使用 curl 获取公网 IP（有 2 秒超时）
    // Use curl to get public IP (with 2 second timeout)
    const publicIP = execSync('curl -s --max-time 2 ifconfig.me || curl -s --max-time 2 api.ipify.org', {
      encoding: 'utf8',
      timeout: 3000,
    }).trim();

    // 验证是否为有效的 IPv4 地址
    // Validate IPv4 address format
    if (publicIP && /^(\d{1,3}\.){3}\d{1,3}$/.test(publicIP)) {
      return publicIP;
    }
  } catch {
    // Ignore errors (firewall, network issues, etc.)
  }

  return null;
}

/**
 * 获取服务器 IP 地址（优先公网 IP，其次局域网 IP）
 * Get server IP address (prefer public IP, fallback to LAN IP)
 */
function getServerIP(): string | null {
  // 1. Linux 无桌面环境：尝试获取公网 IP
  // Linux headless: try to get public IP
  const publicIP = getPublicIP();
  if (publicIP) {
    return publicIP;
  }

  // 2. 所有平台：获取局域网 IP（包括 Windows/Mac/Linux）
  // All platforms: get LAN IP (Windows/Mac/Linux)
  return getLanIP();
}

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
function displayInitialCredentials(credentials: { username: string; password: string }, localUrl: string, allowRemote: boolean, networkUrl?: string): void {
  console.log('\n' + '='.repeat(70));
  console.log('🎉 AionUI Web Server Started Successfully! / AionUI Web 服务器启动成功！');
  console.log('='.repeat(70));
  console.log(`\n📍 Local URL / 本地地址:    ${localUrl}`);

  if (allowRemote && networkUrl && networkUrl !== localUrl) {
    console.log(`📍 Network URL / 网络地址:  ${networkUrl}`);
  }

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

      // 尝试获取服务器 IP（Linux 无桌面环境获取公网 IP，其他环境获取局域网 IP）
      // Try to get server IP (public IP for Linux headless, LAN IP for others)
      const serverIP = getServerIP();
      const displayUrl = serverIP ? `http://${serverIP}:${port}` : localUrl;

      // 显示初始凭证（如果是首次启动）
      // Display initial credentials (if first time)
      if (initialCredentials) {
        displayInitialCredentials(initialCredentials, localUrl, allowRemote, displayUrl);
      } else {
        // Only show network access when --remote flag is enabled
        if (allowRemote && serverIP && serverIP !== 'localhost') {
          console.log(`\n   🚀 Local access / 本地访问: ${localUrl}`);
          console.log(`   🚀 Network access / 网络访问: ${displayUrl}\n`);
        } else {
          console.log(`\n   🚀 WebUI started / WebUI 已启动: ${localUrl}\n`);
        }
      }

      // 自动打开浏览器（仅在有桌面环境时）
      // Auto-open browser (only when desktop environment is available)
      // 当 allowRemote 为 true 时，优先打开局域网 IP
      // When allowRemote is true, prefer to open LAN IP
      if (process.env.DISPLAY || process.platform !== 'linux') {
        const urlToOpen = allowRemote && serverIP ? displayUrl : localUrl;
        void shell.openExternal(urlToOpen);
      }

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
