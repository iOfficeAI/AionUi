/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { App } from 'electron';

/**
 * Windows AppUserModelID for packaged builds.
 *
 * MUST stay in sync with the `appId` field in packages/desktop/electron-builder.yml.
 * The NSIS installer stamps that appId onto the Start Menu shortcut; Windows only
 * delivers toast notifications when the running process registers the same
 * AppUserModelID. Electron performs this registration automatically for
 * Squirrel.Windows installers only, so NSIS builds must do it themselves.
 * Consistency with electron-builder.yml is guarded by a unit test.
 */
export const WINDOWS_APP_USER_MODEL_ID = 'com.aionui.app';

type AppUserModelIdTarget = Pick<App, 'isPackaged' | 'setAppUserModelId'>;

type RegisterWindowsAppUserModelIdOptions = {
  app: AppUserModelIdTarget;
  platform?: NodeJS.Platform;
  execPath?: string;
};

/**
 * Register the process-side AppUserModelID so Windows can deliver toast
 * notifications for NSIS-installed builds. Packaged builds register the
 * electron-builder appId; development builds fall back to process.execPath
 * per the Electron notifications tutorial. No-op on non-Windows platforms.
 *
 * Must be called at main-process module load, before app.whenReady() and
 * before any notification path runs.
 */
export function registerWindowsAppUserModelId(options: RegisterWindowsAppUserModelIdOptions): void {
  const { app, platform = process.platform, execPath = process.execPath } = options;
  if (platform !== 'win32') {
    return;
  }
  app.setAppUserModelId(app.isPackaged ? WINDOWS_APP_USER_MODEL_ID : execPath);
}
