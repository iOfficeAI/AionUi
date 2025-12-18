/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType, clearCachedCredentialFile, Config, getOauthInfoWithCache, loginWithOauth } from '@office-ai/aioncli-core';
import { ipcBridge } from '../../common';

export function initAuthBridge(): void {
  ipcBridge.googleAuth.status.provider(async ({ proxy }) => {
    try {
      const info = await getOauthInfoWithCache(proxy);

      if (info) return { success: true, data: { account: info.email } };
      return { success: false };
    } catch (e) {
      return { success: false, msg: e.message || e.toString() };
    }
  });

  // Google OAuth 登录处理器
  // Google OAuth login handler
  ipcBridge.googleAuth.login.provider(async ({ proxy }) => {
    try {
      // 创建配置对象，包含代理设置
      // Create config object with proxy settings
      const config = new Config({
        proxy,
        sessionId: '',
        targetDir: '',
        debugMode: false,
        cwd: '',
        model: '',
      });

      // 执行 OAuth 登录流程
      // Execute OAuth login flow
      // 添加超时机制，防止用户未完成登录导致一直卡住 / Add timeout to prevent hanging if user doesn't complete login
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('Login timed out after 2 minutes')), 2 * 60 * 1000);
      });

      const client = await Promise.race([loginWithOauth(AuthType.LOGIN_WITH_GOOGLE, config), timeoutPromise]);

      if (client) {
        // 登录成功后，获取用户账户信息
        // After successful login, get the actual account info
        try {
          const oauthInfo = await getOauthInfoWithCache(proxy);
          if (oauthInfo && oauthInfo.email) {
            return { success: true, data: { account: oauthInfo.email } };
          }
        } catch (error) {
          console.warn('[Auth] Failed to get OAuth info after login:', error);
          // 即使无法获取邮箱，登录仍然是成功的
          // Even if we can't get the email, login was successful
          return { success: true };
        }
        return { success: true, data: { account: '' } };
      }

      // 登录失败，返回错误信息
      // Login failed, return error message
      return { success: false, msg: 'Login failed: No client returned' };
    } catch (error) {
      // 捕获登录过程中的所有异常，避免未处理的错误导致应用弹窗
      // Catch all exceptions during login to prevent unhandled errors from showing error dialogs
      console.error('[Auth] Login error:', error);
      return { success: false, msg: error.message || error.toString() };
    }
  });

  ipcBridge.googleAuth.logout.provider(async () => {
    return await clearCachedCredentialFile();
  });
}
