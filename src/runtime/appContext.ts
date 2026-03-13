/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os';
import * as path from 'path';

type AppPathKey = 'home' | 'temp' | 'userData';

type ElectronAppLike = {
  getPath: (name: AppPathKey) => string;
  getAppPath: () => string;
  isPackaged: boolean;
};

function tryGetElectronApp(): ElectronAppLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron') as { app?: ElectronAppLike };
    if (electron?.app?.getPath && electron.app.getAppPath) {
      return electron.app;
    }
  } catch {
    // ignore when running outside electron
  }
  return null;
}

const runtimeRoot = process.env.AIONUI_USER_DATA_DIR || process.env.AIONUI_RUNTIME_DIR || path.join(os.homedir(), '.aionui-runtime');

function getFallbackPath(name: AppPathKey): string {
  switch (name) {
    case 'home':
      return os.homedir();
    case 'temp':
      return os.tmpdir();
    case 'userData':
      return runtimeRoot;
    default:
      return runtimeRoot;
  }
}

const electronApp = tryGetElectronApp();

export const runtimeApp = {
  getPath(name: AppPathKey): string {
    if (electronApp) {
      return electronApp.getPath(name);
    }
    return getFallbackPath(name);
  },

  getAppPath(): string {
    if (electronApp) {
      return electronApp.getAppPath();
    }
    return process.cwd();
  },

  get isPackaged(): boolean {
    if (electronApp) {
      return electronApp.isPackaged;
    }
    return process.env.NODE_ENV === 'production';
  },
};
