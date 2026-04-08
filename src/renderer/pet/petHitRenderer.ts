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
  hitEl.setPointerCapture(e.pointerId);
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
  isDragging = false;
  hitEl.classList.remove('dragging');

  if (didDrag) {
    window.petHitAPI.dragEnd();
    return;
  }

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

/**
 * Backup drag-end trigger for cases where pointerup never fires.
 * pointercancel is emitted when the OS or browser cancels the gesture (touch
 * interrupted, another window steals capture, etc). It fires well before the
 * main-process drag watchdog (8s) and lets the user recover instantly.
 *
 * We deliberately do NOT listen for window 'blur' here: on macOS a system
 * notification or popup can briefly steal focus mid-drag without actually
 * cancelling the user's mouse hold, and we'd cut their drag short. The
 * main-process watchdog covers the rare case where pointercancel is also
 * dropped.
 */
function abortDrag(): void {
  if (!isDragging) return;
  isDragging = false;
  hitEl.classList.remove('dragging');
  if (didDrag) {
    window.petHitAPI.dragEnd();
  }
  didDrag = false;
}

hitEl.addEventListener('pointercancel', abortDrag);

document.addEventListener('contextmenu', (e) => e.preventDefault());

// Click-through: toggle ignore based on mouse position relative to pet body circle.
// With forward: true, mouse move events are forwarded even when the window ignores clicks.
//
// Geometry is read live on every mousemove (not cached at module load) because the
// hit window can be resized at runtime via the size submenu. Caching the constants
// once caused a Windows bug where the hit circle stayed at the original size after
// resize: the user had to click near the *old* center to start a drag. See
// petManager.resizePet() which sends `pet:hit-reset` to clear stale drag state too.
let isIgnoring = true;

function getHitRadius(): number {
  return window.innerWidth * 0.4;
}

document.addEventListener('mousemove', (e: MouseEvent) => {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const r = getHitRadius();
  const dx = e.clientX - cx;
  const dy = e.clientY - cy;
  const inCircle = dx * dx + dy * dy <= r * r;

  if (inCircle && isIgnoring) {
    isIgnoring = false;
    window.petHitAPI.setIgnoreMouseEvents(false);
  } else if (!inCircle && !isIgnoring) {
    isIgnoring = true;
    window.petHitAPI.setIgnoreMouseEvents(true, { forward: true });
  }
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
