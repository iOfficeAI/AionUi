/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { setNotchTaskboxNotifyHook } from '@/common/adapter/main';
import { getApplicationMainWindow } from '@process/bridge/applicationBridge';
import { ProcessConfig } from '@process/utils/initStorage';
import { destroyPetWindow, isPetSupported } from '@process/pet/petManager';
import type { NotchTaskboxBridgeEvent, NotchTaskboxStatus } from './notchTaskboxTypes';

const TASKBOX_ENABLED_KEY = 'notchTaskbox.enabled';
const TASKBOX_HARDWARE_NOTCH_KEY = 'notchTaskbox.hardwareNotch';
const COMPACT_SIZE = { width: 680, height: 44 };
const COMPACT_HARDWARE_NOTCH_SIZE = { width: 760, height: 44 };
const EXPANDED_SIZE = { width: 760, height: 520 };
const EXPANDED_HARDWARE_NOTCH_SIZE = { width: 820, height: 540 };
const REQUEST_CHANNEL = 'notch-taskbox:request';
const SET_EXPANDED_CHANNEL = 'notch-taskbox:set-expanded';
const OPEN_MAIN_WINDOW_CHANNEL = 'notch-taskbox:open-main-window';

// Dynamically imported main-process modules are emitted under out/main/chunks,
// so ../.. reaches the sibling out/preload and out/renderer folders.
const PRELOAD_DIR = path.join(__dirname, '..', '..', 'preload');
const RENDERER_DIR = path.join(__dirname, '..', '..', 'renderer', 'notch-taskbox');

let taskboxWindow: BrowserWindow | null = null;
let taskboxExpanded = false;
let taskboxIpcRegistered = false;
let taskboxLifecycleRegistered = false;
let pendingEvents: NotchTaskboxBridgeEvent[] = [];

export function isNotchTaskboxSupported(): boolean {
  return (process.platform === 'darwin' || process.platform === 'win32') && isPetSupported();
}

export async function getNotchTaskboxStatus(): Promise<NotchTaskboxStatus> {
  const [enabled, hardwareNotch] = await Promise.all([
    ProcessConfig.get(TASKBOX_ENABLED_KEY),
    ProcessConfig.get(TASKBOX_HARDWARE_NOTCH_KEY),
  ]);
  return {
    enabled: enabled ?? false,
    open: isNotchTaskboxOpen(),
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
  if (isNotchTaskboxOpen()) {
    setTaskboxExpanded(taskboxExpanded);
    sendStatus();
  }
  return getNotchTaskboxStatus();
}

export async function createNotchTaskboxWindow(): Promise<void> {
  if (!isNotchTaskboxSupported()) {
    console.warn('[NotchTaskbox] Not supported in this environment');
    return;
  }

  if (taskboxWindow && !taskboxWindow.isDestroyed()) {
    taskboxWindow.showInactive();
    return;
  }

  registerTaskboxIpc();
  registerTaskboxLifecycle();
  setNotchTaskboxNotifyHook(forwardBridgeEvent);

  taskboxExpanded = false;
  const frame = await frameForTaskbox(false);
  taskboxWindow = new BrowserWindow({
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

  taskboxWindow.setAlwaysOnTop(true, process.platform === 'darwin' ? 'screen-saver' : 'pop-up-menu');
  loadContent();

  taskboxWindow.webContents.on('did-finish-load', () => {
    sendStatus();
    flushPendingEvents();
  });
  taskboxWindow.once('ready-to-show', () => {
    taskboxWindow?.showInactive();
  });
  taskboxWindow.on('blur', () => {
    setTaskboxExpanded(false);
  });
  taskboxWindow.on('closed', () => {
    taskboxWindow = null;
    pendingEvents = [];
    setNotchTaskboxNotifyHook(null);
  });
}

export function destroyNotchTaskboxWindow(): void {
  setNotchTaskboxNotifyHook(null);
  pendingEvents = [];
  taskboxExpanded = false;
  if (taskboxWindow && !taskboxWindow.isDestroyed()) {
    taskboxWindow.destroy();
  }
  taskboxWindow = null;
}

function isNotchTaskboxOpen(): boolean {
  return Boolean(taskboxWindow && !taskboxWindow.isDestroyed());
}

function loadContent(): void {
  if (!taskboxWindow || taskboxWindow.isDestroyed()) return;
  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];

  if (!app.isPackaged && rendererUrl) {
    taskboxWindow.loadURL(`${rendererUrl}/notch-taskbox/notch-taskbox.html`).catch((error) => {
      console.error('[NotchTaskbox] loadURL failed:', error);
    });
    return;
  }

  taskboxWindow.loadFile(path.join(RENDERER_DIR, 'notch-taskbox.html')).catch((error) => {
    console.error('[NotchTaskbox] loadFile failed:', error);
  });
}

function registerTaskboxLifecycle(): void {
  if (taskboxLifecycleRegistered) return;
  taskboxLifecycleRegistered = true;
  app.on('before-quit', destroyNotchTaskboxWindow);
  app.on('will-quit', destroyNotchTaskboxWindow);
  process.once('exit', destroyNotchTaskboxWindow);
}

function registerTaskboxIpc(): void {
  if (taskboxIpcRegistered) return;
  taskboxIpcRegistered = true;

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

  ipcMain.handle(SET_EXPANDED_CHANNEL, async (_event, expanded: boolean) => {
    await setTaskboxExpanded(expanded);
  });

  ipcMain.handle(OPEN_MAIN_WINDOW_CHANNEL, () => {
    const mainWindow = getApplicationMainWindow();
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

function resolveBackendUrl(): string {
  const port = (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort;
  if (!port) {
    throw new Error('[NotchTaskbox] Cannot request backend before aioncore is running');
  }
  return `http://127.0.0.1:${port}`;
}

async function frameForTaskbox(expanded: boolean): Promise<Electron.Rectangle> {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  const hardwareNotch =
    process.platform === 'darwin' && ((await ProcessConfig.get(TASKBOX_HARDWARE_NOTCH_KEY)) ?? false);
  const desired = expanded
    ? hardwareNotch
      ? EXPANDED_HARDWARE_NOTCH_SIZE
      : EXPANDED_SIZE
    : hardwareNotch
      ? COMPACT_HARDWARE_NOTCH_SIZE
      : COMPACT_SIZE;
  const width = Math.min(desired.width, area.width - 32);
  const height = Math.min(desired.height, area.height - 48);

  return {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y,
    width,
    height,
  };
}

async function setTaskboxExpanded(expanded: boolean): Promise<void> {
  if (!taskboxWindow || taskboxWindow.isDestroyed()) return;
  const frame = await frameForTaskbox(expanded);
  taskboxExpanded = expanded;
  taskboxWindow.setBounds(frame, true);
  taskboxWindow.webContents.send('notch-taskbox:expanded', expanded);
  if (expanded) {
    taskboxWindow.showInactive();
  }
}

function forwardBridgeEvent(name: string, data: unknown): void {
  const event = { name, data };
  if (!taskboxWindow || taskboxWindow.isDestroyed() || taskboxWindow.webContents.isLoading()) {
    pendingEvents.push(event);
    pendingEvents = pendingEvents.slice(-40);
    return;
  }
  taskboxWindow.webContents.send('notch-taskbox:event', event);
}

function flushPendingEvents(): void {
  if (!taskboxWindow || taskboxWindow.isDestroyed()) return;
  for (const event of pendingEvents) {
    taskboxWindow.webContents.send('notch-taskbox:event', event);
  }
  pendingEvents = [];
}

function sendStatus(): void {
  if (!taskboxWindow || taskboxWindow.isDestroyed()) return;
  void getNotchTaskboxStatus()
    .then((status) => {
      if (!taskboxWindow || taskboxWindow.isDestroyed()) return;
      taskboxWindow.webContents.send('notch-taskbox:status', status);
    })
    .catch((error) => {
      console.error('[NotchTaskbox] Failed to send status:', error);
    });
}
