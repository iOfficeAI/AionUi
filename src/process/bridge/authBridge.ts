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

  ipcBridge.googleAuth.login.provider(async ({ proxy }) => {
    try {
      const config = new Config({
        proxy,
        sessionId: '',
        targetDir: '',
        debugMode: false,
        cwd: '',
        model: '',
      });
      const client = await loginWithOauth(AuthType.LOGIN_WITH_GOOGLE, config);

      if (client) {
        // After successful login, get the actual account info
        try {
          const oauthInfo = await getOauthInfoWithCache(proxy);
          if (oauthInfo && oauthInfo.email) {
            return { success: true, data: { account: oauthInfo.email } };
          }
        } catch (error) {
          console.warn('[Auth] Failed to get OAuth info after login:', error);
          // Even if we can't get the email, login was successful
          return { success: true };
        }
        return { success: true, data: { account: '' } };
      }
      return { success: false, msg: 'Login failed: No client returned' };
    } catch (error) {
      console.error('[Auth] Login error:', error);
      return { success: false, msg: error.message || error.toString() };
    }
  });

  ipcBridge.googleAuth.logout.provider(async () => {
    return await clearCachedCredentialFile();
  });
}
