/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { app, BrowserWindow, ipcMain, screen } from 'electron';
import type { IConfirmation } from '@/common/chat/chatLib';
import { workerTaskManager } from '@process/task/workerTaskManagerSingleton';
import { setConfirmHook, IpcAgentEventEmitter } from '@process/task/IpcAgentEventEmitter';
import { ProcessConfig } from '@process/utils/initStorage';
import i18n from '@process/services/i18n';

// petConfirmManager is dynamically imported → rollup places it in out/main/chunks/,
// so __dirname is out/main/chunks/ and we need '../..' to reach out/.
const PRELOAD_DIR = path.join(__dirname, '..', '..', 'preload');
const RENDERER_DIR = path.join(__dirname, '..', '..', 'renderer', 'pet');

let confirmWindow: BrowserWindow | null = null;
let currentConfirmations = new Map<string, IConfirmation<any> & { conversation_id: string }>();
let anchorBounds: { x: number; y: number; width: number; height: number } | null = null;
let pendingConfirmations: Array<IConfirmation<any> & { conversation_id: string }> = [];
let windowReady = false;
// User-overridden confirm window position (set when user drags the window).
// Persists for the current app session only; cleared on destroy.
let userPosition: { x: number; y: number } | null = null;

/**
 * Initialize pet confirm manager with anchor bounds (pet window position).
 * Safe to call multiple times — handlers are unregistered first to prevent
 * stacking listeners when the user toggles the confirm-bubble setting.
 */
export function initPetConfirmManager(bounds: { x: number; y: number; width: number; height: number }): void {
  anchorBounds = bounds;
  unregisterIpcHandlers();
  registerIpcHandlers();
  // Use main-process hook (buildEmitter.on() only works in renderer)
  setConfirmHook({
    onAdd: (conversationId, data) => {
      showConfirmation({ ...data, conversation_id: conversationId });
    },
    onUpdate: (conversationId, data) => {
      updateConfirmation({ ...data, conversation_id: conversationId });
    },
    onRemove: (conversationId, confirmationId) => {
      removeConfirmation({ conversation_id: conversationId, id: confirmationId });
    },
  });
}

/**
 * Update anchor bounds when pet window moves.
 * Note: confirm window position is independent of pet position — it stays where the
 * user last placed it (or the default bottom-right corner). We only track anchor for
 * potential future use, but no longer reposition the confirm window when the pet moves.
 */
export function updateAnchorBounds(bounds: { x: number; y: number; width: number; height: number }): void {
  anchorBounds = bounds;
}

/**
 * Destroy confirm manager and clean up resources.
 */
export function destroyPetConfirmManager(): void {
  unregisterIpcHandlers();
  setConfirmHook(null);
  destroyConfirmWindow();
  currentConfirmations.clear();
  anchorBounds = null;
  userPosition = null;
}

/**
 * Stop routing future confirmations to the bubble while leaving any open
 * confirm window alive so the user can finish responding to it. Used when the
 * "pet confirm bubble" toggle is turned off at runtime.
 */
export function unhookPetConfirm(): void {
  setConfirmHook(null);
}

/**
 * Translate confirmation option labels using main-process i18n.
 */
function translateConfirmation<T>(
  confirmation: IConfirmation<T> & { conversation_id: string }
): IConfirmation<T> & { conversation_id: string } {
  return {
    ...confirmation,
    title: confirmation.title ? i18n.t(confirmation.title, { defaultValue: confirmation.title }) : confirmation.title,
    description: i18n.t(confirmation.description, { defaultValue: confirmation.description }),
    options: confirmation.options.map((opt) => ({
      ...opt,
      label: i18n.t(opt.label, { ...opt.params, defaultValue: opt.label }),
    })),
  };
}

/**
 * Create confirm window anchored to the bottom-right corner of the pet's display,
 * or at the user's last dragged position if overridden this session.
 */
function createConfirmWindow(): void {
  if (confirmWindow && !confirmWindow.isDestroyed()) {
    confirmWindow.show();
    return;
  }

  // Window size = content area (320×280) + 12px on each axis for shadow padding
  // (#container uses 6px padding to match). Window itself can touch the screen
  // edge (margin = 0 below), so the shadow padding on the outer side overflows
  // off-screen — the card visually sits ~4px from the screen corner.
  const windowWidth = 332;
  const windowHeight = 292;

  // Position priority:
  //   1. userPosition (if user has dragged the window this session)
  //   2. Default bottom-right corner of the display where the pet currently lives
  //
  // When restoring a user-provided position, clamp within the display nearest to
  // that position so the window stays on the monitor where the user placed it.
  // Otherwise, use the display nearest to the pet's center point so the default
  // placement appears on the same screen as the pet (multi-monitor safe).
  // Falls back to the primary display when no anchor is known yet.
  const petCenter = anchorBounds
    ? {
        x: anchorBounds.x + Math.round(anchorBounds.width / 2),
        y: anchorBounds.y + Math.round(anchorBounds.height / 2),
      }
    : null;
  // margin = 0: the window itself touches the screen edge. The 6px shadow
  // padding inside the renderer keeps the visible card ~6px from the edge,
  // which matches clawd-on-desk's tight bottom-right anchoring.
  const margin = 0;

  let workArea: Electron.Rectangle;
  let rawX: number;
  let rawY: number;

  if (userPosition) {
    // Clamp to the display where the user last placed the window, not the pet's display
    rawX = userPosition.x;
    rawY = userPosition.y;
    workArea = screen.getDisplayNearestPoint({ x: rawX, y: rawY }).workArea;
  } else {
    workArea = petCenter ? screen.getDisplayNearestPoint(petCenter).workArea : screen.getPrimaryDisplay().workArea;
    rawX = workArea.x + workArea.width - windowWidth - margin;
    rawY = workArea.y + workArea.height - windowHeight - margin;
  }

  const x = Math.max(workArea.x, Math.min(rawX, workArea.x + workArea.width - windowWidth));
  const y = Math.max(workArea.y, Math.min(rawY, workArea.y + workArea.height - windowHeight));

  confirmWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: path.join(PRELOAD_DIR, 'petConfirmPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.platform === 'darwin') {
    confirmWindow.setAlwaysOnTop(true, 'screen-saver');
  } else {
    confirmWindow.setAlwaysOnTop(true, 'pop-up-menu');
  }

  windowReady = false;
  loadContent();

  confirmWindow.webContents.on('did-finish-load', async () => {
    windowReady = true;

    // Send current theme to confirm window
    try {
      const theme = ((await ProcessConfig.get('theme')) as string) || 'light';
      if (confirmWindow && !confirmWindow.isDestroyed()) {
        confirmWindow.webContents.send('pet:confirm-theme', theme);
      }
    } catch (_e) {
      /* noop — default light theme via CSS */
    }

    // Flush any confirmations queued before the page finished loading
    for (const c of pendingConfirmations) {
      if (confirmWindow && !confirmWindow.isDestroyed()) {
        confirmWindow.webContents.send('pet:confirm-add', c);
      }
    }
    pendingConfirmations = [];
  });

  confirmWindow.on('closed', () => {
    confirmWindow = null;
    windowReady = false;
  });

  console.log('[PetConfirm] Confirm window created');
}

/**
 * Destroy confirm window.
 */
function destroyConfirmWindow(): void {
  if (confirmWindow && !confirmWindow.isDestroyed()) {
    confirmWindow.destroy();
  }
  confirmWindow = null;
  windowReady = false;
  pendingConfirmations = [];
  console.log('[PetConfirm] Confirm window destroyed');
}

/**
 * Load HTML content into confirm window.
 */
function loadContent(): void {
  if (!confirmWindow || confirmWindow.isDestroyed()) return;

  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];

  if (!app.isPackaged && rendererUrl) {
    confirmWindow.loadURL(`${rendererUrl}/pet/pet-confirm.html`).catch((error) => {
      console.error('[PetConfirm] loadURL failed:', error);
    });
  } else {
    confirmWindow.loadFile(path.join(RENDERER_DIR, 'pet-confirm.html')).catch((error) => {
      console.error('[PetConfirm] loadFile failed:', error);
    });
  }
}

/**
 * Show confirmation in window.
 */
function showConfirmation(confirmation: IConfirmation<any> & { conversation_id: string }): void {
  currentConfirmations.set(confirmation.id, confirmation);
  const translated = translateConfirmation(confirmation);

  if (!confirmWindow || confirmWindow.isDestroyed()) {
    createConfirmWindow();
  }

  if (confirmWindow && !confirmWindow.isDestroyed()) {
    if (windowReady) {
      confirmWindow.webContents.send('pet:confirm-add', translated);
    } else {
      // Queue until did-finish-load
      pendingConfirmations.push(translated);
    }
  }
}

/**
 * Update confirmation in window.
 */
function updateConfirmation(confirmation: IConfirmation<any> & { conversation_id: string }): void {
  currentConfirmations.set(confirmation.id, confirmation);

  if (confirmWindow && !confirmWindow.isDestroyed()) {
    confirmWindow.webContents.send('pet:confirm-update', translateConfirmation(confirmation));
  }
}

/**
 * Remove confirmation from window.
 */
function removeConfirmation(data: { conversation_id: string; id: string }): void {
  currentConfirmations.delete(data.id);

  if (confirmWindow && !confirmWindow.isDestroyed()) {
    confirmWindow.webContents.send('pet:confirm-remove', data);
  }

  // Destroy window if no confirmations left
  if (currentConfirmations.size === 0) {
    destroyConfirmWindow();
  }
}

/**
 * Register IPC handlers for renderer communication.
 */
function registerIpcHandlers(): void {
  // Drag support for confirm window
  let confirmDragOffsetX = 0;
  let confirmDragOffsetY = 0;
  let confirmDragTimer: ReturnType<typeof setInterval> | null = null;

  ipcMain.on('pet:confirm-drag-start', () => {
    if (!confirmWindow || confirmWindow.isDestroyed()) return;
    // Clear any stale timer from a previous drag-start that missed its drag-end
    if (confirmDragTimer) {
      clearInterval(confirmDragTimer);
      confirmDragTimer = null;
    }
    const cursor = screen.getCursorScreenPoint();
    const [wx, wy] = confirmWindow.getPosition();
    confirmDragOffsetX = cursor.x - wx;
    confirmDragOffsetY = cursor.y - wy;

    confirmDragTimer = setInterval(() => {
      if (!confirmWindow || confirmWindow.isDestroyed()) {
        if (confirmDragTimer) clearInterval(confirmDragTimer);
        confirmDragTimer = null;
        return;
      }
      const cur = screen.getCursorScreenPoint();
      confirmWindow.setPosition(cur.x - confirmDragOffsetX, cur.y - confirmDragOffsetY, false);
    }, 16);
  });

  ipcMain.on('pet:confirm-drag-end', () => {
    if (confirmDragTimer) {
      clearInterval(confirmDragTimer);
      confirmDragTimer = null;
    }
    // Remember user-chosen position for the rest of this session
    if (confirmWindow && !confirmWindow.isDestroyed()) {
      const [px, py] = confirmWindow.getPosition();
      userPosition = { x: px, y: py };
    }
  });

  ipcMain.on(
    'pet:confirm-respond',
    (_event, data: { conversation_id: string; msg_id: string; callId: string; data: any }) => {
      console.log('[PetConfirm] Received response:', JSON.stringify(data));

      // Remove from local tracking
      const confirmation = Array.from(currentConfirmations.values()).find(
        (c) => c.callId === data.callId && c.conversation_id === data.conversation_id
      );

      if (confirmation) {
        currentConfirmations.delete(confirmation.id);

        // CRITICAL: Immediately broadcast removal to prevent main renderer from also responding.
        // The main renderer's ConversationChatConfirm has keyboard shortcuts that can trigger
        // a second response. Since worker uses pipe.once(callId), only the first response is
        // processed — if main renderer responds first (e.g., user presses Enter accidentally),
        // the pet window's response (e.g., 'cancel') is ignored.
        // By emitting remove NOW, main renderer removes the confirmation from state before
        // its keyboard handler can fire, ensuring pet window response reaches worker first.
        new IpcAgentEventEmitter().emitConfirmationRemove(data.conversation_id, confirmation.id);
      }

      // Forward response directly to task (main→main, cannot use ipcBridge.invoke)
      const task = workerTaskManager.getTask(data.conversation_id);
      if (task) {
        console.log('[PetConfirm] Calling task.confirm with:', data.msg_id, data.callId, data.data);
        task.confirm(data.msg_id, data.callId, data.data);
      } else {
        console.error('[PetConfirm] Task not found for conversation:', data.conversation_id);
      }

      // Close window if no confirmations left
      if (currentConfirmations.size === 0) {
        destroyConfirmWindow();
      }
    }
  );
}

/**
 * Unregister IPC handlers.
 */
function unregisterIpcHandlers(): void {
  ipcMain.removeAllListeners('pet:confirm-respond');
  ipcMain.removeAllListeners('pet:confirm-drag-start');
  ipcMain.removeAllListeners('pet:confirm-drag-end');
}
