/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcMain } from 'electron';
import { webui } from '@/common/adapter/ipcBridge';
import { SERVER_CONFIG } from '@process/webserver/config/constants';
import { WebuiService } from './services/WebuiService';
import { generateQRLoginUrlDirect, verifyQRTokenDirect } from './webuiQR';
// 预加载 webserver 模块避免启动时延迟 / Preload webserver module to avoid startup delay
import { startWebServerWithInstance } from '@process/webserver/index';
import { cleanupWebAdapter } from '@process/webserver/adapter';

export { generateQRLoginUrlDirect, verifyQRTokenDirect };

// WebUI 服务器实例引用 / WebUI server instance reference
let webServerInstance: {
  server: import('http').Server;
  wss: import('ws').WebSocketServer;
  port: number;
  allowRemote: boolean;
} | null = null;

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
      // If server is already running, stop it first (supports restart for config changes)
      // 如果服务器已在运行，先停止（支持配置变更时的重启）
      if (webServerInstance) {
        try {
          const { server: oldServer, wss: oldWss } = webServerInstance;
          oldWss.clients.forEach((client) => client.close(1000, 'Server restarting'));
          await new Promise<void>((resolve) => {
            oldServer.close(() => resolve());
            // Force resolve after 2s to avoid hanging
            setTimeout(resolve, 2000);
          });
          cleanupWebAdapter();
        } catch (err) {
          console.warn('[WebUI Bridge] Error stopping previous server:', err);
        }
        webServerInstance = null;
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

  webui.changeUsername.provider(async ({ newUsername }) => {
    return WebuiService.handleAsync(async () => {
      const username = await WebuiService.changeUsername(newUsername);
      return { success: true, data: { username } };
    }, 'Change username');
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
      const { port, allowRemote } = webServerInstance;
      const { qrUrl, expiresAt } = generateQRLoginUrlDirect(port, allowRemote);
      // Extract token from QR URL
      const token = new URL(qrUrl).searchParams.get('token') ?? '';

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
    return verifyQRTokenDirect(qrToken);
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

  ipcMain.handle('webui-direct-change-username', async (_event, { newUsername }: { newUsername: string }) => {
    return WebuiService.handleAsync(async () => {
      const username = await WebuiService.changeUsername(newUsername);
      return { success: true, data: { username } };
    }, 'Direct IPC: Change username');
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
      const { port, allowRemote } = webServerInstance;
      const { qrUrl, expiresAt } = generateQRLoginUrlDirect(port, allowRemote);
      // Extract token from QR URL
      const token = new URL(qrUrl).searchParams.get('token') ?? '';

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
