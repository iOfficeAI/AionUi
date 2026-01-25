/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { ipcMain } from 'electron';
import { webui } from '@/common/ipcBridge';
import { AuthService } from '@/webserver/auth/service/AuthService';
import { UserRepository } from '@/webserver/auth/repository/UserRepository';
import { AUTH_CONFIG, SERVER_CONFIG } from '@/webserver/config/constants';
import { WebuiService } from './services/WebuiService';

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

  // 获取 WebUI 状态 / Get WebUI status
  webui.getStatus.provider(async () => {
    console.log('[WebUI Bridge] getStatus handler invoked');
    return WebuiService.handleAsync(async () => {
      const status = await WebuiService.getStatus(webServerInstance);
      return { success: true, data: status };
    }, 'Get status');
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

      // 获取服务器信息 / Get server info
      const status = await WebuiService.getStatus(webServerInstance);
      const localUrl = `http://localhost:${port}`;
      const lanIP = WebuiService.getLanIP();
      const networkUrl = remote && lanIP ? `http://${lanIP}:${port}` : undefined;
      const initialPassword = status.initialPassword;

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
    console.log('[WebUI Bridge] changePassword handler invoked');
    return WebuiService.handleAsync(async () => {
      await WebuiService.changePassword(currentPassword, newPassword);
      return { success: true };
    }, 'Change password');
  });

  // 重置密码（生成新随机密码）/ Reset password (generate new random password)
  // 注意：由于 @office-ai/platform bridge 的 provider 模式不支持返回值，
  // 我们通过 emitter 发送结果，前端监听 resetPasswordResult 事件
  // Note: Since @office-ai/platform bridge provider doesn't support return values,
  // we emit the result via emitter, frontend listens to resetPasswordResult event
  webui.resetPassword.provider(async () => {
    console.log('[WebUI Bridge] resetPassword handler invoked');
    const result = await WebuiService.handleAsync(async () => {
      const newPassword = await WebuiService.resetPassword();
      return { success: true, data: { newPassword } };
    }, 'Reset password');

    // 通过 emitter 发送结果 / Emit result via emitter
    if (result.success && result.data) {
      webui.resetPasswordResult.emit({ success: true, newPassword: result.data.newPassword });
    } else {
      webui.resetPasswordResult.emit({ success: false, msg: result.msg });
    }

    return result;
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
      const lanIP = WebuiService.getLanIP();
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
    return WebuiService.handleAsync(async () => {
      const newPassword = await WebuiService.resetPassword();
      return { success: true, newPassword };
    }, 'Direct IPC: Reset password');
  });

  // 直接 IPC: 获取状态 / Direct IPC: Get status
  ipcMain.handle('webui-direct-get-status', async () => {
    console.log('[WebUI Bridge] Direct IPC: getStatus invoked');
    return WebuiService.handleAsync(async () => {
      const status = await WebuiService.getStatus(webServerInstance);
      return { success: true, data: status };
    }, 'Direct IPC: Get status');
  });

  // 直接 IPC: 修改密码 / Direct IPC: Change password
  ipcMain.handle('webui-direct-change-password', async (_event, { currentPassword, newPassword }: { currentPassword: string; newPassword: string }) => {
    console.log('[WebUI Bridge] Direct IPC: changePassword invoked');
    return WebuiService.handleAsync(async () => {
      await WebuiService.changePassword(currentPassword, newPassword);
      return { success: true };
    }, 'Direct IPC: Change password');
  });

  console.log('[WebUI Bridge] Direct IPC handlers registered');
}
