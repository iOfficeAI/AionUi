/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';
import fs from 'fs';
import path from 'path';

export type StartupSettings = {
  startOnBoot: boolean;
  // Whether to start WebUI service on boot. Does NOT affect login-item args.
  openWebUiOnBoot: boolean;
  // When launched by login item, run without showing main window.
  silentOnBoot: boolean;

  // Close button behavior (all launches): if true, closing window hides to tray.
  closeToTray: boolean;
};

// Marker used for Windows/Linux autostart launches.
// macOS does not support passing args reliably for login items.
export const AUTOSTART_LAUNCH_ARG = '--aionui-autostart';

const getLinuxAutostartFilePath = (): string => {
  const autostartDir = path.join(app.getPath('home'), '.config', 'autostart');
  return path.join(autostartDir, 'AionUi.desktop');
};

const buildAutostartArgs = (): string[] => {
  // IMPORTANT: We do not pass --webui from login item.
  // WebUI service should be started independently without switching app mode.
  return [AUTOSTART_LAUNCH_ARG];
};

const isWindowsSquirrelInstall = (): { isSquirrel: boolean; updateExePath: string } => {
  // Typical Squirrel layout:
  //   .../YourApp/app-<version>/YourApp.exe
  //   .../YourApp/Update.exe
  const updateExePath = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
  return { isSquirrel: fs.existsSync(updateExePath), updateExePath };
};

const applyWindowsLoginItem = (settings: StartupSettings): void => {
  const args = buildAutostartArgs();
  const { isSquirrel, updateExePath } = isWindowsSquirrelInstall();

  if (isSquirrel) {
    const exeName = path.basename(process.execPath);
    app.setLoginItemSettings({
      openAtLogin: settings.startOnBoot,
      path: updateExePath,
      // Squirrel requires Update.exe to be used as the launcher.
      // It expects args in a very specific form.
      args: settings.startOnBoot ? ['--processStart', exeName, '--process-start-args', args.join(' ')] : undefined,
    });
    return;
  }

  // NSIS / portable builds: run the app executable directly.
  app.setLoginItemSettings({
    openAtLogin: settings.startOnBoot,
    path: process.execPath,
    args: settings.startOnBoot ? args : undefined,
  });
};

const applyMacLoginItem = (settings: StartupSettings): void => {
  app.setLoginItemSettings({
    openAtLogin: settings.startOnBoot,
  });
};

const ensureDir = (dirPath: string): void => {
  if (fs.existsSync(dirPath)) return;
  fs.mkdirSync(dirPath, { recursive: true });
};

const applyLinuxLoginItem = (settings: StartupSettings): void => {
  const autostartFile = getLinuxAutostartFilePath();
  const autostartDir = path.dirname(autostartFile);

  if (!settings.startOnBoot) {
    if (fs.existsSync(autostartFile)) {
      fs.unlinkSync(autostartFile);
    }
    return;
  }

  ensureDir(autostartDir);

  const exec = `"${process.execPath}"`;
  const args = buildAutostartArgs().join(' ');
  const desktopEntry = `[Desktop Entry]
Type=Application
Name=AionUi
Exec=${exec} ${args}
Terminal=false
X-GNOME-Autostart-enabled=true
Hidden=false
`;

  fs.writeFileSync(autostartFile, desktopEntry, 'utf-8');
};

export const applyStartupSettingsToSystem = (settings: StartupSettings): Promise<void> => {
  // In development (`electron-forge start`), `process.execPath` points to the Electron binary,
  // not the packaged app executable. Registering login items in this case would create broken
  // autostart entries (or worse: point at Electron itself). Only apply OS autostart in packaged builds.
  if (!app.isPackaged) {
    return Promise.resolve();
  }

  // Apply to OS immediately. This is safe to call after app.whenReady().
  if (process.platform === 'win32') {
    applyWindowsLoginItem(settings);
    return Promise.resolve();
  }
  if (process.platform === 'darwin') {
    applyMacLoginItem(settings);
    return Promise.resolve();
  }
  if (process.platform === 'linux') {
    applyLinuxLoginItem(settings);
  }
  return Promise.resolve();
};

export const getLinuxAutostartEnabled = (): boolean => {
  if (process.platform !== 'linux') return false;
  return fs.existsSync(getLinuxAutostartFilePath());
};

const getWindowsAutostartEnabled = (): boolean => {
  const args = buildAutostartArgs();
  const { isSquirrel, updateExePath } = isWindowsSquirrelInstall();

  if (isSquirrel) {
    const exeName = path.basename(process.execPath);
    return (
      app.getLoginItemSettings({
        path: updateExePath,
        args: ['--processStart', exeName, '--process-start-args', args.join(' ')],
      }).openAtLogin === true
    );
  }

  return (
    app.getLoginItemSettings({
      path: process.execPath,
      args,
    }).openAtLogin === true
  );
};

export const getEffectiveStartOnBoot = (): boolean | undefined => {
  try {
    if (process.platform === 'linux') {
      return getLinuxAutostartEnabled();
    }
    if (process.platform === 'win32') {
      return getWindowsAutostartEnabled();
    }

    return app.getLoginItemSettings().openAtLogin === true;
  } catch {
    return undefined;
  }
};

export const wasLaunchedAtLogin = (): boolean => {
  if (process.platform === 'darwin') {
    return app.getLoginItemSettings().wasOpenedAtLogin === true;
  }

  return process.argv.includes(AUTOSTART_LAUNCH_ARG);
};
