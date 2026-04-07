/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, screen } from 'electron';
import i18n from '@process/services/i18n';
import { PetStateMachine } from './petStateMachine';
import { PetIdleTicker } from './petIdleTicker';
import { PetEventBridge } from './petEventBridge';
import { setPetNotifyHook } from '../../common/adapter/main';
import {
  initPetConfirmManager,
  updateAnchorBounds,
  destroyPetConfirmManager,
  unhookPetConfirm,
} from './petConfirmManager';
import type { PetSize, PetState } from './petTypes';

// petManager is dynamically imported → rollup places it in out/main/chunks/,
// so __dirname is out/main/chunks/ and we need '../..' to reach out/.
const PRELOAD_DIR = path.join(__dirname, '..', '..', 'preload');
const RENDERER_DIR = path.join(__dirname, '..', '..', 'renderer', 'pet');

let petWindow: BrowserWindow | null = null;
let petHitWindow: BrowserWindow | null = null;
let stateMachine: PetStateMachine | null = null;
let idleTicker: PetIdleTicker | null = null;
let eventBridge: PetEventBridge | null = null;
let currentSize: PetSize = 280;
let dragTimer: ReturnType<typeof setInterval> | null = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let preDragState: PetState | null = null;
// Whether tool-call confirmations should be routed to the pet's bubble window.
// When false, the pet still runs normally but confirmation requests stay in the
// main chat window. Updated at runtime via setPetConfirmEnabled() and read on
// createPetWindow() so the initial value picked up from ProcessConfig at startup
// (see src/index.ts) is honored even though createPetWindow itself is sync.
let confirmBubbleEnabled = true;

// States that should be restored after drag ends (AI activity / notifications).
// User-interaction states (attention/poke/happy) and idle/sleep states are NOT restored.
const RESTORABLE_STATES: ReadonlySet<PetState> = new Set<PetState>(['thinking', 'working', 'error', 'notification']);

/**
 * Create pet windows (rendering window + hit detection window).
 */
export function createPetWindow(): void {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.show();
    petWindow.focus();
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const margin = 20;
  const x = screenWidth - currentSize - margin;
  const y = screenHeight - currentSize - margin;

  // Rendering window (transparent, always on top, ignores mouse events)
  petWindow = new BrowserWindow({
    width: currentSize,
    height: currentSize,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      preload: path.join(PRELOAD_DIR, 'petPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.platform === 'darwin') {
    petWindow.setAlwaysOnTop(true, 'screen-saver');
  } else {
    petWindow.setAlwaysOnTop(true, 'pop-up-menu');
  }

  petWindow.setIgnoreMouseEvents(true);

  // Hit detection window (body area only, 60% of pet size)
  const hitSize = Math.round(currentSize * 0.6);
  const hitOffset = Math.round(currentSize * 0.2);

  petHitWindow = new BrowserWindow({
    width: hitSize,
    height: hitSize,
    x: x + hitOffset,
    y: y + hitOffset,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      preload: path.join(PRELOAD_DIR, 'petHitPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.platform === 'darwin') {
    petHitWindow.setAlwaysOnTop(true, 'screen-saver');
  } else {
    petHitWindow.setAlwaysOnTop(true, 'pop-up-menu');
  }

  petHitWindow.setIgnoreMouseEvents(true, { forward: true });

  // Initialize state machine, idle ticker, and event bridge
  stateMachine = new PetStateMachine();
  idleTicker = new PetIdleTicker(stateMachine);
  eventBridge = new PetEventBridge(stateMachine, idleTicker);

  stateMachine.onStateChange((state: PetState) => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send('pet:state-changed', state);
    }
  });

  idleTicker.onEyeMove((data) => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send('pet:eye-move', data);
    }
  });

  idleTicker.setPetBounds(x, y, currentSize, currentSize);

  setPetNotifyHook((name: string, data: unknown) => {
    if (eventBridge) {
      eventBridge.handleBridgeMessage(name, data);
    }
  });

  idleTicker.start();
  registerIpcHandlers();
  loadContent();

  // Initialize confirm manager only if the user opted in.
  // When disabled, AI tool-call confirmations remain in the main chat window
  // instead of being routed to a pet bubble.
  if (confirmBubbleEnabled) {
    initPetConfirmManager({ x, y, width: currentSize, height: currentSize });
  }

  petWindow.on('closed', () => {
    destroyPetWindow();
  });

  console.log('[Pet] Pet windows created');
}

/**
 * Destroy pet windows and clean up resources.
 */
export function destroyPetWindow(): void {
  clearDragTimer();

  // Destroy confirm manager
  destroyPetConfirmManager();

  if (eventBridge) {
    eventBridge.dispose();
    eventBridge = null;
  }

  if (idleTicker) {
    idleTicker.stop();
    idleTicker = null;
  }

  if (stateMachine) {
    stateMachine.dispose();
    stateMachine = null;
  }

  setPetNotifyHook(null);
  unregisterIpcHandlers();

  if (petHitWindow && !petHitWindow.isDestroyed()) {
    petHitWindow.destroy();
  }
  petHitWindow = null;

  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.destroy();
  }
  petWindow = null;

  console.log('[Pet] Pet windows destroyed');
}

export function showPetWindow(): void {
  if (petWindow && !petWindow.isDestroyed()) petWindow.show();
  if (petHitWindow && !petHitWindow.isDestroyed()) petHitWindow.show();
}

export function hidePetWindow(): void {
  if (petWindow && !petWindow.isDestroyed()) petWindow.hide();
  if (petHitWindow && !petHitWindow.isDestroyed()) petHitWindow.hide();
}

export function getEventBridge(): PetEventBridge | null {
  return eventBridge;
}

export function resizePetWindow(size: PetSize): void {
  resizePet(size);
}

export function setPetDndMode(dnd: boolean): void {
  stateMachine?.setDnd(dnd);
}

/**
 * Enable or disable the pet's confirm-bubble window for AI tool-call
 * confirmations. When disabled, future confirmations stay in the main chat
 * window. Any confirmation already on-screen is left alone so the user can
 * finish responding to it — only the next request takes the new setting.
 */
export function setPetConfirmEnabled(enabled: boolean): void {
  confirmBubbleEnabled = enabled;

  // Pet not running → just remember the value for the next createPetWindow().
  if (!petWindow || petWindow.isDestroyed()) return;

  if (enabled) {
    // Late-enable: install the hook so future confirmations route to the bubble.
    // Use the current pet bounds as the initial anchor.
    const [x, y] = petWindow.getPosition();
    initPetConfirmManager({ x, y, width: currentSize, height: currentSize });
  }
  // Late-disable: leave the existing confirm window (if any) alone — it will
  // self-destroy after the user responds to the current confirmation. New
  // confirmations will not reach it because we unhook here.
  else {
    unhookPetConfirm();
  }
}

// ---------------------------------------------------------------------------
// Window content loading
// ---------------------------------------------------------------------------

function loadContent(): void {
  if (!petWindow || !petHitWindow) return;
  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];

  if (!app.isPackaged && rendererUrl) {
    petWindow.loadURL(`${rendererUrl}/pet/pet.html`).catch((error) => {
      console.error('[Pet] loadURL failed for pet window:', error);
    });
    petHitWindow.loadURL(`${rendererUrl}/pet/pet-hit.html`).catch((error) => {
      console.error('[Pet] loadURL failed for pet-hit window:', error);
    });
  } else {
    petWindow.loadFile(path.join(RENDERER_DIR, 'pet.html')).catch((error) => {
      console.error('[Pet] loadFile failed for pet window:', error);
    });
    petHitWindow.loadFile(path.join(RENDERER_DIR, 'pet-hit.html')).catch((error) => {
      console.error('[Pet] loadFile failed for pet-hit window:', error);
    });
  }
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

function registerIpcHandlers(): void {
  ipcMain.on('pet:drag-start', () => {
    if (!petWindow || petWindow.isDestroyed() || !petHitWindow || petHitWindow.isDestroyed()) return;

    const cursor = screen.getCursorScreenPoint();
    const windowPos = petWindow.getPosition();
    dragOffsetX = cursor.x - windowPos[0];
    dragOffsetY = cursor.y - windowPos[1];

    // Snapshot AI activity state so we can restore it after drag ends
    const cur = stateMachine?.getCurrentState();
    preDragState = cur && RESTORABLE_STATES.has(cur) ? cur : null;

    stateMachine?.forceState('dragging');

    dragTimer = setInterval(() => {
      if (!petWindow || petWindow.isDestroyed() || !petHitWindow || petHitWindow.isDestroyed()) {
        clearDragTimer();
        return;
      }

      const cursor = screen.getCursorScreenPoint();
      const newX = cursor.x - dragOffsetX;
      const newY = cursor.y - dragOffsetY;

      petWindow.setPosition(newX, newY, false);

      const hitOffset = Math.round(currentSize * 0.2);
      petHitWindow.setPosition(newX + hitOffset, newY + hitOffset, false);

      idleTicker?.setPetBounds(newX, newY, currentSize, currentSize);
    }, 16);
  });

  ipcMain.on('pet:drag-end', () => {
    clearDragTimer();
    // Restore pre-drag AI state if there was one, otherwise return to idle
    const restoreTo: PetState = preDragState ?? 'idle';
    preDragState = null;
    stateMachine?.forceState(restoreTo);
    idleTicker?.resetIdle();
    // Update anchor after drag so next confirm window appears at the new position
    if (petWindow && !petWindow.isDestroyed()) {
      const [nx, ny] = petWindow.getPosition();
      updateAnchorBounds({ x: nx, y: ny, width: currentSize, height: currentSize });
    }
  });

  ipcMain.on('pet:click', (_event, data: { side: string; count: number }) => {
    if (!stateMachine || !idleTicker) return;

    idleTicker.resetIdle();

    if (data.count >= 3) {
      stateMachine.requestState('error');
    } else if (data.count === 2) {
      stateMachine.requestState(data.side === 'left' ? 'poke-left' : 'poke-right');
    } else if (data.count === 1) {
      stateMachine.requestState('attention');
    }
  });

  ipcMain.on('pet:context-menu', () => {
    if (!petHitWindow || petHitWindow.isDestroyed()) return;

    const sizeKeys = { 200: 'pet.sizeSmall', 280: 'pet.sizeMedium', 360: 'pet.sizeLarge' } as const;
    const menu = Menu.buildFromTemplate([
      {
        label: i18n.t('pet.pat'),
        click: () => {
          if (stateMachine && idleTicker) {
            idleTicker.resetIdle();
            stateMachine.requestState('happy');
          }
        },
      },
      { type: 'separator' },
      {
        label: i18n.t('pet.size'),
        submenu: ([200, 280, 360] as PetSize[]).map((size) => ({
          label: i18n.t(sizeKeys[size], { px: size }),
          type: 'radio' as const,
          checked: currentSize === size,
          click: () => resizePet(size),
        })),
      },
      { type: 'separator' },
      {
        label: i18n.t('pet.dnd'),
        type: 'checkbox',
        checked: stateMachine?.getDnd() ?? false,
        click: (menuItem) => {
          stateMachine?.setDnd(menuItem.checked);
        },
      },
      { type: 'separator' },
      {
        label: i18n.t('pet.resetPosition'),
        click: () => resetPosition(),
      },
      {
        label: i18n.t('pet.hide'),
        click: () => hidePetWindow(),
      },
    ]);

    menu.popup({ window: petHitWindow });
  });

  ipcMain.on('pet:set-ignore-mouse-events', (_event, ignore: boolean, options?: { forward: boolean }) => {
    if (!petHitWindow || petHitWindow.isDestroyed()) return;
    petHitWindow.setIgnoreMouseEvents(ignore, options);
  });
}

function unregisterIpcHandlers(): void {
  ipcMain.removeAllListeners('pet:drag-start');
  ipcMain.removeAllListeners('pet:drag-end');
  ipcMain.removeAllListeners('pet:click');
  ipcMain.removeAllListeners('pet:context-menu');
  ipcMain.removeAllListeners('pet:set-ignore-mouse-events');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clearDragTimer(): void {
  if (dragTimer) {
    clearInterval(dragTimer);
    dragTimer = null;
  }
}

function resizePet(size: PetSize): void {
  if (!petWindow || petWindow.isDestroyed() || !petHitWindow || petHitWindow.isDestroyed()) return;

  currentSize = size;
  const [x, y] = petWindow.getPosition();

  petWindow.setSize(size, size, false);

  const hitSize = Math.round(size * 0.6);
  const hitOffset = Math.round(size * 0.2);
  petHitWindow.setSize(hitSize, hitSize, false);
  petHitWindow.setPosition(x + hitOffset, y + hitOffset, false);

  idleTicker?.setPetBounds(x, y, size, size);

  // Update confirm window anchor
  updateAnchorBounds({ x, y, width: size, height: size });

  if (!petWindow.isDestroyed()) {
    petWindow.webContents.send('pet:resize', size);
  }
}

function resetPosition(): void {
  if (!petWindow || petWindow.isDestroyed() || !petHitWindow || petHitWindow.isDestroyed()) return;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const margin = 20;
  const x = screenWidth - currentSize - margin;
  const y = screenHeight - currentSize - margin;

  petWindow.setPosition(x, y, false);

  const hitOffset = Math.round(currentSize * 0.2);
  petHitWindow.setPosition(x + hitOffset, y + hitOffset, false);

  idleTicker?.setPetBounds(x, y, currentSize, currentSize);

  // Update confirm window anchor
  updateAnchorBounds({ x, y, width: currentSize, height: currentSize });
}
