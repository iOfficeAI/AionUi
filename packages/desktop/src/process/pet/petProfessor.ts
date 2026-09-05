/**
 * @license
 * Copyright 2025 AIbang (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { app, BrowserWindow, screen } from 'electron';
import type { PetState } from './petTypes';

/**
 * Professor persona speech-bubble ticker.
 *
 * When the user picks the "professor" pet persona, this module periodically
 * pops a small speech bubble above the pet window asking about the user's
 * thesis / experiment progress. Everything pet-specific is injected via
 * ProfessorDeps so this module stays decoupled from petManager (and free of
 * circular imports).
 */

// 教授固定说中文（不跟随应用语言）。每 5 秒说一句。
const FIRST_SHOW_DELAY_MS = 5_000;
const NAG_INTERVAL_MS = 5_000;
// Bubble auto-hides after this long (well under the nag interval).
const BUBBLE_SHOW_MS = 2_800;
// Cooldown so rapid hover enter/exit doesn't spam the slap reaction.
const SLAP_COOLDOWN_MS = 900;

const BUBBLE_WIDTH = 240;
const BUBBLE_HEIGHT = 84;
// Gap between the bubble and the pet window edge (kept tight so the bubble
// visibly belongs to the professor).
const BUBBLE_GAP = 2;

// States during which the professor keeps quiet.
const SILENT_STATES: ReadonlySet<PetState> = new Set<PetState>(['sleeping', 'dozing', 'dragging']);

export interface ProfessorDeps {
  /** Pet window bounds (screen coords), or null when the pet doesn't exist. */
  getPetBounds(): { x: number; y: number; width: number; height: number } | null;
  isPetVisible(): boolean;
  getCurrentState(): PetState;
  getDnd(): boolean;
  /** Next nag line to say (already localized — 中文). */
  getLine(): string;
  /** Line for the hover butt-slap reaction (中文). */
  getSlapLine(): string;
  /** Push the talking-flag to the pet renderer so it animates the mouth. */
  setTalking(talking: boolean): void;
}

// petProfessor lives in out/main/chunks/ (dynamically imported), so __dirname
// needs '../..' to reach out/.
const RENDERER_DIR = path.join(__dirname, '..', '..', 'renderer', 'pet');

let deps: ProfessorDeps | null = null;
let bubbleWindow: BrowserWindow | null = null;
let nextTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let lastSlapAt = 0;

export function startProfessorTicker(professorDeps: ProfessorDeps): void {
  stopProfessorTicker();
  deps = professorDeps;
  scheduleNext(FIRST_SHOW_DELAY_MS);
}

export function stopProfessorTicker(): void {
  if (nextTimer) {
    clearTimeout(nextTimer);
    nextTimer = null;
  }
  cancelHide();
  deps?.setTalking(false);
  if (bubbleWindow && !bubbleWindow.isDestroyed()) {
    bubbleWindow.destroy();
  }
  bubbleWindow = null;
  deps = null;
  lastSlapAt = 0;
}

function scheduleNext(delayMs: number): void {
  if (nextTimer) clearTimeout(nextTimer);
  nextTimer = setTimeout(() => {
    nextTimer = null;
    showBubble();
    if (deps) {
      scheduleNext(NAG_INTERVAL_MS);
    }
  }, delayMs);
}

/**
 * Hover butt-slap reaction: the professor protests immediately (bypassing
 * DND / silent states — the user is actively poking him) and the nag
 * schedule restarts from now.
 */
export function professorSlap(): void {
  const now = Date.now();
  if (now - lastSlapAt < SLAP_COOLDOWN_MS) return;
  lastSlapAt = now;
  if (!deps) return;
  showBubble(deps.getSlapLine(), true);
  if (deps) {
    scheduleNext(NAG_INTERVAL_MS);
  }
}

function cancelHide(): void {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function showBubble(overrideLine?: string, force = false): void {
  if (!deps) return;
  // Respect quiet hours: DND, hidden pet, or the pet busy/sleeping.
  // User-initiated reactions (slap) bypass these checks.
  if (!force) {
    if (deps.getDnd()) return;
    if (!deps.isPetVisible()) return;
    if (SILENT_STATES.has(deps.getCurrentState())) return;
  } else if (!deps.isPetVisible()) {
    return;
  }
  const bounds = deps.getPetBounds();
  if (!bounds) return;

  const text = overrideLine ?? deps.getLine();
  if (!text) return;

  const win = ensureBubbleWindow();
  if (!win) return;
  positionBubble(win, bounds);

  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
  const search = `text=${encodeURIComponent(text)}`;
  if (!app.isPackaged && rendererUrl) {
    win.loadURL(`${rendererUrl}/pet/professor-bubble.html?${search}`).catch(() => { });
  } else {
    win.loadFile(path.join(RENDERER_DIR, 'professor-bubble.html'), { search }).catch(() => { });
  }

  win.showInactive();
  deps.setTalking(true);
  cancelHide();
  hideTimer = setTimeout(() => {
    hideTimer = null;
    if (bubbleWindow && !bubbleWindow.isDestroyed()) {
      bubbleWindow.hide();
    }
    deps?.setTalking(false);
  }, BUBBLE_SHOW_MS);
}

function ensureBubbleWindow(): BrowserWindow | null {
  if (bubbleWindow && !bubbleWindow.isDestroyed()) {
    return bubbleWindow;
  }
  bubbleWindow = new BrowserWindow({
    width: BUBBLE_WIDTH,
    height: BUBBLE_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // Never steal focus or intercept clicks — purely decorative.
  bubbleWindow.setIgnoreMouseEvents(true);
  if (process.platform === 'darwin') {
    bubbleWindow.setAlwaysOnTop(true, 'screen-saver');
  } else {
    bubbleWindow.setAlwaysOnTop(true, 'pop-up-menu');
  }
  bubbleWindow.on('closed', () => {
    bubbleWindow = null;
  });
  return bubbleWindow;
}

// The professor SVG's viewBox has ~30% empty padding above the hat (content
// top ≈ -0.8 in a -18..40 viewBox), so anchoring the bubble to the window top
// leaves a huge visual gap. Anchor to the visible hat top instead. A hair of
// headroom is kept so the hat-pop animation doesn't clip into the bubble.
const HEAD_TOP_FRACTION = 0.27;
const BODY_BOTTOM_FRACTION = 0.75;

function positionBubble(win: BrowserWindow, petBounds: { x: number; y: number; width: number; height: number }): void {
  const bx = Math.round(petBounds.x + (petBounds.width - BUBBLE_WIDTH) / 2);
  // Bubble bottom sits just above the visible hat top inside the pet window.
  let by = Math.round(petBounds.y + petBounds.height * HEAD_TOP_FRACTION - BUBBLE_HEIGHT - BUBBLE_GAP);

  // Clamp into the current work area: prefer above the head, fall back below.
  const display = screen.getDisplayNearestPoint({
    x: petBounds.x + Math.round(petBounds.width / 2),
    y: petBounds.y + Math.round(petBounds.height / 2),
  });
  const area = display.workArea;
  if (by < area.y) {
    by = Math.round(petBounds.y + petBounds.height * BODY_BOTTOM_FRACTION + BUBBLE_GAP);
  }
  const x = Math.min(Math.max(bx, area.x), area.x + area.width - BUBBLE_WIDTH);
  const y = Math.min(Math.max(by, area.y), area.y + area.height - BUBBLE_HEIGHT);
  win.setBounds({ x, y, width: BUBBLE_WIDTH, height: BUBBLE_HEIGHT }, false);
}
