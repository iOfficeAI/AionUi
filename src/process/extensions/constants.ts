/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import * as os from 'os';
import { app } from 'electron';
import { getEnvAwareName } from '@/common/config/appEnv';

export const AIONUI_EXTENSIONS_PATH_ENV = 'AIONUI_EXTENSIONS_PATH';
export const AIONUI_STRICT_ENV_ENV = 'AIONUI_STRICT_ENV';
export const EXTENSION_MANIFEST_FILE = 'aion-extension.json';
export const EXTENSIONS_DIR_NAME = 'extensions';
export const PATH_SEPARATOR = process.platform === 'win32' ? ';' : ':';

export function getUserExtensionsDir(): string {
  return path.join(os.homedir(), getEnvAwareName('.aionui'), EXTENSIONS_DIR_NAME);
}

export function getAppDataExtensionsDir(): string {
  try {
    return path.join(app.getPath('userData'), EXTENSIONS_DIR_NAME);
  } catch {
    const appData = process.env.APPDATA || path.join(os.homedir(), '.config');
    return path.join(appData, 'AionUI', EXTENSIONS_DIR_NAME);
  }
}

export function getEnvExtensionsDirs(): string[] {
  const envPath = process.env[AIONUI_EXTENSIONS_PATH_ENV];
  if (!envPath) return [];
  return envPath.split(PATH_SEPARATOR).filter(Boolean);
}
