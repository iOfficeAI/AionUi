/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { networkInterfaces } from 'os';
import type { IWebUIStatus } from '@/common/adapter/ipcBridge';
import { clearInitialAdminPassword, getInitialAdminPassword } from '@process/webserver/auth/bootstrapAdminState';
import { AuthService } from '@process/webserver/auth/service/AuthService';
import { UserRepository } from '@process/webserver/auth/repository/UserRepository';
import { AUTH_CONFIG, SERVER_CONFIG } from '@process/webserver/config/constants';

/**
 * WebUI 服务层 - 封装所有 WebUI 相关的业务逻辑
 * WebUI Service Layer - Encapsulates all WebUI-related business logic
 */
export class WebuiService {
  /**
   * 获取局域网 IP 地址
   * Get LAN IP address
   */
  static getLanIP(): string | null {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      const netInfo = nets[name];
      if (!netInfo) continue;

      for (const net of netInfo) {
        // Node.js 18.4+ returns number (4/6), older versions return string ('IPv4'/'IPv6')
        const isIPv4 = net.family === 'IPv4' || (net.family as unknown) === 4;
        const isNotInternal = !net.internal;
        if (isIPv4 && isNotInternal) {
          return net.address;
        }
      }
    }
    return null;
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
      initialPassword: getInitialAdminPassword() ?? undefined,
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
    clearInitialAdminPassword();
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
    clearInitialAdminPassword();

    return newPassword;
  }
}
