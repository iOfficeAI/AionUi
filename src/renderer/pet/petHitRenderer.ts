const DRAG_THRESHOLD = 3;
const CLICK_WINDOW = 400;
const STARTUP_DELAY = 500;

const hitEl = document.getElementById('hit')!;
let isDragging = false;
let didDrag = false;
let startX = 0;
let startY = 0;
let clickCount = 0;
let clickTimer: ReturnType<typeof setTimeout> | null = null;
let lastClickSide: 'left' | 'right' = 'left';
let ready = false;

// Prevent spurious pointer events during window creation
setTimeout(() => {
  ready = true;
}, STARTUP_DELAY);

function endDrag(): void {
  if (!isDragging) return;
  isDragging = false;
  hitEl.classList.remove('dragging');
  if (didDrag) {
    window.petHitAPI.dragEnd();
  }
}

hitEl.addEventListener('pointerdown', (e: PointerEvent) => {
  if (!ready) return;
  if (e.button === 2) {
    window.petHitAPI.contextMenu();
    return;
  }
  isDragging = true;
  didDrag = false;
  startX = e.clientX;
  startY = e.clientY;
  try {
    hitEl.setPointerCapture(e.pointerId);
  } catch {
    // Pointer capture can fail if the window is mid-transition; drag still
    // works via document-level pointermove fallback below.
  }
  hitEl.classList.add('dragging');
});

document.addEventListener('pointermove', (e: PointerEvent) => {
  if (!isDragging) return;
  const dx = e.clientX - startX;
  const dy = e.clientY - startY;
  if (!didDrag && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
    didDrag = true;
    window.petHitAPI.dragStart();
  }
});

document.addEventListener('pointerup', (e: PointerEvent) => {
  if (!isDragging) return;
  const wasDrag = didDrag;
  endDrag();

  if (wasDrag) return;

  // Click detection
  clickCount++;
  lastClickSide = e.clientX < window.innerWidth / 2 ? 'left' : 'right';
  if (clickTimer) clearTimeout(clickTimer);
  clickTimer = setTimeout(() => {
    window.petHitAPI.click({ side: lastClickSide, count: clickCount });
    clickCount = 0;
    clickTimer = null;
  }, CLICK_WINDOW);
});

// Defensive: if the pointer interaction is cancelled (OS gesture, pointer
// capture released), make sure we don't leave the window in a half-dragging
// state where it keeps capturing the mouse.
document.addEventListener('pointercancel', () => endDrag());

document.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------------------
// Click-through management
// ---------------------------------------------------------------------------
//
// The hit window is `alwaysOnTop` at `screen-saver` level and covers a
// circular body area. When it does NOT ignore mouse events, it swallows every
// click in that area — including clicks meant for other apps. So we MUST
// aggressively keep it in "ignore" mode unless the cursor is actually inside
// the circle.
//
// Previously this relied on a single `mousemove` listener to toggle ignore
// state. That was fragile: if any mousemove was lost (window transitions,
// fast cursor exits via a screen edge, forwarded-event quirks when
// `setIgnoreMouseEvents(true, { forward: true })` races with an in-flight
// move), the window would stay in non-ignore mode forever and permanently
// capture the mouse, requiring a force-quit. That is the "mouse stuck on
// pet" bug this code is fixing.
//
// The fix layers multiple independent defenses:
//   1. `mousemove` (fast path) — toggles ignore state in real time for
//      responsive hover feedback.
//   2. `mouseleave` on the document — forces ignore=true the moment the
//      cursor leaves the window, catching "lost final mousemove" cases.
//   3. Main-process watchdog in petManager.ts — the ultimate safety net:
//      polls the real system cursor via screen.getCursorScreenPoint() and
//      can force ignore=true even if this renderer hangs entirely.
let WIN_CENTER_X = window.innerWidth / 2;
let WIN_CENTER_Y = window.innerHeight / 2;
let HIT_RADIUS_SQ = (window.innerWidth * 0.4) ** 2;
let isIgnoring = true;

function setIgnoring(next: boolean): void {
  if (next === isIgnoring) return;
  isIgnoring = next;
  if (next) {
    window.petHitAPI.setIgnoreMouseEvents(true, { forward: true });
  } else {
    window.petHitAPI.setIgnoreMouseEvents(false);
  }
}

function isInsideCircle(clientX: number, clientY: number): boolean {
  const dx = clientX - WIN_CENTER_X;
  const dy = clientY - WIN_CENTER_Y;
  return dx * dx + dy * dy <= HIT_RADIUS_SQ;
}

document.addEventListener('mousemove', (e: MouseEvent) => {
  setIgnoring(!isInsideCircle(e.clientX, e.clientY));
});

// When the cursor leaves the document entirely, force ignore=true. This
// catches the "lost final mousemove" case where the cursor exits the circle
// so fast that no intermediate move event fires with outside coordinates.
document.addEventListener('mouseleave', () => {
  if (!isDragging) setIgnoring(true);
});

/**
 * Reset transient drag/click state and force ignoreMouseEvents back to true.
 *
 * Triggered when the main process resizes the hit window: a pointer capture in
 * progress at that moment can be silently dropped by Windows (transparent +
 * frameless windows lose capture across resize/move), leaving `isDragging` true
 * forever and the cursor stuck in `grabbing`. We also re-arm the click-through
 * so the next mousemove re-evaluates the (now-different) hit circle.
 */
function resetHitState(): void {
  // Refresh geometry to reflect the new window dimensions after resize
  WIN_CENTER_X = window.innerWidth / 2;
  WIN_CENTER_Y = window.innerHeight / 2;
  HIT_RADIUS_SQ = (window.innerWidth * 0.4) ** 2;

  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
  }
  clickCount = 0;
  isDragging = false;
  didDrag = false;
  hitEl.classList.remove('dragging');
  isIgnoring = true;
  window.petHitAPI.setIgnoreMouseEvents(true, { forward: true });
}

window.petHitAPI.onHitReset?.(resetHitState);
