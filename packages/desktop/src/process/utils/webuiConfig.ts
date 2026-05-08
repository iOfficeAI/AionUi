/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { ProcessConfig, getSystemDir } from './initStorage';
import { startWebHost } from '@aionui/web-host';
import { resolveBinaryPath } from '../backend';
import { setActiveWebUI } from '../bridge/webuiBridge';
import { getDataPath } from './utils';

const WEBUI_CONFIG_FILE = 'webui.config.json';
const DESKTOP_WEBUI_ENABLED_KEY = 'webui.desktop.enabled';
const DESKTOP_WEBUI_ALLOW_REMOTE_KEY = 'webui.desktop.allowRemote';
const DESKTOP_WEBUI_PORT_KEY = 'webui.desktop.port';

export type WebUIUserConfig = {
  port?: number | string;
  allowRemote?: boolean;
};

export const parsePortValue = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const portNumber = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (!Number.isFinite(portNumber) || portNumber < 1 || portNumber > 65535) {
    return null;
  }
  return portNumber;
};

export const parseBooleanEnv = (value?: string): boolean | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
};

export const loadUserWebUIConfig = (): { config: WebUIUserConfig; path: string | null; exists: boolean } => {
  try {
    const userDataPath = app.getPath('userData');
    const configPath = path.join(userDataPath, WEBUI_CONFIG_FILE);
    if (!fs.existsSync(configPath)) {
      return { config: {}, path: configPath, exists: false };
    }

    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { config: {}, path: configPath, exists: false };
    }
    return { config: parsed as WebUIUserConfig, path: configPath, exists: true };
  } catch {
    return { config: {}, path: null, exists: false };
  }
};

// Keep aligned with renderer's WEBUI_DEFAULT_PORT (common/config/constants.ts):
//   production -> 25808, dev -> 25809, multi-instance dev -> 25810
const DEFAULT_WEBUI_PORT = (() => {
  if (process.env.NODE_ENV === 'production') return 25808;
  if (process.env.AIONUI_MULTI_INSTANCE === '1') return 25810;
  return 25809;
})();

export const resolveWebUIPort = (
  config: WebUIUserConfig,
  getSwitchValue: (flag: string) => string | undefined
): number => {
  const cliPort = parsePortValue(getSwitchValue('port') ?? getSwitchValue('webui-port'));
  if (cliPort) return cliPort;

  const envPort = parsePortValue(process.env.AIONUI_PORT ?? process.env.PORT);
  if (envPort) return envPort;

  const configPort = parsePortValue(config.port);
  if (configPort) return configPort;

  return DEFAULT_WEBUI_PORT;
};

export const resolveRemoteAccess = (config: WebUIUserConfig, isRemoteMode: boolean): boolean => {
  const envRemote = parseBooleanEnv(process.env.AIONUI_ALLOW_REMOTE || process.env.AIONUI_REMOTE);
  const hostHint = process.env.AIONUI_HOST?.trim();
  const hostRequestsRemote = hostHint ? ['0.0.0.0', '::', '::0'].includes(hostHint) : false;
  const configRemote = config.allowRemote === true;

  return isRemoteMode || hostRequestsRemote || envRemote === true || configRemote;
};

export const restoreDesktopWebUIFromPreferences = async (): Promise<void> => {
  try {
    const enabled = (await ProcessConfig.get(DESKTOP_WEBUI_ENABLED_KEY)) === true;
    if (!enabled) return;

    const [allowRemotePref, portPref] = await Promise.all([
      ProcessConfig.get(DESKTOP_WEBUI_ALLOW_REMOTE_KEY),
      ProcessConfig.get(DESKTOP_WEBUI_PORT_KEY),
    ]);
    const allowRemote = allowRemotePref === true;
    const preferredPort = typeof portPref === 'number' && portPref > 0 ? portPref : DEFAULT_WEBUI_PORT;

    // M6: Switch to @aionui/web-host
    const handle = await startWebHost({
      app: {
        version: app.getVersion(),
        isPackaged: app.isPackaged,
        resourcesPath: app.getAppPath(),
        // webui.config.json lives under userDataPath and must match the path
        // used by --resetpass and the settings-toggle `changePassword` IPC,
        // otherwise the browser login reads a different config file than the
        // one the CLI just rewrote. getDataPath() returns ~/.aionui[-dev]
        // symlink on macOS to keep CLI tools off paths containing spaces.
        userDataPath: getDataPath(),
      },
      // After bundling, this file is part of out/main/index.js, so __dirname is
      // "<app>/out/main". Renderer assets live at "<app>/out/renderer".
      staticDir: path.join(__dirname, '../renderer'),
      port: preferredPort,
      allowRemote,
      // Must match the desktop IPC path's backend data-dir (packages/desktop/src/index.ts:493),
      // otherwise the WebUI-path backend and the desktop-IPC-path backend read/write two
      // different SQLite databases and users see disjoint conversations / cron jobs.
      dataDir: getDataPath(),
      logDir: getSystemDir().logDir,
      // Match the desktop IPC path's AIONUI_{CACHE,WORK,LOG}_DIR env so that
      // /api/system/info reports the same workDir (symlink on macOS) whether
      // the user opens the desktop app or the bundled WebUI.
      dirs: (() => {
        const s = getSystemDir();
        return { cacheDir: s.cacheDir, workDir: s.workDir, logDir: s.logDir };
      })(),
      backend: {
        kind: 'ownBackend',
        resolveBackend: resolveBinaryPath,
      },
    });
    setActiveWebUI({
      port: handle.port,
      allowRemote,
      initialPassword: handle.initialPassword,
    });
    console.log(`[WebUI] Auto-restored from desktop preferences (port=${handle.port}, backendPort=${handle.backendPort}, allowRemote=${allowRemote})`);
  } catch (error) {
    console.error('[WebUI] Failed to auto-restore from desktop preferences:', error);
  }
};
