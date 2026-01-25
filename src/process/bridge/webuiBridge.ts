/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { networkInterfaces } from 'os';
import { ipcMain } from 'electron';
import { webui, type IWebUIStatus } from '@/common/ipcBridge';
import { AuthService } from '@/webserver/auth/service/AuthService';
import { UserRepository } from '@/webserver/auth/repository/UserRepository';
import { AUTH_CONFIG, SERVER_CONFIG } from '@/webserver/config/constants';

// 使用动态导入避免循环依赖 / Use dynamic import to avoid circular dependency
// webserver/index -> authRoutes -> webuiBridge -> webserver/index
let _getInitialAdminPassword: (() => string | null) | null = null;
let _clearInitialAdminPassword: (() => void) | null = null;

async function loadWebServerFunctions() {
  if (!_getInitialAdminPassword || !_clearInitialAdminPassword) {
    const webServer = await import('@/webserver/index');
    _getInitialAdminPassword = webServer.getInitialAdminPassword;
    _clearInitialAdminPassword = webServer.clearInitialAdminPassword;
  }
}

function getInitialAdminPassword(): string | null {
  return _getInitialAdminPassword?.() ?? null;
}

function clearInitialAdminPassword(): void {
  _clearInitialAdminPassword?.();
}

// WebUI 服务器实例引用 / WebUI server instance reference
let webServerInstance: {
  server: import('http').Server;
  wss: import('ws').WebSocketServer;
  port: number;
  allowRemote: boolean;
} | null = null;

// QR Token 存储 (内存中，有效期短) / QR Token store (in-memory, short-lived)
const qrTokenStore = new Map<string, { expiresAt: number; used: boolean }>();

// QR Token 有效期 5 分钟 / QR Token validity: 5 minutes
const QR_TOKEN_EXPIRY = 5 * 60 * 1000;

/**
 * 直接验证 QR Token（供 authRoutes 使用，无需 IPC）
 * Verify QR token directly (for authRoutes, no IPC needed)
 */
export async function verifyQRTokenDirect(qrToken: string): Promise<{ success: boolean; data?: { sessionToken: string; username: string }; msg?: string }> {
  try {
    // 检查 token 是否存在 / Check if token exists
    const tokenData = qrTokenStore.get(qrToken);
    if (!tokenData) {
      return {
        success: false,
        msg: 'Invalid or expired QR token',
      };
    }

    // 检查是否过期 / Check if expired
    if (Date.now() > tokenData.expiresAt) {
      qrTokenStore.delete(qrToken);
      return {
        success: false,
        msg: 'QR token has expired',
      };
    }

    // 检查是否已使用 / Check if already used
    if (tokenData.used) {
      qrTokenStore.delete(qrToken);
      return {
        success: false,
        msg: 'QR token has already been used',
      };
    }

    // 标记为已使用 / Mark as used
    tokenData.used = true;

    // 获取管理员用户 / Get admin user
    const adminUser = UserRepository.findByUsername(AUTH_CONFIG.DEFAULT_USER.USERNAME);
    if (!adminUser) {
      return {
        success: false,
        msg: 'Admin user not found',
      };
    }

    // 生成会话 token / Generate session token
    const sessionToken = AuthService.generateToken(adminUser);

    // 更新最后登录时间 / Update last login time
    UserRepository.updateLastLogin(adminUser.id);

    // 删除已使用的 QR token / Delete used QR token
    qrTokenStore.delete(qrToken);

    return {
      success: true,
      data: {
        sessionToken,
        username: adminUser.username,
      },
    };
  } catch (error) {
    console.error('[WebUI Bridge] Verify QR token error:', error);
    return {
      success: false,
      msg: error instanceof Error ? error.message : 'Failed to verify QR token',
    };
  }
}

/**
 * 获取局域网 IP 地址
 * Get LAN IP address
 */
function getLanIP(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    const netInfo = nets[name];
    if (!netInfo) continue;

    for (const net of netInfo) {
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
 * 清理过期的 QR Token
 * Clean up expired QR tokens
 */
function cleanupExpiredTokens(): void {
  const now = Date.now();
  for (const [token, data] of qrTokenStore.entries()) {
    if (data.expiresAt < now || data.used) {
      qrTokenStore.delete(token);
    }
  }
}

/**
 * 设置 WebUI 服务器实例
 * Set WebUI server instance (called from webserver/index.ts)
 */
export function setWebServerInstance(instance: typeof webServerInstance): void {
  webServerInstance = instance;
}

/**
 * 获取 WebUI 服务器实例
 * Get WebUI server instance
 */
export function getWebServerInstance(): typeof webServerInstance {
  return webServerInstance;
}

/**
 * 初始化 WebUI IPC 桥接
 * Initialize WebUI IPC bridge
 */
export function initWebuiBridge(): void {
  console.log('[WebUI Bridge] Initializing webuiBridge...');
  // 加载 webserver 函数（避免循环依赖）/ Load webserver functions (avoid circular dependency)
  void loadWebServerFunctions();

  // 获取 WebUI 状态 / Get WebUI status
  webui.getStatus.provider(async () => {
    console.log('[WebUI Bridge] getStatus handler invoked');
    try {
      // 确保 webserver 函数已加载 / Ensure webserver functions are loaded
      await loadWebServerFunctions();

      const adminUser = UserRepository.findByUsername(AUTH_CONFIG.DEFAULT_USER.USERNAME);
      const running = webServerInstance !== null;
      const port = webServerInstance?.port ?? SERVER_CONFIG.DEFAULT_PORT;
      const allowRemote = webServerInstance?.allowRemote ?? false;

      const localUrl = `http://localhost:${port}`;
      const lanIP = getLanIP();
      const networkUrl = allowRemote && lanIP ? `http://${lanIP}:${port}` : undefined;

      const status: IWebUIStatus = {
        running,
        port,
        allowRemote,
        localUrl,
        networkUrl,
        lanIP: lanIP ?? undefined, // 始终返回 LAN IP / Always return LAN IP
        adminUsername: adminUser?.username ?? AUTH_CONFIG.DEFAULT_USER.USERNAME,
        initialPassword: getInitialAdminPassword() ?? undefined,
      };

      return {
        success: true,
        data: status,
      };
    } catch (error) {
      console.error('[WebUI Bridge] Get status error:', error);
      return {
        success: false,
        msg: 'Failed to get WebUI status',
      };
    }
  });

  // 启动 WebUI / Start WebUI
  webui.start.provider(async ({ port: requestedPort, allowRemote }) => {
    console.log('[WebUI Bridge] start handler invoked, port:', requestedPort, 'allowRemote:', allowRemote);
    try {
      if (webServerInstance) {
        return {
          success: false,
          msg: 'WebUI is already running',
        };
      }

      const port = requestedPort ?? SERVER_CONFIG.DEFAULT_PORT;
      const remote = allowRemote ?? false;

      // 动态导入避免循环依赖 / Dynamic import to avoid circular dependency
      console.log('[WebUI Bridge] Starting server, port:', port, 'remote:', remote);
      const { startWebServerWithInstance } = await import('@/webserver/index');
      const instance = await startWebServerWithInstance(port, remote);

      webServerInstance = instance;
      console.log('[WebUI Bridge] Server started, webServerInstance set:', !!webServerInstance);

      // 确保 webserver 函数已加载 / Ensure webserver functions are loaded
      await loadWebServerFunctions();

      const localUrl = `http://localhost:${port}`;
      const lanIP = getLanIP();
      const networkUrl = remote && lanIP ? `http://${lanIP}:${port}` : undefined;
      const initialPassword = getInitialAdminPassword() ?? undefined;

      // 发送状态变更事件 / Emit status changed event
      webui.statusChanged.emit({
        running: true,
        port,
        localUrl,
        networkUrl,
      });

      return {
        success: true,
        data: {
          port,
          localUrl,
          networkUrl,
          lanIP: lanIP ?? undefined,
          initialPassword,
        },
      };
    } catch (error) {
      console.error('[WebUI Bridge] Start error:', error);
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Failed to start WebUI',
      };
    }
  });

  // 停止 WebUI / Stop WebUI
  webui.stop.provider(async () => {
    try {
      if (!webServerInstance) {
        return {
          success: false,
          msg: 'WebUI is not running',
        };
      }

      const { server, wss } = webServerInstance;

      // 关闭所有 WebSocket 连接 / Close all WebSocket connections
      wss.clients.forEach((client) => {
        client.close(1000, 'Server shutting down');
      });

      // 关闭服务器 / Close server
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      webServerInstance = null;

      // 发送状态变更事件 / Emit status changed event
      webui.statusChanged.emit({
        running: false,
      });

      return { success: true };
    } catch (error) {
      console.error('[WebUI Bridge] Stop error:', error);
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Failed to stop WebUI',
      };
    }
  });

  // 修改密码 / Change password
  webui.changePassword.provider(async ({ currentPassword, newPassword }) => {
    try {
      // 确保 webserver 函数已加载 / Ensure webserver functions are loaded
      await loadWebServerFunctions();

      const adminUser = UserRepository.findByUsername(AUTH_CONFIG.DEFAULT_USER.USERNAME);
      if (!adminUser) {
        return {
          success: false,
          msg: 'Admin user not found',
        };
      }

      // 验证当前密码 / Verify current password
      const isValidPassword = await AuthService.verifyPassword(currentPassword, adminUser.password_hash);
      if (!isValidPassword) {
        return {
          success: false,
          msg: 'Current password is incorrect',
        };
      }

      // 验证新密码强度 / Validate new password strength
      const passwordValidation = AuthService.validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        return {
          success: false,
          msg: passwordValidation.errors.join('; '),
        };
      }

      // 更新密码 / Update password
      const newPasswordHash = await AuthService.hashPassword(newPassword);
      UserRepository.updatePassword(adminUser.id, newPasswordHash);

      // 使所有现有 token 失效 / Invalidate all existing tokens
      AuthService.invalidateAllTokens();

      // 清除初始密码（用户已修改密码）/ Clear initial password (user has changed password)
      clearInitialAdminPassword();

      return { success: true };
    } catch (error) {
      console.error('[WebUI Bridge] Change password error:', error);
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Failed to change password',
      };
    }
  });

  // 重置密码（生成新随机密码）/ Reset password (generate new random password)
  // 注意：由于 @office-ai/platform bridge 的 provider 模式不支持返回值，
  // 我们通过 emitter 发送结果，前端监听 resetPasswordResult 事件
  // Note: Since @office-ai/platform bridge provider doesn't support return values,
  // we emit the result via emitter, frontend listens to resetPasswordResult event
  webui.resetPassword.provider(async () => {
    console.log('[WebUI Bridge] resetPassword handler invoked');
    try {
      // 确保 webserver 函数已加载 / Ensure webserver functions are loaded
      await loadWebServerFunctions();

      const adminUser = UserRepository.findByUsername(AUTH_CONFIG.DEFAULT_USER.USERNAME);
      if (!adminUser) {
        console.log('[WebUI Bridge] Admin user not found');
        // 通过 emitter 发送错误结果 / Emit error result
        webui.resetPasswordResult.emit({ success: false, msg: 'Admin user not found' });
        return { success: false, msg: 'Admin user not found' };
      }

      // 生成新的随机密码 / Generate new random password
      console.log('[WebUI Bridge] Generating new password...');
      const newPassword = AuthService.generateRandomPassword();
      const newPasswordHash = await AuthService.hashPassword(newPassword);

      // 更新密码 / Update password
      console.log('[WebUI Bridge] Updating password in database...');
      UserRepository.updatePassword(adminUser.id, newPasswordHash);

      // 使所有现有 token 失效 / Invalidate all existing tokens
      AuthService.invalidateAllTokens();

      // 清除旧的初始密码 / Clear old initial password
      clearInitialAdminPassword();

      console.log('[WebUI Bridge] Password reset successful, emitting result');
      // 通过 emitter 发送成功结果 / Emit success result
      webui.resetPasswordResult.emit({ success: true, newPassword });

      return { success: true, data: { newPassword } };
    } catch (error) {
      console.error('[WebUI Bridge] Reset password error:', error);
      const msg = error instanceof Error ? error.message : 'Failed to reset password';
      // 通过 emitter 发送错误结果 / Emit error result
      webui.resetPasswordResult.emit({ success: false, msg });
      return { success: false, msg };
    }
  });

  // 生成二维码登录 token / Generate QR login token
  console.log('[WebUI Bridge] Registering generateQRToken provider...');
  webui.generateQRToken.provider(async () => {
    console.log('[WebUI Bridge] generateQRToken handler invoked');

    // 检查 webServerInstance 状态
    if (!webServerInstance) {
      console.log('[WebUI Bridge] webServerInstance is null');
      return {
        success: false,
        msg: 'WebUI is not running. Please start WebUI first.',
      };
    }

    console.log('[WebUI Bridge] webServerInstance exists, generating token...');

    try {
      // 清理过期 token / Clean up expired tokens
      cleanupExpiredTokens();

      // 生成随机 token / Generate random token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + QR_TOKEN_EXPIRY;

      // 存储 token / Store token
      qrTokenStore.set(token, { expiresAt, used: false });

      // 构建 QR URL / Build QR URL
      const { port, allowRemote } = webServerInstance;
      const lanIP = getLanIP();
      const baseUrl = allowRemote && lanIP ? `http://${lanIP}:${port}` : `http://localhost:${port}`;
      const qrUrl = `${baseUrl}/qr-login?token=${token}`;

      console.log('[WebUI Bridge] QR token generated:', { token: token.substring(0, 8) + '...', qrUrl });

      return {
        success: true,
        data: {
          token,
          expiresAt,
          qrUrl,
        },
      };
    } catch (error) {
      console.error('[WebUI Bridge] Generate QR token error:', error);
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Failed to generate QR token',
      };
    }
  });

  // 验证二维码 token / Verify QR token
  webui.verifyQRToken.provider(async ({ qrToken }) => {
    try {
      // 检查 token 是否存在 / Check if token exists
      const tokenData = qrTokenStore.get(qrToken);
      if (!tokenData) {
        return {
          success: false,
          msg: 'Invalid or expired QR token',
        };
      }

      // 检查是否过期 / Check if expired
      if (Date.now() > tokenData.expiresAt) {
        qrTokenStore.delete(qrToken);
        return {
          success: false,
          msg: 'QR token has expired',
        };
      }

      // 检查是否已使用 / Check if already used
      if (tokenData.used) {
        qrTokenStore.delete(qrToken);
        return {
          success: false,
          msg: 'QR token has already been used',
        };
      }

      // 标记为已使用 / Mark as used
      tokenData.used = true;

      // 获取管理员用户 / Get admin user
      const adminUser = UserRepository.findByUsername(AUTH_CONFIG.DEFAULT_USER.USERNAME);
      if (!adminUser) {
        return {
          success: false,
          msg: 'Admin user not found',
        };
      }

      // 生成会话 token / Generate session token
      const sessionToken = AuthService.generateToken(adminUser);

      // 更新最后登录时间 / Update last login time
      UserRepository.updateLastLogin(adminUser.id);

      // 删除已使用的 QR token / Delete used QR token
      qrTokenStore.delete(qrToken);

      return {
        success: true,
        data: {
          sessionToken,
          username: adminUser.username,
        },
      };
    } catch (error) {
      console.error('[WebUI Bridge] Verify QR token error:', error);
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Failed to verify QR token',
      };
    }
  });

  console.log('[WebUI Bridge] All providers registered successfully');

  // ===== 直接 IPC 处理器（绕过 bridge 库）/ Direct IPC handlers (bypass bridge library) =====
  // 这些处理器直接返回结果，不依赖 emitter 模式
  // These handlers return results directly, without relying on emitter pattern

  // 直接 IPC: 重置密码 / Direct IPC: Reset password
  ipcMain.handle('webui-direct-reset-password', async () => {
    console.log('[WebUI Bridge] Direct IPC: resetPassword invoked');
    try {
      await loadWebServerFunctions();

      const adminUser = UserRepository.findByUsername(AUTH_CONFIG.DEFAULT_USER.USERNAME);
      if (!adminUser) {
        console.log('[WebUI Bridge] Direct IPC: Admin user not found');
        return { success: false, msg: 'Admin user not found' };
      }

      // 生成新的随机密码 / Generate new random password
      console.log('[WebUI Bridge] Direct IPC: Generating new password...');
      const newPassword = AuthService.generateRandomPassword();
      const newPasswordHash = await AuthService.hashPassword(newPassword);

      // 更新密码 / Update password
      console.log('[WebUI Bridge] Direct IPC: Updating password in database...');
      UserRepository.updatePassword(adminUser.id, newPasswordHash);

      // 使所有现有 token 失效 / Invalidate all existing tokens
      AuthService.invalidateAllTokens();

      // 清除旧的初始密码 / Clear old initial password
      clearInitialAdminPassword();

      console.log('[WebUI Bridge] Direct IPC: Password reset successful, returning newPassword');
      return { success: true, newPassword };
    } catch (error) {
      console.error('[WebUI Bridge] Direct IPC: Reset password error:', error);
      return { success: false, msg: error instanceof Error ? error.message : 'Failed to reset password' };
    }
  });

  // 直接 IPC: 获取状态 / Direct IPC: Get status
  ipcMain.handle('webui-direct-get-status', async () => {
    console.log('[WebUI Bridge] Direct IPC: getStatus invoked');
    try {
      await loadWebServerFunctions();

      const adminUser = UserRepository.findByUsername(AUTH_CONFIG.DEFAULT_USER.USERNAME);
      const running = webServerInstance !== null;
      const port = webServerInstance?.port ?? SERVER_CONFIG.DEFAULT_PORT;
      const allowRemote = webServerInstance?.allowRemote ?? false;

      const localUrl = `http://localhost:${port}`;
      const lanIP = getLanIP();
      const networkUrl = allowRemote && lanIP ? `http://${lanIP}:${port}` : undefined;

      const status: IWebUIStatus = {
        running,
        port,
        allowRemote,
        localUrl,
        networkUrl,
        lanIP: lanIP ?? undefined,
        adminUsername: adminUser?.username ?? AUTH_CONFIG.DEFAULT_USER.USERNAME,
        initialPassword: getInitialAdminPassword() ?? undefined,
      };

      return { success: true, data: status };
    } catch (error) {
      console.error('[WebUI Bridge] Direct IPC: Get status error:', error);
      return { success: false, msg: 'Failed to get WebUI status' };
    }
  });

  console.log('[WebUI Bridge] Direct IPC handlers registered');
}
