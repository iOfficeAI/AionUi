/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Bubble renderer (M1).
 *
 * Responsibilities:
 *   - Detect pointer drag vs click with the 5px threshold (AC-M1-8).
 *   - Fire `ambient:drag-start` on mousedown, `ambient:drag-end` on mouseup,
 *     and `ambient:click` when mouseup ≤ 5px away from mousedown (black-box
 *     API contract — no debug IPC).
 *   - Main process owns actual window movement (subscribes to cursor via
 *     `screen.getCursorScreenPoint()` in a 16ms timer once drag-start fires),
 *     so this renderer does NOT try to compute bounds itself.
 */

import './ambient.d';

// AC-M1-8: ≤ 5px movement is still a click; > 5px is a drag.
const CLICK_VS_DRAG_THRESHOLD = 5;

const bubble = document.querySelector<HTMLDivElement>('[data-testid="ambient-bubble"]');
if (!bubble) {
  console.error('[Ambient] bubble element not found — check bubble.html markup');
}

let downX = 0;
let downY = 0;
let dragging = false;

function onMouseDown(event: MouseEvent): void {
  if (event.button !== 0) return; // left-click only; right-click handled separately in later milestone
  downX = event.screenX;
  downY = event.screenY;
  dragging = true;
  bubble?.classList.add('dragging');
  window.ambientAPI.dragStart();
}

function onMouseUp(event: MouseEvent): void {
  if (!dragging) return;
  dragging = false;
  bubble?.classList.remove('dragging');

  const dx = event.screenX - downX;
  const dy = event.screenY - downY;
  const distance = Math.hypot(dx, dy);

  window.ambientAPI.dragEnd();

  if (distance <= CLICK_VS_DRAG_THRESHOLD) {
    window.ambientAPI.click();
  }
}

function onBlur(): void {
  // If the user drags fast enough that the cursor leaves our 56x56 bubble
  // element before mouseup fires at the document level, we still want the
  // drag to end cleanly. Main process has an 8s watchdog as the hard floor,
  // but this is the nicer path when the cursor exits the renderer viewport.
  if (!dragging) return;
  dragging = false;
  bubble?.classList.remove('dragging');
  window.ambientAPI.dragEnd();
}

if (bubble) {
  bubble.addEventListener('mousedown', onMouseDown);
  // Listen on document so a mouseup that lands outside the tiny 56px element
  // still ends the drag — mouse tracking happens in the main process, so the
  // cursor is likely nowhere near the bubble by the time the user releases.
  document.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);
}
