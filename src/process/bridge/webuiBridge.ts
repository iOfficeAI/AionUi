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
// 预加载 webserver 模块避免启动时延迟 / Preload webserver module to avoid startup delay
import { startWebServerWithInstance } from '@/webserver/index';
import { cleanupWebAdapter } from '@/webserver/adapter';

// WebUI 服务器实例引用 / WebUI server instance reference
let webServerInstance: {
  server: import('http').Server;
  wss: import('ws').WebSocketServer;
  port: number;
  allowRemote: boolean;
} | null = null;

// QR Token 存储 (内存中，有效期短) / QR Token store (in-memory, short-lived)
// 增加 allowLocalOnly 标志，限制本地模式下只能从本地网络使用
// Added allowLocalOnly flag to restrict local mode to local network only
const qrTokenStore = new Map<string, { expiresAt: number; used: boolean; allowLocalOnly: boolean }>();

// QR Token 有效期 5 分钟 / QR Token validity: 5 minutes
const QR_TOKEN_EXPIRY = 5 * 60 * 1000;

/**
 * 直接生成二维码登录 URL（供服务端启动时调用）
 * Generate QR login URL directly (for server-side use on startup)
 */
export function generateQRLoginUrlDirect(port: number, allowRemote: boolean): { qrUrl: string; expiresAt: number } {
  // 清理过期 token / Clean up expired tokens
  cleanupExpiredTokens();

  // 生成随机 token / Generate random token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + QR_TOKEN_EXPIRY;

  // 存储 token / Store token
  const allowLocalOnly = !allowRemote;
  qrTokenStore.set(token, { expiresAt, used: false, allowLocalOnly });

  // 构建 QR URL / Build QR URL
  const lanIP = WebuiService.getLanIP();
  const baseUrl = allowRemote && lanIP ? `http://${lanIP}:${port}` : `http://localhost:${port}`;
  const qrUrl = `${baseUrl}/qr-login?token=${token}`;

  return { qrUrl, expiresAt };
}

/**
 * 检查 IP 是否为本地/局域网地址
 * Check if IP is localhost or local network address
 */
function isLocalIP(ip: string): boolean {
  if (!ip) return false;
  // 处理 IPv6 格式的 localhost / Handle IPv6 localhost format
  const cleanIP = ip.replace(/^::ffff:/, '');

  // localhost
  if (cleanIP === '127.0.0.1' || cleanIP === 'localhost' || cleanIP === '::1') {
    return true;
  }

  // 私有网络地址 / Private network addresses
  // 10.0.0.0/8
  if (cleanIP.startsWith('10.')) return true;
  // 172.16.0.0/12
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanIP)) return true;
  // 192.168.0.0/16
  if (cleanIP.startsWith('192.168.')) return true;
  // Link-local
  if (cleanIP.startsWith('169.254.')) return true;

  return false;
}

/**
 * 直接验证 QR Token（供 authRoutes 使用，无需 IPC）
 * Verify QR token directly (for authRoutes, no IPC needed)
 *
 * @param qrToken - QR token string
 * @param clientIP - 客户端 IP 地址（用于本地网络限制）/ Client IP address (for local network restriction)
 */
export async function verifyQRTokenDirect(qrToken: string, clientIP?: string): Promise<{ success: boolean; data?: { sessionToken: string; username: string }; msg?: string }> {
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

    // P0 安全修复：检查本地网络限制 / P0 Security fix: Check local network restriction
    if (tokenData.allowLocalOnly && clientIP && !isLocalIP(clientIP)) {
      console.warn(`[WebUI Bridge] QR token rejected: non-local IP ${clientIP} attempted to use local-only token`);
      return {
        success: false,
        msg: 'QR login is only allowed from local network',
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
  // 获取 WebUI 状态 / Get WebUI status
  webui.getStatus.provider(async () => {
    return WebuiService.handleAsync(async () => {
      const status = await WebuiService.getStatus(webServerInstance);
      return { success: true, data: status };
    }, 'Get status');
  });

  // 启动 WebUI / Start WebUI
  webui.start.provider(async ({ port: requestedPort, allowRemote }) => {
    try {
      if (webServerInstance) {
        return {
          success: false,
          msg: 'WebUI is already running',
        };
      }

      const port = requestedPort ?? SERVER_CONFIG.DEFAULT_PORT;
      const remote = allowRemote ?? false;

      // 使用预加载的模块 / Use preloaded module
      const instance = await startWebServerWithInstance(port, remote);
      webServerInstance = instance;

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

      // 清理 WebSocket 广播注册 / Cleanup WebSocket broadcaster registration
      cleanupWebAdapter();

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

  // 修改密码（不需要当前密码）/ Change password (no current password required)
  webui.changePassword.provider(async ({ newPassword }) => {
    return WebuiService.handleAsync(async () => {
      await WebuiService.changePassword(newPassword);
      return { success: true };
    }, 'Change password');
  });

  // 重置密码（生成新随机密码）/ Reset password (generate new random password)
  // 注意：由于 @office-ai/platform bridge 的 provider 模式不支持返回值，
  // 我们通过 emitter 发送结果，前端监听 resetPasswordResult 事件
  // Note: Since @office-ai/platform bridge provider doesn't support return values,
  // we emit the result via emitter, frontend listens to resetPasswordResult event
  webui.resetPassword.provider(async () => {
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
  webui.generateQRToken.provider(async () => {
    // 检查 webServerInstance 状态
    if (!webServerInstance) {
      return {
        success: false,
        msg: 'WebUI is not running. Please start WebUI first.',
      };
    }

    try {
      // 清理过期 token / Clean up expired tokens
      cleanupExpiredTokens();

      // 获取服务器配置 / Get server configuration
      const { port, allowRemote } = webServerInstance;

      // 生成随机 token / Generate random token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + QR_TOKEN_EXPIRY;

      // 存储 token / Store token
      // 如果不是远程模式，则限制只能从本地网络使用
      // If not in remote mode, restrict to local network only
      const allowLocalOnly = !allowRemote;
      qrTokenStore.set(token, { expiresAt, used: false, allowLocalOnly });

      // 构建 QR URL / Build QR URL
      const lanIP = WebuiService.getLanIP();
      const baseUrl = allowRemote && lanIP ? `http://${lanIP}:${port}` : `http://localhost:${port}`;
      const qrUrl = `${baseUrl}/qr-login?token=${token}`;

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

  // ===== 直接 IPC 处理器（绕过 bridge 库）/ Direct IPC handlers (bypass bridge library) =====
  // 这些处理器直接返回结果，不依赖 emitter 模式
  // These handlers return results directly, without relying on emitter pattern

  // 直接 IPC: 重置密码 / Direct IPC: Reset password
  ipcMain.handle('webui-direct-reset-password', async () => {
    return WebuiService.handleAsync(async () => {
      const newPassword = await WebuiService.resetPassword();
      return { success: true, newPassword };
    }, 'Direct IPC: Reset password');
  });

  // 直接 IPC: 获取状态 / Direct IPC: Get status
  ipcMain.handle('webui-direct-get-status', async () => {
    return WebuiService.handleAsync(async () => {
      const status = await WebuiService.getStatus(webServerInstance);
      return { success: true, data: status };
    }, 'Direct IPC: Get status');
  });

  // 直接 IPC: 修改密码（不需要当前密码）/ Direct IPC: Change password (no current password required)
  ipcMain.handle('webui-direct-change-password', async (_event, { newPassword }: { newPassword: string }) => {
    return WebuiService.handleAsync(async () => {
      await WebuiService.changePassword(newPassword);
      return { success: true };
    }, 'Direct IPC: Change password');
  });

  // 直接 IPC: 生成二维码 token / Direct IPC: Generate QR token
  ipcMain.handle('webui-direct-generate-qr-token', async () => {
    // 检查 webServerInstance 状态
    if (!webServerInstance) {
      return {
        success: false,
        msg: 'WebUI is not running. Please start WebUI first.',
      };
    }

    try {
      // 清理过期 token / Clean up expired tokens
      cleanupExpiredTokens();

      // 获取服务器配置 / Get server configuration
      const { port, allowRemote } = webServerInstance;

      // 生成随机 token / Generate random token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + QR_TOKEN_EXPIRY;

      // 存储 token / Store token
      const allowLocalOnly = !allowRemote;
      qrTokenStore.set(token, { expiresAt, used: false, allowLocalOnly });

      // 构建 QR URL / Build QR URL
      const lanIP = WebuiService.getLanIP();
      const baseUrl = allowRemote && lanIP ? `http://${lanIP}:${port}` : `http://localhost:${port}`;
      const qrUrl = `${baseUrl}/qr-login?token=${token}`;

      return {
        success: true,
        data: {
          token,
          expiresAt,
          qrUrl,
        },
      };
    } catch (error) {
      console.error('[WebUI Bridge] Direct IPC: Generate QR token error:', error);
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Failed to generate QR token',
      };
    }
  });
}
