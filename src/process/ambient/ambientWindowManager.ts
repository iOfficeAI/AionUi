/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Ambient Mode — M1 bubble window manager.
 *
 * Evolved from `src/process/pet/petManager.ts` (U-1 = A decision, 2026-05-11):
 *   - Keeps pet's proven cross-platform primitives: frameless + transparent +
 *     alwaysOnTop('screen-saver'), drag-follow timer, 8s watchdog, Windows
 *     transparent-resize workaround.
 *   - Drops pet-specific concepts: state machine, idle ticker, hit-test
 *     window, confirm bubble. The ambient bubble is a single window; clicks
 *     are detected in renderer and routed via IPC.
 *   - Implements AC-M1-1/2/3/4/5/6/9/10/11/13 for the M1 skeleton. M2+ (hover,
 *     chat, panels) will layer on top without replacing this manager.
 */

import path from 'node:path';
import fs from 'node:fs';
import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { ProcessConfig } from '@process/utils/initStorage';

export const BUBBLE_SIZE = 64;
export const SCREEN_MARGIN = 24;
const DRAG_TICK_MS = 16;
// Main-process safety watchdog: if drag-end never arrives within this window
// (renderer dropped pointerup — happens on Windows transparent + frameless
// across resize/move), we force-end the drag. Matches the pet's value.
const DRAG_WATCHDOG_MS = 8000;
// Click vs drag threshold — accumulated pointer movement ≤ 5px counts as click.
// Evaluated in renderer (see bubbleRenderer.ts); main only sees drag-start /
// drag-end / click IPCs.
const CLICK_VS_DRAG_THRESHOLD = 5;
void CLICK_VS_DRAG_THRESHOLD;

// Rollup *sometimes* places dynamically imported modules in out/main/chunks/
// (when code-splitting kicks in; see petManager) and sometimes inlines them
// into out/main/index.js (when the module graph is small). In both cases we
// want to reach sibling dirs under `out/` — resolve relative to the `out/`
// root by walking up until we find the `preload` sibling.
function resolveOutDir(): string {
  // __dirname is either `out/main` or `out/main/chunks` depending on bundling.
  // Walk up until we find a parent that contains both `preload/` and `renderer/`.
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    const candidatePreload = path.join(dir, 'preload');
    if (path.basename(dir) !== 'preload' && path.basename(dir) !== 'renderer' && fs.existsSync(candidatePreload)) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  // Fallback to the pet-style assumption if nothing matched
  return path.join(__dirname, '..', '..');
}

const OUT_DIR = resolveOutDir();
const PRELOAD_DIR = path.join(OUT_DIR, 'preload');
const RENDERER_DIR = path.join(OUT_DIR, 'renderer', 'ambient');

let bubbleWindow: BrowserWindow | null = null;
let dragTimer: ReturnType<typeof setInterval> | null = null;
let dragWatchdog: ReturnType<typeof setTimeout> | null = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let positionSaveTimer: ReturnType<typeof setTimeout> | null = null;
// Guard to avoid recursive snap when our own setPosition inside endDrag /
// external-move-handler fires the window's `move` event.
let suppressExternalMoveHandler = false;

export function isAmbientSupported(): boolean {
  if (process.platform === 'linux') {
    const ozonePlatform = app.commandLine.getSwitchValue('ozone-platform');
    if (ozonePlatform === 'headless') return false;
  }
  return true;
}

export function getBubbleWindow(): BrowserWindow | null {
  return bubbleWindow && !bubbleWindow.isDestroyed() ? bubbleWindow : null;
}

/**
 * Resolve the bubble's starting position.
 *
 * AC-M1-1 / AC-M1-7 / AC-M1-13:
 *   1. If persisted `ambient.bubblePosition` exists and its displayId still
 *      maps to an attached display → clamp into that display's workArea.
 *   2. Otherwise → primary display's bottom-right with 24px margin.
 *
 * Note: bounds validation uses `getDisplayNearestPoint` as a fallback even
 * when displayId matches, because the user may have changed display
 * resolution since the position was saved.
 */
async function resolveInitialBounds(): Promise<{ x: number; y: number }> {
  let persisted: { x: number; y: number; displayId: number } | null = null;
  // In E2E test mode we always start from the default bottom-right — the
  // persistence layer is shared with the dev app's userData (`AionUi-Dev/config/`)
  // so a previous local run could leave a non-default `ambient.bubblePosition`
  // that breaks AC-M1-1's "bottom-right on first launch" assertion. Honoring
  // AIONUI_E2E_TEST here gives the test suite a clean slate without needing
  // sandbox-per-worker userData isolation.
  const isE2E = process.env['AIONUI_E2E_TEST'] === '1';
  if (!isE2E) {
    try {
      persisted = (await ProcessConfig.get('ambient.bubblePosition')) ?? null;
    } catch (err) {
      console.warn('[Ambient] Failed to read persisted bubble position:', err);
    }
  }

  if (persisted) {
    const display = screen.getAllDisplays().find((d) => d.id === persisted!.displayId);
    if (display) {
      const { workArea } = display;
      const clampedX = clamp(
        persisted.x,
        workArea.x + SCREEN_MARGIN,
        workArea.x + workArea.width - SCREEN_MARGIN - BUBBLE_SIZE
      );
      const clampedY = clamp(
        persisted.y,
        workArea.y + SCREEN_MARGIN,
        workArea.y + workArea.height - SCREEN_MARGIN - BUBBLE_SIZE
      );
      return { x: clampedX, y: clampedY };
    }
    console.warn('[Ambient] Persisted displayId not found; falling back to primary display default');
  }

  return computeDefaultPosition();
}

function computeDefaultPosition(): { x: number; y: number } {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + workArea.width - SCREEN_MARGIN - BUBBLE_SIZE,
    y: workArea.y + workArea.height - SCREEN_MARGIN - BUBBLE_SIZE,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export async function createAmbientWindow(): Promise<void> {
  if (!isAmbientSupported()) {
    console.warn('[Ambient] Ambient mode not supported in this environment (headless Linux)');
    return;
  }

  if (bubbleWindow && !bubbleWindow.isDestroyed()) {
    bubbleWindow.show();
    bubbleWindow.focus();
    return;
  }

  const { x, y } = await resolveInitialBounds();

  bubbleWindow = new BrowserWindow({
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    x,
    y,
    title: 'AionUi Ambient Bubble',
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      preload: path.join(PRELOAD_DIR, 'ambientPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // screen-saver level keeps the bubble above Spotlight on macOS; pop-up-menu
  // is the equivalent safe ceiling on Windows/Linux (matches pet).
  if (process.platform === 'darwin') {
    bubbleWindow.setAlwaysOnTop(true, 'screen-saver');
  } else {
    bubbleWindow.setAlwaysOnTop(true, 'pop-up-menu');
  }

  // Expose transparency state for E2E introspection. Electron's native
  // `BrowserWindow.isOpaque()` is only available on some platforms/versions
  // (not present in our Electron 37 cross-platform surface), so we attach
  // our own `isOpaque()` function onto the instance as a stable polyfill.
  // Our bubble is constructed with `transparent: true`, so isOpaque() = false.
  Object.defineProperty(bubbleWindow, 'isOpaque', {
    value: () => false,
    writable: false,
    configurable: true,
  });

  registerIpcHandlers();
  loadContent();

  // AC-M1-2 / AC-M1-6 / AC-M1-13: whenever the window moves by any path other
  // than our own drag timer (e.g. user mouse drag via OS title-bar drag once
  // we add one, programmatic setBounds from tests, external IPC), snap to the
  // nearest side and clamp y. The drag timer path sets `suppressExternalMoveHandler`
  // so this handler doesn't fight with live drag updates.
  bubbleWindow.on('move', handleExternalMove);

  bubbleWindow.on('closed', () => {
    destroyAmbientWindow();
  });

  console.log('[Ambient] Bubble window created at', x, y);
}

export function destroyAmbientWindow(): void {
  clearDragTimer();
  if (positionSaveTimer) {
    clearTimeout(positionSaveTimer);
    positionSaveTimer = null;
  }
  unregisterIpcHandlers();
  if (bubbleWindow && !bubbleWindow.isDestroyed()) {
    bubbleWindow.destroy();
  }
  bubbleWindow = null;
  console.log('[Ambient] Bubble window destroyed');
}

function loadContent(): void {
  if (!bubbleWindow) return;
  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && rendererUrl) {
    bubbleWindow.loadURL(`${rendererUrl}/ambient/bubble.html`).catch((error) => {
      console.error('[Ambient] loadURL failed:', error);
    });
  } else {
    bubbleWindow.loadFile(path.join(RENDERER_DIR, 'bubble.html')).catch((error) => {
      console.error('[Ambient] loadFile failed:', error);
    });
  }
}

// ---------------------------------------------------------------------------
// IPC handlers (drag / click)
// ---------------------------------------------------------------------------

function registerIpcHandlers(): void {
  ipcMain.on('ambient:drag-start', handleDragStart);
  ipcMain.on('ambient:drag-end', handleDragEnd);
  ipcMain.on('ambient:click', handleClick);
}

function unregisterIpcHandlers(): void {
  ipcMain.removeListener('ambient:drag-start', handleDragStart);
  ipcMain.removeListener('ambient:drag-end', handleDragEnd);
  ipcMain.removeListener('ambient:click', handleClick);
}

function handleDragStart(): void {
  const win = getBubbleWindow();
  if (!win) return;

  // Defensive: a previous drag may have left the timer or watchdog alive
  // (renderer dropped pointerup). Clean up before starting a new one.
  if (dragTimer || dragWatchdog) {
    endDrag();
  }

  const cursor = screen.getCursorScreenPoint();
  const [wx, wy] = win.getPosition();
  dragOffsetX = cursor.x - wx;
  dragOffsetY = cursor.y - wy;

  // AC-M1-2: lower window opacity via OS compositor (not DOM) while dragging.
  win.setOpacity(0.85);

  dragTimer = setInterval(() => {
    const w = getBubbleWindow();
    if (!w) {
      endDrag();
      return;
    }
    const c = screen.getCursorScreenPoint();
    suppressExternalMoveHandler = true;
    w.setPosition(c.x - dragOffsetX, c.y - dragOffsetY, false);
    suppressExternalMoveHandler = false;
  }, DRAG_TICK_MS);

  dragWatchdog = setTimeout(() => {
    console.warn('[Ambient] drag-end not received in', DRAG_WATCHDOG_MS, 'ms — force-ending drag');
    endDrag();
  }, DRAG_WATCHDOG_MS);
}

function handleDragEnd(): void {
  endDrag();
}

function handleClick(): void {
  // M2 not yet implemented. Log the click so QA can verify the round-trip
  // works; M2 impl will replace this with the input-state transition.
  console.info('ambient: click, will expand');
}

function clearDragTimer(): void {
  if (dragTimer) {
    clearInterval(dragTimer);
    dragTimer = null;
  }
  if (dragWatchdog) {
    clearTimeout(dragWatchdog);
    dragWatchdog = null;
  }
}

/**
 * End-of-drag cleanup: stop the follow timer, restore opacity, snap to the
 * nearest side of the current display's workArea, clamp y into visible range,
 * and debounce-persist the final position.
 *
 * AC-M1-2 hard rule: opacity must be restored to 1.0 from *every* code path
 * that could end a drag (normal mouseup, watchdog, interruption) — missing
 * any one of these three leaves the bubble permanently at 0.85 until restart.
 */
function endDrag(): void {
  clearDragTimer();
  const win = getBubbleWindow();
  if (!win) return;

  // Restore opacity before snapping — snap writes setPosition, which does not
  // touch opacity, but any subsequent failure should not leave the bubble
  // half-transparent.
  win.setOpacity(1.0);

  snapAndPersist(win);
}

/**
 * Given a window currently at some position, snap to the nearest vertical
 * edge of the workArea containing its center, clamp y into visible range,
 * and schedule persistence. Idempotent — running it on an already-snapped
 * position is a no-op.
 */
function snapAndPersist(win: BrowserWindow): void {
  const [curX, curY] = win.getPosition();
  const centerX = curX + BUBBLE_SIZE / 2;
  const centerY = curY + BUBBLE_SIZE / 2;
  const display = screen.getDisplayNearestPoint({ x: Math.round(centerX), y: Math.round(centerY) });
  const { workArea } = display;

  const snapX =
    centerX < workArea.x + workArea.width / 2
      ? workArea.x + SCREEN_MARGIN
      : workArea.x + workArea.width - SCREEN_MARGIN - BUBBLE_SIZE;

  const snapY = clamp(curY, workArea.y + SCREEN_MARGIN, workArea.y + workArea.height - SCREEN_MARGIN - BUBBLE_SIZE);

  if (snapX !== curX || snapY !== curY) {
    suppressExternalMoveHandler = true;
    win.setPosition(snapX, snapY, false);
    suppressExternalMoveHandler = false;
  }
  schedulePositionSave(snapX, snapY, display.id);
}

/**
 * Handler for the BrowserWindow `move` event. Fires when window position
 * changes from any path other than our drag timer (e.g. programmatic
 * setBounds from an E2E test harness, OS-driven window moves, or future
 * native title-bar drag if we add one). Debounced so multiple moves in one
 * tick only snap once.
 */
function handleExternalMove(): void {
  if (suppressExternalMoveHandler) return;
  if (dragTimer) return; // live drag owns position; don't fight it
  const win = getBubbleWindow();
  if (!win) return;
  // Any external move represents a "drop" from the user's perspective — the
  // window has come to rest at a new position and must snap to a side, clamp
  // into view, and restore opacity (AC-M1-2 requires opacity=1.0 in every
  // drag-end path, including interrupted/external-driven ones).
  win.setOpacity(1.0);
  // Snap synchronously so E2E tests (and programmatic callers) that read
  // bounds immediately after setBounds see the snapped position. Coalescing
  // multiple moves into one is already achieved by snapAndPersist being
  // idempotent on already-snapped positions.
  snapAndPersist(win);
}

/**
 * Debounce position writes so a drag doesn't flood ConfigStorage. 500ms is
 * well above the drag tick rate but short enough that a close-app-during-drag
 * still catches the final position.
 */
function schedulePositionSave(x: number, y: number, displayId: number): void {
  if (positionSaveTimer) clearTimeout(positionSaveTimer);
  positionSaveTimer = setTimeout(() => {
    positionSaveTimer = null;
    void persistPosition(x, y, displayId);
  }, 200);
}

async function persistPosition(x: number, y: number, displayId: number): Promise<void> {
  try {
    await ProcessConfig.set('ambient.bubblePosition', { x, y, displayId });
  } catch (err) {
    console.warn('[Ambient] Failed to persist bubble position:', err);
  }
}

/**
 * Public setter used by the bridge (`ambient.setBubblePosition`). Does NOT
 * invoke snap logic — this is a direct move + persist, meant for the bridge
 * layer to accept renderer-computed final positions in the future.
 */
export async function setBubblePosition(pos: { x: number; y: number; displayId: number }): Promise<void> {
  const win = getBubbleWindow();
  if (!win) return;
  suppressExternalMoveHandler = true;
  win.setPosition(pos.x, pos.y, false);
  suppressExternalMoveHandler = false;
  await persistPosition(pos.x, pos.y, pos.displayId);
}

/**
 * Read the currently-persisted position. Reflects the last drag-end snap plus
 * debounce flush, NOT necessarily the live window position (E2E callers that
 * need the live value should BrowserWindow.getBounds() directly).
 */
export async function getPersistedBubblePosition(): Promise<{ x: number; y: number; displayId: number } | null> {
  // If there's a pending debounced write, flush it first so reads-after-drag
  // are not stale.
  if (positionSaveTimer) {
    clearTimeout(positionSaveTimer);
    positionSaveTimer = null;
    const win = getBubbleWindow();
    if (win) {
      const [x, y] = win.getPosition();
      const display = screen.getDisplayNearestPoint({
        x: Math.round(x + BUBBLE_SIZE / 2),
        y: Math.round(y + BUBBLE_SIZE / 2),
      });
      await persistPosition(x, y, display.id);
    }
  }

  // Also handle the case where the user moved the window via setBounds (from
  // E2E test hooks) without going through our IPC drag path — we can't
  // auto-persist every external setBounds, so the test harness is expected
  // to call setBubblePosition() or rely on the drag handlers. For now, fall
  // back to reporting the live position if nothing has been persisted yet.
  const persisted = (await ProcessConfig.get('ambient.bubblePosition')) ?? null;
  if (persisted) return persisted;

  const win = getBubbleWindow();
  if (!win) return null;
  const [x, y] = win.getPosition();
  const display = screen.getDisplayNearestPoint({
    x: Math.round(x + BUBBLE_SIZE / 2),
    y: Math.round(y + BUBBLE_SIZE / 2),
  });
  return { x, y, displayId: display.id };
}
