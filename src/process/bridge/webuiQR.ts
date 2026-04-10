/**
 * QR login helpers — no Electron imports.
 * Shared between webuiBridge.ts (Electron mode) and webserver/index.ts (standalone mode).
 *
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { AuthService } from '@process/webserver/auth/service/AuthService';
import { UserRepository } from '@process/webserver/auth/repository/UserRepository';
import { WebuiService } from './services/WebuiService';

// QR Token 存储 (内存中，有效期短) / QR Token store (in-memory, short-lived)
// 增加 allowLocalOnly 标志，限制本地模式下只能从本地网络使用
// Added allowLocalOnly flag to restrict local mode to local network only
const qrTokenStore = new Map<string, { expiresAt: number; used: boolean; allowLocalOnly: boolean }>();

// QR Token 有效期 5 分钟 / QR Token validity: 5 minutes
const QR_TOKEN_EXPIRY = 5 * 60 * 1000;

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
 * 直接验证 QR Token（供 authRoutes 使用，无需 IPC）
 * Verify QR token directly (for authRoutes, no IPC needed)
 *
 * @param qrToken - QR token string
 * @param clientIP - 客户端 IP 地址（用于本地网络限制）/ Client IP address (for local network restriction)
 */
export async function verifyQRTokenDirect(
  qrToken: string,
  clientIP?: string
): Promise<{
  success: boolean;
  data?: { sessionToken: string; username: string };
  msg?: string;
}> {
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
      console.warn(`[WebUI QR] QR token rejected: non-local IP ${clientIP} attempted to use local-only token`);
      return {
        success: false,
        msg: 'QR login is only allowed from local network',
      };
    }

    // 标记为已使用 / Mark as used
    tokenData.used = true;

    // 获取管理员用户 / Get admin user
    const adminUser = await UserRepository.getPrimaryWebUIUser();
    if (!adminUser) {
      return {
        success: false,
        msg: 'WebUI user not found',
      };
    }

    // 生成会话 token / Generate session token
    const sessionToken = await AuthService.generateToken(adminUser);

    // 更新最后登录时间 / Update last login time
    await UserRepository.updateLastLogin(adminUser.id);

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
    console.error('[WebUI QR] Verify QR token error:', error);
    return {
      success: false,
      msg: error instanceof Error ? error.message : 'Failed to verify QR token',
    };
  }
}
