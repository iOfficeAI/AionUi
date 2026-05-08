/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Desktop IPC bridge for WebUI direct calls (webui-direct-*).
 * Backed by @aionui/web-host after M6 migration.
 */

import { ipcMain, app } from 'electron';
import bcrypt from 'bcryptjs';
import type { AppMetadata } from '@aionui/web-host';
import { loadConfig, saveConfig, resetPassword } from '@aionui/web-host';
import type { WebUIStatus } from '@/common/types/electron';
import { networkInterfaces } from 'os';
import { generateQRLoginUrlDirect } from './webuiQR';
import { getDataPath } from '@process/utils/utils';

const BCRYPT_SALT_ROUNDS = 10;
// Keep aligned with renderer's WEBUI_DEFAULT_PORT (common/config/constants.ts):
//   production -> 25808, dev -> 25809, multi-instance dev -> 25810
const DEFAULT_WEBUI_PORT = (() => {
  if (process.env.NODE_ENV === 'production') return 25808;
  if (process.env.AIONUI_MULTI_INSTANCE === '1') return 25810;
  return 25809;
})();

// Electron-launched WebUI stores webui.config.json (password hash, etc.)
// alongside the backend's SQLite DB — both under getDataPath() so that the
// settings-toggle WebUI, `--webui` headless, and the `--resetpass` CLI all
// read/write the same auth state. On macOS this resolves to ~/.aionui[-dev],
// a symlink that avoids the spaces in "Application Support".
const getAppMetadata = (): AppMetadata => ({
  version: app.getVersion(),
  isPackaged: app.isPackaged,
  resourcesPath: app.getAppPath(),
  userDataPath: getDataPath(),
});

const getLanIP = (): string | null => {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    const netInfo = nets[name];
    if (!netInfo) continue;
    for (const net of netInfo) {
      const isIPv4 = net.family === 'IPv4' || (net.family as unknown) === 4;
      if (isIPv4 && !net.internal) return net.address;
    }
  }
  return null;
};

type ActiveWebUI = {
  port: number;
  allowRemote: boolean;
  initialPassword?: string;
};

let activeWebUI: ActiveWebUI | null = null;

export const setActiveWebUI = (info: ActiveWebUI | null): void => {
  activeWebUI = info;
};

async function getStatus(): Promise<WebUIStatus> {
  const cfg = await loadConfig(getAppMetadata());
  const running = activeWebUI !== null;
  const port = activeWebUI?.port ?? DEFAULT_WEBUI_PORT;
  const allowRemote = activeWebUI?.allowRemote ?? false;
  const lanIP = getLanIP();
  return {
    running,
    port,
    allowRemote,
    localUrl: `http://localhost:${port}`,
    networkUrl: allowRemote && lanIP ? `http://${lanIP}:${port}` : undefined,
    lanIP: lanIP ?? undefined,
    adminUsername: cfg.adminUsername || 'admin',
    initialPassword: activeWebUI?.initialPassword,
  };
}

async function changePasswordDirect(newPassword: string): Promise<void> {
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new Error('PASSWORD_TOO_SHORT');
  }
  const metadata = getAppMetadata();
  const cfg = await loadConfig(metadata);
  const hash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
  await saveConfig(metadata, {
    ...cfg,
    passwordHash: hash,
    adminUsername: cfg.adminUsername || 'admin',
    passwordUpdatedAt: new Date().toISOString(),
  });
  if (activeWebUI) activeWebUI.initialPassword = undefined;
}

async function changeUsernameDirect(newUsername: string): Promise<string> {
  const normalized = (newUsername || '').trim();
  if (!normalized) throw new Error('USERNAME_EMPTY');
  const metadata = getAppMetadata();
  const cfg = await loadConfig(metadata);
  if (cfg.adminUsername === normalized) return normalized;
  await saveConfig(metadata, { ...cfg, adminUsername: normalized });
  return normalized;
}

export function initWebuiBridge(): void {
  ipcMain.handle('webui-direct-get-status', async () => {
    try {
      const data = await getStatus();
      return { success: true, data };
    } catch (error) {
      console.error('[WebUI Bridge] getStatus error:', error);
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'getStatus failed',
      };
    }
  });

  ipcMain.handle('webui-direct-change-password', async (_event, payload: { newPassword?: string } = {}) => {
    try {
      await changePasswordDirect(payload.newPassword ?? '');
      return { success: true };
    } catch (error) {
      console.error('[WebUI Bridge] changePassword error:', error);
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'changePassword failed',
      };
    }
  });

  ipcMain.handle('webui-direct-change-username', async (_event, payload: { newUsername?: string } = {}) => {
    try {
      const username = await changeUsernameDirect(payload.newUsername ?? '');
      return { success: true, data: { username } };
    } catch (error) {
      console.error('[WebUI Bridge] changeUsername error:', error);
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'changeUsername failed',
      };
    }
  });

  ipcMain.handle('webui-direct-reset-password', async () => {
    try {
      const newPassword = await resetPassword({ app: getAppMetadata() });
      if (activeWebUI) activeWebUI.initialPassword = undefined;
      return { success: true, newPassword };
    } catch (error) {
      console.error('[WebUI Bridge] resetPassword error:', error);
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'resetPassword failed',
      };
    }
  });

  ipcMain.handle('webui-direct-generate-qr-token', async () => {
    try {
      if (!activeWebUI) {
        return { success: false, msg: 'WebUI is not running' };
      }
      const result = generateQRLoginUrlDirect(activeWebUI.port, activeWebUI.allowRemote);
      const tokenMatch = /token=([a-f0-9]+)/.exec(result.qrUrl);
      const token = tokenMatch ? tokenMatch[1] : '';
      return {
        success: true,
        data: {
          token,
          expiresAt: result.expiresAt,
          qrUrl: result.qrUrl,
        },
      };
    } catch (error) {
      console.error('[WebUI Bridge] generateQRToken error:', error);
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'generateQRToken failed',
      };
    }
  });
}
