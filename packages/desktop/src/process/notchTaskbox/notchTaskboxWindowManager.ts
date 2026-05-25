/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { ProcessConfig } from '@process/utils/initStorage';
import { destroyPetWindow, isPetSupported } from '@process/pet/petManager';
import type { NotchTaskboxStatus } from './notchTaskboxTypes';

const TASKBOX_ENABLED_KEY = 'notchTaskbox.enabled';
const TASKBOX_HARDWARE_NOTCH_KEY = 'notchTaskbox.hardwareNotch';
const COMPACT_SIZE = { width: 408, height: 40 };
const EXPANDED_SIZE = { width: 560, height: 392 };
const REQUEST_CHANNEL = 'notch-taskbox:request';

let nativeHelperProcess: ChildProcess | null = null;
let taskboxLifecycleRegistered = false;
let windowsTaskboxWindow: BrowserWindow | null = null;
let windowsTaskboxExpanded = false;
let windowsPointerWatchdog: ReturnType<typeof setInterval> | null = null;
let windowsTaskboxIpcRegistered = false;

// Dynamically imported main-process modules are emitted under out/main/chunks,
// so ../.. reaches the sibling out/preload and out/renderer folders.
const PRELOAD_DIR = path.join(__dirname, '..', '..', 'preload');

function isNativeHelperRunning(): boolean {
  return Boolean(nativeHelperProcess && !nativeHelperProcess.killed);
}

function isWindowsTaskboxRunning(): boolean {
  return Boolean(windowsTaskboxWindow && !windowsTaskboxWindow.isDestroyed());
}

function isNotchTaskboxSupported(): boolean {
  return (process.platform === 'darwin' || process.platform === 'win32') && isPetSupported();
}

export async function getNotchTaskboxStatus(): Promise<NotchTaskboxStatus> {
  const [enabled, hardwareNotch] = await Promise.all([
    ProcessConfig.get(TASKBOX_ENABLED_KEY),
    ProcessConfig.get(TASKBOX_HARDWARE_NOTCH_KEY),
  ]);
  return {
    enabled: enabled ?? false,
    open: isNativeHelperRunning() || isWindowsTaskboxRunning(),
    hardwareNotch: hardwareNotch ?? false,
  };
}

export async function setNotchTaskboxEnabled(enabled: boolean): Promise<NotchTaskboxStatus> {
  if (enabled) {
    if (!isNotchTaskboxSupported()) {
      console.warn('[NotchTaskbox] Not supported in this environment');
      await ProcessConfig.set(TASKBOX_ENABLED_KEY, false);
      return getNotchTaskboxStatus();
    }
    await ProcessConfig.set(TASKBOX_ENABLED_KEY, true);
    await ProcessConfig.set('pet.enabled', false);
    destroyPetWindow();
    await createNotchTaskboxWindow();
  } else {
    await ProcessConfig.set(TASKBOX_ENABLED_KEY, false);
    destroyNotchTaskboxWindow();
  }
  return getNotchTaskboxStatus();
}

export async function setNotchTaskboxHardwareNotch(hardwareNotch: boolean): Promise<NotchTaskboxStatus> {
  await ProcessConfig.set(TASKBOX_HARDWARE_NOTCH_KEY, hardwareNotch);
  const enabled = (await ProcessConfig.get(TASKBOX_ENABLED_KEY)) ?? false;
  if (enabled && process.platform === 'darwin') {
    destroyNativeNotchTaskboxHelper();
    await createNativeNotchTaskboxHelper();
  }
  return getNotchTaskboxStatus();
}

export async function createNotchTaskboxWindow(): Promise<void> {
  if (!isNotchTaskboxSupported()) {
    console.warn('[NotchTaskbox] Not supported in this environment');
    return;
  }
  if (process.platform === 'darwin') {
    await createNativeNotchTaskboxHelper();
    return;
  }
  createWindowsTaskboxWindow();
}

export function destroyNotchTaskboxWindow(): void {
  destroyNativeNotchTaskboxHelper();
  destroyWindowsTaskboxWindow();
}

function resolveBackendUrl(): string {
  const port = (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort;
  if (!port) {
    throw new Error('[NotchTaskbox] Cannot start: aioncore is not running (globalThis.__backendPort unset)');
  }
  return `http://127.0.0.1:${port}`;
}

function resolveHelperSourcePath(): string {
  const resourcesPath = app.isPackaged ? process.resourcesPath : path.join(process.cwd(), 'resources');
  return path.join(resourcesPath, 'notch-taskbox-helper', 'AionUiNotchTaskbox.swift');
}

async function resolvePackagedHelperBinaryPath(): Promise<string | null> {
  if (!app.isPackaged) return null;
  const binaryPath = path.join(process.resourcesPath, 'notch-taskbox-helper', 'AionUiNotchTaskbox');
  try {
    await fsPromises.access(binaryPath);
    return binaryPath;
  } catch {
    return null;
  }
}

async function ensureNativeHelperBinary(): Promise<string> {
  const packagedBinaryPath = await resolvePackagedHelperBinaryPath();
  if (packagedBinaryPath) return packagedBinaryPath;

  const sourcePath = resolveHelperSourcePath();
  const outputDir = path.join(app.getPath('userData'), 'helpers');
  const outputPath = path.join(outputDir, 'AionUiNotchTaskbox');
  await fsPromises.mkdir(outputDir, { recursive: true });

  const [sourceStat, outputStat] = await Promise.all([
    fsPromises.stat(sourcePath),
    fsPromises.stat(outputPath).catch((_error: unknown): null => null),
  ]);

  if (outputStat && outputStat.mtimeMs >= sourceStat.mtimeMs) {
    return outputPath;
  }

  await new Promise<void>((resolve, reject) => {
    execFile(
      '/usr/bin/swiftc',
      [sourcePath, '-o', outputPath, '-framework', 'AppKit', '-framework', 'WebKit'],
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve();
      }
    );
  });

  await fsPromises.chmod(outputPath, 0o755);
  return outputPath;
}

async function createNativeNotchTaskboxHelper(): Promise<void> {
  if (isNativeHelperRunning()) return;
  registerNativeHelperLifecycle();
  const helperPath = await ensureNativeHelperBinary();
  const hardwareNotch = (await ProcessConfig.get(TASKBOX_HARDWARE_NOTCH_KEY)) ?? false;
  const args = ['--api', resolveBackendUrl(), '--parent-pid', String(process.pid)];
  if (hardwareNotch) {
    args.push('--hardware-notch');
  }
  nativeHelperProcess = spawn(helperPath, args, {
    stdio: 'ignore',
  });
  nativeHelperProcess.on('exit', () => {
    nativeHelperProcess = null;
  });
  nativeHelperProcess.unref();
}

function registerNativeHelperLifecycle(): void {
  if (taskboxLifecycleRegistered) return;
  taskboxLifecycleRegistered = true;
  app.on('before-quit', destroyNativeNotchTaskboxHelper);
  app.on('will-quit', destroyNativeNotchTaskboxHelper);
  process.once('exit', destroyNativeNotchTaskboxHelper);
}

function destroyNativeNotchTaskboxHelper(): void {
  if (!nativeHelperProcess || nativeHelperProcess.killed) {
    nativeHelperProcess = null;
    return;
  }
  nativeHelperProcess.kill();
  nativeHelperProcess = null;
}

function resolveWindowsTaskboxHtmlPath(): string {
  const resourcesPath = app.isPackaged ? process.resourcesPath : path.join(process.cwd(), 'resources');
  return path.join(resourcesPath, 'notch-taskbox-helper', 'taskbox.html');
}

function createWindowsTaskboxWindow(): void {
  if (process.platform !== 'win32') return;
  if (windowsTaskboxWindow && !windowsTaskboxWindow.isDestroyed()) {
    windowsTaskboxWindow.showInactive();
    return;
  }

  registerWindowsTaskboxIpc();
  registerWindowsTaskboxLifecycle();

  windowsTaskboxExpanded = false;
  const frame = frameForWindowsTaskbox(false);
  windowsTaskboxWindow = new BrowserWindow({
    ...frame,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    show: false,
    webPreferences: {
      preload: path.join(PRELOAD_DIR, 'notchTaskboxPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  windowsTaskboxWindow.setAlwaysOnTop(true, 'pop-up-menu');
  windowsTaskboxWindow.loadFile(resolveWindowsTaskboxHtmlPath()).catch((error: unknown) => {
    console.error('[NotchTaskbox] Failed to load Windows taskbox UI:', error);
  });
  windowsTaskboxWindow.once('ready-to-show', () => {
    windowsTaskboxWindow?.showInactive();
  });
  windowsTaskboxWindow.on('blur', () => {
    collapseWindowsTaskboxIfPointerOutside();
  });
  windowsTaskboxWindow.on('closed', () => {
    windowsTaskboxWindow = null;
    stopWindowsPointerWatchdog();
  });
  startWindowsPointerWatchdog();
}

function destroyWindowsTaskboxWindow(): void {
  stopWindowsPointerWatchdog();
  windowsTaskboxExpanded = false;
  if (windowsTaskboxWindow && !windowsTaskboxWindow.isDestroyed()) {
    windowsTaskboxWindow.destroy();
  }
  windowsTaskboxWindow = null;
}

function registerWindowsTaskboxLifecycle(): void {
  if (taskboxLifecycleRegistered) return;
  taskboxLifecycleRegistered = true;
  app.on('before-quit', destroyNotchTaskboxWindow);
  app.on('will-quit', destroyNotchTaskboxWindow);
  process.once('exit', destroyNotchTaskboxWindow);
}

function registerWindowsTaskboxIpc(): void {
  if (windowsTaskboxIpcRegistered) return;
  windowsTaskboxIpcRegistered = true;
  ipcMain.handle(
    REQUEST_CHANNEL,
    async (
      _event,
      request: { path?: string; options?: { method?: string; headers?: Record<string, string>; body?: string } }
    ) => {
      const requestPath = request.path ?? '';
      if (!requestPath.startsWith('/api/')) {
        throw new Error('[NotchTaskbox] Only local /api requests are allowed');
      }
      const response = await fetch(`${resolveBackendUrl()}${requestPath}`, request.options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      if (response.status === 204) return null;
      const text = await response.text();
      if (!text) return null;
      const json = JSON.parse(text) as unknown;
      if (json && typeof json === 'object' && 'data' in json) {
        return (json as { data: unknown }).data;
      }
      return json;
    }
  );
}

function frameForWindowsTaskbox(expanded: boolean): Electron.Rectangle {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  const width = expanded ? Math.min(EXPANDED_SIZE.width, area.width - 32) : COMPACT_SIZE.width;
  const height = expanded ? Math.min(EXPANDED_SIZE.height, area.height - 48) : COMPACT_SIZE.height;
  return {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y,
    width,
    height,
  };
}

function setWindowsTaskboxExpanded(expanded: boolean): void {
  if (!windowsTaskboxWindow || windowsTaskboxWindow.isDestroyed()) return;
  if (windowsTaskboxExpanded === expanded) return;
  windowsTaskboxExpanded = expanded;
  windowsTaskboxWindow.setBounds(frameForWindowsTaskbox(expanded), true);
  windowsTaskboxWindow.webContents.send('notch-taskbox:expanded', expanded);
  if (expanded) {
    windowsTaskboxWindow.showInactive();
  }
}

function collapseWindowsTaskboxIfPointerOutside(): void {
  if (!windowsTaskboxWindow || windowsTaskboxWindow.isDestroyed() || !windowsTaskboxExpanded) return;
  const pointer = screen.getCursorScreenPoint();
  const bounds = windowsTaskboxWindow.getBounds();
  const slop = 8;
  const inside =
    pointer.x >= bounds.x - slop &&
    pointer.x <= bounds.x + bounds.width + slop &&
    pointer.y >= bounds.y - slop &&
    pointer.y <= bounds.y + bounds.height + slop;
  if (!inside) {
    setWindowsTaskboxExpanded(false);
  }
}

function startWindowsPointerWatchdog(): void {
  stopWindowsPointerWatchdog();
  windowsPointerWatchdog = setInterval(() => {
    if (!windowsTaskboxWindow || windowsTaskboxWindow.isDestroyed()) return;
    const pointer = screen.getCursorScreenPoint();
    const bounds = windowsTaskboxWindow.getBounds();
    const inside =
      pointer.x >= bounds.x &&
      pointer.x <= bounds.x + bounds.width &&
      pointer.y >= bounds.y &&
      pointer.y <= bounds.y + bounds.height;
    if (inside && !windowsTaskboxExpanded) {
      setWindowsTaskboxExpanded(true);
    } else if (!inside && windowsTaskboxExpanded) {
      collapseWindowsTaskboxIfPointerOutside();
    }
  }, 60);
}

function stopWindowsPointerWatchdog(): void {
  if (windowsPointerWatchdog) {
    clearInterval(windowsPointerWatchdog);
    windowsPointerWatchdog = null;
  }
}
