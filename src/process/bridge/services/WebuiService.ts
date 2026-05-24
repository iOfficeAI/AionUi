/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { networkInterfaces, type NetworkInterfaceInfo } from 'os';
import type { IWebUIStatus } from '@/common/adapter/ipcBridge';
import { AuthService } from '@process/webserver/auth/service/AuthService';
import { UserRepository } from '@process/webserver/auth/repository/UserRepository';
import { AUTH_CONFIG, SERVER_CONFIG } from '@process/webserver/config/constants';

type NetworkInterfaceMap = ReturnType<typeof networkInterfaces>;

function isIPv4Interface(net: NetworkInterfaceInfo): boolean {
  return net.family === 'IPv4' || (net.family as unknown) === 4;
}

function parseIPv4(address: string): number[] | null {
  const parts = address.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts;
}

function isTailscaleAddress(address: string): boolean {
  const parts = parseIPv4(address);
  return Boolean(parts && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
}

function isPrivateAddress(address: string): boolean {
  const parts = parseIPv4(address);
  if (!parts) return false;

  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;

  return false;
}

function isLinkLocalAddress(address: string): boolean {
  const parts = parseIPv4(address);
  return Boolean(parts && parts[0] === 169 && parts[1] === 254);
}

function scoreRemoteAddress(interfaceName: string, address: string): number {
  const normalizedName = interfaceName.toLowerCase();

  if (isLinkLocalAddress(address)) {
    return Number.NEGATIVE_INFINITY;
  }

  if (normalizedName.includes('tailscale') || isTailscaleAddress(address)) {
    return 1000;
  }

  let score = 0;

  if (isPrivateAddress(address)) {
    score += 100;
  }

  if (/^(wi-?fi|wlan|ethernet|en\d+|eth\d+)/i.test(interfaceName)) {
    score += 50;
  }

  if (address.startsWith('192.168.')) {
    score += 30;
  } else if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(address)) {
    score += 20;
  } else if (address.startsWith('10.')) {
    score += 10;
  } else {
    score += 5;
  }

  if (/(vpn|virtual|anyconnect|vmware|hyper-v|vbox|bluetooth)/i.test(interfaceName)) {
    score -= 40;
  }

  return score;
}

export function selectPreferredRemoteAddress(nets: NetworkInterfaceMap): string | null {
  const candidates: Array<{ address: string; order: number; score: number }> = [];
  let order = 0;

  for (const name of Object.keys(nets)) {
    const netInfo = nets[name];
    if (!netInfo) continue;

    for (const net of netInfo) {
      if (!isIPv4Interface(net) || net.internal) {
        continue;
      }

      const score = scoreRemoteAddress(name, net.address);
      if (score === Number.NEGATIVE_INFINITY) {
        continue;
      }

      candidates.push({ address: net.address, order, score });
      order += 1;
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.order - b.order);
  return candidates[0]?.address ?? null;
}

/**
 * WebUI 服务层 - 封装所有 WebUI 相关的业务逻辑
 * WebUI Service Layer - Encapsulates all WebUI-related business logic
 */
export class WebuiService {
  private static webServerFunctionsLoaded = false;
  private static _getInitialAdminPassword: (() => string | null) | null = null;
  private static _clearInitialAdminPassword: (() => void) | null = null;

  /**
   * 加载 webserver 函数（避免循环依赖）
   * Load webserver functions (avoid circular dependency)
   */
  private static async loadWebServerFunctions(): Promise<void> {
    if (this.webServerFunctionsLoaded) return;

    const webServer = await import('@process/webserver/index');
    this._getInitialAdminPassword = webServer.getInitialAdminPassword;
    this._clearInitialAdminPassword = webServer.clearInitialAdminPassword;
    this.webServerFunctionsLoaded = true;
  }

  /**
   * 获取初始管理员密码
   * Get initial admin password
   */
  private static getInitialAdminPassword(): string | null {
    return this._getInitialAdminPassword?.() ?? null;
  }

  /**
   * 清除初始管理员密码
   * Clear initial admin password
   */
  private static clearInitialAdminPassword(): void {
    this._clearInitialAdminPassword?.();
  }

  /**
   * 获取局域网 IP 地址
   * Get LAN IP address
   */
  static getLanIP(): string | null {
    return selectPreferredRemoteAddress(networkInterfaces());
  }

  /**
   * 统一的异步错误处理包装器
   * Unified async error handling wrapper
   */
  static async handleAsync<T>(
    handler: () => Promise<{ success: boolean; data?: T; msg?: string }>,
    context = 'Operation'
  ): Promise<{ success: boolean; data?: T; msg?: string }> {
    try {
      return await handler();
    } catch (error) {
      console.error(`[WebUI Service] ${context} error:`, error);
      return {
        success: false,
        msg: error instanceof Error ? error.message : `${context} failed`,
      };
    }
  }

  /**
   * 获取管理员用户（带自动加载）
   * Get admin user (with auto-loading)
   */
  static async getAdminUser() {
    await this.loadWebServerFunctions();
    const adminUser = await UserRepository.getPrimaryWebUIUser();
    if (!adminUser) {
      throw new Error('WebUI user not found');
    }
    return adminUser;
  }

  /**
   * 获取 WebUI 状态
   * Get WebUI status
   */
  static async getStatus(
    webServerInstance: {
      server: import('http').Server;
      wss: import('ws').WebSocketServer;
      port: number;
      allowRemote: boolean;
    } | null
  ): Promise<IWebUIStatus> {
    await this.loadWebServerFunctions();

    const adminUser = await UserRepository.getPrimaryWebUIUser();
    const running = webServerInstance !== null;
    const port = webServerInstance?.port ?? SERVER_CONFIG.DEFAULT_PORT;
    const allowRemote = webServerInstance?.allowRemote ?? false;

    const localUrl = `http://localhost:${port}`;
    const lanIP = this.getLanIP();
    const networkUrl = allowRemote && lanIP ? `http://${lanIP}:${port}` : undefined;

    return {
      running,
      port,
      allowRemote,
      localUrl,
      networkUrl,
      lanIP: lanIP ?? undefined,
      adminUsername: adminUser?.username ?? AUTH_CONFIG.DEFAULT_USER.USERNAME,
      initialPassword: this.getInitialAdminPassword() ?? undefined,
    };
  }

  /**
   * 修改密码（不需要当前密码验证）
   * Change password (no current password verification required)
   */
  static async changePassword(newPassword: string): Promise<void> {
    const adminUser = await this.getAdminUser();

    // 验证新密码强度 / Validate new password strength
    const passwordValidation = AuthService.validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      throw new Error(passwordValidation.errors.join('; '));
    }

    // 更新密码（密文存储）/ Update password (encrypted storage)
    const newPasswordHash = await AuthService.hashPassword(newPassword);
    await UserRepository.updatePassword(adminUser.id, newPasswordHash);

    // 使所有现有 token 失效 / Invalidate all existing tokens
    await AuthService.invalidateAllTokens();

    // 清除初始密码（用户已修改密码）/ Clear initial password (user has changed password)
    this.clearInitialAdminPassword();
  }

  static async changeUsername(newUsername: string): Promise<string> {
    const adminUser = await this.getAdminUser();
    const normalizedUsername = newUsername.trim();

    const usernameValidation = AuthService.validateUsername(normalizedUsername);
    if (!usernameValidation.isValid) {
      throw new Error(usernameValidation.errors.join('; '));
    }

    const existingUser = await UserRepository.findByUsername(normalizedUsername);
    if (existingUser && existingUser.id !== adminUser.id) {
      throw new Error('Username already exists');
    }

    if (normalizedUsername === adminUser.username) {
      return adminUser.username;
    }

    await UserRepository.updateUsername(adminUser.id, normalizedUsername);
    await AuthService.invalidateAllTokens();

    return normalizedUsername;
  }

  /**
   * 重置密码（生成新的随机密码）
   * Reset password (generate new random password)
   */
  static async resetPassword(): Promise<string> {
    const adminUser = await this.getAdminUser();

    // 生成新的随机密码 / Generate new random password
    const newPassword = AuthService.generateRandomPassword();
    const newPasswordHash = await AuthService.hashPassword(newPassword);

    // 更新密码 / Update password
    await UserRepository.updatePassword(adminUser.id, newPasswordHash);

    // 使所有现有 token 失效 / Invalidate all existing tokens
    await AuthService.invalidateAllTokens();

    // 清除旧的初始密码 / Clear old initial password
    this.clearInitialAdminPassword();

    return newPassword;
  }
}
