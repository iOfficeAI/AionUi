/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getOauthInfoWithCache, Storage } from '@office-ai/aioncli-core';
import { ipcBridge } from '@/common';
import { promises as fsAsync } from 'node:fs';

export function initAuthBridge(): void {
  ipcBridge.googleAuth.status.provider(async ({ proxy }) => {
    try {
      const credsPath = Storage.getOAuthCredsPath();

      // Check credential file existence without blocking the main process
      try {
        await fsAsync.access(credsPath);
      } catch {
        // 凭证文件不存在时直接返回，避免触发底层 ENOENT 日志
        // Return early when credential file is missing to avoid noisy ENOENT logs
        return { success: false };
      }

      // 首先尝试从缓存获取用户信息
      // First try to get user info from cache
      const info = await getOauthInfoWithCache(proxy);

      if (info) return { success: true, data: { account: info.email } };

      // 如果缓存获取失败，检查凭证文件是否存在
      // If cache retrieval failed, check if credential file exists
      // 这种情况可能是：终端已登录但 google_accounts.json 的 active 为 null
      // This can happen when: terminal is logged in but google_accounts.json has active: null
      try {
        // 凭证文件存在但 getOauthInfoWithCache 失败，可能是令牌需要刷新
        // Credentials file exists but getOauthInfoWithCache failed, token may need refresh
        // 读取凭证文件检查是否有 refresh_token
        // Read credentials file to check for refresh_token
        const credsContent = await fsAsync.readFile(credsPath, 'utf-8');
        const creds = JSON.parse(credsContent);
        if (creds.refresh_token) {
          // 有 refresh_token，凭证有效但可能需要在使用时刷新
          // Has refresh_token, credentials are valid but may need refresh when used
          console.log('[Auth] Credentials exist with refresh_token, returning success');
          return { success: true, data: { account: 'Logged in (refresh needed)' } };
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
}
