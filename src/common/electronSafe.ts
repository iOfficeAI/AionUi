/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @internal
 *
 * Null-safe Electron shim. Import ONLY from:
 *   - src/process/utils/tray.ts
 *   - src/process/services/conversionService.ts
 *   - src/common/platform/ElectronPlatformServices.ts (imports 'electron' directly, not this file)
 *
 * All other modules must use getPlatformServices() from '@/common/platform' instead.
 */

// import type is erased at compile time — safe to use in this file
import type {
  BrowserWindow as BrowserWindowClass,
  Menu as MenuClass,
  NativeImage as NativeImageClass,
  Notification as NotificationClass,
  Tray as TrayClass,
} from 'electron';

/** Structural type for the module-level utilityProcess export (static side with fork()). */
interface UtilityProcessModule {
  fork(
    modulePath: string,
    args?: string[],
    options?: {
      cwd?: string;
      env?: Record<string, string>;
      [key: string]: unknown;
    }
  ): Electron.UtilityProcess;
}

/** Structural type for the module-level powerSaveBlocker export. */
interface PowerSaveBlockerModule {
  start(type: 'prevent-app-suspension' | 'prevent-display-sleep'): number;
  stop(id: number): void;
  isStarted(id: number): boolean;
}

type ElectronModule = {
  app: Electron.App;
  utilityProcess: UtilityProcessModule;
  powerSaveBlocker: PowerSaveBlockerModule;
  BrowserWindow: typeof BrowserWindowClass;
  Menu: typeof MenuClass;
  nativeImage: { createFromPath(path: string): NativeImageClass };
  Notification: typeof NotificationClass;
  Tray: typeof TrayClass;
};

function loadElectron(): ElectronModule | null {
  if (process.versions?.electron) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('electron') as ElectronModule;
  }
  return null;
}

const _electron = loadElectron();

export const electronApp: Electron.App | null = _electron?.app ?? null;

export const electronUtilityProcess: UtilityProcessModule | null = _electron?.utilityProcess ?? null;

export const electronPowerSaveBlocker: PowerSaveBlockerModule | null = _electron?.powerSaveBlocker ?? null;

export const electronBrowserWindow: typeof BrowserWindowClass | null = _electron?.BrowserWindow ?? null;

export const electronNotification: typeof NotificationClass | null = _electron?.Notification ?? null;

export const electronMenu: typeof MenuClass | null = _electron?.Menu ?? null;

export const electronNativeImage: {
  createFromPath(path: string): NativeImageClass;
} | null = _electron?.nativeImage ?? null;

export const electronTray: typeof TrayClass | null = _electron?.Tray ?? null;
