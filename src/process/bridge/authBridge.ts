/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType, clearCachedCredentialFile, Config, getOauthInfoWithCache, loginWithOauth, Storage } from '@office-ai/aioncli-core';
import { ipcBridge } from '../../common';
import * as fs from 'node:fs';

export function initAuthBridge(): void {
  ipcBridge.googleAuth.status.provider(async ({ proxy }) => {
    try {
      // 首先尝试从缓存获取用户信息
      // First try to get user info from cache
      const info = await getOauthInfoWithCache(proxy);

      if (info) return { success: true, data: { account: info.email } };

      // 如果缓存获取失败，检查凭证文件是否存在
      // If cache retrieval failed, check if credential file exists
      // 这种情况可能是：终端已登录但 google_accounts.json 的 active 为 null
      // This can happen when: terminal is logged in but google_accounts.json has active: null
      try {
        const credsPath = Storage.getOAuthCredsPath();
        const credsExist = fs.existsSync(credsPath);
        if (credsExist) {
          // 凭证文件存在但 getOauthInfoWithCache 失败，可能是令牌需要刷新
          // Credentials file exists but getOauthInfoWithCache failed, token may need refresh
          // 读取凭证文件检查是否有 refresh_token
          // Read credentials file to check for refresh_token
          const credsContent = fs.readFileSync(credsPath, 'utf-8');
          const creds = JSON.parse(credsContent);
          if (creds.refresh_token) {
            // 有 refresh_token，凭证有效但可能需要在使用时刷新
            // Has refresh_token, credentials are valid but may need refresh when used
            console.log('[Auth] Credentials exist with refresh_token, returning success');
            return { success: true, data: { account: 'Logged in (refresh needed)' } };
          }
        }
      } catch (fsError) {
        // 忽略文件系统错误，继续返回 false
        // Ignore filesystem errors, continue to return false
        console.debug('[Auth] Error checking credentials file:', fsError);
      }

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
        // 登录成功后，验证凭证是否被正确保存
        // After successful login, verify credentials were saved properly
        try {
          // 短暂延迟确保凭证文件写入完成
          // Brief delay to ensure credential file is written
          await new Promise((resolve) => setTimeout(resolve, 500));

          const oauthInfo = await getOauthInfoWithCache(proxy);
          if (oauthInfo && oauthInfo.email) {
            console.log('[Auth] Login successful, account:', oauthInfo.email);
            return { success: true, data: { account: oauthInfo.email } };
          }

          // 凭证获取失败，说明登录流程虽然返回了 client 但凭证未正确保存
          // Credential retrieval failed - login returned client but credentials weren't saved properly
          console.warn('[Auth] Login completed but no credentials found');
          return {
            success: false,
            msg: 'Login completed but credentials were not saved. Please try again.',
          };
        } catch (error) {
          console.error('[Auth] Failed to verify credentials after login:', error);
          return {
            success: false,
            msg: `Login verification failed: ${error.message || error.toString()}`,
          };
        }
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
