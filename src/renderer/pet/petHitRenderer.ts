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

document.addEventListener('contextmenu', (e) => e.preventDefault());

// Click-through: toggle ignore based on mouse position relative to pet body circle.
// With forward: true, mouse move events are forwarded even when the window ignores clicks.
const WIN_CENTER_X = window.innerWidth / 2;
const WIN_CENTER_Y = window.innerHeight / 2;
const HIT_RADIUS = window.innerWidth * 0.4;
let isIgnoring = true;

document.addEventListener('mousemove', (e: MouseEvent) => {
  const dx = e.clientX - WIN_CENTER_X;
  const dy = e.clientY - WIN_CENTER_Y;
  const inCircle = dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS;

  if (inCircle && isIgnoring) {
    isIgnoring = false;
    window.petHitAPI.setIgnoreMouseEvents(false);
  } else if (!inCircle && !isIgnoring) {
    isIgnoring = true;
    window.petHitAPI.setIgnoreMouseEvents(true, { forward: true });
  }
});
